# 安装与本地开发

本文档覆盖从零安装、初始化数据库、创建管理员、导入题库到本地访问的完整流程。

## 1. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 22+（推荐 24） | 脚本使用内置 `node:sqlite`，需 Node 22.5+ |
| npm | 10+ | 使用 npm workspaces |
| Cloudflare 账号 | 仅部署需要 | 本地开发不需要 |

```bash
node -v
npm -v
```

## 2. 安装依赖

```bash
cd online-quiz
npm install
```

安装内容：

- 前端：Vue 3、Vue Router、Pinia、Vite、vue-tsc
- 后端：wrangler、TypeScript、Cloudflare Workers 类型
- 测试：Node 内置 `node:test`（无需额外安装测试框架）

## 3. 选择本地运行方式

项目支持两种本地运行方式，**任选其一**。

### 方式 A：Node 运行时（推荐，兼容性最好）

使用 `scripts/node-runtime` 中的 D1 兼容层，加载真实迁移并直接调用 Worker 的 `fetch` 入口。

优点：

- 不需要 workerd，可在 ARM/Android 容器等受限环境运行
- 与生产使用同一套 Worker 路由与业务代码
- 前后端同端口，无跨域问题

步骤：

```bash
# 1) 创建管理员（会自动创建数据库文件并应用迁移）
node scripts/create-admin.mjs \
  --sqlite workers/api/.local/quiz.sqlite \
  --username admin \
  --password 'YourPass123'

# 2) 导入题库（可选）
npm run seed:demo            # 23 道演示题
npm run seed:ten-category    # 500 道十类信息技术题

# 3) 构建前端
npm run build

# 4) 启动（API + 静态资源，默认 127.0.0.1:8787）
npm run dev:local
```

打开 <http://127.0.0.1:8787>，使用刚才的管理员账号登录。

数据库文件：`workers/api/.local/quiz.sqlite`（已加入 `.gitignore`）。

重置本地数据：

```bash
rm -rf workers/api/.local
```

> 前端热更新开发：另开终端运行 `npm run dev:web`，访问 <http://127.0.0.1:5173>，Vite 会代理 `/api` 到 8787。此时请保持 `node scripts/dev-server.mjs` 运行。

### 方式 B：wrangler dev（标准 Cloudflare 本地）

需要 workerd 能在当前系统运行。

```bash
# 1) 应用本地 D1 迁移
npm run db:migrate:local

# 2) 构建前端（assets 目录必须存在）
npm run build

# 3) 启动
npm run dev:api
```

wrangler 会读取 `workers/api/wrangler.toml`：

- D1 绑定 `DB`（本地状态保存在 `workers/api/.wrangler/state`）
- 静态资源绑定 `ASSETS`，指向 `apps/web/dist`
- 环境变量在 `[vars]`

本地密钥放在 `workers/api/.dev.vars`（已在 `.gitignore`）：

```dotenv
DEEPSEEK_API_KEY=
ADMIN_SETUP_TOKEN=local-setup-token
```

> `.dev.vars` 不要提交到仓库，也不要写入真实生产密钥以外的敏感信息。

## 4. 环境变量

复制 `.env.example` 作为参考。变量说明：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PASSWORD_ITERATIONS` | 100000 | PBKDF2 迭代次数；CPU 受限时可下调 |
| `SESSION_TTL_HOURS` | 72 | 会话有效期 |
| `COOKIE_SECURE` | false | HTTPS 会自动加 Secure，可强制开启 |
| `TZ_OFFSET_MINUTES` | 480 | 统计"今日"使用的时区偏移（东八区 480） |
| `DEEPSEEK_API_KEY` | 空 | **必须通过 Secret 设置**，禁止写入仓库 |
| `DEEPSEEK_BASE_URL` | https://api.deepseek.com | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | deepseek-chat | 模型名称 |
| `AI_ENABLED` | true | AI 功能默认开关（数据库设置优先） |
| `AI_MAX_QUESTIONS_PER_REQUEST` | 50 | 单次生成上限（最大 50） |
| `AI_DAILY_TASK_LIMIT` | 20 | 每日任务上限（数据库可调） |
| `AI_MAX_INPUT_CHARS` | 24000 | 大纲/资料输入字符上限 |
| `AI_MAX_OUTPUT_TOKENS` | 8000 | 输出 Token 上限 |
| `AI_TIMEOUT_MS` | 120000 | 单次 AI 调用超时 |
| `UPLOAD_MAX_BYTES` | 10485760 | 上传文件大小上限（10 MB） |
| `ADMIN_SETUP_TOKEN` | 空 | 初始化管理员接口令牌（可选） |

生产环境请用：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put ADMIN_SETUP_TOKEN
```

## 5. 初始化管理员

### 方式一：直接写数据库（推荐）

```bash
# Node 本地 SQLite
node scripts/create-admin.mjs --sqlite workers/api/.local/quiz.sqlite --username admin --password 'YourPass123'

# 生产 D1（需要已登录 wrangler，且已执行远程迁移）
node scripts/create-admin.mjs --username admin --remote --db online-quiz
```

密码来源优先级：`--password` > 环境变量 `ADMIN_PASSWORD` > 自动生成（只打印一次）。

脚本会：

- 校验用户名/密码强度
- 使用与线上一致的 PBKDF2 哈希
- 默认拒绝在已有管理员时重复创建（`--force` 可强制）
- 写入一条初始化审计日志

### 方式二：初始化接口

部署时设置 `ADMIN_SETUP_TOKEN`，然后：

```bash
node scripts/create-admin.mjs \
  --api https://your-app.workers.dev \
  --setup-token <token> \
  --username admin \
  --password 'YourPass123'
```

该接口在系统已存在管理员后会返回 409，不能用于日常创建管理员。

### 方式三：登录后创建

先用方式一/二创建管理员，登录后台后通过「邀请码」邀请普通用户。系统**不提供**公开的管理员注册入口。

## 6. 导入题库

```bash
# 预览（默认不写入）
npm run questions:validate -- workers/api/seeds/demo-questions.json

# 写入本地数据库
npm run questions:import -- workers/api/seeds/demo-questions.json --commit --sqlite workers/api/.local/quiz.sqlite --status published
```

格式见 [QUESTION_FORMAT.md](QUESTION_FORMAT.md)。单次脚本最多 20000 条；Web 端批量导入单次最多 1000 条。

## 7. 验证安装

1. `npm test` 应全部通过（47 项）
2. `npm run check` 类型检查通过
3. `GET /api/v1/health` 返回 `{"ok":true,"data":{"status":"ok","db":"ok"}}`
4. 管理员登录后台，能生成邀请码、创建题目
5. 用邀请码注册普通用户，能进入刷题并看到判分结果

## 8. 常见安装问题

| 现象 | 处理 |
| --- | --- |
| `unable to open database file` | 目标目录不存在；脚本已自动创建，若手动指定路径请先 `mkdir -p` |
| `workerd ... MmapAligned failed` / `tcmalloc` | 当前环境无法运行 workerd，改用方式 A |
| 前端 404 / 白屏 | 先执行 `npm run build` |
| `no such table: users` | 未应用迁移；Node 模式脚本会自动迁移，wrangler 模式执行 `npm run db:migrate:local` |
| 登录后立即退出 | 检查是否 HTTPS 但 `COOKIE_SECURE` 配置异常，或浏览器禁用了 Cookie |
| AI 返回“未配置 API Key” | 设置 `DEEPSEEK_API_KEY`（本地 `.dev.vars`，生产 Secret） |

更多问题见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
