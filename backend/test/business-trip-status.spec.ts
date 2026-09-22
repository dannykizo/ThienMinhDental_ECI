import { describe, expect, it } from 'vitest';
import { canCompleteBusinessTripMember, canStartBusinessTripMember, canTransitionBusinessTrip, hasValidBusinessTripEvidence, shouldCompleteBusinessTrip } from '../src/modules/business-trips/domain/business-trip-status.js';

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

  it('lets only an assigned member start and only an in-progress member complete', () => {
    expect(canStartBusinessTripMember('ASSIGNED', 'ASSIGNED')).toBe(true);
    expect(canStartBusinessTripMember('IN_PROGRESS', 'ASSIGNED')).toBe(true);
    expect(canStartBusinessTripMember('DRAFT', 'ASSIGNED')).toBe(false);
    expect(canCompleteBusinessTripMember('IN_PROGRESS')).toBe(true);
    expect(canCompleteBusinessTripMember('ASSIGNED')).toBe(false);
  });

  it('completes the aggregate trip only after every member completes', () => {
    expect(shouldCompleteBusinessTrip(['COMPLETED', 'COMPLETED'])).toBe(true);
    expect(shouldCompleteBusinessTrip(['COMPLETED', 'ASSIGNED'])).toBe(false);
    expect(shouldCompleteBusinessTrip([])).toBe(false);
  });

  it('requires image and capture time together when field evidence is enabled', () => {
    expect(hasValidBusinessTripEvidence(true, 'trip/photo.jpg', '2026-09-22T08:00:00+07:00')).toBe(true);
    expect(hasValidBusinessTripEvidence(true, 'trip/photo.jpg')).toBe(false);
    expect(hasValidBusinessTripEvidence(false)).toBe(true);
    expect(hasValidBusinessTripEvidence(false, 'trip/photo.jpg')).toBe(false);
  });
});
