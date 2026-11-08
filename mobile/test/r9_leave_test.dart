import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/leave/leave_request_screen.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

// Synthetic fixture only. No real account, leave balance, GPS or Backend access.
final policy = LeavePolicy.fromJson({
  'id': 'development-policy',
  'code': 'R9_DEV',
  'name': 'R9 Development only',
  'allowHalfDay': true,
  'allowHourly': true,
  'dayMinutes': 480,
  'balanceTrackingEnabled': true,
  'allowApprovedCancellation': true,
});
EmployeeLeaveRequest item(String status) => EmployeeLeaveRequest.fromJson({
      'id': 'development-request',
      'policyId': policy.id,
      'leaveType': policy.code,
      'policyName': policy.name,
      'startDate': '2030-01-15',
      'endDate': '2030-01-15',
      'reason': 'R9 development only',
      'requestedMinutes': 240,
      'durationType': 'HALF_DAY',
      'halfDayPeriod': 'AM',
      'status': status,
      'submittedAt': '2026-10-12T00:00:00Z',
    });

class _Api extends ApiClient {
  int creates = 0, cancels = 0, reads = 0;
  String status = 'SUBMITTED';
  bool failRead = false;
  ApiException? createError, cancelError;
  Completer<void>? cancelPending;
  List<LeaveBalance> balances = [];

  @override
  Future<List<EmployeeLeaveRequest>> myLeaveRequests() async {
    reads++;
    if (failRead) throw const ApiException('R9 development-only stale read');
    return [item(status)];
  }

  @override
  Future<List<LeavePolicy>> leavePolicies() async => [policy];
  @override
  Future<List<LeaveBalance>> myLeaveBalances(int year) async => balances;
  @override
  Future<void> createLeaveRequest(
      {required String endDate,
      required String policyId,
      required String reason,
      required String startDate,
      String durationType = 'FULL_DAY',
      String? endTime,
      String? halfDayPeriod,
      String? startTime}) async {
    creates++;
    if (createError != null) throw createError!;
  }

  @override
  Future<void> cancelLeaveRequest(
      {required String leaveRequestId, required String reason}) async {
    cancels++;
    if (cancelError != null) throw cancelError!;
    if (cancelPending != null) await cancelPending!.future;
    status = 'CANCELLED';
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<SessionController> session(ApiClient api) async {
    FlutterSecureStorage.setMockInitialValues({});
    final push = PushNotificationService();
    final value = SessionController(
        api: api,
        pushNotifications: push,
        storage: const FlutterSecureStorage());
    addTearDown(value.dispose);
    addTearDown(push.dispose);
    return value;
  }

  Future<void> tap(WidgetTester tester, String text) async {
    final target = find.text(text);
    if (target.evaluate().isEmpty) {
      await tester.scrollUntilVisible(target, 250,
          scrollable: find.byType(Scrollable).first);
    }
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  Future<void> openCancellation(WidgetTester tester) async {
    await tap(tester, 'Hủy đơn');
    await tester.enterText(
        find.byType(TextField).last, 'R9 development cancellation');
    await tester.tap(find.text('Xác nhận hủy'));
    // Busy state has no replay. Avoid settling until the held mutation completes.
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<FilledButton> action(WidgetTester tester, String label) async {
    final text = find.text(label);
    if (text.evaluate().isEmpty) {
      await tester.scrollUntilVisible(text, 250,
          scrollable: find.byType(Scrollable).first);
    }
    await tester.ensureVisible(text);
    await tester.pumpAndSettle();
    return tester.widget<FilledButton>(find
        .ancestor(
            of: text,
            matching:
                find.byWidgetPredicate((widget) => widget is FilledButton))
        .first);
  }

  test(
      'balances and partial leave render exact Backend minutes without calculating policy usage',
      () {
    final balance = LeaveBalance.fromJson({
      'availableMinutes': 1060,
      'pendingMinutes': 106,
      'dayMinutes': 360,
      'policyId': policy.id,
      'policyName': policy.name
    });
    expect(balance.availableMinutes, 1060);
    expect(balance.pendingMinutes, 106);
    expect(item('SUBMITTED').requestedMinutes, 240);
    expect(item('SUBMITTED').halfDayPeriod, 'AM');
  });
  test(
      'hourly payload omits actor and calculated minutes; cancel is a separate request',
      () async {
    final api = ApiClient(baseUrl: 'https://development.invalid/api');
    final bodies = <Map<String, dynamic>>[];
    await http.runWithClient(() async {
      await api.createLeaveRequest(
          policyId: policy.id,
          startDate: '2030-01-15',
          endDate: '2030-01-15',
          durationType: 'HOURS',
          startTime: '08:15',
          endTime: '10:01',
          reason: 'Development only');
      await api.cancelLeaveRequest(
          leaveRequestId: 'request', reason: 'Development only');
    },
        () => MockClient((request) async {
              expect(request.method, 'POST');
              bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
              expect(
                  request.url.path,
                  bodies.length == 1
                      ? '/api/leave-requests/mine'
                      : '/api/leave-requests/request/cancel');
              return http.Response('{}', 201);
            }));
    expect(bodies.first, containsPair('endTime', '10:01'));
    expect(bodies.first.keys, isNot(contains('employeeId')));
    expect(bodies.first.keys, isNot(contains('requestedMinutes')));
    expect(bodies.last, {'reason': 'Development only'});
  });
  for (final code in [409, 502]) {
    testWidgets(
        'ambiguous/conflict submission $code requires checking list, not replay',
        (tester) async {
      final api = _Api()
        ..createError = ApiException('R9 development response', status: code);
      await tester.pumpWidget(MaterialApp(
          home: CreateLeaveRequestScreen(
              session: await session(api), policies: [policy])));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byType(TextField).last, 'R9 development reason');
      await tap(tester, 'Gửi đơn nghỉ');
      expect(find.text('Kiểm tra danh sách đơn'), findsOneWidget);
      expect((await action(tester, 'Gửi đơn nghỉ')).onPressed, isNull);
      expect(api.creates, 1);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
      '400 validation keeps the form editable and does not pretend to reserve balance',
      (tester) async {
    final api = _Api()
      ..createError =
          const ApiException('R9 development validation', status: 400);
    await tester.pumpWidget(MaterialApp(
        home: CreateLeaveRequestScreen(
            session: await session(api), policies: [policy])));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextField).last, 'R9 development reason');
    await tap(tester, 'Gửi đơn nghỉ');
    expect(find.text('Kiểm tra danh sách đơn'), findsNothing);
    expect((await action(tester, 'Gửi đơn nghỉ')).onPressed, isNotNull);
    expect(api.creates, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'cancel holds all mutations until response, then rereads requests/balance',
      (tester) async {
    final api = _Api()..cancelPending = Completer<void>();
    await tester.pumpWidget(
        MaterialApp(home: LeaveRequestScreen(session: await session(api))));
    await tester.pumpAndSettle();
    await openCancellation(tester);
    expect(api.cancels, 1);
    expect(find.text('Hủy đơn'), findsNothing);
    expect((await action(tester, 'Tạo đơn nghỉ')).onPressed, isNull);
    api.cancelPending!.complete();
    await tester.pumpAndSettle();
    expect(api.reads, 2);
    expect(find.text('Hủy đơn'), findsNothing);
    expect(api.status, 'CANCELLED');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'cancel error requires read-only refresh before another operation',
      (tester) async {
    final api = _Api()
      ..cancelError =
          const ApiException('R9 development unknown result', status: 502);
    await tester.pumpWidget(
        MaterialApp(home: LeaveRequestScreen(session: await session(api))));
    await tester.pumpAndSettle();
    await openCancellation(tester);
    await tester.pumpAndSettle();
    expect(api.cancels, 1);
    expect(find.text('Hủy đơn'), findsNothing);
    expect((await action(tester, 'Tạo đơn nghỉ')).onPressed, isNull);
    api.status = 'CANCELLED';
    await tester.tap(find.byTooltip('Làm mới'));
    await tester.pumpAndSettle();
    expect(api.reads, 2);
    expect(api.cancels, 1);
    expect(find.text('Hủy đơn'), findsNothing);
    expect((await action(tester, 'Tạo đơn nghỉ')).onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'failed refresh retains visible snapshot but disables stale actions',
      (tester) async {
    final api = _Api();
    await tester.pumpWidget(
        MaterialApp(home: LeaveRequestScreen(session: await session(api))));
    await tester.pumpAndSettle();
    expect(find.text('Hủy đơn'), findsOneWidget);
    api.failRead = true;
    await tester.tap(find.byTooltip('Làm mới'));
    await tester.pumpAndSettle();
    expect(find.text('R9 development-only stale read'), findsOneWidget);
    expect(find.text('Hủy đơn'), findsNothing);
    expect(api.cancels, 0);
    expect((await action(tester, 'Tạo đơn nghỉ')).onPressed, isNull);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'uninitialized balance is labelled as a Backend preview, not a granted balance',
      (tester) async {
    final api = _Api()
      ..balances = [
        LeaveBalance.fromJson({
          'policyId': policy.id,
          'policyName': policy.name,
          'pendingMinutes': 0,
          'availableMinutes': 240,
          'initialized': false
        })
      ];
    await tester.pumpWidget(
        MaterialApp(home: LeaveRequestScreen(session: await session(api))));
    await tester.pumpAndSettle();
    expect(find.text('Số dư dự kiến · chưa khởi tạo'), findsOneWidget);
    expect(api.balances.single.initialized, isFalse);
    expect(
        LeaveBalance.fromJson({
          'policyId': policy.id,
          'policyName': policy.name,
          'pendingMinutes': 0,
          'availableMinutes': 0
        }).initialized,
        isNull);
    expect(tester.takeException(), isNull);
  });
}
