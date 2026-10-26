# API 文档

所有接口前缀：`/api/v1`。前端与 API 同源部署，使用 Cookie 会话，不使用 Bearer Token。

## 1. 通用约定

### 1.1 响应格式

成功：

```json
{
  "ok": true,
  "data": { },
  "pagination": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

失败：

```json
{
  "ok": false,
  "error": { "code": "INVALID_INPUT", "message": "请求参数校验失败", "details": [] },
  "requestId": "req_..."
}
```

### 1.2 状态码与错误码

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | 参数/题目结构校验失败，`details` 可能是字符串数组或字段错误 |
| 401 | `UNAUTHORIZED` | 未登录、会话过期、账号被禁用 |
| 403 | `FORBIDDEN` | 无权限 |
| 403 | `CSRF_FAILED` | CSRF 令牌缺失或不匹配 |
| 403 | `PASSWORD_CHANGE_REQUIRED` | 首次登录/重置密码后必须先改密 |
| 404 | `NOT_FOUND` | 资源不存在或不属于当前用户 |
| 409 | `CONFLICT` | 状态冲突（重复题目、重复交卷、考试不允许重考等） |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体或文件过大 |
| 429 | `RATE_LIMITED` | 触发限流，`details.retryAfterSeconds` 给出等待秒数 |
| 500 | `INTERNAL_ERROR` | 服务端错误（不返回堆栈） |
| 503 | `SERVICE_UNAVAILABLE` | DeepSeek 未配置/不可用、数据库不可用 |

### 1.3 认证与 CSRF

- 登录/注册成功后返回 `Set-Cookie: oq_session=...; HttpOnly; SameSite=Strict`
- 登录、注册、`/auth/me`、`/auth/change-password` 的响应中包含 `csrfToken`
- 所有**写请求**（POST/PUT/PATCH/DELETE）需带 `X-CSRF-Token: <csrfToken>`
- 请求需同源（浏览器会带 `Origin`/`Sec-Fetch-Site`）

### 1.4 分页

查询参数：`page`（默认 1）、`pageSize`（默认 20，最大 100）。

---

## 2. 认证

### GET /api/v1/meta

公开接口，返回站点名称与 AI 开关。

```json
{ "ok": true, "data": { "siteName": "智能答题系统", "aiEnabled": true, "version": "1.0.0" } }
```

### POST /api/v1/auth/register

```json
{
  "username": "student01",
  "password": "StudentPass123",
  "confirmPassword": "StudentPass123",
  "inviteCode": "QZ-XXXX-XXXX-XXXX"
}
```

返回：`{ user, csrfToken, expiresAt }`，并设置会话 Cookie。角色固定为 `user`。

### POST /api/v1/auth/login

```json
{ "username": "student01", "password": "StudentPass123" }
```

返回：`{ user, csrfToken, expiresAt }`。失败统一 401。

### POST /api/v1/auth/logout

需要登录。撤销当前会话并清除 Cookie。

### GET /api/v1/auth/me

需要登录。返回：

```json
{
  "user": { "id": "u_...", "username": "admin", "role": "admin", "status": "active", "mustChangePassword": false, "displayName": null },
  "csrfToken": "...",
  "siteName": "智能答题系统"
}
```

### POST /api/v1/auth/change-password

```json
{
  "currentPassword": "old",
  "newPassword": "newPass123",
  "confirmPassword": "newPass123"
}
```

成功后撤销全部旧会话并返回新会话。

### POST /api/v1/admin/bootstrap

初始化管理员，仅在系统中没有管理员时可用。

- 需要 Secret `ADMIN_SETUP_TOKEN`
- 请求头 `X-Setup-Token` 或 body `setupToken`
- body：`{ "username": "admin", "password": "YourPass123" }`
- 已有管理员返回 409

### GET /api/v1/health

公开。返回 `status`、`db`、`version`、`time`、`environment`；数据库异常时 503。

---

## 3. 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/users/me` | 个人资料 |
| PATCH | `/users/me` | 修改昵称 `{ displayName }` |
| GET | `/users/me/stats` | 学习统计（今日/累计、正确率、错题、收藏、最近考试、7 天活动） |
| GET | `/users/me/history?page=` | 练习历史 + 最近答题 |

`/users/me/stats` 返回示例：

```json
{
  "todayAnswered": 12, "todayCorrect": 9, "todayAccuracy": 75,
  "totalAnswered": 320, "totalCorrect": 240, "totalAccuracy": 75,
  "wrongCount": 18, "wrongTotal": 24, "favoriteCount": 6,
  "examCount": 2, "practiceCount": 15,
  "lastExam": { "id": "ea_...", "examId": "ex_...", "title": "...", "score": 80, "totalScore": 100, "submittedAt": 1700000000000 },
  "recentRecords": [], "dailyActivity": []
}
```

---

## 4. 题目与刷题

### GET /api/v1/questions

查询参数：`q`、`subject`、`categoryId`、`type`、`difficulty`、`knowledge`、`sort`、`page`、`pageSize`。

只返回已发布题目，**不包含答案与解析**。

### GET /api/v1/questions/filters

返回科目、分类、题型、难度选项，用于筛选器。

### GET /api/v1/questions/:id

单题详情（不含答案），包含 `isFavorite`。

### POST /api/v1/questions/:id/answer

```json
{ "answer": ["B"], "sessionId": "ps_...", "timeSpentMs": 12000 }
```

返回：

```json
{
  "questionId": "q_...",
  "isCorrect": true,
  "correctAnswer": ["B"],
  "explanation": "IPv4 地址为 32 位。",
  "duplicate": false,
  "answeredAt": 1700000000000,
  "questionType": "single"
}
```

- 服务端判分，忽略客户端提交的分数
- 同一会话同一题重复提交返回 `duplicate: true` 与既有结果，不重复计数
- 答错自动写入错题本

### POST /api/v1/practice/sessions

```json
{
  "mode": "subject",
  "count": 10,
  "subject": "计算机基础",
  "categoryId": "cat_...",
  "type": "single",
  "difficulty": 2,
  "knowledgePoint": "IPv4"
}
```

`mode`：`random` / `sequence` / `subject` / `category` / `knowledge` / `type` / `difficulty` / `mistake` / `favorite`。

返回 `{ sessionId, questions, total, requested }`。无可用题目返回 409。

### GET /api/v1/practice/sessions/:id

恢复练习：返回会话、题目（不含答案）、已答题的判分结果与解析。

### POST /api/v1/practice/sessions/:id/submit

结束练习，返回 `{ answeredCount, correctCount, totalQuestions, accuracy }`。

### GET /api/v1/practice/history

分页返回练习历史。

### GET /api/v1/mistakes

查询：`status=pending|mastered`、`subject`、`type`、`page`、`pageSize`。不返回答案/解析。

### POST /api/v1/mistakes/:id/mastered

body：`{ "mastered": true }`（可省略，默认 true）。`id` 为错题记录 ID。

### GET /api/v1/favorites

分页收藏列表（不含答案）。

### POST /api/v1/favorites/:questionId

收藏题目。重复收藏不会产生重复记录（`created:false`）。

### DELETE /api/v1/favorites/:questionId

取消收藏。

### GET /api/v1/categories?subject=

分类列表（含已发布题目数）。

---

## 5. 模拟考试

### GET /api/v1/exams

已发布考试列表（`page`、`pageSize`、`subject`）。

### GET /api/v1/exams/:id

返回考试配置、我的考试记录、`openAttemptId`、`canStart`、`blockedReason`、`serverTime`。

### POST /api/v1/exams/:id/start

创建或恢复考试，返回试卷：

```json
{
  "attempt": { "id": "ea_...", "status": "in_progress", "startedAt": 0, "deadlineAt": 0, "totalScore": 100 },
  "exam": { "title": "...", "durationMinutes": 60, "allowReview": "after_submit" },
  "questions": [
    { "id": "eq_...", "questionId": "q_...", "position": 1, "type": "single", "stem": "...", "options": [], "score": 2, "userAnswer": [], "flagged": false, "answered": false }
  ],
  "serverTime": 0,
  "remainingSeconds": 3600
}
```

试卷不含答案与解析。

### GET /api/v1/exam-attempts

我的考试记录（可按 `examId` 过滤）。

### GET /api/v1/exam-attempts/:id

恢复试卷。时间已到会自动交卷并返回 409。

### PUT /api/v1/exam-attempts/:id/answers/:questionId

```json
{ "answer": ["A", "C"], "flagged": true }
```

返回 `{ saved, autoSubmitted, remainingSeconds }`。超时保存时 `saved:false`、`autoSubmitted:true`，并返回成绩。

### POST /api/v1/exam-attempts/:id/submit

交卷并返回成绩。重复交卷返回同一结果，不会重复生成成绩。

### GET /api/v1/exam-attempts/:id/result

返回：

```json
{
  "attempt": { "score": 80, "totalScore": 100, "correctCount": 40, "wrongCount": 8, "unansweredCount": 2, "durationSeconds": 1234, "autoSubmitted": false },
  "reviewAllowed": true,
  "summary": { "byType": { "single": { "total": 30, "correct": 26, "score": 52, "maxScore": 60 } }, "knowledge": [] },
  "questions": []
}
```

`reviewAllowed=false` 时 `correctAnswer`/`explanation` 为 `null`。

---

## 6. 公告

### GET /api/v1/announcements

已发布公告（置顶优先，最多 10 条）。

---

## 7. 管理端

所有 `/admin/*` 接口要求 `role=admin`。

### 7.1 仪表盘、日志、设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/dashboard` | 用户/题库/考试/AI/今日数据/最近日志 |
| GET | `/admin/logs?action=&page=` | 操作日志分页 |
| GET | `/admin/settings` | 站点名称、AI 开关、限额、模型、密钥是否配置、R2 状态 |
| PUT | `/admin/settings` | `{ siteName?, aiEnabled?, aiDailyTaskLimit?, aiMaxQuestions? }` |

### 7.2 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/users?q=&status=&role=&page=` | 用户列表（含答题数/正确数/考试数） |
| GET | `/admin/users/:id` | 用户详情 + 学习统计 |
| POST | `/admin/users/:id/reset-password` | 生成一次性初始密码（仅返回一次），旧会话失效 |
| POST | `/admin/users/:id/disable` | 禁用并撤销会话 |
| POST | `/admin/users/:id/enable` | 恢复 |
| POST | `/admin/users/:id/delete` | 软删除（保留历史数据） |

### 7.3 邀请码

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/invites?status=&page=` | 列表（掩码展示） |
| POST | `/admin/invites` | `{ maxUses, expiresAt, note }`，返回明文一次 |
| POST | `/admin/invites/batch` | `{ count: 1-50, maxUses, expiresAt, note }` |
| POST | `/admin/invites/:id/disable` | 禁用 |
| GET | `/admin/invites/:id/usages` | 使用记录 |

### 7.4 题库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/questions?q=&subject=&type=&status=&difficulty=&page=` | 题目列表（含答案） |
| GET | `/admin/questions/stats` | 各状态数量与题型统计 |
| GET | `/admin/questions/export?format=json\|csv&...` | 导出文件 |
| GET | `/admin/questions/:id` | 题目详情 |
| POST | `/admin/questions` | 新建题目 |
| PUT | `/admin/questions/:id` | 更新（版本 +1，保存快照） |
| DELETE | `/admin/questions/:id` | 软删除 |
| POST | `/admin/questions/:id/publish` | 发布 |
| POST | `/admin/questions/:id/archive` | 归档 |
| POST | `/admin/questions/bulk-category` | `{ ids, subject, category }` 批量改分类 |
| POST | `/admin/questions/import` | `{ format, content, mode, duplicateStrategy, defaultStatus }` |
| POST | `/admin/categories` | 新建分类 |
| DELETE | `/admin/categories/:id` | 删除分类（题目 category_id 置空） |

题目创建/更新 body 与 [QUESTION_FORMAT.md](QUESTION_FORMAT.md) 字段一致，另可带 `status`。

导入响应（预览示例）：

```json
{
  "mode": "preview", "format": "json", "total": 3, "valid": 2, "invalid": 1,
  "duplicates": 0, "inserted": 0, "updated": 0, "skipped": 0,
  "errors": [{ "row": 2, "message": "题干不能为空" }],
  "duplicateDetails": [],
  "preview": []
}
```

### 7.5 AI 出题

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/ai/settings` | 开关、限额、模型、Key 是否配置 |
| PUT | `/admin/ai/settings` | `{ enabled?, dailyLimit?, maxQuestions? }` |
| GET | `/admin/ai/usage` | 今日任务、30 天 Token、待审数量 |
| POST | `/admin/ai/generate` | 见下 |
| GET | `/admin/ai/tasks?status=&page=` | 任务列表 |
| GET | `/admin/ai/tasks/:id` | 任务详情 + 待审题目 |
| GET | `/admin/ai/review-questions?status=&taskId=&page=` | 待审题目 |
| PUT | `/admin/ai/review-questions/:id` | 编辑待审题目 |
| POST | `/admin/ai/review-questions/:id/approve` | 通过并发布（可带修改后的题目） |
| POST | `/admin/ai/review-questions/:id/reject` | `{ reason }` |
| POST | `/admin/ai/review-questions/:id/regenerate` | 重新生成单题（消耗 AI 配额） |
| POST | `/admin/ai/review-questions/batch` | `{ ids, action: "approve"\|"reject", reason? }` |
| GET | `/admin/ai/sources` | 已上传资料 |
| POST | `/admin/ai/sources` | `multipart/form-data`，字段 `file` |
| GET | `/admin/ai/sources/:id` | 资料详情（预览前 3000 字） |
| DELETE | `/admin/ai/sources/:id` | 删除资料 |

`POST /admin/ai/generate` 请求：

```json
{
  "mode": "outline",
  "subject": "计算机基础",
  "category": "计算机网络",
  "examName": "2027 模拟考试",
  "knowledgePoints": ["IPv4", "子网掩码"],
  "typeCounts": { "single": 8, "multiple": 2, "boolean": 0 },
  "count": 10,
  "difficulty": "medium",
  "optionsCount": 4,
  "explanationLength": "medium",
  "includeCalculation": false,
  "requireEvidence": false,
  "outline": "考试大纲正文……",
  "topic": "",
  "requirement": "",
  "documentText": "",
  "sourceId": ""
}
```

`mode`：`outline` / `document` / `topic`。`typeCounts` 全 0 表示由 AI 分配。

响应：

```json
{
  "taskId": "ait_...", "status": "succeeded", "requested": 10, "generated": 10,
  "pendingReview": 9, "invalid": 1, "duplicates": 0,
  "model": "deepseek-chat",
  "usage": { "promptTokens": 1200, "completionTokens": 3400, "totalTokens": 4600 },
  "error": null,
  "questions": [{ "id": "air_...", "status": "pending", "errors": [], "warnings": [], "duplicateOf": null, "stem": "..." }]
}
```

失败任务返回 `status:"failed"` 与 `error`，HTTP 200（任务已记录，便于展示诊断）。

### 7.6 考试管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/exams?page=` | 全部考试 |
| POST | `/admin/exams` | 创建（题目不足返回 400 + `details.shortages`） |
| GET | `/admin/exams/:id` | 详情 + 当前试卷题目 |
| PUT | `/admin/exams/:id` | 更新（抽题范围变化会生成新试卷版本） |
| POST | `/admin/exams/:id/publish` | 发布 |
| POST | `/admin/exams/:id/close` | 关闭 |
| GET | `/admin/exams/:id/results` | 成绩列表 |
| GET | `/admin/exams/:id/results/export` | 导出 CSV |

创建/更新 body：

```json
{
  "title": "模拟考试一",
  "description": "",
  "subject": "计算机基础",
  "categoryIds": [],
  "knowledgePoints": [],
  "typeCounts": { "single": 20, "multiple": 5, "boolean": 5 },
  "difficultyCounts": { "1": 5, "2": 10, "3": 10, "4": 5 },
  "scoreSingle": 2,
  "scoreMultiple": 3,
  "scoreBoolean": 2,
  "durationMinutes": 60,
  "allowEarlySubmit": true,
  "allowReview": "after_submit",
  "startAt": null,
  "endAt": null,
  "allowRetake": false,
  "status": "published"
}
```

`difficultyCounts` 合计必须等于题目总数，或全部为 0（不限难度）。总分由服务端按题型数量×分值计算。

### 7.7 公告

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/announcements` | 全部（含草稿） |
| POST | `/admin/announcements` | `{ title, content, status, pinned }` |
| PUT | `/admin/announcements/:id` | 更新 |
| DELETE | `/admin/announcements/:id` | 删除 |

---

## 8. 限流参考

| 接口 | 限制 |
| --- | --- |
| `POST /auth/register` | 5 / 10 分钟 / IP |
| `POST /auth/login` | 10 / 5 分钟 / IP，8 / 5 分钟 / 账号 |
| `POST /auth/change-password` | 5 / 5 分钟 |
| `POST /questions/:id/answer` | 120 / 分钟 |
| `POST /practice/sessions` | 30 / 分钟 |
| `POST /exams/:id/start` | 15 / 分钟 |
| `PUT /exam-attempts/:id/answers/:qid` | 600 / 分钟 |
| `POST /exam-attempts/:id/submit` | 20 / 分钟 |
| `POST /admin/ai/generate` | 5 / 分钟 + 每日上限 |
| `POST /admin/questions/import` | 10 / 分钟 |

触发时返回 429 与 `Retry-After` 响应头。
