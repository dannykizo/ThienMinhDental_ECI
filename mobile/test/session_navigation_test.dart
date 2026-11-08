import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/auth/login_screen.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

const _owner = SessionUser(
    id: 'development-owner',
    email: 'uat@development.invalid',
    displayName: 'Development only',
    employeeId: 'development-employee',
    roles: ['EMPLOYEE']);

class _Api extends ApiClient {
  @override
  Future<TodayAttendance> today() async => const TodayAttendance(
      checkedInAt: null,
      checkedOutAt: null,
      date: '2026-10-14',
      isFullWorkday: false,
      overtimeMinutes: 0,
      requiredWorkMinutes: 480,
      riskFlags: [],
      status: 'NOT_CHECKED_IN',
      workedMinutes: 0);
  @override
  Future<List<BusinessTripAssignment>> myBusinessTrips() async => [];
  @override
  Future<List<EmployeeAnnouncement>> myAnnouncements() async => [];
  @override
  Future<ManagementAccess> managementAccess() async =>
      const ManagementAccess(canReviewExplanations: false, grants: []);
  @override
  Future<void> logout() async {}
  @override
  Future<LoginSession> login(String email, String password,
          {required String deviceId, required String deviceName}) async =>
      const LoginSession(
          accessToken: 'new-development-access',
          refreshToken: 'new-development-refresh',
          user: _owner);
}

class _Push extends PushNotificationService {
  Completer<void>? cleanup;
  @override
  Future<void> clearAccount() async {
    await cleanup?.future;
  }

  @override
  Future<void> refreshStatus() async {}
  @override
  Future<void> syncCurrentToken() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<(SessionController, _Api, _Push)> mount(WidgetTester tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'permission_setup_v1_seen': 'true',
      'access_token': 'development-access',
      'refresh_token': 'development-refresh',
    });
    final api = _Api(), push = _Push();
    final session = SessionController(
        api: api,
        pushNotifications: push,
        storage: const FlutterSecureStorage())
      ..isBootstrapping = false
      ..user = _owner;
    api.accessToken = 'development-access';
    api.refreshToken = 'development-refresh';
    addTearDown(session.dispose);
    addTearDown(push.dispose);
    await tester.pumpWidget(WorkforceApp(session: session));
    await tester.pumpAndSettle();
    final navigator =
        tester.state<NavigatorState>(find.byType(Navigator).first);
    unawaited(navigator.push(MaterialPageRoute<void>(
        builder: (_) =>
            const Scaffold(body: Text('Development-only private detail')))));
    await tester.pumpAndSettle();
    final context =
        tester.element(find.text('Development-only private detail'));
    unawaited(showDialog<void>(
        context: context,
        builder: (_) => const AlertDialog(
            content: Text('Development-only pending decision'))));
    await tester.pumpAndSettle();
    return (session, api, push);
  }

  testWidgets(
      'revocation removes details and dialog before native cleanup finishes',
      (tester) async {
    final (session, api, push) = await mount(tester);
    push.cleanup = Completer<void>();
    final expired = api.onSessionExpired!(const ApiException(
        'Development-only revoked session',
        code: 'SESSION_REVOKED',
        status: 401));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('Development-only private detail'), findsNothing);
    expect(find.text('Development-only pending decision'), findsNothing);
    expect(session.user, isNull);
    expect(api.refreshToken, isNull);
    push.cleanup!.complete();
    await expired;
    await tester.pumpAndSettle();
    expect(session.sessionNotice?.kind, SessionNoticeKind.ended);
    expect(tester.takeException(), isNull);
  });

  testWidgets('logout clears pushed private pages and cannot pop back to them',
      (tester) async {
    final (session, _, _) = await mount(tester);
    await session.logout();
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('Development-only private detail'), findsNothing);
    expect(tester.state<NavigatorState>(find.byType(Navigator).first).canPop(),
        isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('network and inbox refresh retain the active route and dialog',
      (tester) async {
    final (session, api, _) = await mount(tester);
    final revision = session.authenticatedNavigationRevision;
    api.onAvailabilityChanged!(ApiAvailability.backendUnavailable);
    session.updateUnreadAnnouncementCount(3);
    await tester.pumpAndSettle();
    expect(session.user?.id, _owner.id);
    expect(session.authenticatedNavigationRevision, revision);
    expect(find.text('Development-only pending decision'), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'new session for the same identity disposes the old navigation cache',
      (tester) async {
    final (session, _, _) = await mount(tester);
    final revision = session.authenticatedNavigationRevision;
    await session.login('uat@development.invalid', 'development-only-password');
    await tester.pumpAndSettle();
    expect(session.user?.id, _owner.id);
    expect(session.authenticatedNavigationRevision, greaterThan(revision));
    expect(find.text('Development-only private detail'), findsNothing);
    expect(find.text('Development-only pending decision'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
