export const businessTripTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionBusinessTrip(from: string, to: string): boolean {
  return businessTripTransitions[from]?.includes(to) ?? false;
}

export function canStartBusinessTripMember(tripStatus: string, memberStatus: string): boolean {
  return ['ASSIGNED', 'IN_PROGRESS'].includes(tripStatus) && memberStatus === 'ASSIGNED';
}

export function canCompleteBusinessTripMember(memberStatus: string): boolean {
  return memberStatus === 'IN_PROGRESS';
}

export function shouldCompleteBusinessTrip(memberStatuses: readonly string[]): boolean {
  return memberStatuses.length > 0 && memberStatuses.every((status) => status === 'COMPLETED');
}

export function hasValidBusinessTripEvidence(requiresPhoto: boolean, imageReference?: string, capturedAt?: string): boolean {
  const hasImage = Boolean(imageReference?.trim());
  const hasCaptureTime = Boolean(capturedAt);
  return hasImage === hasCaptureTime && (!requiresPhoto || (hasImage && hasCaptureTime));
}
