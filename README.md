# 在线智能答题系统

一个可实际部署到 **Cloudflare Workers + D1** 的完整在线答题系统，包含邀请码注册、日常刷题、错题本、收藏、模拟考试、DeepSeek AI 出题与人工审核、管理后台和自动化测试。

> 面向约 50 名用户、2000+ 道题的轻量部署场景，优先使用 Cloudflare 免费额度，不依赖 VPS、Docker、SMTP 或付费鉴权服务。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [常用命令](#常用命令)
- [部署到 Cloudflare](#部署到-cloudflare)
- [题库导入](#题库导入)
- [AI 出题](#ai-出题)
- [测试](#测试)
- [安全设计](#安全设计)
- [已知限制与取舍](#已知限制与取舍)
- [文档索引](#文档索引)

---

## 功能概览

### 普通用户

- 邀请码注册、用户名密码登录、修改密码
- 首页学习数据：今日/累计答题量与正确率、错题数、收藏数、最近考试
- 九种刷题方式：随机、顺序、按科目、按分类、按知识点、按题型、按难度、错题重练、收藏练习
- 内置 500 道十类信息技术自编题（单选 300 / 多选 100 / 判断 100），覆盖考纲 8 个模块
- 提交后由**服务端判分**，返回正确答案与解析；支持收藏、进度恢复、防重复提交
- 错题本：自动收录、累计答错次数、标记掌握、再次答错自动回到待复习
- 收藏列表与收藏练习
- 模拟考试：服务端计时与截止时间、答题卡、标记疑问、暂存答案、断网恢复、自动/手动交卷、成绩分析（题型得分、知识点表现、错题回顾）
- 系统公告与个人学习档案

### 管理员

- 仪表盘：用户、题库、考试、AI 调用、Token 用量、最近操作日志
- 用户管理：搜索、禁用/恢复、软删除、重置一次性初始密码、查看学习统计
- 邀请码：单个/批量生成、次数与有效期、禁用、使用记录（数据库只保存哈希）
- 题库：增删改查、发布/归档、批量修改分类、JSON/CSV 导入导出、多维筛选
- 模拟考试：抽题规则（题型/难度/分类/知识点）、分值、时长、开放时间、成绩导出
- 公告管理
- AI 出题：大纲/资料/自定义主题三种模式，结果全部进入待审核队列；支持编辑、通过、拒绝、重新生成、批量审核
- 操作日志：关键管理操作可追溯

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3（Composition API）+ TypeScript + Vite + Vue Router + Pinia + 原生 CSS |
| 后端 | Cloudflare Workers（TypeScript，模块化路由/中间件/服务/仓储） |
| 数据库 | Cloudflare D1（SQLite），SQL 迁移文件管理 |
| 文件存储 | 默认 D1 存文本；可选 R2 保存原始资料 |
| AI | DeepSeek Chat Completions API（JSON 输出模式），API Key 存 Worker Secret |
| 部署 | `wrangler deploy`，Worker 同时托管前端静态资源与 `/api/*` |
| 测试 | Node 24 内置 `node:test` + `node:sqlite` 驱动的 D1 模拟层，直接调用 Worker 入口 |

### 为什么测试使用 Node 运行时？

`wrangler dev` / `vitest-pool-workers` 依赖 workerd。本项目在部分受限环境（如 Android 容器、arm64 受限地址空间）中 workerd 无法分配内存，因此提供了一套 **Node 24 + `node:sqlite`** 的 D1 兼容层：

- 加载真实 `migrations/*.sql`
- 使用**同一份 Worker 源码**（`src/index.ts` 的 `fetch` 入口）
- 覆盖认证、权限、判分、考试、AI、导入等 47 项集成测试

生产部署仍使用标准 Wrangler + D1，见 [docs/DEPLOY.md](docs/DEPLOY.md)。

---

## 项目结构

```
online-quiz/
├── apps/web/                     # Vue 3 前端
│   ├── src/
│   │   ├── api/                  # fetch 封装与类型化接口
│   │   ├── assets/               # 全局设计系统样式
│   │   ├── components/           # 通用组件（选项、分页、弹窗、提示等）
│   │   ├── composables/          # Toast、主题等组合式函数
│   │   ├── layouts/              # 用户端 / 管理端 / 登录布局
│   │   ├── router/               # 路由与守卫
│   │   ├── stores/               # Pinia 认证状态
│   │   ├── types/                # 前端类型定义
│   │   ├── utils/                # 格式化工具
│   │   ├── views/                # 页面（auth/dashboard/practice/exams/mistakes/favorites/profile/admin）
│   │   ├── App.vue
│   │   └── main.ts
│   ├── public/                   # favicon、安全响应头
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── workers/api/                  # Cloudflare Worker 后端
│   ├── seeds/                    # 演示题库 + 500 道十类信息技术题库
│   ├── src/
│   │   ├── routes/               # 路由（含 admin/）
│   │   ├── middleware/           # 认证、CSRF、限流
│   │   ├── services/             # 业务逻辑（认证、题目、考试、AI、文本提取、统计）
│   │   ├── repositories/         # D1 数据访问
│   │   ├── validators/           # 输入校验、题目结构校验与判分
│   │   ├── utils/                # 加密、HTTP、CSV、日志、错误
│   │   ├── types/                # 环境与模型类型
│   │   ├── router.ts
│   │   └── index.ts              # Worker 入口（API + 静态资源）
│   ├── migrations/0001_init.sql  # 建表、索引、初始配置
│   ├── seeds/demo-questions.json # 演示题库（23 题）
│   ├── seeds/ten-category-it-500.json # 十类信息技术题库（500 题）
│   ├── test/                     # 47 项自动化测试
│   ├── wrangler.toml
│   └── package.json
├── scripts/                      # 运维脚本（Node 运行）
│   ├── create-admin.mjs          # 初始化管理员（SQLite / D1 / API）
│   ├── import-questions.mjs      # 批量导入 2000+ 题
│   ├── validate-questions.mjs    # 题库文件校验
│   ├── check-security.mjs        # 密钥与日志安全自检
│   ├── dev-server.mjs            # Node 本地运行（D1 模拟）
│   ├── dev-all.mjs               # 同时启动 API 与 Vite
│   └── node-runtime/             # D1 兼容层与迁移工具
├── docs/                         # 安装、部署、数据库、安全、格式、API、故障排查
├── .env.example                  # 仅占位符
├── .gitignore
├── package.json                  # npm workspaces
└── README.md
```

---

## 快速开始

### 环境要求

- Node.js **22+**（推荐 24）
- npm **10+**
- 部署时需要 Cloudflare 账号与 `wrangler`（随依赖安装）

```bash
npm install
```

### 方式 A：Node 本地运行（无需 workerd，推荐在此类受限环境使用）

```bash
# 1. 初始化数据库并创建管理员
node scripts/create-admin.mjs --sqlite workers/api/.local/quiz.sqlite --username admin --password 'YourPass123'

# 2. 导入演示题库（23 题）
npm run seed:demo

# 3. 构建前端（首次必须执行）
npm run build

# 4. 启动 API + 前端（同一端口，访问 http://127.0.0.1:8787）
npm run dev:local
```

登录：`admin` / 你设置的密码。

> 前端开发热更新：另开终端运行 `npm run dev:web`，Vite 在 5173 端口并把 `/api` 代理到 8787。

### 方式 B：标准 Cloudflare 本地开发（wrangler）

```bash
# 需要 workerd 能在本机运行
npm run db:migrate:local
npm run build
npm run dev:api          # wrangler dev，默认 http://127.0.0.1:8787
```

初始化管理员（本地 D1）：

```bash
node scripts/create-admin.mjs --username admin --sqlite .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
```

或使用带 `ADMIN_SETUP_TOKEN` 的初始化接口：

```bash
# workers/api/.dev.vars 中设置 ADMIN_SETUP_TOKEN=your-token
curl -X POST http://127.0.0.1:8787/api/v1/admin/bootstrap \
  -H 'content-type: application/json' -H 'x-setup-token: your-token' \
  -d '{"username":"admin","password":"YourPass123"}'
```

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:local` | Node 运行时启动 API + Vite（同端口 8787） |
| `npm run dev:web` | 仅启动 Vite 前端（5173） |
| `npm run dev:api` | `wrangler dev`（需要 workerd） |
| `npm run build` | 构建前端到 `apps/web/dist` |
| `npm run check` | 前后端 TypeScript 类型检查 |
| `npm test` | 运行 47 项自动化测试 |
| `npm run seed:demo` | 向本地数据库导入演示题库 |
| `npm run questions:validate -- 文件` | 校验题库文件 |
| `npm run questions:import -- 文件 --commit --remote` | 批量导入到 D1 |
| `npm run admin:create -- --username admin --remote` | 创建管理员 |
| `npm run security:check` | 扫描密钥泄露与敏感日志 |
| `npm run db:migrate:local` | 本地应用 D1 迁移（wrangler） |
| `npm run db:migrate:remote` | 生产 D1 应用迁移 |
| `npm run deploy` | 构建前端并部署 Worker |

---

## 部署到 Cloudflare

完整步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)，核心流程：

```bash
npx wrangler login
npx wrangler d1 create online-quiz          # 复制 database_id 到 wrangler.toml

npm run build
npm run db:migrate:remote

npx wrangler secret put DEEPSEEK_API_KEY    # AI 出题必需
npx wrangler secret put ADMIN_SETUP_TOKEN   # 可选，用于初始化接口

npm run deploy
```

部署后在 `https://<worker>.workers.dev` 验证：

```bash
curl https://<worker>.workers.dev/api/v1/health
```

初始化管理员（二选一）：

```bash
# 通过 API
node scripts/create-admin.mjs --username admin --api https://<worker>.workers.dev --setup-token <token>

# 或通过 wrangler 直接写 D1
node scripts/create-admin.mjs --username admin --remote --db online-quiz
```

> DeepSeek API 费用与 Cloudflare 无关；Cloudflare 免费额度也可能调整，详见部署文档。

---

## 题库导入

项目内置两套种子题库：

- `workers/api/seeds/demo-questions.json`：23 道演示题
- `workers/api/seeds/ten-category-it-500.json`：**500 道十类信息技术自编题**（见 [题库说明](docs/QUESTION_BANK_500.md)）

一键导入本地库：

```bash
npm run seed:demo            # 23 道演示题
npm run seed:ten-category    # 500 道十类信息技术题
```

支持 JSON 与 CSV，先预览再写入：

```bash
# 预览
npm run questions:validate -- questions.json
npm run questions:import -- questions.json --remote

# 写入
npm run questions:import -- questions.json --commit --remote --status published
```

- 单条题目使用与 API 完全相同的校验规则
- 默认跳过与现有题库题干完全相同的题目（`--allow-duplicates` 可强制）
- 自动创建缺失分类，不会清空题库
- 格式说明与完整示例：[docs/QUESTION_FORMAT.md](docs/QUESTION_FORMAT.md)

---

## AI 出题

1. 管理员在 **管理后台 → AI 出题中心** 选择模式：
   - **大纲出题**：粘贴大纲/知识点范围
   - **资料出题**：上传 TXT/PDF/DOCX，或粘贴正文
   - **自定义主题**：输入主题与要求
2. Worker 调用 DeepSeek（JSON 输出模式），服务端校验结构、答案、选项与重复
3. 合法题目进入 **待审核队列**，管理员编辑/通过/拒绝/重新生成
4. 通过后才写入正式题库（默认发布）

安全与费用控制：

- API Key 只存在 Worker Secret，前端不可见
- 仅管理员可调用；每日任务上限、单次生成上限、输入字符上限可配置
- 记录模型、Token 用量、任务状态；失败不写入题库
- AI 返回内容一律视为不可信数据，先校验后入库

---

## 测试

```bash
npm test
```

覆盖范围：

- 注册/登录/退出、邀请码并发上限、用户名重复、禁用账号、密码重置与强制改密、登录限流、CSRF
- 权限：普通用户访问管理接口、伪造角色、读取答案、跨用户数据隔离
- 判分：单选/多选（顺序无关）/判断/非法答案、重复提交幂等、客户端伪造分数无效
- 考试：题目不足报错、试卷不含答案、服务端计时与自动交卷、重复交卷、历史快照
- AI：合法/非法 JSON、缺失答案、错误题型、默认待审核、每日限额、功能开关、Key 不泄露
- 导入：预览不落库、非法 JSON、缺失字段行号、重复策略（跳过/更新/新建）、CSV、部分失败、不覆盖题库

---

## 安全设计

- 密码：PBKDF2-HMAC-SHA256（WebCrypto 原生实现）+ 16 字节随机盐；格式 `pbkdf2$sha256$iter$salt$hash`，禁止明文/Base64/MD5/单次 SHA-256
- 会话：32 字节随机令牌，只保存 SHA-256；HttpOnly + SameSite=Strict + Secure（HTTPS）
- CSRF：会话绑定令牌 + `X-CSRF-Token` + 同源校验
- 权限：所有管理接口在服务端校验角色；前端守卫仅改善体验
- 限流：D1 原子计数，登录/注册/答题/AI/导入分级限制
- 邀请码：60 bit 随机、只存哈希、掩码展示、原子占用名额
- 答案保密：作答前不下发答案/解析；考试试卷不含答案；成绩由服务端计算
- 审计：关键管理操作写入 `admin_audit_logs`，不含密码/令牌/密钥
- 上传：类型、大小、解压上限校验；扫描版 PDF 明确提示 OCR；资料按数据而非指令处理
- 响应头：CSP、nosniff、Referrer-Policy、frame-ancestors 等

细节与取舍：[docs/SECURITY.md](docs/SECURITY.md)。

---

## 已知限制与取舍

1. **密码哈希使用 PBKDF2 而非 Argon2id**：Workers 无原生 Argon2id，WASM 实现的 CPU/内存开销不适合免费计划。默认 100000 次迭代，可通过 `PASSWORD_ITERATIONS` 调整；若触发 Worker CPU 限制（1102），请下调迭代次数或升级 Workers Paid。详见安全文档。
2. **PDF/DOCX 文本提取为内置轻量实现**：不依赖第三方库；扫描版 PDF、加密 PDF、特殊 CID 字体的 PDF 无法提取时会明确报错并提示 OCR。DOCX 仅读取正文 XML，不包含批注/页眉。
3. **workerd 本地开发**：部分受限 ARM/Android 容器无法运行 workerd（tcmalloc 内存分配失败）。本项目提供 Node 运行时用于本地验收，生产仍走标准 Wrangler。
4. **测试方式**：使用 Node + `node:sqlite` 驱动真实 Worker 代码，而非 `vitest-pool-workers`。D1 的 SQL 与事务语义已尽量对齐，但极端并发行为建议在真实 D1 上复测。
5. **AI 出题为同步请求**：单次最多 50 题，受 Worker 执行时间限制。大批量请分批生成。
6. **未在真实 Cloudflare 账号上验证部署**：本仓库交付时无法访问你的 Cloudflare 账号，部署步骤按官方 Wrangler 流程编写；首次部署请按 [docs/DEPLOY.md](docs/DEPLOY.md) 逐项验证。
7. **软删除策略**：用户与题目均为软删除，历史答题/成绩保留；不提供物理删除入口。
8. **无 SMTP**：不提供邮件验证与找回密码，忘记密码由管理员重置。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/INSTALL.md](docs/INSTALL.md) | 安装、本地开发、初始化管理员 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Cloudflare 部署、D1 迁移、Secret、验证 |
| [docs/DATABASE.md](docs/DATABASE.md) | 表结构、索引、关系、数据保留 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全措施、密码哈希取舍、威胁模型 |
| [docs/QUESTION_FORMAT.md](docs/QUESTION_FORMAT.md) | JSON/CSV 题库格式与示例 |
| [docs/API.md](docs/API.md) | 完整 API 清单与响应格式 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | 常见问题与排查 |

---

## License

本项目代码可自由用于学习与自建部署；演示题库仅用于格式示例，不代表任何官方考试原题。
