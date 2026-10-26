# 部署到 Cloudflare

本项目使用 **单个 Worker** 同时提供 API 与前端静态资源：

- `run_worker_first = ["/api/*"]`：`/api/*` 交给 Worker
- 其余路径由 Workers 静态资源托管（`apps/web/dist`）
- 前端使用 History 路由，`not_found_handling = "single-page-application"`

这样无需单独维护 Pages 项目，也避免跨域 Cookie 问题。

---

## 0. 部署前检查清单

- [ ] 已注册 Cloudflare 账号
- [ ] `node -v` ≥ 22
- [ ] 已执行 `npm install`
- [ ] 已准备 DeepSeek API Key（AI 出题需要；不配置也能使用其它功能）
- [ ] `npm run build` 成功
- [ ] `npm test` 通过

---

## 1. 登录 Wrangler

```bash
npx wrangler login
```

浏览器会打开授权页面。无浏览器的服务器可使用 `CLOUDFLARE_API_TOKEN` 环境变量（在 Cloudflare 控制台创建具有 Workers 与 D1 权限的 Token）。

---

## 2. 创建 D1 数据库

```bash
npx wrangler d1 create online-quiz
```

输出示例：

```toml
[[d1_databases]]
binding = "DB"
database_name = "online-quiz"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把 `database_id` 填入 `workers/api/wrangler.toml` 中对应的占位符：

```toml
[[d1_databases]]
binding = "DB"
database_name = "online-quiz"
database_id = "替换为你的 database_id"
migrations_dir = "migrations"
```

> 免费计划可创建多个 D1 数据库，但注意单库存储与读写额度。

---

## 3. 配置生产环境变量

`workers/api/wrangler.toml` 的 `[vars]` 中：

```toml
[vars]
ENVIRONMENT = "production"
APP_NAME = "智能答题系统"
PASSWORD_ITERATIONS = "100000"
SESSION_TTL_HOURS = "72"
COOKIE_SECURE = "false"   # HTTPS 下会自动加 Secure；也可设为 true
TZ_OFFSET_MINUTES = "480"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
AI_ENABLED = "true"
AI_MAX_QUESTIONS_PER_REQUEST = "50"
AI_DAILY_TASK_LIMIT = "20"
AI_MAX_INPUT_CHARS = "24000"
AI_MAX_OUTPUT_TOKENS = "8000"
AI_TIMEOUT_MS = "120000"
UPLOAD_MAX_BYTES = "10485760"
```

说明：

- `ENVIRONMENT=production` 会启用 HSTS 等生产行为，建议部署时设置
- 密钥**不要**写进 `[vars]`，使用 Secret
- 修改 `[vars]` 后需要重新部署生效

---

## 4. 执行远程数据库迁移

```bash
npm run db:migrate:remote
# 等价于：cd workers/api && npx wrangler d1 migrations apply online-quiz --remote
```

验证表已创建：

```bash
npx wrangler d1 execute online-quiz --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

---

## 5. 设置 Secrets

```bash
npx wrangler secret put DEEPSEEK_API_KEY
# 粘贴 sk-... 后回车，不会回显

# 可选：仅在首次初始化管理员时使用
npx wrangler secret put ADMIN_SETUP_TOKEN
# 建议用 openssl rand -hex 32 生成
```

查看已设置的 Secret 名称（不会显示值）：

```bash
npx wrangler secret list
```

---

## 6. 构建并部署

```bash
npm run build
npm run deploy
```

`npm run deploy` 实际执行：

```bash
npm run build
cd workers/api && npx wrangler deploy
```

首次部署会输出类似：

```
Deployed online-quiz triggers
  https://online-quiz.<subdomain>.workers.dev
```

> `apps/web/dist` 必须存在，否则静态资源为空。CI 中请先构建。

---

## 7. 验证部署

```bash
# 健康检查（包含数据库连通性）
curl -s https://<worker>.workers.dev/api/v1/health

# 站点元信息
curl -s https://<worker>.workers.dev/api/v1/meta

# 首页应返回 HTML
curl -sI https://<worker>.workers.dev/
```

预期健康检查：

```json
{"ok":true,"data":{"status":"ok","db":"ok","version":"1.0.0","time":1700000000000,"environment":"production"}}
```

如果 `db` 为 `error`，说明 D1 绑定或迁移有问题。

---

## 8. 初始化管理员

```bash
# 方式一：通过初始化接口（需要 ADMIN_SETUP_TOKEN）
node scripts/create-admin.mjs \
  --api https://<worker>.workers.dev \
  --setup-token <token> \
  --username admin \
  --password 'YourStrongPass123'

# 方式二：直接写远程 D1（本地已登录 wrangler）
node scripts/create-admin.mjs --username admin --remote --db online-quiz
```

登录后可立即在后台修改密码。

---

## 9. 导入初始题库（约 2000 题）

推荐使用脚本（绕过 Worker 请求大小/时间限制）：

```bash
# 校验
npm run questions:validate -- questions.json

# 预览
npm run questions:import -- questions.json --remote --db online-quiz

# 写入
npm run questions:import -- questions.json --commit --remote --db online-quiz --status published
```

也可以使用管理后台「批量导入」，单次最多 1000 题、文件不超过 5 MB。

---

## 10. 生成邀请码并验证注册

1. 管理员登录后台 → 邀请码 → 生成（可批量）
2. **立即复制**邀请码（只显示一次，数据库只保存哈希）
3. 打开注册页，使用邀请码注册普通用户
4. 普通用户进入首页 → 刷题 → 提交后应看到服务端判分结果

---

## 11. 可选配置

### 11.1 自定义域名

Cloudflare 控制台 → Workers & Pages → 选择 Worker → Settings → Domains & Routes → Add Custom Domain。

绑定后：

- Cookie 自动使用 Secure（HTTPS）
- `Origin` 校验基于实际访问域名，无需额外配置
- 建议开启 Always Use HTTPS

### 11.2 绑定 R2（可选）

```bash
npx wrangler r2 bucket create online-quiz-sources
```

在 `workers/api/wrangler.toml` 取消注释：

```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "online-quiz-sources"
```

重新部署。绑定后：

- 上传的原始资料会保存到 R2
- 提取的文本仍保存到 D1（用于出题）
- 未绑定 R2 时系统完全可用，只是原始文件不保留

### 11.3 调整 AI 限额

后台「系统设置」可直接调整：

- AI 功能开关
- 每日任务上限（1-500）
- 单次生成上限（1-50）

### 11.4 关闭初始化接口

初始化完成后：

```bash
npx wrangler secret delete ADMIN_SETUP_TOKEN
```

或者直接不设置该 Secret。接口在已有管理员时也会返回 409。

---

## 12. 免费额度与费用说明

Cloudflare 免费计划通常包含（以官方最新说明为准）：

- Workers：每天 10 万次请求，单次 CPU 时间有限
- D1：每日读/写行数、存储额度有限
- R2：有一定免费存储与操作额度，超出按量计费

本项目已尽量降低消耗：

- 分页查询、索引覆盖常用筛选
- 答题写入按题粒度、考试暂存合并
- AI 任务限流、输出 Token 上限
- 静态资源由 Workers 托管，无额外 Pages 构建

**注意**：

- DeepSeek API 费用独立计算，与 Cloudflare 免费额度无关
- PBKDF2 迭代次数较高时可能触发 Worker CPU 限制，见安全文档
- 流量、并发、文件大小都会影响实际可用性，不承诺"任何流量下永久免费"

---

## 13. 更新与回滚

更新：

```bash
git pull
npm install
npm run db:migrate:remote   # 如有新迁移
npm run build
npm run deploy
```

回滚代码：重新部署上一个提交。

回滚数据库：D1 迁移默认不可逆。执行迁移前请先导出：

```bash
npx wrangler d1 export online-quiz --remote --output backup-$(date +%F).sql
```

---

## 14. 部署后检查清单

- [ ] `/api/v1/health` 返回 `db: ok`
- [ ] 首页可以打开，登录页无控制台报错
- [ ] 管理员能登录后台
- [ ] 邀请码能注册普通用户
- [ ] 普通用户不能访问 `/admin`
- [ ] 题目作答前不返回答案
- [ ] AI 出题能生成并进入待审核（已配置 Key）
- [ ] `npm run security:check` 通过

遇到问题请查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
