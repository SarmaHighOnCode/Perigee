import { describe, expect, it } from 'vitest';

import {
  buildDecision,
  canLeaveResults,
  createScreening,
  reduceScreening,
} from './screening';

describe('Field screening workflow', () => {
  it('moves through reviewed capture, fixture, search and pending decision in order', () => {
    const captured = reduceScreening(createScreening(), {
      type: 'CAPTURED',
      mediaUri: 'file:///capture.jpg',
    });
    const reviewed = reduceScreening(captured, { type: 'REVIEWED' });
    const selected = reduceScreening(reviewed, {
      type: 'FIXTURE_SELECTED',
      fixture: 'FIXTURE_REVIEW',
    });
    const searching = reduceScreening(selected, { type: 'SEARCH_STARTED' });
    const pending = reduceScreening(searching, {
      type: 'SEARCH_SUCCEEDED',
      searchId: 'search-1',
      renderedAtMs: 500,
    });
    expect(pending).toMatchObject({
      phase: 'pending-decision',
      fixture: 'FIXTURE_REVIEW',
      searchId: 'search-1',
      renderedAtMs: 500,
    });
    expect(canLeaveResults(pending)).toBe(false);
  });

  it('rejects skipping review or fixture selection', () => {
    expect(() => reduceScreening(createScreening(), { type: 'SEARCH_STARTED' })).toThrow(
      'fixture-selected',
    );
  });

  it('requires a rank only for confirmation and records review latency', () => {
    expect(buildDecision({
      decision: 'CONFIRMED', confirmedRank: 2, renderedAtMs: 500, decidedAtMs: 1750,
    })).toEqual({
      decision: 'CONFIRMED', confirmed_rank: 2, latency_ms: 1250,
      quality_override: false,
    });
    expect(() => buildDecision({
      decision: 'CONFIRMED', renderedAtMs: 0, decidedAtMs: 100,
    })).toThrow('confirmed rank');
    expect(buildDecision({
      decision: 'ABORTED', renderedAtMs: 100, decidedAtMs: 90,
    })).toMatchObject({ decision: 'ABORTED', latency_ms: 0 });
  });

  it('allows leaving only after an explicit recorded outcome', () => {
    const pending = {
      ...createScreening(),
      phase: 'pending-decision' as const,
      mediaUri: 'file:///capture.jpg',
      fixture: 'FIXTURE_STRONG' as const,
      searchId: 'search-1',
      renderedAtMs: 100,
    };
    expect(canLeaveResults(pending)).toBe(false);
    expect(canLeaveResults(reduceScreening(pending, {
      type: 'DECISION_RECORDED', decision: 'ABORTED',
    }))).toBe(true);
  });
});
