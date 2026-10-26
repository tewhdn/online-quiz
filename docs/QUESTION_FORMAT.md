# 题库格式与导入

支持 **JSON** 与 **CSV**。所有导入路径（管理后台、命令行脚本）使用同一套服务端校验规则。

> PDF / DOCX / TXT 不是标准题库格式，仅用于 AI 出题资料。

## 1. JSON 格式

顶层可以是题目数组，也可以是包含 `questions` 数组的对象：

```json
{
  "version": 1,
  "questions": []
}
```

### 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | ✓ | `single` 单选、`multiple` 多选、`boolean` 判断（也接受「单选/多选/判断」） |
| `subject` | ✓ | 科目，≤60 字符 |
| `category` | ✗ | 分类，缺省等于科目；导入时自动创建分类 |
| `knowledge_points` | ✗ | 字符串数组或顿号/逗号分隔字符串，最多 10 个，单个 ≤40 字符 |
| `difficulty` | ✗ | 1–5 整数，默认 2 |
| `stem` | ✓ | 题干，≤5000 字符 |
| `options` | 选择题必填 | `[{ "key": "A", "text": "..." }]`，2–8 个；也接受 `["A. 选项内容", ...]` |
| `answer` | ✓ | 字符串数组；判断题 `["true"]` 或 `["false"]` |
| `explanation` | 建议 | 解析，≤5000 字符；缺失会产生警告 |
| `source` | ✗ | 来源，≤200 字符 |
| `source_ref` | ✗ | 来源章节/大纲条目，≤200 字符 |
| `tags` | ✗ | 字符串数组，≤10 个 |
| `status` | ✗ | `draft` / `published`；导入时可由参数覆盖 |

### 题型规则

**单选题**

- 至少 2 个选项，key 唯一（A–H）
- `answer` 必须恰好 1 个，且存在于选项中
- 判分：完全匹配

**多选题**

- 至少 2 个选项
- `answer` 至少 1 个，全部存在于选项中，重复项自动去重
- 判分：完全匹配；漏选、错选均不得分；提交顺序无关

**判断题**

- `options` 必须为空（或省略，服务端会清空）
- `answer` 只能是 `["true"]` 或 `["false"]`（也接受布尔值 `true`/`false`、`正确`/`错误`，服务端归一化）

### 示例

```json
{
  "version": 1,
  "questions": [
    {
      "type": "single",
      "subject": "计算机基础",
      "category": "计算机网络",
      "knowledge_points": ["IP地址"],
      "difficulty": 2,
      "stem": "IPv4 地址由多少位二进制数组成？",
      "options": [
        { "key": "A", "text": "16 位" },
        { "key": "B", "text": "32 位" },
        { "key": "C", "text": "64 位" },
        { "key": "D", "text": "128 位" }
      ],
      "answer": ["B"],
      "explanation": "IPv4 地址长度为 32 位。",
      "source": "示例题"
    },
    {
      "type": "multiple",
      "subject": "计算机基础",
      "category": "网络设备",
      "knowledge_points": ["网络设备"],
      "difficulty": 3,
      "stem": "以下哪些设备可以工作在网络层？",
      "options": [
        { "key": "A", "text": "路由器" },
        { "key": "B", "text": "三层交换机" },
        { "key": "C", "text": "集线器" },
        { "key": "D", "text": "中继器" }
      ],
      "answer": ["A", "B"],
      "explanation": "路由器和三层交换机具备网络层转发能力。",
      "source": "示例题"
    },
    {
      "type": "boolean",
      "subject": "计算机基础",
      "category": "计算机基础知识",
      "knowledge_points": ["数据表示"],
      "difficulty": 1,
      "stem": "计算机使用二进制表示和处理数据。",
      "options": [],
      "answer": ["true"],
      "explanation": "现代计算机通常使用二进制进行底层数据表示与处理。",
      "source": "示例题"
    }
  ]
}
```

完整可导入示例：`workers/api/seeds/demo-questions.json`。

## 2. CSV 格式

第一行是表头，支持中英文列名。

推荐列：

```csv
type,subject,category,knowledge_points,difficulty,stem,option_a,option_b,option_c,option_d,answer,explanation,source,source_ref,tags
```

也支持用 `options` 列写选项：

```csv
type,subject,category,knowledge_points,difficulty,stem,options,answer,explanation,source
single,计算机基础,计算机网络,IP地址,2,IPv4 地址由多少位组成？,A. 16 位|B. 32 位|C. 64 位|D. 128 位,B,IPv4 为 32 位,示例
```

规则：

- 字段包含逗号/换行/双引号时用双引号包裹，内部双引号写成 `""`
- 判断题的 `answer` 写 `true` 或 `false`，选项列留空
- `option_a`–`option_h` 会自动组装为 A–H
- `options` 列支持 `A. 内容|B. 内容` 或 `内容1|内容2`（自动分配 key）
- 空行会被忽略

## 3. 导入行为

### 3.1 管理后台导入

1. 选择格式（JSON/CSV）与重复策略
2. 上传文件（≤5MB）或粘贴内容
3. 点击「预览」查看：可导入数量、失败数量、重复项、行号级错误
4. 确认后点击「确认导入」写入

单次最多 **1000 道题**（Web 端）。更大的题库请用命令行脚本。

### 3.2 命令行导入

```bash
# 预览
npm run questions:import -- questions.json --remote

# 写入生产 D1
npm run questions:import -- questions.json --commit --remote --db online-quiz --status published
```

脚本限制 20000 条/次，自动分批 200 条执行，自动创建分类。

### 3.3 重复策略

| 策略 | 行为 |
| --- | --- |
| `skip`（默认） | 题干哈希相同或高度相似时跳过 |
| `update` | 更新匹配到的题目，版本号 +1 并保存修订快照 |
| `create` | 全部作为新题导入（可能出现重复题干） |

- 精确重复：归一化题干（去空白/标点、转小写）的 SHA-256 相同
- 近似重复：同科目候选题的字符二元组相似度 ≥ 0.9，仅作提示
- 不会删除或清空已有题目
- 校验失败的题目跳过，其余题目正常写入（部分成功），错误按行号返回

### 3.4 常见错误

| 错误信息 | 原因 |
| --- | --- |
| `题干不能为空` | `stem` 缺失/空白 |
| `选择题至少需要 2 个选项` | `options` 数量不足 |
| `选项 key 存在重复` | 两个选项使用同一个 key |
| `选项内容存在重复` | 两个选项文本相同 |
| `单选题只能有一个正确答案` | `answer` 多于 1 个 |
| `答案 B 不在选项中` | 答案 key 与选项不匹配 |
| `判断题答案必须是 true 或 false` | 判断题答案写成了 A/B |
| `难度必须是 1-5 的整数` | `difficulty` 越界 |

### 3.5 状态

- 管理后台导入默认 `draft`（推荐），确认无误后再发布
- 可在导入时选择 `published` 直接发布
- 命令行使用 `--status published`

## 4. AI 生成题目结构

AI 必须返回：

```json
{
  "questions": [
    {
      "type": "single",
      "subject": "计算机基础",
      "category": "计算机网络",
      "knowledge_points": ["IPv4 地址"],
      "difficulty": 2,
      "stem": "IPv4 地址的长度是多少？",
      "options": [
        { "key": "A", "text": "16 位" },
        { "key": "B", "text": "32 位" },
        { "key": "C", "text": "64 位" },
        { "key": "D", "text": "128 位" }
      ],
      "answer": ["B"],
      "explanation": "IPv4 地址使用 32 位表示。",
      "source": "管理员指定主题",
      "evidence": "IPv4 地址长度为 32 位。"
    }
  ]
}
```

服务端处理流程：

1. 提取 JSON（容忍 Markdown 代码块围栏）
2. 结构校验（与导入同一套规则）
3. 答案/选项格式校验
4. 与现有题库重复检测
5. 合法题目进入 `pending`，明显问题进入 `invalid`
6. 管理员审核通过后才写入正式题库

`evidence` 只是模型给出的原文依据，不能保证真实；管理员应核对。若模型无法提供依据，允许为空，系统不会声称题目已通过权威审核。
