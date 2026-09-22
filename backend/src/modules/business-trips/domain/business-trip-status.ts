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
