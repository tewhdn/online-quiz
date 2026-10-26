import { ApiError } from '../utils/errors.ts';
import { asRecord, readBoolean, readEnum, readInt, readString, readStringArray } from './common.ts';

export type AiMode = 'outline' | 'document' | 'topic';

export interface AiGenerateInput {
  mode: AiMode;
  subject: string;
  category: string;
  examName: string;
  knowledgePoints: string[];
  typeCounts: { single: number; multiple: number; boolean: number };
  count: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  optionsCount: number;
  explanationLength: 'short' | 'medium' | 'detailed';
  includeCalculation: boolean;
  requireEvidence: boolean;
  outline: string;
  topic: string;
  requirement: string;
  documentText: string;
  sourceId: string;
}

export function validateAiGenerateInput(raw: unknown, maxCount: number, maxInputChars: number): AiGenerateInput {
  const source = asRecord(raw);
  const mode = readEnum(source, 'mode', ['outline', 'document', 'topic'] as const, {
    fallback: 'topic',
    label: '出题模式',
  });

  const subject = readString(source, 'subject', { required: true, max: 60, label: '科目' });
  const category = readString(source, 'category', { max: 60, label: '分类' });
  const examName = readString(source, 'examName', { max: 120, label: '考试名称' });
  const knowledgePoints = readStringArray(source, ['knowledgePoints', 'knowledge_points'], {
    maxItems: 30,
    maxLength: 60,
  });

  const count = readInt(source, 'count', { required: true, min: 1, max: maxCount, label: '生成数量' });
  const typeCountsRaw = asRecord(source.typeCounts ?? source.type_counts);
  const typeCounts = {
    single: readInt(typeCountsRaw, 'single', { min: 0, max: maxCount, fallback: 0, label: '单选题数量' }),
    multiple: readInt(typeCountsRaw, 'multiple', { min: 0, max: maxCount, fallback: 0, label: '多选题数量' }),
    boolean: readInt(typeCountsRaw, 'boolean', { min: 0, max: maxCount, fallback: 0, label: '判断题数量' }),
  };
  const typeSum = typeCounts.single + typeCounts.multiple + typeCounts.boolean;
  if (typeSum > 0 && typeSum !== count) {
    throw ApiError.badRequest(`题型数量合计（${typeSum}）必须等于生成数量（${count}），或全部填 0 由 AI 分配`);
  }

  const difficulty = readEnum(source, 'difficulty', ['easy', 'medium', 'hard', 'mixed'] as const, {
    fallback: 'medium',
    label: '难度',
  });
  const optionsCount = readInt(source, 'optionsCount', { min: 2, max: 8, fallback: 4, label: '选项数量' });
  const explanationLength = readEnum(
    source,
    'explanationLength',
    ['short', 'medium', 'detailed'] as const,
    { fallback: 'medium', label: '解析长度' },
  );
  const includeCalculation = readBoolean(source, 'includeCalculation', false);
  const requireEvidence = readBoolean(source, 'requireEvidence', false);

  const outline = readString(source, 'outline', { max: maxInputChars, label: '考试大纲' });
  const topic = readString(source, 'topic', { max: 4000, label: '自定义主题' });
  const requirement = readString(source, 'requirement', { max: 4000, label: '补充要求' });
  const documentText = readString(source, 'documentText', { max: maxInputChars, label: '资料正文' });
  const sourceId = readString(source, 'sourceId', { max: 64, label: '资料来源 ID' });

  if (mode === 'outline' && !outline && knowledgePoints.length === 0) {
    throw ApiError.badRequest('大纲出题需要填写考试大纲，或至少填写知识点');
  }
  if (mode === 'document' && !documentText && !sourceId) {
    throw ApiError.badRequest('资料出题需要上传资料或粘贴资料正文');
  }
  if (mode === 'topic' && !topic) {
    throw ApiError.badRequest('自定义主题出题需要填写主题');
  }

  return {
    mode,
    subject,
    category,
    examName,
    knowledgePoints,
    typeCounts,
    count,
    difficulty,
    optionsCount,
    explanationLength,
    includeCalculation,
    requireEvidence,
    outline,
    topic,
    requirement,
    documentText,
    sourceId,
  };
}
