-- Add failedAt to quiz_attempt: exact fail timestamp used for retry wait check
ALTER TABLE quiz_attempt ADD COLUMN failed_at INTEGER;

-- Add wasEdited to post_draft: track whether user edited the AI-generated post
ALTER TABLE post_draft ADD COLUMN was_edited INTEGER NOT NULL DEFAULT 0;
