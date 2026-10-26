# 前端 UI 重构记录

## 一、审计发现

重构前的前端是 Vue 3 + Vite + TypeScript + 单文件全局 CSS，没有 Tailwind，也没有 UI 组件库。

| 问题 | 重构前 |
| --- | --- |
| 页面数量 | 28 个视图 |
| 全局 CSS | `apps/web/src/assets/styles.css`，约 1600 行 |
| 毛玻璃 | `backdrop-filter` 16 处 |
| 渐变 | `linear-gradient` 5 处、`radial-gradient` 2 处 |
| 胶囊/大圆角 | `border-radius: 999px` 3 处，卡片 16–22px 圆角 |
| 阴影 | 23 处 `box-shadow`，卡片、按钮、统计块普遍使用 |
| Emoji | 20 个文件、88 个 Emoji 充当图标 |
| 样式分散 | 5 个页面各自带 `<style scoped>`，视觉规则重复 |
| 组件 | 无成熟组件库；弹窗、Toast、分页、表格、菜单均为手写 |

典型问题：

- 紫蓝渐变 + 玻璃拟态 + 大圆角 + 发光阴影，观感像通用 AI 模板。
- 所有页面都是“卡片堆卡片”，错题/收藏列表每题一张卡片。
- 导航、快捷入口、操作按钮大量用 Emoji，缺少统一图标体系。
- 表单、按钮、徽章尺寸不统一，焦点态和禁用态不一致。
- 移动端只是桌面布局缩小，导航和后台侧栏没有真正的响应式方案。

## 二、开源方案评估

| 方案 | 许可证 | 结论 |
| --- | --- | --- |
| [shadcn-vue](https://github.com/unovue/shadcn-vue) 2.8.2 | MIT | 组件分发方案，需要 Tailwind CSS；当前项目没有 Tailwind，28 个视图和 1600 行 CSS 都要重写，冲突和回归风险最大，未采用 |
| [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) | MIT | 完整后台框架，会替换现有工程架构、路由和构建方式，不符合“最小改动”，未采用 |
| [Naive UI](https://github.com/tusen-ai/naive-ui) 2.45.3 | MIT | Vue 3 原生、TypeScript、按需引入、CSS-in-JS、不依赖 Tailwind，能渐进替换公共组件，**采用** |
| [Lucide](https://github.com/lucide-icons/lucide)（`@lucide/vue` 1.61.0） | ISC | 统一线性图标，替代 Emoji，**采用** |

选择 Naive UI 的原因：

1. 与现有 Vue 3.5 / Vite 7 / TypeScript 5.9 技术栈直接兼容，peer dependency 只要求 Vue `^3.0.0`。
2. 不需要引入 Tailwind，不会与现有 CSS 选择器、构建链发生冲突。
3. 组件覆盖本项目实际用到的菜单、下拉、弹窗、消息、分页、加载、进度、表格。
4. 主题变量可集中覆盖，能和新 CSS 设计令牌保持同一套颜色和尺寸。
5. MIT 许可证，依赖关系清晰。

没有直接复制 shadcn-vue 或 Vben Admin 的源码，只使用 npm 依赖；许可证说明见 `THIRD_PARTY_LICENSES.md`。

## 三、设计系统

新界面采用“暖白纸张 + 墨色文字 + 深青主色 + 朱红强调”的扁平方案，去掉了所有玻璃、渐变、霓虹和装饰性阴影。

### 颜色

| 令牌 | 浅色 | 深色 |
| --- | --- | --- |
| `--bg` | `#f7f6f2` | `#111518` |
| `--surface-solid` | `#ffffff` | `#181d22` |
| `--text` | `#1c232b` | `#e8ebee` |
| `--muted` | `#6b7480` | `#8c959d` |
| `--border` | `#e3e0d8` | `#2a3138` |
| `--primary` | `#17494d` | `#7fbdb7` |
| `--accent` | `#c0492f` | `#e08a78` |
| `--success` | `#2f7d5b` | `#63b78d` |
| `--danger` | `#c0492f` | `#e07865` |
| `--warning` | `#a96a14` | `#d6a45a` |

### 尺度

- 圆角：输入框/按钮 6–8px，卡片 8px，弹窗 10px；不再使用全站 16–22px 或胶囊。
- 间距：4 / 6 / 8 / 10 / 14 / 16 / 20 / 24；页面垂直间距 16–22px。
- 字号：正文 15px；辅助 13–14px；页面标题 1.4–1.75rem；卡片标题 1rem。
- 控件高度：普通 36–38px，大号 42–44px。
- 阴影：只保留弹窗、移动端侧栏和 Naive Message 的层级阴影。
- 焦点：2px 主色 outline 或 3px 半透明 ring。
- 动画：页面进入 180ms、弹窗 150ms、进度条 250ms；尊重 `prefers-reduced-motion`。

## 四、实际改动

### 依赖

`apps/web/package.json` 新增：

- `naive-ui@^2.45.3`
- `@lucide/vue@^1.61.0`

### 新增/重写文件

| 文件 | 内容 |
| --- | --- |
| `src/theme/naive.ts` | Naive UI 浅色/深色主题覆盖，与 CSS 令牌同步 |
| `src/App.vue` | `NConfigProvider` + `NMessageProvider` + `NDialogProvider` |
| `src/composables/useToast.ts` | 改为 Naive UI Message，保留原有 `success/error/info` API |
| `src/components/ConfirmDialog.vue` | 改为 `NModal` + `NButton` |
| `src/components/PaginationBar.vue` | 改为 `NPagination` |
| `src/components/LoadingBlock.vue` | 改为 `NSpin` |
| `src/components/EmptyState.vue` | 改为 `NEmpty` + Lucide 图标 |
| `src/components/ProgressBar.vue` | 改为 `NProgress` |
| `src/layouts/DefaultLayout.vue` | 扁平顶栏、Lucide 导航、`NDropdown` 用户菜单、移动端底栏 |
| `src/layouts/AdminLayout.vue` | `NMenu` 侧栏、`NDropdown` 账户菜单、移动端抽屉 |
| `src/layouts/AuthLayout.vue` | 桌面双栏登录面板，移动端单栏 |
| `src/assets/styles.css` | 重写为统一扁平设计系统，删除玻璃/渐变/大阴影/胶囊规则，集中页面级样式 |
| `public/favicon.svg` 等 | 上一轮已替换的纸质墨色图标 |

### 页面调整

- **首页**：Hero 不再包在卡片里；5 个统计块合并为一条 `stat-strip`；快捷入口改为 Lucide 图标；保留最近 7 天、最近考试、公告、学习记录四个区块。
- **刷题设置**：9 种模式改为扁平模式网格，图标来自 Lucide；练习设置保持单一表单面板。
- **答题页**：进度条并入题目卡片，减少一层卡片；选项、正确/错误反馈、收藏、标记改为扁平样式和图标。
- **考试列表/详情/考试中**：去掉 Emoji 元信息，改用 FileText/Clock/Award/Users/Flag 图标；考试栏改为实色粘性栏。
- **考试结果**：题目回顾不再“卡片套卡片”，改为一个面板内的分隔行；统计块改为 `mini-stat`。
- **错题本/收藏**：每题一张卡片改为一个 `list-panel` 内的 `list-question` 行，信息密度更高。
- **登录/注册**：桌面为品牌说明 + 表单双栏，移动端单栏；表单标题和辅助说明重新分层。
- **管理后台**：侧栏改为 Naive `NMenu`，分组、图标、移动端抽屉；仪表盘快捷入口换图标。
- **操作日志**：迁移为 Naive `NDataTable`，保留服务端分页和筛选。
- **管理端导入/AI 出题**：嵌套卡片改为预览行/上传摘要，避免卡片套卡片。

## 五、保留的原有功能

以下均未改动：

- 所有路由地址和页面结构。
- 后端 API、D1 表结构、认证、CSRF、权限、限流、考试快照与判分逻辑。
- 用户登录/注册/改密、刷题、模拟考试、错题、收藏、个人中心。
- 管理后台的用户、题库、导入、AI 出题/审核、考试、公告、日志、设置。
- 环境变量名称和 Cloudflare Workers 部署方式。

## 六、验证结果

| 项目 | 结果 |
| --- | --- |
| `npm run check` | 通过（前端 vue-tsc + 后端 tsc） |
| `npm run build` | 通过；CSS 25.6KB，入口 JS 约 478KB（gzip 147.7KB） |
| `npm test` | 50 / 50 通过 |
| `npm run security:check` | 通过；扫描 46 个前端产物，未发现密钥或服务端环境变量 |
| happy-dom 运行时冒烟 | 登录、首页、刷题、考试列表、错题本、个人中心、管理后台/日志均能挂载并输出预期文本 |
| 真实浏览器截图 | 未完成：容器内 Chromium/Firefox 启动即退出（内核限制）；手机端截图需要无障碍服务，当前未开启 |

> 没有虚构“浏览器截图验证”。构建、类型检查、自动化测试和 happy-dom 渲染均实际执行；真实浏览器/手机端视觉检查需要用户在可用环境中再确认一次。

## 七、已知问题与后续

1. **包体增大**：Naive UI 使入口 JS 从约 126KB 增至约 478KB（gzip 147.7KB）。后续可对管理后台做更细的异步分包，或只在管理端加载 Naive UI 的重组件。
2. **仅迁移了一张表格**：操作日志使用 `NDataTable`；用户、题库、考试、邀请码等表格暂时保留语义化 `<table>`，因为包含大量行内操作和移动端横向滚动，全面迁移需要逐页回归。现有表格已统一为 13.5px 密度、粘性表头和扁平边框。
3. **管理仪表盘未做完整 mock 渲染**：happy-dom 中该页依赖完整统计字段，mock 数据不全时会报警；生产 API 的字段是完整的，未改后端。
4. **真实浏览器视觉未验证**：需要在 Chrome/Safari 中检查桌面 1440、平板 900、手机 390 三个宽度的间距、换行和触控区域。

## 八、后续建议

- 用真实浏览器检查登录页、首页、答题页、考试结果页、管理后台五个关键页面。
- 若包体不可接受，将管理后台路由拆为独立异步 chunk，并把 Naive UI 组件按需注册。
- 逐步把剩余管理表格迁移到 `NDataTable`，优先用户管理和题库管理。
- 可以继续用 Naive UI 的 `NForm`/`NSelect` 替换管理端原生表单，但需要逐页回归校验和错误提示。
