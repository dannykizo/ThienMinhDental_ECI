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

export function validateEvidence(issueType: ExplanationIssueType, evidence: ExplanationEvidence): boolean {
  const evidenceValues = [
    evidence.evidenceImageReference,
    evidence.evidenceCapturedAt,
    evidence.evidenceLatitude,
    evidence.evidenceLongitude,
  ];
  const hasAny = evidenceValues.some((value) => value !== undefined && value !== '');
  return issueType === 'GPS_RISK' || hasAny ? hasCompleteEvidence(evidence) : true;
}

export function canReviewExplanation(status: string): boolean {
  return status === 'SUBMITTED';
}
