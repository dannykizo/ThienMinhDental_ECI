export const ANNOUNCEMENT_PUSH_SENDER = Symbol(
  'ANNOUNCEMENT_PUSH_SENDER',
);

export interface AnnouncementPushResult {
  attempted: number;
  delivered: number;
  failed: number;
  status: 'SENT' | 'SKIPPED' | 'FAILED';
}

export interface AnnouncementPushSender {
  isConfigured(): boolean;
  sendAnnouncement(input: {
    announcementId: string;
    body: string;
    employeeIds: string[];
    requiresAcknowledgement: boolean;
    title: string;
  }): Promise<AnnouncementPushResult>;
}
