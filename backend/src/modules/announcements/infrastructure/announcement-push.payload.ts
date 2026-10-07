import type { Message } from 'firebase-admin/messaging';

// Keep the transport preview below FCM's 4 KB payload limit, including UTF-8
// text. Full content and read/acknowledgement state remain in the inbox API.
export function announcementPushPayload(input: {
  announcementId: string;
  body: string;
  requiresAcknowledgement: boolean;
  title: string;
}, recipientUserId: string): Omit<Message, 'token' | 'topic' | 'condition'> {
  const preview = Array.from(input.body);
  return {
    android: {
      notification: {
        channelId: 'announcements',
        icon: 'ic_notification',
        tag: input.announcementId,
        visibility: 'private' as const,
      },
      priority: 'high' as const,
    },
    data: {
      announcementId: input.announcementId,
      recipientUserId,
      requiresAcknowledgement: String(input.requiresAcknowledgement),
      type: 'ANNOUNCEMENT',
    },
    notification: {
      body: preview.slice(0, 400).join('') + (preview.length > 400 ? '…' : ''),
      title: Array.from(input.title).slice(0, 200).join(''),
    },
  };
}
