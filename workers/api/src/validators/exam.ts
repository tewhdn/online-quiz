import { ApiError } from '../utils/errors.ts';
import { asRecord, readBoolean, readInt, readString, readStringArray, readEnum } from './common.ts';

export interface ExamInput {
  title: string;
  description: string;
  subject: string;
  categoryIds: string[];
  knowledgePoints: string[];
  typeCounts: { single: number; multiple: number; boolean: number };
  difficultyCounts: Record<string, number>;
  scoreSingle: number;
  scoreMultiple: number;
  scoreBoolean: number;
  durationMinutes: number;
  allowEarlySubmit: boolean;
  allowReview: 'never' | 'after_submit' | 'after_end';
  startAt: number | null;
  endAt: number | null;
  allowRetake: boolean;
  status: 'draft' | 'published';
}

export function validateExamInput(raw: unknown): ExamInput {
  const source = asRecord(raw);
  const title = readString(source, 'title', { required: true, min: 2, max: 80, label: '考试名称' });
  const description = readString(source, 'description', { max: 2000, label: '考试说明' });
  const subject = readString(source, 'subject', { max: 60, label: '科目' });
  const categoryIds = readStringArray(source, ['categoryIds', 'category_ids'], { maxItems: 20 });
  const knowledgePoints = readStringArray(source, ['knowledgePoints', 'knowledge_points'], {
    maxItems: 20,
    maxLength: 40,
  });

  const typeCountsRaw = asRecord(source.typeCounts ?? source.type_counts);
  const typeCounts = {
    single: readInt(typeCountsRaw, 'single', { min: 0, max: 200, fallback: 0, label: '单选题数量' }),
    multiple: readInt(typeCountsRaw, 'multiple', { min: 0, max: 200, fallback: 0, label: '多选题数量' }),
    boolean: readInt(typeCountsRaw, 'boolean', { min: 0, max: 200, fallback: 0, label: '判断题数量' }),
  };
  const totalQuestions = typeCounts.single + typeCounts.multiple + typeCounts.boolean;
  if (totalQuestions <= 0) throw ApiError.badRequest('题目总数必须大于 0');
  if (totalQuestions > 200) throw ApiError.badRequest('单场考试题目不能超过 200 道');

  const difficultyRaw = asRecord(source.difficultyCounts ?? source.difficulty_counts);
  const difficultyCounts: Record<string, number> = {};
  for (const level of ['1', '2', '3', '4', '5']) {
    const count = readInt(difficultyRaw, level, { min: 0, max: 200, fallback: 0, label: `难度 ${level} 数量` });
    if (count > 0) difficultyCounts[level] = count;
  }
  const difficultyTotal = Object.values(difficultyCounts).reduce((sum, value) => sum + value, 0);
  if (difficultyTotal > 0 && difficultyTotal !== totalQuestions) {
    throw ApiError.badRequest(`难度分布合计（${difficultyTotal}）必须等于题目总数（${totalQuestions}），或全部留空表示不限难度`);
  }

  const scoreSingle = readInt(source, 'scoreSingle', { min: 1, max: 100, fallback: 2, label: '单选题分值' });
  const scoreMultiple = readInt(source, 'scoreMultiple', { min: 1, max: 100, fallback: 3, label: '多选题分值' });
  const scoreBoolean = readInt(source, 'scoreBoolean', { min: 1, max: 100, fallback: 2, label: '判断题分值' });

  const durationMinutes = readInt(source, 'durationMinutes', { min: 1, max: 300, fallback: 60, label: '考试时长' });
  const allowEarlySubmit = readBoolean(source, 'allowEarlySubmit', true);
  const allowReview = readEnum(source, 'allowReview', ['never', 'after_submit', 'after_end'] as const, {
    fallback: 'after_submit',
    label: '解析可见性',
  });
  const startAt = readNullableTimestamp(source.startAt ?? source.start_at, '开放时间');
  const endAt = readNullableTimestamp(source.endAt ?? source.end_at, '结束时间');
  if (startAt !== null && endAt !== null && endAt <= startAt) {
    throw ApiError.badRequest('结束时间必须晚于开放时间');
  }
  const allowRetake = readBoolean(source, 'allowRetake', false);
  const status = readEnum(source, 'status', ['draft', 'published'] as const, { fallback: 'draft', label: '状态' });

  return {
    title,
    description,
    subject,
    categoryIds,
    knowledgePoints,
    typeCounts,
    difficultyCounts,
    scoreSingle,
    scoreMultiple,
    scoreBoolean,
    durationMinutes,
    allowEarlySubmit,
    allowReview,
    startAt,
    endAt,
    allowRetake,
    status,
  };
}

export function examTotalScore(input: Pick<ExamInput, 'typeCounts' | 'scoreSingle' | 'scoreMultiple' | 'scoreBoolean'>): number {
  return (
    input.typeCounts.single * input.scoreSingle +
    input.typeCounts.multiple * input.scoreMultiple +
    input.typeCounts.boolean * input.scoreBoolean
  );
}

function readNullableTimestamp(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const ts = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ts)) throw ApiError.badRequest(`${label}格式不正确`);
  return ts;
}
