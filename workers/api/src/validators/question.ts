/**
 * 题目结构校验（纯函数、无外部依赖）。
 * 同时被 Worker API、导入脚本和测试使用，保证"导入 = API 创建"使用同一套规则。
 */
export type QuestionType = 'single' | 'multiple' | 'boolean';

export interface QuestionOption {
  key: string;
  text: string;
}

export interface NormalizedQuestion {
  type: QuestionType;
  subject: string;
  category: string;
  knowledgePoints: string[];
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
  source: string;
  sourceRef: string;
  tags: string[];
}

export interface QuestionValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  question?: NormalizedQuestion;
  contentHash?: string;
}

const MAX_STEM = 5000;
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;
const MAX_EXPLANATION = 5000;
const MAX_TAGS = 10;
const MAX_KNOWLEDGE = 10;

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asStringList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，;；|、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeQuestionType(value: unknown): QuestionType | null {
  const raw = asString(value).trim().toLowerCase();
  const map: Record<string, QuestionType> = {
    single: 'single',
    single_choice: 'single',
    radio: 'single',
    '单选': 'single',
    '单选题': 'single',
    multiple: 'multiple',
    multiple_choice: 'multiple',
    checkbox: 'multiple',
    '多选': 'multiple',
    '多选题': 'multiple',
    boolean: 'boolean',
    true_false: 'boolean',
    bool: 'boolean',
    judge: 'boolean',
    '判断': 'boolean',
    '判断题': 'boolean',
  };
  return map[raw] ?? null;
}

const OPTION_KEY_PATTERN = /^[A-Ha-h]$/;

function normalizeOptions(raw: unknown, errors: string[]): QuestionOption[] {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        errors.push('options 不是合法的 JSON 数组');
        return [];
      }
    } else {
      value = trimmed
        .split(/[|｜]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('options 必须是数组');
    return [];
  }
  if (value.length > MAX_OPTIONS) {
    errors.push(`选项数量不能超过 ${MAX_OPTIONS} 个`);
  }
  const options: QuestionOption[] = [];
  const autoKeys = 'ABCDEFGH';
  value.forEach((item, index) => {
    if (typeof item === 'string') {
      const match = item.match(/^\s*([A-Ha-h])\s*[.、:：)）]\s*(.+)$/);
      if (match) {
        options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
      } else {
        options.push({ key: autoKeys[index] ?? '?', text: item.trim() });
      }
      return;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const key = asString(record.key ?? record.option_key ?? record.label).trim().toUpperCase();
      const text = asString(record.text ?? record.content ?? record.value).trim();
      options.push({ key: key || (autoKeys[index] ?? '?'), text });
      return;
    }
    errors.push(`第 ${index + 1} 个选项格式不正确`);
  });
  return options;
}

function normalizeBooleanAnswer(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    return normalizeBooleanAnswer(value[0]);
  }
  if (typeof value === 'boolean') return [String(value)];
  if (typeof value === 'number') {
    if (value === 1) return ['true'];
    if (value === 0) return ['false'];
    return null;
  }
  const raw = asString(value).trim().toLowerCase();
  if (['true', 't', 'yes', 'y', '1', '正确', '对', '是'].includes(raw)) return ['true'];
  if (['false', 'f', 'no', 'n', '0', '错误', '错', '否'].includes(raw)) return ['false'];
  return null;
}

function normalizeChoiceAnswer(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim().toUpperCase())
      .filter(Boolean);
  }
  return asString(value)
    .split(/[,，;；|、\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

/** 归一化题干用于去重：去掉所有空白与标点，转小写。 */
export function normalizeStemForHash(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[\p{P}\p{S}]/gu, '');
}

export async function contentHashOf(stem: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeStemForHash(stem));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * 校验并归一化一道题目。
 * 返回 ok=false 时不包含 question，调用方必须拒绝写入正式题库。
 */
export async function validateQuestionInput(raw: unknown): Promise<QuestionValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['题目必须是对象'], warnings };
  }
  const record = raw as Record<string, unknown>;
  const type = normalizeQuestionType(record.type);
  if (!type) {
    return { ok: false, errors: ['题型不合法，仅支持 single / multiple / boolean'], warnings };
  }

  const stem = asString(record.stem ?? record.title ?? record.question).trim();
  if (!stem) errors.push('题干不能为空');
  else if (stem.length > MAX_STEM) errors.push(`题干不能超过 ${MAX_STEM} 个字符`);

  const subject = asString(record.subject).trim();
  if (!subject) errors.push('科目不能为空');
  else if (subject.length > 60) errors.push('科目不能超过 60 个字符');

  const category = asString(record.category).trim() || subject;

  const knowledgePoints = asStringList(record.knowledge_points ?? record.knowledgePoints).slice(0, MAX_KNOWLEDGE);
  if (knowledgePoints.length > MAX_KNOWLEDGE) errors.push(`知识点最多 ${MAX_KNOWLEDGE} 个`);
  if (knowledgePoints.some((item) => item.length > 40)) errors.push('单个知识点不能超过 40 个字符');

  let difficulty = 2;
  const rawDifficulty = record.difficulty;
  if (rawDifficulty !== undefined && rawDifficulty !== null && rawDifficulty !== '') {
    const parsed = Number(rawDifficulty);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      errors.push('难度必须是 1-5 的整数');
    } else {
      difficulty = parsed;
    }
  }

  let options: QuestionOption[] = [];
  let answer: string[] = [];

  if (type === 'boolean') {
    const normalized = normalizeBooleanAnswer(record.answer);
    if (!normalized) errors.push('判断题答案必须是 true 或 false');
    else answer = normalized;
    options = [];
  } else {
    options = normalizeOptions(record.options, errors);
    if (options.length < MIN_OPTIONS) {
      errors.push(`选择题至少需要 ${MIN_OPTIONS} 个选项`);
    }
    if (options.length > MAX_OPTIONS) {
      // 已在 normalizeOptions 中记录
    }
    const keys = options.map((option) => option.key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) errors.push('选项 key 存在重复');
    if (keys.some((key) => !OPTION_KEY_PATTERN.test(key))) errors.push('选项 key 必须是 A-H 之间的字母');
    if (options.some((option) => !option.text)) errors.push('选项内容不能为空');
    // 注意：不能忽略大小写。ASCII 题中 'A' 与 'a' 是合法且不同的选项。
    const texts = options.map((option) => option.text.trim()).filter(Boolean);
    if (new Set(texts).size !== texts.length) errors.push('选项内容存在重复');

    const rawAnswer = normalizeChoiceAnswer(record.answer);
    const uniqueAnswer = Array.from(new Set(rawAnswer)).sort();
    if (uniqueAnswer.length === 0) {
      errors.push('正确答案不能为空');
    }
    if (type === 'single' && uniqueAnswer.length !== 1) {
      errors.push('单选题只能有一个正确答案');
    }
    if (type === 'multiple' && uniqueAnswer.length < 1) {
      errors.push('多选题至少需要一个正确答案');
    }
    if (uniqueAnswer.length > options.length) {
      errors.push('正确答案数量超过选项数量');
    }
    const invalid = uniqueAnswer.filter((key) => !keys.includes(key));
    if (invalid.length > 0) errors.push(`答案 ${invalid.join(',')} 不在选项中`);
    answer = uniqueAnswer;
  }

  const explanation = asString(record.explanation ?? record.analysis).trim();
  if (explanation.length > MAX_EXPLANATION) errors.push(`解析不能超过 ${MAX_EXPLANATION} 个字符`);
  if (!explanation) warnings.push('缺少解析，发布前建议补充');

  const source = asString(record.source).trim();
  const sourceRef = asString(record.source_ref ?? record.sourceRef).trim();
  if (source.length > 200) errors.push('来源不能超过 200 个字符');
  if (sourceRef.length > 200) errors.push('来源章节不能超过 200 个字符');

  const tags = asStringList(record.tags).slice(0, MAX_TAGS);

  if (errors.length > 0) return { ok: false, errors, warnings };

  const question: NormalizedQuestion = {
    type,
    subject,
    category,
    knowledgePoints,
    difficulty,
    stem,
    options,
    answer,
    explanation,
    source,
    sourceRef,
    tags,
  };
  return { ok: true, errors: [], warnings, question, contentHash: await contentHashOf(stem) };
}

/** 判分：单选/多选/判断都采用完全匹配（多选与顺序无关）。 */
export function gradeAnswer(questionType: QuestionType, correctAnswer: string[], userAnswer: unknown): boolean {
  let submitted: string[];
  if (questionType === 'boolean') {
    const normalized = normalizeBooleanAnswer(userAnswer);
    if (!normalized) return false;
    submitted = normalized;
  } else {
    submitted = Array.from(new Set(normalizeChoiceAnswer(userAnswer))).sort();
  }
  const expected = Array.from(new Set(correctAnswer.map((item) => String(item).toLowerCase()))).sort();
  const actual = Array.from(new Set(submitted.map((item) => String(item).toLowerCase()))).sort();
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => value === actual[index]);
}
