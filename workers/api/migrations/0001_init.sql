-- ============================================================================
-- 在线智能答题系统 - 初始数据库结构
-- 数据库：Cloudflare D1 (SQLite)
-- 约定：
--   * 所有时间戳为 Unix 毫秒（INTEGER），时区由应用层按 TZ_OFFSET_MINUTES 计算。
--   * 所有主键为应用层生成的 TEXT ID（前缀 + 随机串），便于日志与排查。
--   * JSON 字段以 TEXT 存储（SQLite json1 可用，但为兼容性尽量在应用层解析）。
--   * 删除用户/题目一律使用软删除（deleted_at / status），以保留历史成绩。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 用户
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL,                       -- 原始大小写，用于展示
  username_lower       TEXT NOT NULL UNIQUE,                -- 小写归一，保证唯一且不区分大小写
  password_hash        TEXT NOT NULL,                       -- pbkdf2$sha256$iter$salt$hash
  role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  display_name         TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  last_login_at        INTEGER,
  deleted_at           INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- ---------------------------------------------------------------------------
-- 2. 服务端会话（只保存 token 的 SHA-256，泄库也无法直接登录）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  ip_hash      TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 3. 邀请码（只保存哈希，列表展示掩码）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL UNIQUE,
  code_mask   TEXT NOT NULL,
  note        TEXT,
  max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count  INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at  INTEGER,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by  TEXT REFERENCES users (id),
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_created ON invitations (created_at);

CREATE TABLE IF NOT EXISTS invitation_usages (
  id             TEXT PRIMARY KEY,
  invitation_id  TEXT NOT NULL REFERENCES invitations (id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  used_at        INTEGER NOT NULL,
  UNIQUE (invitation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_invitation_usages_inv ON invitation_usages (invitation_id, used_at);

-- ---------------------------------------------------------------------------
-- 4. 题库分类
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE (subject, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_subject ON question_categories (subject, sort_order);

-- ---------------------------------------------------------------------------
-- 5. 题目（答案只在本表，普通用户查询永远不返回 answer / explanation）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('single', 'multiple', 'boolean')),
  subject          TEXT NOT NULL,
  category_id      TEXT REFERENCES question_categories (id),
  category         TEXT NOT NULL DEFAULT '',               -- 冗余分类名，便于筛选与导出
  knowledge_points TEXT NOT NULL DEFAULT '[]',             -- JSON string[]
  difficulty       INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  stem             TEXT NOT NULL,
  options          TEXT NOT NULL DEFAULT '[]',             -- JSON [{key,text}]
  answer           TEXT NOT NULL,                          -- JSON string[]，布尔题为 ["true"]/["false"]
  explanation      TEXT NOT NULL DEFAULT '',
  source           TEXT,
  source_ref       TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',             -- JSON string[]
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'archived')),
  version          INTEGER NOT NULL DEFAULT 1,
  content_hash     TEXT NOT NULL,                          -- 归一化题干哈希，用于去重
  created_by       TEXT REFERENCES users (id),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  published_at     INTEGER,
  archived_at      INTEGER,
  deleted_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions (status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions (subject, status);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions (category_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions (type, status);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions (difficulty, status);
CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions (content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_updated ON questions (updated_at);

-- ---------------------------------------------------------------------------
-- 6. 题目修订历史（每次编辑保存快照，可追溯）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_versions (
  id          TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  snapshot    TEXT NOT NULL,
  changed_by  TEXT REFERENCES users (id),
  change_note TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (question_id, version)
);
CREATE INDEX IF NOT EXISTS idx_question_versions_q ON question_versions (question_id, version);

-- ---------------------------------------------------------------------------
-- 7. 刷题会话与答题记录
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode            TEXT NOT NULL,                           -- subject/category/knowledge/type/difficulty/random/sequence/mistake/favorite
  filters         TEXT NOT NULL DEFAULT '{}',
  question_ids    TEXT NOT NULL DEFAULT '[]',
  total_questions INTEGER NOT NULL DEFAULT 0,
  answered_count  INTEGER NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions (user_id, started_at);

CREATE TABLE IF NOT EXISTS answer_records (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id     TEXT REFERENCES practice_sessions (id) ON DELETE SET NULL,
  question_id    TEXT NOT NULL REFERENCES questions (id),
  question_type  TEXT NOT NULL,
  user_answer    TEXT NOT NULL,                            -- JSON string[]
  is_correct     INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  time_spent_ms  INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'practice' CHECK (source IN ('practice', 'mistake', 'favorite', 'exam')),
  created_at     INTEGER NOT NULL,
  UNIQUE (session_id, question_id)                         -- 防止同一会话内重复提交
);
CREATE INDEX IF NOT EXISTS idx_answer_records_user_time ON answer_records (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_records_user_q ON answer_records (user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_answer_records_question ON answer_records (question_id);

-- ---------------------------------------------------------------------------
-- 8. 错题本
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wrong_questions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  wrong_count   INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_result   INTEGER NOT NULL DEFAULT 0 CHECK (last_result IN (0, 1)),
  last_wrong_at INTEGER,
  mastered      INTEGER NOT NULL DEFAULT 0 CHECK (mastered IN (0, 1)),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_wrong_user ON wrong_questions (user_id, mastered, updated_at);

-- ---------------------------------------------------------------------------
-- 9. 收藏
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 10. 模拟考试
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  subject             TEXT,
  category_ids        TEXT NOT NULL DEFAULT '[]',
  knowledge_points    TEXT NOT NULL DEFAULT '[]',
  type_counts         TEXT NOT NULL DEFAULT '{"single":0,"multiple":0,"boolean":0}',
  difficulty_counts   TEXT NOT NULL DEFAULT '{}',
  total_questions     INTEGER NOT NULL DEFAULT 0,
  total_score         INTEGER NOT NULL DEFAULT 100,
  score_single        INTEGER NOT NULL DEFAULT 2,
  score_multiple      INTEGER NOT NULL DEFAULT 3,
  score_boolean       INTEGER NOT NULL DEFAULT 2,
  duration_minutes    INTEGER NOT NULL DEFAULT 60,
  allow_early_submit  INTEGER NOT NULL DEFAULT 1 CHECK (allow_early_submit IN (0, 1)),
  allow_review        TEXT NOT NULL DEFAULT 'after_submit' CHECK (allow_review IN ('never', 'after_submit', 'after_end')),
  start_at            INTEGER,
  end_at              INTEGER,
  allow_retake        INTEGER NOT NULL DEFAULT 0 CHECK (allow_retake IN (0, 1)),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  active_set_id       TEXT,
  created_by          TEXT REFERENCES users (id),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams (status, start_at);

-- 试卷版本（每次变更题目范围生成新版本，历史成绩永远指向旧版本快照）
CREATE TABLE IF NOT EXISTS exam_question_sets (
  id             TEXT PRIMARY KEY,
  exam_id        TEXT NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  total_score    INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  UNIQUE (exam_id, version)
);
CREATE INDEX IF NOT EXISTS idx_exam_sets_exam ON exam_question_sets (exam_id, version);

CREATE TABLE IF NOT EXISTS exam_questions (
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES exam_question_sets (id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  position    INTEGER NOT NULL,
  type        TEXT NOT NULL,
  score       INTEGER NOT NULL,
  snapshot    TEXT NOT NULL,                               -- 完整题目快照（含答案，仅服务端使用）
  UNIQUE (set_id, position)
);
CREATE INDEX IF NOT EXISTS idx_exam_questions_set ON exam_questions (set_id, position);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id               TEXT PRIMARY KEY,
  exam_id          TEXT NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  set_id           TEXT NOT NULL REFERENCES exam_question_sets (id),
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
  started_at       INTEGER NOT NULL,
  deadline_at      INTEGER NOT NULL,
  submitted_at     INTEGER,
  auto_submitted   INTEGER NOT NULL DEFAULT 0 CHECK (auto_submitted IN (0, 1)),
  score            INTEGER,
  total_score      INTEGER NOT NULL DEFAULT 0,
  correct_count    INTEGER NOT NULL DEFAULT 0,
  wrong_count      INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  result_detail    TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON exam_attempts (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts (exam_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_open ON exam_attempts (user_id, exam_id, status);

CREATE TABLE IF NOT EXISTS exam_answers (
  id               TEXT PRIMARY KEY,
  attempt_id       TEXT NOT NULL REFERENCES exam_attempts (id) ON DELETE CASCADE,
  exam_question_id TEXT NOT NULL,
  question_id      TEXT NOT NULL,
  user_answer      TEXT NOT NULL DEFAULT '[]',
  is_correct       INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  score            INTEGER NOT NULL DEFAULT 0,
  flagged          INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  answered_at      INTEGER NOT NULL,
  UNIQUE (attempt_id, exam_question_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON exam_answers (attempt_id);

-- ---------------------------------------------------------------------------
-- 11. AI 出题
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_sources (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  char_count   INTEGER NOT NULL DEFAULT 0,
  text_content TEXT NOT NULL DEFAULT '',
  storage      TEXT NOT NULL DEFAULT 'd1' CHECK (storage IN ('d1', 'r2')),
  r2_key       TEXT,
  uploaded_by  TEXT REFERENCES users (id),
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ai_sources_created ON ai_sources (created_at);

CREATE TABLE IF NOT EXISTS ai_generation_tasks (
  id                TEXT PRIMARY KEY,
  admin_id          TEXT NOT NULL REFERENCES users (id),
  mode              TEXT NOT NULL CHECK (mode IN ('outline', 'document', 'topic')),
  subject           TEXT,
  params            TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'partial', 'failed')),
  model             TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  request_count     INTEGER NOT NULL DEFAULT 0,
  attempts          INTEGER NOT NULL DEFAULT 0,
  source_id         TEXT REFERENCES ai_sources (id),
  error             TEXT,
  created_at        INTEGER NOT NULL,
  started_at        INTEGER,
  finished_at       INTEGER,
  duration_ms       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_created ON ai_generation_tasks (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_generation_tasks (status, created_at);

CREATE TABLE IF NOT EXISTS ai_review_questions (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL REFERENCES ai_generation_tasks (id) ON DELETE CASCADE,
  payload             TEXT NOT NULL,                       -- AI 原始结构化题目
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'invalid')),
  validation          TEXT NOT NULL DEFAULT '{}',          -- 服务端校验结果
  duplicate_of        TEXT,
  reviewed_by         TEXT REFERENCES users (id),
  reviewed_at         INTEGER,
  reject_reason       TEXT,
  created_question_id TEXT,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_review_status ON ai_review_questions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_review_task ON ai_review_questions (task_id);

-- ---------------------------------------------------------------------------
-- 12. 公告 / 审计日志 / 限流 / 系统配置
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  pinned       INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_by   TEXT REFERENCES users (id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements (status, pinned, published_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT REFERENCES users (id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT NOT NULL DEFAULT '{}',
  ip_hash     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs (admin_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('ai_enabled', 'true', 0),
  ('ai_daily_task_limit', '20', 0),
  ('ai_max_questions_per_request', '50', 0),
  ('site_name', '智能答题系统', 0);
