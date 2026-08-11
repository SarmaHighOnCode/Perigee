export class PerigeeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly requestId: string | null;

  constructor(options: {
    message: string;
    status: number;
    code: string;
    detail?: unknown;
    requestId?: string | null;
  }) {
    super(options.message);
    this.name = 'PerigeeApiError';
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail ?? null;
    this.requestId = options.requestId ?? null;
  }
}
