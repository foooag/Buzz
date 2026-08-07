export type AppError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

