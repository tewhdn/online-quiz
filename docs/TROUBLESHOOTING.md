# 故障排查

## 本地开发

### `workerd` 启动失败 / tcmalloc / MmapAligned 错误

现象：

```
MmapAligned() failed ... TCMalloc assumes a 48-bit virtual address space
```

原因：当前系统（常见于 ARM/Android 容器、受限地址空间环境）无法运行 workerd。

处理：

```bash
# 使用 Node 运行时
node scripts/create-admin.mjs --sqlite workers/api/.local/quiz.sqlite --username admin --password 'YourPass123'
npm run seed:demo
npm run build
npm run dev:local
```

这是环境限制，不是项目代码问题。标准 Linux/macOS 或 CI 环境可使用 `npm run dev:api`。

### `unable to open database file`

目标目录不存在。先创建：

```bash
mkdir -p workers/api/.local
```

脚本通常会自动创建父目录；若手动指定路径仍失败，检查写入权限。

### 前端白屏 / 404

- 未构建：`npm run build`
- `wrangler dev` 的 `[assets] directory` 指向 `../../apps/web/dist`，构建后才有文件
- 检查 `apps/web/dist/index.html` 是否存在

### 登录后立刻掉线

- 确认使用 `http://127.0.0.1:8787` 或 `http://localhost:5173`（同源代理）
- HTTPS 环境 Cookie 会带 `Secure`，HTTP 环境无法保存 → 使用 HTTPS 或本地 HTTP
- 检查浏览器是否禁用 Cookie
- 查看 `/api/v1/auth/me` 是否返回 401

### 写请求返回 `403 CSRF_FAILED`

- 前端会话刷新后需重新获取 `csrfToken`（刷新页面会自动通过 `/auth/me` 获取）
- 自定义客户端需把 `/auth/me` 返回的 `csrfToken` 放入 `X-CSRF-Token`
- 跨站请求会被拒绝，请保持同源

### `429 RATE_LIMITED`

正常限流。查看响应头 `Retry-After`，等待后重试。测试环境可通过不同 IP 或清空 `rate_limits` 表重置：

```bash
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('workers/api/.local/quiz.sqlite').exec('DELETE FROM rate_limits')"
```

---

## 数据库

### `no such table: users`

迁移未执行：

```bash
# Node 模式：重新运行任一脚本（会自动迁移），或
npm run db:migrate:local

# 生产
npm run db:migrate:remote
```

### 生产环境 `database_id` 未配置

`wrangler.toml` 中仍是 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。执行：

```bash
npx wrangler d1 create online-quiz
```

把输出的 `database_id` 填入配置后重新部署。

### 迁移冲突 / 重复执行

- 不要修改已应用的迁移文件
- 新增 `0002_xxx.sql` 等新文件
- 生产执行前先 `wrangler d1 export` 备份
- 本地可删除 `.wrangler/state` 或 `workers/api/.local` 重建

### 导入后分类 ID 为空

命令行导入会自动创建分类并关联；若手动写 SQL，请确保 `category_id` 指向已存在的 `question_categories.id`，或留 NULL。

---

## 部署

### `wrangler login` 打不开浏览器

```bash
# 使用 API Token
export CLOUDFLARE_API_TOKEN=...
npx wrangler deploy
```

Token 需要 Workers Scripts、D1、R2（可选）权限。

### 部署成功但首页 404

- `apps/web/dist` 未构建或为空
- `wrangler.toml` 中 `run_worker_first` 只应匹配 `/api/*`
- 确认部署日志中包含静态资源上传

### 部署后接口 500 / `db: error`

- D1 绑定名称必须是 `DB`
- 迁移是否已应用：`npx wrangler d1 migrations list online-quiz --remote`
- 查看实时日志：`npx wrangler tail`

### 部署后登录接口报 1102（CPU 超限）

PBKDF2 迭代次数过高。下调：

```toml
[vars]
PASSWORD_ITERATIONS = "60000"
```

重新部署。或在后台/数据库迁移前先用脚本重新哈希已有密码（注意需要用户旧密码，通常不建议）；更稳妥的做法是升级 Workers Paid。

### 静态资源缓存了旧版本

- 修改后重新 `npm run build && npm run deploy`
- HTML 设置为 `no-cache`，JS/CSS 带内容哈希
- 强制刷新浏览器或清 CDN 缓存

---

## AI 出题

### `未配置 DeepSeek API Key`

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

本地写入 `workers/api/.dev.vars`。

### `DeepSeek API Key 无效`

- 检查 Key 是否复制完整
- 检查 `DEEPSEEK_BASE_URL` 是否正确（默认 `https://api.deepseek.com`）
- 确认 Secret 名称拼写

### `账户余额不足` / 429

DeepSeek 账户问题或频率限制。充值或稍后重试。Cloudflare 免费额度不覆盖 DeepSeek。

### AI 返回非法 JSON

系统会记录任务 `failed`，不会写入题库。可：

1. 减少生成数量
2. 降低难度范围
3. 换更明确的主题/大纲
4. 重试或手动出题

### 生成很慢 / 超时

- 单次生成数量减少（建议 10–20 题）
- 提高 `AI_TIMEOUT_MS`（最大 300000）
- Worker 有执行时间限制，超大批量请分批

### 资料 PDF 无法提取

- 扫描版 PDF 需要先 OCR
- 加密 PDF 需解除密码
- 特殊字体编码可能提取为乱码，建议改传 TXT/DOCX
- 超过大小/字符上限会被截断并提示

### 上传文件被拒绝

- 仅支持 TXT/PDF/DOCX
- 默认 10MB 上限（`UPLOAD_MAX_BYTES`）
- 空文件、损坏的 DOCX/PDF 会报错

---

## 考试

### 开始考试返回 409

可能原因：

- 已有一场未完成考试（返回 `openAttemptId`，可继续）
- 考试不允许重复参加且已交卷
- 试卷为空/未生成

### 交卷后成绩为 0

- 是否所有题都未作答
- 检查考试题目快照是否完整
- 查看 `exam_attempts.result_detail`

### 时间到但没有自动交卷

前端依赖服务端 `remainingSeconds` 与本地倒计时；即使前端未触发，服务端保存答案/查询成绩时也会检查截止时间并自动交卷。若浏览器长时间休眠，重新打开页面会触发结算。

### 历史成绩被修改

正常情况下不会：成绩与题目快照保存在 `exam_attempts.result_detail` 与 `exam_question_sets/exam_questions`。若手动改库需自行负责。

---

## 权限与账号

### 管理员无法登录

- 确认账号 `role='admin'` 且 `status='active'`
- 用脚本重新创建/重置：

```bash
node scripts/create-admin.mjs --username admin --sqlite workers/api/.local/quiz.sqlite --force
```

### 忘记密码

系统无邮件找回。管理员在后台「用户管理 → 重置密码」生成一次性初始密码；用户首次登录必须改密。

### 普通用户能看到管理菜单

前端菜单仅按角色显示，但即使手动访问 `/admin`，所有管理接口仍会返回 403。若确实能调用，请检查后端版本。

---

## 测试

### `npm test` 失败

```bash
node --version   # 需要 22.5+，推荐 24
npm test
```

若失败集中在数据库相关断言，检查 `workers/api/migrations/0001_init.sql` 是否被修改。

### 测试通过但线上异常

本地使用 Node 的 D1 兼容层，线上是真实 D1。请重点检查：

- 迁移是否全部应用
- Secret 是否配置
- Worker 日志 `npx wrangler tail`
- 免费额度是否用尽

---

## 安全事件处理

如果怀疑密钥泄露：

1. 立即在 DeepSeek 控制台吊销旧 Key，重新 `wrangler secret put DEEPSEEK_API_KEY`
2. 删除 `ADMIN_SETUP_TOKEN`
3. 强制所有用户重新登录：清空 `sessions` 表或重置密码
4. 检查 `admin_audit_logs` 与 Cloudflare 日志
5. 运行 `npm run security:check` 确认仓库无硬编码密钥

```bash
npx wrangler d1 execute online-quiz --remote --command "DELETE FROM sessions;"
```
