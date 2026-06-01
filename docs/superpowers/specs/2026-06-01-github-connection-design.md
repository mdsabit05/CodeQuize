# GitHub Connection Design

## Goal

After login, user connects their GitHub account via OAuth App (public repos only, read-only). They then pick which repos to share with the app. When they hit "Start", the app fetches recent commits live from GitHub, reads the code, generates results (quiz/concepts), and discards the source code immediately — raw code is never stored.

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| GitHub OAuth App vs GitHub App | OAuth App | No installation step, simpler "Connect GitHub" UX |
| Scope | `public_repo` | Truly read-only enforced at GitHub level — no write risk at all |
| Private repos | Not supported | Security — cannot risk any write access |
| Webhooks | No | On-demand fetch only — simpler, no security overhead |
| Raw code storage | Never | Only results (quiz, concepts) stored — source code discarded after use |

---

## Architecture

### Flow

```
Dashboard → "Connect GitHub" button
    ↓
GET /api/github/connect
→ build GitHub OAuth URL (state param for CSRF, scope=public_repo)
→ return URL to frontend
    ↓
Frontend redirects to GitHub OAuth page
    ↓
User authorizes on GitHub
    ↓
GitHub redirects → GET /api/github/callback?code=&state=
→ validate state
→ exchange code for access_token (fetch to GitHub)
→ fetch github user info
→ store github_connection in D1
→ redirect frontend to /github/repos
    ↓
GET /api/github/repos
→ use stored access_token
→ call GitHub API: GET /user/repos?visibility=public
→ return repo list (never stored)
    ↓
User selects repos (checkboxes)
    ↓
POST /api/github/repos/select
→ save selected repos to github_selected_repo table
    ↓
Dashboard shows connected repos
    ↓
User hits "Start" on a repo
    ↓
GET /api/github/repos/:owner/:repo/commits
→ fetch recent commits from GitHub API live
→ read file contents (in memory only)
→ extract concepts / generate quiz
→ save results to DB
→ discard raw code — never written to DB
```

---

## Database

### `github_connection` table
```
id             text  primary key
userId         text  not null  → references user(id) on delete cascade
githubUserId   text  not null
githubUsername text  not null
accessToken    text  not null  (stored server-side only, never sent to frontend)
connectedAt    integer (timestamp)
```

### `github_selected_repo` table
```
id           text  primary key
userId       text  not null  → references user(id) on delete cascade
repoId       text  not null  (GitHub's numeric repo ID — stable even if renamed)
repoName     text  not null
repoFullName text  not null  (owner/repo)
selectedAt   integer (timestamp)
```

**What is never stored:**
- File contents
- Raw source code
- Diff / patch content
- Commit message bodies (only SHA and metadata for reference)

---

## Backend Routes

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/github/connect` | Build + return GitHub OAuth URL with state |
| `GET` | `/api/github/callback` | Exchange code → token → store → redirect |
| `GET` | `/api/github/status` | Is user connected? Returns username or null |
| `GET` | `/api/github/repos` | Fetch public repos from GitHub API |
| `POST` | `/api/github/repos/select` | Save user's chosen repos |
| `GET` | `/api/github/repos/selected` | Get user's saved repo selections |
| `DELETE` | `/api/github/disconnect` | Remove connection + selected repos |
| `GET` | `/api/github/repos/:owner/:repo/commits` | On-demand: fetch recent commits live |

All routes are protected — session middleware runs first, 401 if not logged in.

---

## Frontend

### New Route
- `/github/repos` — protected, shows repo list with checkboxes, save button

### Dashboard Changes
- If not connected: "Connect GitHub" button
- If connected: show selected repos, "Disconnect" option, "Start" button per repo

### Environment
- `GITHUB_CLIENT_ID` — added to `frontend/.env.local` (public, safe to expose)

---

## Backend Environment Variables

Added to `backend/.dev.vars`:
```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...    ← never goes to frontend
GITHUB_REDIRECT_URI=https://your-backend/api/github/callback
```

---

## Security

- `state` param (random string) generated per OAuth attempt, verified on callback — prevents CSRF
- `access_token` stored in D1, never returned to frontend
- `public_repo` scope → GitHub enforces read-only at server level
- All GitHub API calls made from Worker (backend) using `fetch` — token never touches browser
- Raw code never written to any DB table

---

## What is Saved vs Discarded

| Data | Saved | Never Saved |
|---|---|---|
| GitHub username | ✅ | |
| Access token | ✅ (server only) | |
| Repo name + ID | ✅ | |
| Quiz results | ✅ | |
| Concepts found | ✅ | |
| Commit SHA (reference) | ✅ | |
| Raw file contents | | ❌ |
| Source code | | ❌ |
| Diff / patch | | ❌ |
