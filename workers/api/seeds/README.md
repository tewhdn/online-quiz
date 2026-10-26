# 种子题库

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `demo-questions.json` | 23 道演示题 | 快速验收、格式示例 |
| `ten-category-it-500.json` | 500 道十类信息技术自编题 | 正式练习题库 |

## 500 题题库说明

- 依据《2027 年河北省高职单招十类职业适应性测试考试说明》中“信息技术”部分的 8 个模块自编
- 单选 300、多选 100、判断 100
- 覆盖：信息技术基础、数据与编码、算法与编程、数据结构、信息系统与网络、信息处理、人工智能、信息社会责任
- 每题含选项、正确答案、解析、知识点、难度
- **不是官方原题**，也未抄录任何题库；题目由脚本按知识点原创或程序化计算生成

重新生成：

```bash
npm run bank:build
```

导入本地数据库：

```bash
npm run seed:ten-category
```

导入 Cloudflare D1：

```bash
npm run questions:import -- workers/api/seeds/ten-category-it-500.json --commit --remote --db online-quiz --status published
```

详细分布与抽检说明见 `docs/QUESTION_BANK_500.md`。
