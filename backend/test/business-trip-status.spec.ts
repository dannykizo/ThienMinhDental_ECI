import { describe, expect, it } from 'vitest';
import { canTransitionBusinessTrip } from '../src/modules/business-trips/domain/business-trip-status.js';

describe('business trip state machine', () => {
  it('allows the approved forward path and cancellation before completion', () => {
    expect(canTransitionBusinessTrip('DRAFT', 'ASSIGNED')).toBe(true);
    expect(canTransitionBusinessTrip('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionBusinessTrip('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransitionBusinessTrip('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionBusinessTrip('ASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransitionBusinessTrip('IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('rejects skipped, reversed, and terminal transitions', () => {
    expect(canTransitionBusinessTrip('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionBusinessTrip('IN_PROGRESS', 'ASSIGNED')).toBe(false);
    expect(canTransitionBusinessTrip('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransitionBusinessTrip('CANCELLED', 'ASSIGNED')).toBe(false);
  });
});
