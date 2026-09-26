const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function businessTripPeriod(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('BUSINESS_TRIP_PERIOD_INVALID');
  return `${year}${month}`;
}

export function formatBusinessTripCode(
  period: string,
  sequence: number,
): string {
  if (!/^\d{6}$/.test(period) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('BUSINESS_TRIP_CODE_INPUT_INVALID');
  }
  return `CT-${period}-${String(sequence).padStart(4, '0')}`;
}
