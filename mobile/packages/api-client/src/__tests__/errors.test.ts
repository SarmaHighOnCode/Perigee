import { describe, expect, it } from 'vitest';

import {
  PerigeeApiError,
  isPendingDecisionLimit,
  isPerigeeApiError,
  isPurposeNotAuthorised,
  isRateLimited,
  parseErrorEnvelope,
} from '../errors';

const ENVELOPE = {
  error: {
    code: 'PENDING_DECISION_LIMIT',
    message: '3 searches await adjudication',
    detail: { open_search_ids: ['018f2c00-0000-4000-8000-00000000000a'] },
    request_id: '018f2c00-0000-4000-8000-000000000001',
  },
};

describe('parseErrorEnvelope', () => {
  it('maps every envelope field onto the error', () => {
    const error = parseErrorEnvelope(ENVELOPE, 429, 'fallback-id');

    expect(error).toBeInstanceOf(PerigeeApiError);
    expect(error?.code).toBe('PENDING_DECISION_LIMIT');
    expect(error?.message).toBe('3 searches await adjudication');
    expect(error?.detail).toEqual({
      open_search_ids: ['018f2c00-0000-4000-8000-00000000000a'],
    });
    expect(error?.requestId).toBe('018f2c00-0000-4000-8000-000000000001');
    expect(error?.httpStatus).toBe(429);
  });

  it('falls back to the locally generated request id when the body omits one', () => {
    const error = parseErrorEnvelope(
      { error: { code: 'NOT_FOUND', message: 'gone', detail: {} } },
      404,
      'fallback-id',
    );

    expect(error?.requestId).toBe('fallback-id');
  });

  it('defaults a missing detail to an empty object', () => {
    const error = parseErrorEnvelope({ error: { code: 'NOT_FOUND' } }, 404, 'fallback-id');

    expect(error?.detail).toEqual({});
    // No message in the body: the code stands in, so a UI never renders "undefined".
    expect(error?.message).toBe('NOT_FOUND');
  });

  it('returns null rather than inventing a code for a body it does not recognise', () => {
    expect(parseErrorEnvelope({ detail: 'Not Found' }, 404, 'id')).toBeNull();
    expect(parseErrorEnvelope('<html>502 Bad Gateway</html>', 502, 'id')).toBeNull();
    expect(parseErrorEnvelope(null, 500, 'id')).toBeNull();
    expect(parseErrorEnvelope({ error: { message: 'no code' } }, 500, 'id')).toBeNull();
  });
});

describe('type guards', () => {
  const pendingLimit = parseErrorEnvelope(ENVELOPE, 429, 'id');

  it('identifies a PerigeeApiError and nothing else', () => {
    expect(isPerigeeApiError(pendingLimit)).toBe(true);
    expect(isPerigeeApiError(new Error('boom'))).toBe(false);
    expect(isPerigeeApiError({ code: 'RATE_LIMITED' })).toBe(false);
    expect(isPerigeeApiError(undefined)).toBe(false);
  });

  it('separates the two 429s, which need opposite handling', () => {
    const rateLimited = new PerigeeApiError({
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      httpStatus: 429,
    });

    expect(isPendingDecisionLimit(pendingLimit)).toBe(true);
    expect(isRateLimited(pendingLimit)).toBe(false);

    expect(isRateLimited(rateLimited)).toBe(true);
    expect(isPendingDecisionLimit(rateLimited)).toBe(false);
  });

  it('identifies a purpose-binding refusal', () => {
    const forbidden = new PerigeeApiError({
      code: 'PURPOSE_NOT_AUTHORISED',
      message: 'Access to a person record requires a search_id with a CONFIRMED decision',
      httpStatus: 403,
    });

    expect(isPurposeNotAuthorised(forbidden)).toBe(true);
    expect(isPurposeNotAuthorised(new Error('nope'))).toBe(false);
  });
});
