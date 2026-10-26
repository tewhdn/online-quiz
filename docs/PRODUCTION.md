# 生产环境部署记录

## 访问地址

| 项目 | 值 |
| --- | --- |
| 自定义域名 | https://exam.shandiana.cn |
| Workers 地址 | https://online-quiz.2932944216.workers.dev |
| Worker 名称 | `online-quiz` |
| 运行环境 | Cloudflare Workers，`ENVIRONMENT=production` |
| 数据库 | Cloudflare D1 `online-quiz` |
| D1 Database ID | `76f0d04c-4f11-48a3-af29-6d10806c131e` |
| D1 区域 | APAC |
| 静态资源 | 由同一 Worker 托管（`apps/web/dist`） |

## 最近更新

- 2026-10-26：替换站点图标、Apple Touch Icon 与 PWA 图标（纸质墨色 + 朱红批改线），并同步更新页头品牌标记
- 2026-10-26：前端 UI 重构（Naive UI + Lucide，扁平设计系统，移除毛玻璃/渐变/Emoji 图标）
- 2026-10-26：AI 出题改为每批 10 题自动拆分，并增加 jsonrepair 容错与单批失败 partial 处理

## 已配置内容

- D1 迁移：`0001_init.sql` 已应用（24 张表）
- 管理员：`admin`（首次登录强制修改密码）
- 题库：500 道十类信息技术自编题，全部已发布
  - 单选 300 / 多选 100 / 判断 100
  - 8 个模块，8 个分类
- DeepSeek：`DEEPSEEK_API_KEY` 已设置为 Worker Secret
  - 已实测生成 1 道题（683 tokens），联调题目已拒绝，待审核队列为 0
- 邀请码：已生成 1 个（5 次可用），不在本文件中保存
- R2：未绑定（上传资料文本存 D1，基础功能不受影响）
- `ADMIN_SETUP_TOKEN`：未设置（初始化接口已关闭）

## 首次登录

1. 打开 https://exam.shandiana.cn
2. 用户名：`admin`
3. 初始密码：见服务器/手机本地文件
   `workers/api/.local/ADMIN_INITIAL_PASSWORD.txt`
4. 系统会强制要求修改密码；修改后旧密码立即失效
5. 建议修改完成后删除该密码文件

## 日常运维命令

```bash
# 进入项目
cd /sdcard/项目/online-quiz

# 查看线上日志
npx wrangler tail online-quiz

# 查看 D1 数据
npx wrangler d1 execute online-quiz --remote --command "SELECT COUNT(*) FROM questions;"

# 备份数据库
npx wrangler d1 export online-quiz --remote --output backup-$(date +%F).sql

# 新增迁移后应用
cd workers/api
npx wrangler d1 migrations apply online-quiz --remote

# 更新代码并部署
cd /sdcard/项目/online-quiz
npm run build
cd workers/api
npx wrangler deploy
```

> 在执行 wrangler 命令前，需要 `npx wrangler login`，或设置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 环境变量。

## 更新题库

```bash
# 导入新的 JSON/CSV（自动跳过完全重复题目）
npm run questions:import -- 新题库.json --commit --remote --db online-quiz --status published
```

## 安全事项

1. 部署使用的 Cloudflare API Token 已在对话中提供，**请立即到控制台吊销**：
   https://dash.cloudflare.com/155802d06fbb28e48df4679628b75342/api-tokens
2. DeepSeek API Key 也曾在对话中出现，建议在 DeepSeek 控制台轮换，然后执行：
   ```bash
   cd workers/api
   npx wrangler secret put DEEPSEEK_API_KEY
   ```
3. 管理员首次登录必须改密；不要继续使用初始密码。
4. 不要将 `.dev.vars`、`.local/`、Token 或密码提交到 Git。
5. 如需 R2：创建桶、绑定 `R2` 后重新部署；当前未使用。

## 已知限制

- 十类职测还有物理约 40%，当前 500 题仅覆盖信息技术部分
- AI 每日任务上限 20 次、单次最多 50 题（后台可调）
- Cloudflare 免费额度与 DeepSeek 费用独立计算
