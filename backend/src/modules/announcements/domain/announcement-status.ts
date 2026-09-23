export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'WITHDRAWN';

const transitions: Readonly<Record<AnnouncementStatus, readonly AnnouncementStatus[]>> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['WITHDRAWN'],
  CANCELLED: [],
  WITHDRAWN: [],
};

export function canTransitionAnnouncement(from: string, to: string): boolean {
  return (transitions[from as AnnouncementStatus] ?? []).includes(to as AnnouncementStatus);
}

export function canAcknowledgeAnnouncement(status: string, requiresAcknowledgement: boolean): boolean {
  return status === 'PUBLISHED' && requiresAcknowledgement;
}
