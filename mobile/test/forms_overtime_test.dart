import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/forms/forms_home.dart';
import 'package:thien_minh_dental_workforce/features/overtime/overtime_form.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

class _Api extends ApiClient {
  int submissions = 0;
  @override
  Future<List<ManagedOvertimeRequest>> overtimeRequests(
          {bool mine = true}) async =>
      [];
  @override
  Future<void> createOvertime(
      {required String submissionId,
      required String workDate,
      required int requestedMinutes,
      required String reason,
      required String workContent}) async {
    submissions++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('hours convert exactly to integral minutes without silently rounding',
      () {
    expect(overtimeMinutesFromHours('1,5'), 90);
    expect(overtimeMinutesFromHours('0.25'), 15);
    for (final value in ['0', '25', 'NaN', 'Infinity', '0.001', 'abc']) {
      expect(overtimeMinutesFromHours(value), isNull);
    }
  });
  test(
      'OT capability is independent and does not derive from leave or membership',
      () {
    expect(
        ManagementAccess.fromJson({
          'capabilities': {'leaveWorkflow': 'LEAVE_TWO_STEP'}
        }).canReviewOvertime,
        isFalse);
    expect(
        ManagementAccess.fromJson({
          'capabilities': {'overtimeWorkflow': 'OVERTIME_TWO_STEP'}
        }).canReviewOvertime,
        isTrue);
  });
  test(
      'OT contract includes its own content, minutes, stage, version and actors',
      () {
    final item = ManagedOvertimeRequest.fromJson({
      'id': 'request',
      'workDate': '2026-10-10',
      'requestedMinutes': 90,
      'reason': 'development only',
      'workContent': 'fixture work content',
      'status': 'SUBMITTED',
      'approvalStage': 'HEAD_APPROVAL',
      'routeVersion': 2,
      'canConfirm': false,
      'canReview': true,
      'confirmedByName': 'Demo leader',
      'headName': 'Demo head'
    });
    expect(item.request.workContent, 'fixture work content');
    expect(item.routeVersion, 2);
    expect(item.canReview, isTrue);
    expect(item.confirmedByName, 'Demo leader');
  });
  testWidgets(
      'Forms groups three types; OT opens its list and validates the form without submitting',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    final api = _Api(), push = PushNotificationService();
    final session = SessionController(
        api: api,
        pushNotifications: push,
        storage: const FlutterSecureStorage())
      ..user = const SessionUser(
          id: 'development-owner',
          email: 'dev@example.invalid',
          displayName: 'Development Only',
          employeeId: 'development-employee',
          roles: ['EMPLOYEE']);
    addTearDown(session.dispose);
    addTearDown(push.dispose);
    await tester.pumpWidget(MaterialApp(home: FormsHome(session: session)));
    expect(find.text('Giải trình'), findsOneWidget);
    expect(find.text('Đơn nghỉ phép'), findsOneWidget);
    expect(find.text('Đơn tăng ca (OT)'), findsOneWidget);
    await tester.tap(find.text('Đơn tăng ca (OT)'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Tạo phiếu OT'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gửi phiếu OT'));
    await tester.pumpAndSettle();
    expect(find.text('Nhập ít nhất 5 ký tự.'), findsNWidgets(2));
    expect(api.submissions, 0);
    expect(tester.takeException(), isNull);
  });
}
