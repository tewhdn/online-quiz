#!/usr/bin/env node
/**
 * 按十类职测“信息技术”8 个模块生成 500 道自编练习题。
 *
 * 数据来源：官方考试说明中的信息技术考纲 + 《计算机应用基础知识》知识点，
 * 题目为程序化自编/计算生成，不抄录任何题库原题。
 *
 * 输出：workers/api/seeds/ten-category-it-500.json
 *
 * 用法：node scripts/generate-ten-category-it.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestionInput, normalizeStemForHash } from '../workers/api/src/validators/question.ts';
import { stemSimilarity } from '../workers/api/src/services/dedupe.ts';
import { CAT } from './it-bank/lib.mjs';
import { buildTemplatesCore } from './it-bank/templates-core.mjs';
import { buildTemplatesFacts } from './it-bank/templates-facts.mjs';
import { buildAlgoStructHand } from './it-bank/hand-algo-struct.mjs';
import { buildNetworkOfficeHand } from './it-bank/hand-network-office.mjs';
import { buildAiRespBasicsHand } from './it-bank/hand-ai-resp-basics.mjs';
import { buildTypeFill } from './it-bank/typefill.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'workers/api/seeds/ten-category-it-500.json');
const SUBJECT = '信息技术';
const SOURCE = '依据2027年河北单招十类职测考试说明·信息技术部分自编';

const TARGET_TOTAL = 500;
const TYPE_QUOTA = { single: 300, multiple: 100, boolean: 100 };
const CATEGORY_TARGET = {
  [CAT.basics]: 65,
  [CAT.encoding]: 70,
  [CAT.algorithm]: 65,
  [CAT.structure]: 55,
  [CAT.network]: 95,
  [CAT.office]: 65,
  [CAT.ai]: 45,
  [CAT.responsibility]: 40,
};

function normalizeKey(stem) {
  return normalizeStemForHash(stem);
}

function pickEven(list, count) {
  if (count >= list.length) return list.slice();
  if (count <= 0) return [];
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(list[Math.floor((i * list.length) / count)]);
  }
  return result;
}

async function main() {
  const raw = [
    ...buildTemplatesCore(),
    ...buildTemplatesFacts(),
    ...buildAlgoStructHand(),
    ...buildNetworkOfficeHand(),
    ...buildAiRespBasicsHand(),
    ...buildTypeFill(),
  ];
  console.log(`原始题目：${raw.length} 道`);

  const seenExact = new Set();
  const keptByCategory = new Map();
  const kept = [];
  const skippedDuplicate = [];
  const invalid = [];

  for (const draft of raw) {
    const key = normalizeKey(draft.stem);
    if (seenExact.has(key)) {
      skippedDuplicate.push({ stem: draft.stem, reason: '题干完全重复' });
      continue;
    }
    const sameCategory = keptByCategory.get(draft.category) ?? [];
    let similar = null;
    for (const existing of sameCategory) {
      if (Math.abs(existing.stem.length - draft.stem.length) > Math.max(24, draft.stem.length * 0.4)) continue;
      const score = stemSimilarity(draft.stem, existing.stem);
      if (score >= 0.92) {
        similar = { stem: existing.stem, score };
        break;
      }
    }
    if (similar) {
      skippedDuplicate.push({ stem: draft.stem, reason: `与已有题目高度相似（${Math.round(similar.score * 1000) / 10}%）` });
      continue;
    }

    const validation = await validateQuestionInput({
      ...draft,
      subject: SUBJECT,
      source: SOURCE,
      status: 'published',
    });
    if (!validation.ok || !validation.question) {
      invalid.push({ stem: draft.stem, errors: validation.errors });
      continue;
    }
    const normalized = validation.question;
    const question = {
      type: normalized.type,
      subject: SUBJECT,
      category: normalized.category,
      knowledge_points: normalized.knowledgePoints,
      difficulty: normalized.difficulty,
      stem: normalized.stem,
      options: normalized.options,
      answer: normalized.answer,
      explanation: normalized.explanation,
      source: SOURCE,
      status: 'published',
    };
    seenExact.add(key);
    sameCategory.push(question);
    keptByCategory.set(draft.category, sameCategory);
    kept.push(question);
  }

  console.log(`去重后：${kept.length} 道（跳过重复 ${skippedDuplicate.length} 道，校验失败 ${invalid.length} 道）`);
  if (invalid.length > 0) {
    console.log('校验失败示例：');
    for (const item of invalid.slice(0, 10)) {
      console.log(`  - ${item.stem.slice(0, 40)}…：${item.errors.join('；')}`);
    }
  }

  // 按类型 + 分类分配名额
  const categories = Object.keys(CATEGORY_TARGET);
  const byTypeCategory = { single: {}, multiple: {}, boolean: {} };
  for (const type of Object.keys(TYPE_QUOTA)) {
    for (const category of categories) {
      byTypeCategory[type][category] = kept.filter((q) => q.type === type && q.category === category);
    }
  }

  const allocation = {};
  for (const type of Object.keys(TYPE_QUOTA)) {
    const quota = TYPE_QUOTA[type];
    const avail = byTypeCategory[type];
    const plan = {};
    let used = 0;
    for (const category of categories) {
      const desired = Math.floor((quota * CATEGORY_TARGET[category]) / TARGET_TOTAL);
      const assign = Math.min(desired, avail[category].length);
      plan[category] = assign;
      used += assign;
    }
    let remaining = quota - used;
    while (remaining > 0) {
      let best = null;
      for (const category of categories) {
        if (plan[category] >= avail[category].length) continue;
        const desired = (quota * CATEGORY_TARGET[category]) / TARGET_TOTAL;
        const deficit = desired - plan[category];
        if (!best || deficit > best.deficit) best = { category, deficit };
      }
      if (!best) break;
      plan[best.category] += 1;
      remaining -= 1;
    }
    allocation[type] = plan;
  }

  const selected = [];
  for (const type of Object.keys(TYPE_QUOTA)) {
    for (const category of categories) {
      const list = byTypeCategory[type][category];
      const count = allocation[type][category] ?? 0;
      selected.push(...pickEven(list, count));
    }
  }

  // 若因可用题不足导致不足 500，从剩余题目中补足（优先保持题型比例）
  if (selected.length < TARGET_TOTAL) {
    const selectedSet = new Set(selected.map((q) => q.stem));
    const remainingPool = kept.filter((q) => !selectedSet.has(q.stem));
    for (const question of remainingPool) {
      if (selected.length >= TARGET_TOTAL) break;
      selected.push(question);
    }
  }

  // 排序：按模块顺序，再按题型、难度
  const categoryOrder = new Map(categories.map((category, index) => [category, index]));
  const typeOrder = { single: 0, multiple: 1, boolean: 2 };
  selected.sort((a, b) => {
    const categoryDiff = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
    if (categoryDiff !== 0) return categoryDiff;
    const typeDiff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    if (typeDiff !== 0) return typeDiff;
    return a.difficulty - b.difficulty;
  });

  const final = selected.slice(0, TARGET_TOTAL);
  const typeCount = final.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});
  const categoryCount = final.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] ?? 0) + 1;
    return acc;
  }, {});
  const difficultyCount = final.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1;
    return acc;
  }, {});

  if (final.length !== TARGET_TOTAL) {
    throw new Error(`题目数量不足：期望 ${TARGET_TOTAL}，实际 ${final.length}`);
  }

  const payload = {
    version: 1,
    subject: SUBJECT,
    note:
      '本文件由脚本按官方考试说明“信息技术”模块自编生成，题目与解析为原创或程序化计算，不包含任何题库原题；不代表官方命题，请结合教材核对后使用。',
    generatedAt: new Date().toISOString(),
    stats: {
      total: final.length,
      byType: typeCount,
      byCategory: categoryCount,
      byDifficulty: difficultyCount,
    },
    questions: final,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`\n已生成：${OUTPUT}`);
  console.log('题型分布：', typeCount);
  console.log('模块分布：');
  for (const category of categories) {
    console.log(`  ${category}：${categoryCount[category] ?? 0}`);
  }
  console.log('难度分布：', difficultyCount);
  console.log(`总计：${final.length} 道`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
