import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../workers/api/src/utils/csv.ts';

const CSV_ALIASES = {
  type: 'type',
  题型: 'type',
  subject: 'subject',
  科目: 'subject',
  category: 'category',
  分类: 'category',
  章节: 'category',
  knowledge_points: 'knowledge_points',
  knowledgepoints: 'knowledge_points',
  知识点: 'knowledge_points',
  difficulty: 'difficulty',
  难度: 'difficulty',
  stem: 'stem',
  题干: 'stem',
  options: 'options',
  选项: 'options',
  answer: 'answer',
  答案: 'answer',
  explanation: 'explanation',
  解析: 'explanation',
  source: 'source',
  来源: 'source',
  source_ref: 'source_ref',
  来源章节: 'source_ref',
  tags: 'tags',
  标签: 'tags',
  status: 'status',
};

function canonicalKey(key) {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (CSV_ALIASES[normalized]) return CSV_ALIASES[normalized];
  const optionMatch = normalized.match(/^option_?([a-h])$/);
  if (optionMatch) return `option_${optionMatch[1]}`;
  return null;
}

/** 读取 JSON / CSV 题库文件，返回 {format, rows:[{row, raw}]} */
export function readQuestionFile(filePath, forcedFormat) {
  const text = readFileSync(filePath, 'utf8');
  const format = forcedFormat ?? (/\.csv$/i.test(filePath) ? 'csv' : 'json');
  if (format === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!list) throw new Error('JSON 必须是题目数组，或包含 questions 数组的对象');
    return { format, rows: list.map((raw, index) => ({ row: index + 1, raw })) };
  }

  const { rows, errors } = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV 内容为空');
  if (errors.length > 0) throw new Error(`CSV 解析问题：${errors.join('；')}`);
  const header = rows[0].map((cell) => cell.trim());
  const result = [];
  for (let i = 1; i < rows.length; i += 1) {
    const record = {};
    header.forEach((key, index) => {
      const canonical = canonicalKey(key);
      if (!canonical) return;
      const value = rows[i][index] ?? '';
      if (value !== '') record[canonical] = value;
    });
    const optionEntries = [];
    for (const letter of 'abcdefgh') {
      const value = record[`option_${letter}`];
      if (typeof value === 'string' && value.trim()) {
        optionEntries.push({ key: letter.toUpperCase(), text: value.trim() });
        delete record[`option_${letter}`];
      }
    }
    if (optionEntries.length > 0) record.options = optionEntries;
    result.push({ row: i + 1, raw: record });
  }
  return { format, rows: result };
}
