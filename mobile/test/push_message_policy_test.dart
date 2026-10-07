import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/services/push_message_policy.dart';

void main() {
  test('push cannot open another account and never grants inbox access', () {
    final data = <String, dynamic>{
      'type': 'ANNOUNCEMENT',
      'recipientUserId': 'owner'
    };
    expect(acceptsAnnouncementPush(data, 'owner'), isTrue);
    expect(acceptsAnnouncementPush(data, 'another-user'), isFalse);
    expect(acceptsAnnouncementPush(data, null), isFalse);
    expect(acceptsAnnouncementPush(<String, dynamic>{'type': 'OTHER'}, 'owner'),
        isFalse);
    expect(
        pushAnnouncementId(<String, dynamic>{'announcementId': 123}), isNull);
    expect(
        pushAnnouncementId(<String, dynamic>{'announcementId': '../private'}),
        isNull);
    expect(
        pushAnnouncementId(<String, dynamic>{
          'announcementId': '8d19f897-9a76-4094-89d2-69ed3542d134'
        }),
        isNotNull);
  });
}
