// Notification data is an identity hint only. The authenticated inbox API must
// still authorize and load the content before any read/acknowledgement action.
bool acceptsAnnouncementPush(Map<String, dynamic> data, String? userId) {
  if (userId == null || data['type'] != 'ANNOUNCEMENT') return false;
  final dynamic target = data['recipientUserId'];
  return target == null || target == userId;
}

String? pushAnnouncementId(Map<String, dynamic> data) {
  final dynamic id = data['announcementId'];
  return id is String && RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(id) ? id : null;
}
