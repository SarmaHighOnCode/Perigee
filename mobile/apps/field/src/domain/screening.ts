import type { Decision, DecisionRequest } from '@perigee/api-client';

import type { FixtureName } from './fixtures';

export type ScreeningPhase =
  | 'idle'
  | 'captured'
  | 'reviewed'
  | 'fixture-selected'
  | 'searching'
  | 'pending-decision'
  | 'resolved';

export interface ScreeningState {
  phase: ScreeningPhase;
  mediaUri: string | null;
  fixture: FixtureName | null;
  searchId: string | null;
  renderedAtMs: number | null;
  decision: Decision | null;
}

export type ScreeningEvent =
  | { type: 'CAPTURED'; mediaUri: string }
  | { type: 'REVIEWED' }
  | { type: 'FIXTURE_SELECTED'; fixture: FixtureName }
  | { type: 'SEARCH_STARTED' }
  | { type: 'SEARCH_SUCCEEDED'; searchId: string; renderedAtMs: number }
  | { type: 'DECISION_RECORDED'; decision: Decision }
  | { type: 'RESET' };

export function createScreening(): ScreeningState {
  return {
    phase: 'idle',
    mediaUri: null,
    fixture: null,
    searchId: null,
    renderedAtMs: null,
    decision: null,
  };
}

function requirePhase(state: ScreeningState, expected: ScreeningPhase) {
  if (state.phase !== expected) {
    throw new Error(`Expected screening phase ${expected}, received ${state.phase}`);
  }
}

export function reduceScreening(
  state: ScreeningState,
  event: ScreeningEvent,
): ScreeningState {
  switch (event.type) {
    case 'CAPTURED':
      if (state.phase !== 'idle' && state.phase !== 'captured') {
        throw new Error(`Expected screening phase idle, received ${state.phase}`);
      }
      return { ...createScreening(), phase: 'captured', mediaUri: event.mediaUri };
    case 'REVIEWED':
      requirePhase(state, 'captured');
      return { ...state, phase: 'reviewed' };
    case 'FIXTURE_SELECTED':
      requirePhase(state, 'reviewed');
      return { ...state, phase: 'fixture-selected', fixture: event.fixture };
    case 'SEARCH_STARTED':
      requirePhase(state, 'fixture-selected');
      return { ...state, phase: 'searching' };
    case 'SEARCH_SUCCEEDED':
      requirePhase(state, 'searching');
      return {
        ...state,
        phase: 'pending-decision',
        searchId: event.searchId,
        renderedAtMs: event.renderedAtMs,
      };
    case 'DECISION_RECORDED':
      requirePhase(state, 'pending-decision');
      return { ...state, phase: 'resolved', decision: event.decision };
    case 'RESET':
      return createScreening();
  }
}

export function canLeaveResults(state: ScreeningState): boolean {
  return state.phase !== 'pending-decision';
}

export function buildDecision(input: {
  decision: Decision;
  confirmedRank?: number;
  renderedAtMs: number;
  decidedAtMs: number;
}): DecisionRequest {
  const latencyMs = Math.max(0, Math.round(input.decidedAtMs - input.renderedAtMs));
  if (input.decision === 'CONFIRMED') {
    const confirmedRank = input.confirmedRank;
    if (typeof confirmedRank !== 'number' || !Number.isInteger(confirmedRank) || confirmedRank < 1) {
      throw new Error('A confirmed rank is required for CONFIRMED decisions');
    }
    return {
      decision: input.decision,
      confirmed_rank: confirmedRank,
      latency_ms: latencyMs,
      quality_override: false,
    };
  }
  return {
    decision: input.decision,
    latency_ms: latencyMs,
    quality_override: false,
  };
}
