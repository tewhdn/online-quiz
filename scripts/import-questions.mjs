#!/usr/bin/env node
/**
 * 批量导入题库脚本（绕过 Worker 请求体限制，适合 2000+ 道题）
 *
 * 用法：
 *   # 预览（默认，不写入）
 *   node scripts/import-questions.mjs workers/api/seeds/demo-questions.json
 *
 *   # 写入本地 dev-server 数据库
 *   node scripts/import-questions.mjs questions.json --commit --sqlite workers/api/.local/quiz.sqlite --status published
 *
 *   # 写入 Cloudflare D1（需要已登录 wrangler）
 *   node scripts/import-questions.mjs questions.json --commit --remote --db online-quiz --status published
 *
 * 行为：
 *   - 逐条使用与 API 相同的校验规则（题干/选项/答案/题型）
 *   - 默认跳过题库中已存在的相同题干（--allow-duplicates 可强制导入）
 *   - 自动创建缺失的分类，不会清空或覆盖已有题库
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateQuestionInput, contentHashOf } from '../workers/api/src/validators/question.ts';
import { newId } from '../workers/api/src/utils/id.ts';
import { readQuestionFile } from './question-file.mjs';
import { applyMigrations } from './node-runtime/migrations.mjs';

function parseArgs(argv) {
  const args = { flags: new Set(), values: {}, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const [key, inline] = item.slice(2).split('=');
      if (inline !== undefined) args.values[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.values[key] = argv[i + 1];
        i += 1;
      } else args.flags.add(key);
    } else args.positional.push(item);
  }
  return args;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

const args = parseArgs(process.argv.slice(2));
if (args.flags.has('help') || args.flags.has('h')) {
  console.log(`用法：node scripts/import-questions.mjs <文件> [选项]

选项：
  --sqlite <路径>        直接写入本地 SQLite 文件（dev-server 使用）
  --remote               写入 Cloudflare D1（默认）
  --db <名称>            D1 数据库名称，默认 online-quiz
  --status draft|published  覆盖题目状态，默认 draft
  --subject <科目>       覆盖科目
  --commit               实际写入（默认仅预览）
  --allow-duplicates     允许导入与已有题干完全相同的题目
  --format json|csv      强制文件格式（默认按扩展名）

示例：
  node scripts/import-questions.mjs workers/api/seeds/demo-questions.json --commit --sqlite workers/api/.local/quiz.sqlite --status published`);
  process.exit(0);
}
const file = args.positional[0];
if (!file) fail('请提供题库文件路径。示例：node scripts/import-questions.mjs questions.json');

const commit = args.flags.has('commit');
const allowDuplicates = args.flags.has('allow-duplicates');
const statusOverride = args.values.status === 'published' ? 'published' : args.values.status === 'draft' ? 'draft' : null;
const subjectOverride = args.values.subject?.trim() || null;
const dbName = args.values.db ?? 'online-quiz';
const sqlitePath = args.values.sqlite;
const remote = args.flags.has('remote') || !sqlitePath;
const MAX_ROWS = 20_000;

const { format, rows } = readQuestionFile(file, args.values.format);
if (rows.length === 0) fail('文件中没有题目');
if (rows.length > MAX_ROWS) fail(`单次最多导入 ${MAX_ROWS} 道题，请分批执行`);

console.log(`\n读取 ${rows.length} 条题目（${format.toUpperCase()}，${file}）`);

const valid = [];
const errors = [];
for (const item of rows) {
  const raw = { ...item.raw };
  if (subjectOverride) raw.subject = subjectOverride;
  if (statusOverride) raw.status = statusOverride;
  const validation = await validateQuestionInput(raw);
  if (!validation.ok || !validation.question) {
    errors.push({ row: item.row, messages: validation.errors });
    continue;
  }
  const status = statusOverride ?? (raw.status === 'published' ? 'published' : raw.status === 'draft' ? 'draft' : 'draft');
  valid.push({
    row: item.row,
    question: validation.question,
    hash: validation.contentHash ?? (await contentHashOf(validation.question.stem)),
    status,
  });
}

console.log(`校验通过 ${valid.length} 条，失败 ${errors.length} 条`);
if (errors.length > 0) {
  console.log('\n失败详情（最多显示 50 条）：');
  for (const item of errors.slice(0, 50)) {
    console.log(`  第 ${item.row} 行：${item.messages.join('；')}`);
  }
  if (errors.length > 50) console.log(`  … 其余 ${errors.length - 50} 条省略`);
}

// ---------------------------------------------------------------------------
// 目标数据库操作
// ---------------------------------------------------------------------------

function wranglerJson(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`wrangler 查询失败：${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
  const text = result.stdout ?? '';
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('无法解析 wrangler 输出');
  const parsed = JSON.parse(text.slice(start, end + 1));
  return parsed[0]?.results ?? [];
}

function wranglerExecFile(sqlText) {
  const dir = mkdtempSync(path.join(tmpdir(), 'quiz-import-'));
  const filePath = path.join(dir, 'import.sql');
  writeFileSync(filePath, sqlText, 'utf8');
  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', `--file=${filePath}`, '--yes'],
      { stdio: 'inherit', env: process.env },
    );
    if (result.status !== 0) throw new Error('wrangler 写入失败');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function loadExistingCategoriesSqlite(db) {
  const rows = db.prepare('SELECT id, subject, name FROM question_categories').all();
  return new Map(rows.map((row) => [`${row.subject}\u0000${row.name}`, row.id]));
}

function loadExistingHashesSqlite(db) {
  const rows = db.prepare('SELECT content_hash FROM questions WHERE deleted_at IS NULL').all();
  return new Set(rows.map((row) => row.content_hash));
}


let inserted = 0;
let skipped = 0;
let categoriesCreated = 0;

if (sqlitePath) {
  mkdirSync(path.dirname(path.resolve(sqlitePath)), { recursive: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    applyMigrations(db);
    const existingHashes = loadExistingHashesSqlite(db);
    const existingCategories = loadExistingCategoriesSqlite(db);
    const kept = valid.filter((item) => {
      if (!allowDuplicates && existingHashes.has(item.hash)) {
        skipped += 1;
        return false;
      }
      existingHashes.add(item.hash);
      return true;
    });

    if (!commit) {
      const { categoryStatements } = buildStatementsFor(kept);
      console.log(`\n[预览] 将写入 ${kept.length} 道题，跳过重复 ${skipped} 道，新增分类 ${categoryStatements.length} 个（未实际写入）`);
      console.log('确认无误后加 --commit 执行写入。');
      process.exit(0);
    }

    const { categoryStatements: catSql, questionStatements: qSql } = buildStatementsFor(kept);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const category of catSql) db.exec(category);
      const insert = db.prepare(
        `INSERT INTO questions (id, type, subject, category_id, category, knowledge_points, difficulty, stem, options, answer, explanation, source, source_ref, tags, status, version, content_hash, created_by, created_at, updated_at, published_at, archived_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, NULL, NULL)`,
      );
      for (const item of kept) {
        const key = `${item.question.subject}\u0000${item.question.category}`;
        const categoryId = findCategoryId(db, item.question.subject, item.question.category) ?? existingCategories.get(key);
        insert.run(
          newId('q'),
          item.question.type,
          item.question.subject,
          categoryId,
          item.question.category,
          JSON.stringify(item.question.knowledgePoints),
          item.question.difficulty,
          item.question.stem,
          JSON.stringify(item.question.options),
          JSON.stringify(item.question.answer),
          item.question.explanation,
          item.question.source || null,
          item.question.sourceRef || null,
          JSON.stringify(item.question.tags),
          item.status,
          item.hash,
          Date.now(),
          Date.now(),
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    inserted = kept.length;
    categoriesCreated = catSql.length;
  } finally {
    db.close();
  }
} else {
  const existingHashes = new Set(wranglerJson('SELECT content_hash FROM questions WHERE deleted_at IS NULL').map((row) => row.content_hash));
  const kept = valid.filter((item) => {
    if (!allowDuplicates && existingHashes.has(item.hash)) {
      skipped += 1;
      return false;
    }
    existingHashes.add(item.hash);
    return true;
  });

  if (!commit) {
    const { categoryStatements } = buildStatementsFor(kept);
    console.log(`\n[预览] 将写入 ${kept.length} 道题，跳过重复 ${skipped} 道，预计新增分类 ${categoryStatements.length} 个（未实际写入）`);
    console.log('确认无误后加 --commit 执行写入。');
    process.exit(0);
  }

  const { categoryStatements, questionStatements } = buildStatementsFor(kept);
  if (categoryStatements.length > 0) {
    for (let i = 0; i < categoryStatements.length; i += 200) {
      wranglerExecFile(categoryStatements.slice(i, i + 200).join('\n'));
    }
  }
  for (let i = 0; i < questionStatements.length; i += 200) {
    wranglerExecFile(questionStatements.slice(i, i + 200).join('\n'));
    console.log(`  已写入 ${Math.min(i + 200, questionStatements.length)} / ${questionStatements.length}`);
  }
  inserted = questionStatements.length;
  categoriesCreated = categoryStatements.length;
}

console.log(`\n✔ 导入完成：新增 ${inserted} 道题，跳过重复 ${skipped} 道，新增分类 ${categoriesCreated} 个`);
if (errors.length > 0) console.log(`  ⚠ ${errors.length} 条题目未通过校验，已跳过（见上方错误详情）`);
console.log('');

function findCategoryId(db, subject, name) {
  const row = db.prepare('SELECT id FROM question_categories WHERE subject = ? AND name = ?').get(subject, name);
  return row?.id ?? null;
}

function buildStatementsFor(items) {
  const categoryStatements = [];
  const questionStatements = [];
  const categoryIds = new Map();
  const ensure = (subject, name) => {
    const key = `${subject}\u0000${name}`;
    if (categoryIds.has(key)) return categoryIds.get(key);
    const id = newId('cat');
    categoryIds.set(key, id);
    categoryStatements.push(
      `INSERT OR IGNORE INTO question_categories (id, name, subject, description, sort_order, created_at) VALUES (${sqlQuote(id)}, ${sqlQuote(name)}, ${sqlQuote(subject)}, NULL, 0, ${Date.now()});`,
    );
    return id;
  };
  for (const item of items) {
    const categoryId = ensure(item.question.subject, item.question.category);
    const now = Date.now();
    questionStatements.push(
      `INSERT INTO questions (id, type, subject, category_id, category, knowledge_points, difficulty, stem, options, answer, explanation, source, source_ref, tags, status, version, content_hash, created_by, created_at, updated_at, published_at, archived_at, deleted_at) VALUES (` +
        [
          sqlQuote(newId('q')),
          sqlQuote(item.question.type),
          sqlQuote(item.question.subject),
          sqlQuote(categoryId),
          sqlQuote(item.question.category),
          sqlQuote(JSON.stringify(item.question.knowledgePoints)),
          item.question.difficulty,
          sqlQuote(item.question.stem),
          sqlQuote(JSON.stringify(item.question.options)),
          sqlQuote(JSON.stringify(item.question.answer)),
          sqlQuote(item.question.explanation),
          sqlQuote(item.question.source || null),
          sqlQuote(item.question.sourceRef || null),
          sqlQuote(JSON.stringify(item.question.tags)),
          sqlQuote(item.status),
          1,
          sqlQuote(item.hash),
          'NULL',
          now,
          now,
          item.status === 'published' ? now : 'NULL',
          'NULL',
          'NULL',
        ].join(', ') +
        ');',
    );
  }
  return { categoryStatements, questionStatements };
}
