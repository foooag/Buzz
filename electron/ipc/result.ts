export type AppError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function success<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function failure(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): IpcResult<never> {
  return {
    ok: false,
    error: details ? { code, message, details } : { code, message },
  };
}
