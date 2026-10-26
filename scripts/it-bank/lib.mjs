/** 出题工具：确定性随机、选项打乱、题目构造 */
let seed = 20260801;

export function resetSeed(value = 20260801) {
  seed = value >>> 0;
}

function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

export function randInt(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

export function pick(list) {
  return list[Math.floor(rnd() * list.length)];
}

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const CAT = {
  basics: '信息技术基础知识',
  encoding: '数据与编码',
  algorithm: '算法与编程',
  structure: '数据结构',
  network: '信息系统与网络',
  office: '信息处理',
  ai: '人工智能基础',
  responsibility: '信息社会责任',
};

export const SOURCE = '依据《2027年河北省高职单招十类职业适应性测试考试说明》信息技术部分自编';

function keyOf(index) {
  return String.fromCharCode(65 + index);
}

function cleanOptions(options) {
  const seen = new Set();
  const out = [];
  for (const option of options) {
    const text = String(option).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/** 单选题：correct 必须出现在选项中，wrongs 提供干扰项 */
export function choice(category, points, difficulty, stem, correct, wrongs, explanation) {
  const options = cleanOptions([correct, ...wrongs]);
  if (options.length < 4) throw new Error(`单选题选项不足：${stem}`);
  const kept = options.slice(0, 4);
  if (!kept.includes(correct)) kept[3] = correct;
  const shuffled = shuffle(kept);
  const answerKey = keyOf(shuffled.indexOf(correct));
  return {
    type: 'single',
    category,
    knowledgePoints: points,
    difficulty,
    stem,
    options: shuffled.map((text, index) => ({ key: keyOf(index), text })),
    answer: [answerKey],
    explanation,
  };
}

/** 多选题：corrects 2-3 个，wrongs 至少 1 个 */
export function multi(category, points, difficulty, stem, corrects, wrongs, explanation) {
  const options = cleanOptions([...corrects, ...wrongs]);
  if (options.length < 4) throw new Error(`多选题选项不足：${stem}`);
  const kept = options.slice(0, 5);
  for (const correct of corrects) {
    if (!kept.includes(correct)) kept[kept.length - 1] = correct;
  }
  const shuffled = shuffle(kept);
  const answer = corrects
    .map((text) => keyOf(shuffled.indexOf(text)))
    .sort();
  return {
    type: 'multiple',
    category,
    knowledgePoints: points,
    difficulty,
    stem,
    options: shuffled.map((text, index) => ({ key: keyOf(index), text })),
    answer,
    explanation,
  };
}

/** 判断题 */
export function judge(category, points, difficulty, stem, isTrue, explanation) {
  return {
    type: 'boolean',
    category,
    knowledgePoints: points,
    difficulty,
    stem,
    options: [],
    answer: [isTrue ? 'true' : 'false'],
    explanation,
  };
}

/** 数值干扰项：围绕正确答案生成 3 个不同且合理的错误值 */
export function numericWrongs(correct, extras = []) {
  const candidates = [
    correct + 1,
    correct - 1,
    correct * 2,
    Math.floor(correct / 2),
    correct + 2,
    correct - 2,
    ...extras,
  ]
    .filter((value) => Number.isFinite(value) && value >= 0 && value !== correct)
    .map((value) => Math.round(value * 100) / 100);
  return Array.from(new Set(candidates)).slice(0, 3).map(String);
}

export function percentWrongs(correct) {
  return [correct + 10, correct - 10, correct + 20]
    .filter((value) => value > 0 && value !== correct)
    .map((value) => `${Math.round(value * 100) / 100}%`);
}
