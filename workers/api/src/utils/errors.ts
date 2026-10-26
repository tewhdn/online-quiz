/** 统一业务错误。错误信息不得包含密钥、堆栈或数据库细节。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = '请求参数不合法', details?: unknown): ApiError {
    return new ApiError(400, 'INVALID_INPUT', message, details);
  }
  static unauthorized(message = '请先登录'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = '没有权限执行该操作'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = '资源不存在'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = '资源状态冲突', details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static payloadTooLarge(message = '请求内容过大'): ApiError {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static tooManyRequests(message = '请求过于频繁，请稍后再试', details?: unknown): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }
  static internal(message = '服务器内部错误'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
  static serviceUnavailable(message = '服务暂不可用', details?: unknown): ApiError {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return ApiError.internal();
}
