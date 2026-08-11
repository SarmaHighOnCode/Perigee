/**
 * The error taxonomy, mirrored from `backend/app/errors.py`.
 *
 * Codes are a public contract and stay stable; `message` is for humans and may
 * change freely. Clients switch on `code`, never on the message text.
 */

/**
 * Codes the server can put in the envelope.
 *
 * `INTERNAL_ERROR` has no `PerigeeError` subclass — it is emitted by
 * `unhandled_error_handler` — and is absent from the taxonomy table in
 * docs/03-API-SPEC.md §1. It is included here because a client will see it.
 */
export const SERVER_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'DEVICE_KEY_MISSING',
  'DEVICE_KEY_INVALID',
  'PURPOSE_NOT_AUTHORISED',
  'NOT_FOUND',
  'DECISION_ALREADY_RECORDED',
  'SEARCH_EXPIRED',
  'INVALID_EMBEDDING',
  'UNSUPPORTED_MODEL',
  'QUALITY_BELOW_FLOOR',
  'RATE_LIMITED',
  'PENDING_DECISION_LIMIT',
  'DATABASE_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

/** Failures that never reached a server response, raised by this client. */
export const CLIENT_ERROR_CODES = ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type PerigeeErrorCode = ServerErrorCode | ClientErrorCode;

/**
 * The server's taxonomy can grow ahead of a deployed app, so an unrecognised
 * code must still be representable. The `string & {}` arm keeps autocomplete
 * on the known codes while accepting anything.
 */
export type AnyErrorCode = PerigeeErrorCode | (string & {});

export interface PerigeeApiErrorInit {
  code: AnyErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  requestId?: string;
  /** 0 when the failure happened before a response existed. */
  httpStatus: number;
}

export class PerigeeApiError extends Error {
  readonly code: AnyErrorCode;
  readonly detail: Record<string, unknown>;
  readonly requestId: string;
  readonly httpStatus: number;

  constructor(init: PerigeeApiErrorInit) {
    super(init.message);
    // Babel/Hermes may downlevel `extends Error`, which breaks `instanceof`
    // unless the prototype is restored explicitly. This package ships to React
    // Native, so the two lines are not optional.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PerigeeApiError';
    this.code = init.code;
    this.detail = init.detail ?? {};
    this.requestId = init.requestId ?? '';
    this.httpStatus = init.httpStatus;
  }
}

export function isPerigeeApiError(err: unknown): err is PerigeeApiError {
  return err instanceof PerigeeApiError;
}

export function hasErrorCode(err: unknown, code: AnyErrorCode): err is PerigeeApiError {
  return isPerigeeApiError(err) && err.code === code;
}

/**
 * The human-in-the-loop brake: too many searches are open without a decision.
 * Route the officer to `pending()` and make them adjudicate, do not retry.
 */
export function isPendingDecisionLimit(err: unknown): err is PerigeeApiError {
  return hasErrorCode(err, 'PENDING_DECISION_LIMIT');
}

/** Record access without a CONFIRMED decision for that exact person. */
export function isPurposeNotAuthorised(err: unknown): err is PerigeeApiError {
  return hasErrorCode(err, 'PURPOSE_NOT_AUTHORISED');
}

/** Token bucket exhausted. `detail.retry_after_seconds` carries the wait. */
export function isRateLimited(err: unknown): err is PerigeeApiError {
  return hasErrorCode(err, 'RATE_LIMITED');
}

/**
 * Parse the `{ error: { code, message, detail, request_id } }` envelope.
 * Returns null when the body is not that shape, so the caller can fall back to
 * `INVALID_RESPONSE` rather than inventing a code the server never sent.
 */
export function parseErrorEnvelope(
  body: unknown,
  httpStatus: number,
  fallbackRequestId: string,
): PerigeeApiError | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;

  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;

  const record = error as Record<string, unknown>;
  if (typeof record['code'] !== 'string') return null;

  const detail = record['detail'];
  const requestId = record['request_id'];

  return new PerigeeApiError({
    code: record['code'],
    message: typeof record['message'] === 'string' ? record['message'] : record['code'],
    detail:
      typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {},
    requestId: typeof requestId === 'string' && requestId ? requestId : fallbackRequestId,
    httpStatus,
  });
}
