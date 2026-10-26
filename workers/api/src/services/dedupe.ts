import { normalizeStemForHash } from '../validators/question.ts';

/** 字符二元组集合，用于中文题干近似重复检测。 */
function bigrams(text: string): Set<string> {
  const normalized = normalizeStemForHash(text);
  const set = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) set.add(normalized.slice(i, i + 2));
  if (set.size === 0 && normalized.length > 0) set.add(normalized);
  return set;
}

export function stemSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export interface DuplicateCandidate {
  id: string;
  stem: string;
  type: string;
  status: string;
}

export interface SimilarMatch {
  id: string;
  similarity: number;
  stem: string;
}

/**
 * 近似重复检测：仅在同一科目的候选题内比较，阈值默认 0.9。
 * 用于提示管理员，不直接阻止写入（避免误杀同知识点不同角度的题）。
 */
export function findSimilarStem(stem: string, candidates: DuplicateCandidate[], threshold = 0.9): SimilarMatch | null {
  let best: SimilarMatch | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.stem.length - stem.length) > stem.length * 0.5 + 10) continue;
    const similarity = stemSimilarity(stem, candidate.stem);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: candidate.id, similarity: Math.round(similarity * 1000) / 1000, stem: candidate.stem };
    }
  }
  return best;
}
