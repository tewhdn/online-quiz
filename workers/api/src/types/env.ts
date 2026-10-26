/** Cloudflare Workers 绑定与环境变量 */
export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  /** 可选：R2 存储原始资料（不绑定也能运行，文本会存入 D1） */
  R2?: R2Bucket;

  ENVIRONMENT?: string;
  APP_NAME?: string;

  /** 安全 */
  PASSWORD_ITERATIONS?: string;
  SESSION_TTL_HOURS?: string;
  COOKIE_SECURE?: string;
  ADMIN_SETUP_TOKEN?: string;

  /** DeepSeek（API Key 必须通过 Secret 设置） */
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;

  /** AI 限额 */
  AI_ENABLED?: string;
  AI_MAX_QUESTIONS_PER_REQUEST?: string;
  AI_DAILY_TASK_LIMIT?: string;
  AI_MAX_INPUT_CHARS?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
  AI_TIMEOUT_MS?: string;

  /** 上传与本地化 */
  UPLOAD_MAX_BYTES?: string;
  TZ_OFFSET_MINUTES?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled' | 'deleted';
  mustChangePassword: boolean;
  displayName: string | null;
}

export interface SessionInfo {
  tokenHash: string;
  userId: string;
  csrfToken: string;
  expiresAt: number;
}

export interface RequestContext {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  user?: AuthUser;
  session?: SessionInfo;
  ipHash?: string;
  userAgent?: string;
}

export type Handler = (ctx: RequestContext) => Promise<Response>;

export interface RouteOptions {
  /** 需要登录 */
  auth?: boolean;
  /** 需要管理员 */
  admin?: boolean;
  /** 需要 CSRF 校验（非 GET 的已认证接口默认开启） */
  csrf?: boolean;
  /** 速率限制：key 前缀 + 次数 / 窗口秒 */
  rateLimit?: { key: string; limit: number; windowSeconds: number };
  /** 允许未修改初始密码的用户访问（默认仅 auth/me、change-password、logout 允许） */
  allowPasswordChangePending?: boolean;
}
