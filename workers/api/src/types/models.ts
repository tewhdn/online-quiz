export type QuestionType = 'single' | 'multiple' | 'boolean';
export type QuestionStatus = 'draft' | 'pending' | 'published' | 'archived';
export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled' | 'deleted';

export interface QuestionOption {
  key: string;
  text: string;
}

/** 服务端完整题目（含答案，绝不直接返回给普通用户） */
export interface QuestionRecord {
  id: string;
  type: QuestionType;
  subject: string;
  categoryId: string | null;
  category: string;
  knowledgePoints: string[];
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
  source: string | null;
  sourceRef: string | null;
  tags: string[];
  status: QuestionStatus;
  version: number;
  contentHash: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  archivedAt: number | null;
  deletedAt: number | null;
}

/** 不含答案的安全题目视图 */
export type PublicQuestion = Omit<
  QuestionRecord,
  'answer' | 'explanation' | 'contentHash' | 'createdBy' | 'deletedAt'
>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
