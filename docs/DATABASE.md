# 数据库结构说明

数据库：Cloudflare D1（SQLite）。全部结构由 `workers/api/migrations/0001_init.sql` 创建，不假定数据库中存在任何表。

## 约定

| 约定 | 说明 |
| --- | --- |
| 主键 | `TEXT`，应用层生成，格式 `前缀_随机串`（如 `q_...`、`u_...`），便于日志排查 |
| 时间 | `INTEGER`，Unix 毫秒；"今日"统计按 `TZ_OFFSET_MINUTES` 计算 |
| JSON | 以 `TEXT` 保存，应用层解析；不使用 SQLite JSON1 作为强依赖 |
| 删除 | 用户/题目使用软删除（`status`/`deleted_at`），保留历史答题与成绩 |
| 外键 | 已声明，需保持 `PRAGMA foreign_keys = ON`（D1 默认开启） |
| 密码/令牌 | 只保存哈希或摘要，不保存明文 |

## 实体关系概览

```
users 1──n sessions
users 1──n practice_sessions 1──n answer_records
users 1──n wrong_questions n──1 questions
users 1──n favorites n──1 questions
users 1──n exam_attempts n──1 exams
exams 1──n exam_question_sets 1──n exam_questions（题目快照）
exam_attempts 1──n exam_answers n──1 exam_questions（快照）
invitations 1──n invitation_usages n──1 users
ai_generation_tasks 1──n ai_review_questions
ai_sources 1──n ai_generation_tasks（可选来源）
users 1──n admin_audit_logs
```

## 表结构

### 1. users

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | 用户 ID |
| username | TEXT | 原始大小写 |
| username_lower | TEXT UNIQUE | 小写归一，保证不区分大小写唯一 |
| password_hash | TEXT | `pbkdf2$sha256$iter$salt$hash` |
| role | TEXT | `admin` / `user` |
| status | TEXT | `active` / `disabled` / `deleted` |
| must_change_password | INTEGER | 1 表示下次登录必须先改密 |
| display_name | TEXT | 昵称 |
| created_at / updated_at / last_login_at / deleted_at | INTEGER | 时间戳 |

索引：`username_lower`（唯一）、`role`、`status`、`created_at`。

### 2. sessions

| 列 | 说明 |
| --- | --- |
| token_hash | PK，会话令牌的 SHA-256，数据库泄露也无法直接登录 |
| user_id | 关联用户 |
| csrf_token | 会话绑定 CSRF 令牌 |
| created_at / expires_at / revoked_at | 生命周期 |
| ip_hash / user_agent | 审计辅助，不保存明文 IP |

索引：`user_id`、`expires_at`。

### 3. invitations / invitation_usages

| 列 | 说明 |
| --- | --- |
| code_hash | 邀请码 SHA-256（唯一），不保存明文 |
| code_mask | 展示用掩码（如 `QZ-****-****-X7K2`） |
| max_uses / used_count | 可用次数 / 已用次数，占用通过原子 UPDATE 完成 |
| expires_at | 过期时间，NULL 表示不过期 |
| status | `active` / `disabled` |
| created_by | 创建管理员 |

`invitation_usages` 记录 `invitation_id + user_id`，唯一约束防止同一用户重复记账。

### 4. question_categories

`id`、`name`、`subject`、`description`、`sort_order`、`created_at`，唯一约束 `(subject, name)`。

### 5. questions

| 列 | 说明 |
| --- | --- |
| type | `single` / `multiple` / `boolean` |
| subject / category_id / category | 科目、分类 ID、冗余分类名 |
| knowledge_points | JSON 字符串数组 |
| difficulty | 1-5 |
| stem / options / answer / explanation | 题干、选项 JSON、答案 JSON、解析 |
| source / source_ref | 来源、来源章节或大纲条目 |
| tags | JSON 字符串数组 |
| status | `draft` / `pending` / `published` / `archived` |
| version | 修订版本，每次编辑 +1 |
| content_hash | 归一化题干哈希（去空白与标点），用于重复检测 |
| created_by / created_at / updated_at / published_at / archived_at / deleted_at | 元数据 |

索引：`(status, deleted_at)`、`(subject, status)`、`(category_id, status)`、`(type, status)`、`(difficulty, status)`、`content_hash`、`updated_at`。

普通用户只能查询 `status='published' AND deleted_at IS NULL`。

### 6. question_versions

保存每次编辑的完整快照：`question_id + version` 唯一，含 `snapshot`、`changed_by`、`change_note`。

### 7. practice_sessions / answer_records

`practice_sessions` 保存本次练习的模式、筛选、题目 ID 列表、答题计数、开始/结束时间。

`answer_records`：

- 关联用户、会话（可空）、题目
- `user_answer` JSON、`is_correct`、`time_spent_ms`、`source`
- **唯一约束 `(session_id, question_id)`**：同一会话重复提交不会重复计数
- 索引：`(user_id, created_at)`、`(user_id, question_id)`、`question_id`

### 8. wrong_questions

`user_id + question_id` 唯一；`wrong_count`、`attempt_count`、`last_result`、`last_wrong_at`、`mastered`。

答对只更新已有错题记录；再次答错会将 `mastered` 重置为 0。

### 9. favorites

`user_id + question_id` 唯一，重复收藏不会产生重复行。

### 10. exams / exam_question_sets / exam_questions

- `exams`：考试配置（题型数量、难度分布、分值、时长、开放时间、允许重考、解析可见性、状态、当前试卷版本 `active_set_id`）
- `exam_question_sets`：**试卷版本**，`(exam_id, version)` 唯一，保存题目数与总分
- `exam_questions`：`set_id + position` 唯一，每行保存完整题目快照 JSON（含答案，仅服务端使用）

**快照设计**：管理员修改题目或重新抽题时，会生成新的 set 版本；历史 attempt 始终指向旧的 `set_id`，因此原题修改不会改变历史成绩与题目内容。

### 11. exam_attempts / exam_answers

- `exam_attempts`：`exam_id + set_id + user_id`、状态（`in_progress`/`submitted`/`expired`）、开始/截止/交卷时间、自动交卷标记、得分、正确/错误/未答数、用时、结果详情 JSON
- `exam_answers`：`(attempt_id, exam_question_id)` 唯一，保存用户答案、是否标记疑问、得分

索引：`(user_id, started_at)`、`(exam_id, status)`、`(user_id, exam_id, status)`。

### 12. ai_sources

上传资料：文件名、MIME、大小、字符数、提取文本、存储方式（`d1`/`r2`）、R2 key、上传管理员、软删除时间。

### 13. ai_generation_tasks

| 列 | 说明 |
| --- | --- |
| mode | `outline` / `document` / `topic` |
| params | 请求参数 JSON |
| status | `pending` / `running` / `succeeded` / `partial` / `failed` |
| model | 实际模型名称 |
| prompt_tokens / completion_tokens / total_tokens | 接口返回的用量；未返回时为 NULL，不伪造 |
| request_count / attempts | 实际请求次数 |
| source_id | 资料出题来源 |
| error | 失败原因（截断，不含密钥） |
| created_at / started_at / finished_at / duration_ms | 时间信息 |

### 14. ai_review_questions

`task_id`、`payload`（AI 原始结构化题目或修改后的题目）、`status`（`pending`/`approved`/`rejected`/`invalid`）、`validation`（错误/警告/重复信息）、`duplicate_of`、审核人/时间、拒绝原因、发布后的 `created_question_id`。

### 15. announcements

标题、内容、状态（`draft`/`published`）、置顶、发布人、发布时间。索引 `(status, pinned, published_at)`。

### 16. admin_audit_logs

管理员、动作（如 `question.create`、`user.disable`）、对象类型/ID、详情 JSON、IP 哈希、时间。**不保存密码、会话令牌、API Key**。

### 17. rate_limits

`key` 主键、固定窗口起点、计数、更新时间。通过一条 `INSERT ... ON CONFLICT ... RETURNING` 原子自增实现。

### 18. system_settings

键值配置：`ai_enabled`、`ai_daily_task_limit`、`ai_max_questions_per_request`、`site_name`。

---

## 迁移

```bash
# 本地（wrangler）
npm run db:migrate:local

# 生产
npm run db:migrate:remote

# 查看已应用迁移
npx wrangler d1 migrations list online-quiz --remote
```

新增迁移：

1. 在 `workers/api/migrations/` 新建 `0002_xxx.sql`
2. 只追加变更，不修改已上线迁移
3. 先在本地验证，再 `--remote`
4. 执行前导出备份

Node 运行时（`scripts/dev-server.mjs`）会在启动时按文件名顺序应用未执行迁移，记录在本地表 `_local_migrations` 中。

## 备份与导出

```bash
# 导出 SQL
npx wrangler d1 export online-quiz --remote --output backup-2026-01-01.sql

# 只导出题目（JSON/CSV）
npm run questions:import -- --help
# 或使用后台「导出 JSON / CSV」
```

## 容量与性能说明

- 目标规模：50 用户、2000+ 题；单表十万级以内 D1 + 索引可满足
- 列表接口全部分页，最大 pageSize 100
- 抽题使用 `ORDER BY RANDOM() LIMIT n`，题目量为千级时开销可接受；万级以上建议改用随机 ID 区间抽样
- 批量导入按 40/200 条分批执行，避免单次请求过大
- 错题/收藏/统计查询均有索引
- 实际容量还取决于并发答题、考试集中开考、AI 调用频率与 D1 每日读写额度
