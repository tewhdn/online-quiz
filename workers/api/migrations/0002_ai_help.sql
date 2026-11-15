-- AI 讲解使用记录：用于「问过 AI 的题进错题本」和「考试中问 AI 本题不计分」
CREATE TABLE IF NOT EXISTS ai_help_records (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  context    TEXT NOT NULL CHECK (context IN ('practice', 'exam', 'other')),
  attempt_id TEXT,
  session_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_help_user_question ON ai_help_records (user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_ai_help_attempt ON ai_help_records (attempt_id);
