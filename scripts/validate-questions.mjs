#!/usr/bin/env node
/**
 * 题库文件校验脚本：不写数据库，只检查格式与内容。
 * 用法：node scripts/validate-questions.mjs questions.json [--json]
 */
import { validateQuestionInput } from '../workers/api/src/validators/question.ts';
import { readQuestionFile } from './question-file.mjs';

const args = process.argv.slice(2);
const file = args.find((item) => !item.startsWith('--'));
const asJson = args.includes('--json');
if (!file) {
  console.error('用法：node scripts/validate-questions.mjs <questions.json|questions.csv> [--json]');
  process.exit(1);
}

let parsed;
try {
  parsed = readQuestionFile(file);
} catch (error) {
  console.error(`✖ 读取失败：${error.message}`);
  process.exit(1);
}

const report = { file, format: parsed.format, total: parsed.rows.length, valid: 0, invalid: 0, errors: [], warnings: [] };
for (const item of parsed.rows) {
  const result = await validateQuestionInput(item.raw);
  if (result.ok) {
    report.valid += 1;
    for (const warning of result.warnings) report.warnings.push({ row: item.row, message: warning });
  } else {
    report.invalid += 1;
    report.errors.push({ row: item.row, messages: result.errors });
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n文件：${file}`);
  console.log(`格式：${report.format.toUpperCase()}`);
  console.log(`总计：${report.total} 条，通过 ${report.valid} 条，失败 ${report.invalid} 条`);
  if (report.errors.length > 0) {
    console.log('\n错误：');
    for (const item of report.errors.slice(0, 100)) {
      console.log(`  第 ${item.row} 行：${item.messages.join('；')}`);
    }
  }
  if (report.warnings.length > 0) {
    console.log('\n提示：');
    for (const item of report.warnings.slice(0, 50)) {
      console.log(`  第 ${item.row} 行：${item.message}`);
    }
  }
  console.log('');
}

process.exit(report.invalid > 0 ? 1 : 0);
