import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { quizJob, topicJob, quizGenJob, quizAttempt, githubConnection, learningLink, postDraft } from "./schema";
import type { Env } from "./env";

type ConceptsMessage      = { type: "concepts";        jobId: string; userId: string; repoFullName: string };
type TopicsMessage        = { type: "topics";           jobId: string; userId: string; conceptTitle: string; conceptDescription: string };
type GenerateQuizMsg      = { type: "generate_quiz";    jobId: string; userId: string; topics: string[] };
type GradeQuizMsg         = { type: "grade_quiz";       attemptId: string; userId: string; questions: Question[]; answers: Answer[] };
type LearningLinksMsg     = { type: "learning_links";   linkJobId: string; attemptId: string; userId: string; wrongTopics: { questionIndex: number; topic: string }[] };
type WritePostsMsg        = { type: "write_posts";      postDraftId: string; attemptId: string; userId: string; topicTitle: string; score: number };
type QueueMessage         = ConceptsMessage | TopicsMessage | GenerateQuizMsg | GradeQuizMsg | LearningLinksMsg | WritePostsMsg;

type Question =
  | { type: "mcq";   question: string; options: string[]; correctAnswer: string }
  | { type: "short"; question: string; sampleAnswer: string }
  | { type: "code";  question: string; sampleAnswer: string; language: string };

type Answer = { questionIndex: number; answer: string };

async function callAI(
  apiKey: string,
  gatewayUrl: string,
  userMessage: string,
  toolName: string,
  toolDescription: string,
  toolSchema: object
): Promise<Record<string, unknown>> {
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: userMessage }],
      tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters: toolSchema } }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const json = await res.json<{
    choices: { message: { tool_calls: { function: { arguments: string } }[] } }[];
  }>();
  const args = json.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call in response");
  return JSON.parse(args);
}

// --- Concepts handler ---
async function handleConceptsJob(msg: ConceptsMessage, env: Env): Promise<void> {
  const db = createDb(env);
  const [conn] = await db.select().from(githubConnection).where(eq(githubConnection.userId, msg.userId)).limit(1);
  if (!conn) throw new Error("GitHub not connected");

  const [owner, repo] = msg.repoFullName.split("/");
  const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, "User-Agent": "codequize-backend" },
  });
  const commitsData = await commitsRes.json<unknown>();
  if (!Array.isArray(commitsData)) {
    const errMsg = (commitsData as any)?.message ?? `HTTP ${commitsRes.status}`;
    throw new Error(`GitHub commits fetch failed: ${errMsg}`);
  }
  const commits = commitsData as { sha: string; commit: { message: string } }[];

  const diffs = await Promise.all(commits.slice(0, 15).map(async (commit) => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/vnd.github.diff", "User-Agent": "codequize-backend" },
    });
    return `## ${commit.commit.message}\n\n${(await res.text()).slice(0, 5000)}`;
  }));

  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `Here are recent code changes from "${msg.repoFullName}":\n\n${diffs.join("\n\n---\n\n").slice(0, 40000)}\n\nExtract ALL key programming concepts found in this codebase — be exhaustive and thorough. Cover every concept present: design patterns, algorithms, data structures, libraries/frameworks used, architectural patterns, language features, APIs, security patterns, performance techniques, testing approaches, etc. Do not skip or merge concepts — list each one separately. Aim for as many distinct concepts as exist in the code — typically 20 to 40.`,
    "extract_concepts", "Extract all programming concepts from code changes",
    { type: "object", properties: { concepts: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string", description: "2-3 sentence explanation of what this concept is and how it is used in this codebase" } }, required: ["title", "description"] }, minItems: 15, maxItems: 40 } }, required: ["concepts"] }
  );

  const { concepts } = result as { concepts: { title: string; description: string }[] };
  await db.update(quizJob).set({ status: "done", concepts: JSON.stringify(concepts) }).where(eq(quizJob.id, msg.jobId));
}

// --- Topics handler ---
async function handleTopicsJob(msg: TopicsMessage, env: Env): Promise<void> {
  const db = createDb(env);
  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `A developer is learning about: "${msg.conceptTitle}" — ${msg.conceptDescription}\n\nGenerate a comprehensive list of learning topics that fully cover this concept from beginner to advanced. Each topic should be a specific, focused subtopic that a developer needs to understand to master this concept completely. Cover: fundamentals, core mechanics, common patterns, edge cases, real-world usage, best practices, common mistakes, performance considerations, and advanced techniques. Aim for 10 to 12 distinct topics.`,
    "suggest_topics", "Suggest comprehensive learning topics for a concept",
    { type: "object", properties: { topics: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string", description: "What the developer will learn about this specific subtopic" } }, required: ["title", "description"] }, minItems: 10, maxItems: 12 } }, required: ["topics"] }
  );
  const { topics } = result as { topics: { title: string; description: string }[] };
  await db.update(topicJob).set({ status: "done", topics: JSON.stringify(topics) }).where(eq(topicJob.id, msg.jobId));
}

// --- Generate quiz handler ---
async function handleGenerateQuiz(msg: GenerateQuizMsg, env: Env): Promise<void> {
  const db = createDb(env);
  const topicsText = msg.topics.join(", ");

  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `Create a comprehensive quiz to deeply test understanding of: ${topicsText}.\n\nRules:\n- Generate exactly 25 to 30 questions total\n- Cover ALL chosen topics — do not skip any\n- Mix of question types: MCQ (conceptual + tricky edge cases), short answer (explain in own words), and code writing (write actual working code)\n- MCQ: 4 options, clearly distinct, test real understanding not just memorization\n- Short answer: ask to explain concepts, compare approaches, or describe when/why to use something\n- Code questions: ask to write a real working function, fix a bug, implement a pattern, or build a small feature — include the programming language context\n- Difficulty progression: start easy (what/why), go medium (how/when), end hard (implement/debug/optimize)\n- Code questions must have a clear problem statement and expected output`,
    "create_quiz", "Create a comprehensive quiz with MCQ, short answer, and coding questions",
    {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["mcq"] },
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correctAnswer: { type: "string" },
                },
                required: ["type", "question", "options", "correctAnswer"],
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["short"] },
                  question: { type: "string" },
                  sampleAnswer: { type: "string" },
                },
                required: ["type", "question", "sampleAnswer"],
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["code"] },
                  question: { type: "string", description: "Clear problem statement with expected input/output and any constraints" },
                  language: { type: "string", description: "Programming language e.g. TypeScript, Python, JavaScript" },
                  sampleAnswer: { type: "string", description: "A complete, working solution with brief explanation" },
                },
                required: ["type", "question", "language", "sampleAnswer"],
              },
            ],
          },
          minItems: 25,
          maxItems: 30,
        },
      },
      required: ["questions"],
    }
  );

  const { questions } = result as { questions: Question[] };
  await db.update(quizGenJob).set({ status: "done", questions: JSON.stringify(questions) }).where(eq(quizGenJob.id, msg.jobId));
}

// --- Grade quiz handler ---
async function handleGradeQuiz(msg: GradeQuizMsg, env: Env): Promise<void> {
  const db = createDb(env);

  const feedback: { questionIndex: number; correct: boolean; explanation: string }[] = [];
  let correctCount = 0;

  for (const q of msg.questions) {
    const ans = msg.answers.find((a) => a.questionIndex === msg.questions.indexOf(q));
    const userAnswer = ans?.answer ?? "";

    const qIndex = msg.questions.indexOf(q);

    if (q.type === "mcq") {
      const correct = userAnswer.trim() === q.correctAnswer.trim();
      correctCount += correct ? 1 : 0;
      feedback.push({
        questionIndex: qIndex,
        question: q.question,
        userAnswer,
        correct,
        verdict: correct
          ? `Correct — the answer is "${q.correctAnswer}".`
          : `Incorrect. The correct answer is "${q.correctAnswer}".`,
      });
    } else {
      // Short answer / code — AI grades
      const isCode = q.type === "code";
      const langContext = isCode ? ` (${(q as { language: string }).language})` : "";
      const result = await callAI(
        env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
        `You are a programming teacher grading a student's quiz answer${langContext}. Grade it and then teach the concept clearly.\n\nQuestion: ${q.question}\nModel answer: ${q.sampleAnswer}\nStudent's answer: ${userAnswer || "(left blank)"}\n\n${isCode ? "This is a CODING question. Grade based on: correctness, logic, syntax, edge cases handled. The correct_answer field MUST contain complete working code with explanation. Point out specific issues in the student's code if any." : "IMPORTANT: The correct_answer field must directly answer the exact question asked. Be concrete and specific. Use inline code with backticks wherever relevant."}`,
        "grade_answer", "Grade answer and return structured teaching explanation",
        {
          type: "object",
          properties: {
            correct: { type: "boolean" },
            verdict: { type: "string", description: "One sentence: what the student got right or wrong." },
            correct_answer: { type: "string", description: "The ideal, complete answer to the exact question asked. If the question asks for code or architecture, write it out fully with backtick code blocks." },
            analogy: { type: "string", description: "A real-life analogy that makes this concept click." },
            why_it_exists: { type: "string", description: "Why was this concept/feature created? What problem does it solve?" },
            code_breakdown: { type: "string", description: "A short code snippet (use backticks) with a 1-2 sentence explanation of what each key part does." },
            common_mistakes: { type: "string", description: "The most common mistake developers make with this concept and how to avoid it." },
            summary: { type: "string", description: "One crisp sentence takeaway — the thing to remember." },
          },
          required: ["correct", "verdict", "correct_answer", "analogy", "why_it_exists", "code_breakdown", "common_mistakes", "summary"],
        }
      );
      const { correct, verdict, correct_answer, analogy, why_it_exists, code_breakdown, common_mistakes, summary } = result as {
        correct: boolean;
        verdict: string;
        correct_answer: string;
        analogy: string;
        why_it_exists: string;
        code_breakdown: string;
        common_mistakes: string;
        summary: string;
      };
      correctCount += correct ? 1 : 0;
      feedback.push({ questionIndex: qIndex, question: q.question, userAnswer, correct, verdict, correct_answer, analogy, why_it_exists, code_breakdown, common_mistakes, summary });
    }
  }

  const score = Math.round((correctCount / msg.questions.length) * 100);

  await db
    .update(quizAttempt)
    .set({
      status: "done",
      score,
      feedback: JSON.stringify(feedback),
      ...(score < 80 ? { failedAt: new Date() } : {}),
    })
    .where(eq(quizAttempt.id, msg.attemptId));

  // Auto-trigger post writing if score >= 80
  if (score >= 80) {
    try {
      const [row] = await db
        .select({ selectedTopics: topicJob.selectedTopics })
        .from(quizAttempt)
        .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
        .innerJoin(topicJob, eq(quizGenJob.topicJobId, topicJob.id))
        .where(eq(quizAttempt.id, msg.attemptId))
        .limit(1);

      const selectedTopics: string[] = row?.selectedTopics ? JSON.parse(row.selectedTopics) : [];
      const topicTitle = selectedTopics.join(", ") || "programming concept";

      const postDraftId = crypto.randomUUID();
      await db.insert(postDraft).values({
        id: postDraftId,
        attemptId: msg.attemptId,
        userId: msg.userId,
        status: "pending",
        createdAt: new Date(),
      });
      await handleWritePosts({ type: "write_posts", postDraftId, attemptId: msg.attemptId, userId: msg.userId, topicTitle, score }, env);
    } catch (err) {
      // Post generation failure should not poison the quiz result
      console.error("handleWritePosts failed:", err);
    }
  }

  // Auto-trigger learning links for any wrong answers
  {
    const wrongTopics = feedback
      .filter((f) => !f.correct)
      .map((f) => ({
        questionIndex: f.questionIndex,
        topic: msg.questions[f.questionIndex]?.question ?? "",
      }));

    if (wrongTopics.length > 0) {
      const linkJobId = crypto.randomUUID();
      await db.insert(learningLink).values({
        id: linkJobId,
        attemptId: msg.attemptId,
        userId: msg.userId,
        status: "pending",
        createdAt: new Date(),
      });
      // Re-enqueue as learning_links message — but we can't access env.QUIZ_QUEUE here
      // So we store the job and let the route trigger it via a separate mechanism
      // Instead: process inline since we're already in the queue worker
      await handleLearningLinks({ type: "learning_links", linkJobId, attemptId: msg.attemptId, userId: msg.userId, wrongTopics }, env);
    }
  }
}

// --- Learning links handler ---
async function handleLearningLinks(msg: LearningLinksMsg, env: Env): Promise<void> {
  const db = createDb(env);

  const allLinks: { questionIndex: number; topic: string; resources: { title: string; url: string; description: string }[] }[] = [];

  for (const { questionIndex, topic } of msg.wrongTopics) {
    // Search Google via Serper.dev
    const searchRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": env.SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${topic} tutorial programming`, num: 3 }),
    });
    const searchData = await searchRes.json<{
      organic?: { title: string; link: string; snippet: string }[];
    }>();

    const resources = (searchData.organic ?? []).slice(0, 3).map((item) => ({
      title: item.title,
      url: item.link,
      description: item.snippet,
    }));

    allLinks.push({ questionIndex, topic, resources });
  }

  await db
    .update(learningLink)
    .set({ status: "done", links: JSON.stringify(allLinks) })
    .where(eq(learningLink.id, msg.linkJobId));
}

// --- Write posts handler ---
async function handleWritePosts(msg: WritePostsMsg, env: Env): Promise<void> {
  const db = createDb(env);

  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `A developer just passed a quiz on "${msg.topicTitle}" with a score of ${msg.score}%. Write three shareable posts celebrating this learning achievement and explaining the concept:\n1. A detailed blog post (title, URL slug, full body with code examples in Markdown)\n2. A LinkedIn post (professional tone, 150-300 words)\n3. A Twitter/X post (casual, punchy, ≤ 280 characters including hashtags)`,
    "write_posts", "Generate blog, LinkedIn, and Twitter posts about a programming concept the developer just mastered",
    {
      type: "object",
      properties: {
        blogTitle: { type: "string", description: "The blog post title" },
        blogSlug: { type: "string", description: "URL-safe slug, e.g. my-first-post (lowercase letters, numbers, hyphens only)" },
        blogBody: { type: "string", description: "Full blog post body in Markdown with code examples" },
        linkedinBody: { type: "string", description: "LinkedIn post body, 150-300 words, professional tone" },
        twitterBody: { type: "string", description: "Twitter/X post, max 280 characters" },
      },
      required: ["blogTitle", "blogSlug", "blogBody", "linkedinBody", "twitterBody"],
    }
  );

  const { blogTitle, blogSlug, blogBody, linkedinBody, twitterBody } = result as {
    blogTitle: string; blogSlug: string; blogBody: string; linkedinBody: string; twitterBody: string;
  };

  await db.update(postDraft).set({ status: "done", blogTitle, blogSlug, blogBody, linkedinBody, twitterBody }).where(eq(postDraft.id, msg.postDraftId));
}

// --- Main handler ---
export async function handleQueue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const db = createDb(env);
    try {
      if (message.body.type === "concepts") {
        await handleConceptsJob(message.body, env);
      } else if (message.body.type === "topics") {
        await handleTopicsJob(message.body, env);
      } else if (message.body.type === "generate_quiz") {
        await handleGenerateQuiz(message.body, env);
      } else {
        await handleGradeQuiz(message.body, env);
      }
      message.ack();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const body = message.body;

      if (body.type === "concepts") {
        await db.update(quizJob).set({ status: "error", error: errMsg }).where(eq(quizJob.id, body.jobId));
      } else if (body.type === "topics") {
        await db.update(topicJob).set({ status: "error", error: errMsg }).where(eq(topicJob.id, body.jobId));
      } else if (body.type === "generate_quiz") {
        await db.update(quizGenJob).set({ status: "error", error: errMsg }).where(eq(quizGenJob.id, body.jobId));
      } else if (body.type === "write_posts") {
        await db.update(postDraft).set({ status: "error", error: errMsg }).where(eq(postDraft.id, body.postDraftId));
      } else {
        await db.update(quizAttempt).set({ status: "error", error: errMsg }).where(eq(quizAttempt.id, body.attemptId));
      }
      message.ack();
    }
  }
}
