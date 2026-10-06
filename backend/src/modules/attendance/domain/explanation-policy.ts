export type ExplanationIssueType =
  | 'MISSING_CHECK_IN'
  | 'MISSING_CHECK_OUT'
  | 'DUPLICATE_ATTEMPT'
  | 'WRONG_DATE_OR_DEVICE_TIME'
  | 'GPS_RISK'
  | 'OTHER';

export interface ExplanationEvidence {
  evidenceImageReference?: string;
  evidenceCapturedAt?: string;
  evidenceLatitude?: number;
  evidenceLongitude?: number;
}

export function hasCompleteEvidence(evidence: ExplanationEvidence): boolean {
  return Boolean(
    evidence.evidenceImageReference?.trim()
      && evidence.evidenceCapturedAt
      && evidence.evidenceLatitude !== undefined
      && evidence.evidenceLongitude !== undefined,
  );
}

export function validateEvidence(_issueType: ExplanationIssueType, evidence: ExplanationEvidence): boolean {
  const evidenceValues = [
    evidence.evidenceImageReference,
    evidence.evidenceCapturedAt,
    evidence.evidenceLatitude,
    evidence.evidenceLongitude,
  ];
  const hasAny = evidenceValues.some((value) => value != null && value !== '');
  if (!hasAny) return true;
  if (!evidence.evidenceImageReference?.trim()) return false;
  // Imported images need neither a made-up capture time nor GPS metadata.
  return (evidence.evidenceLatitude == null) === (evidence.evidenceLongitude == null);
}

export function validExplanationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function canReviewExplanation(status: string): boolean {
  return status === 'SUBMITTED';
}
