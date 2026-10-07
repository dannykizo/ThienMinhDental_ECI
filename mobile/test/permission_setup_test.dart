import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/permissions/permission_setup_screen.dart';
import 'package:thien_minh_dental_workforce/services/android_notification_bridge.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

class _Bridge extends AndroidNotificationBridge {
  int requests = 0;
  int settings = 0;
  @override
  bool get supported => true;
  @override
  Future<void> initialize() async {}
  @override
  Future<void> refreshStatus() async {}
  @override
  Future<void> requestPermission() async {
    requests++;
    enabled = true;
    permissionGranted = true;
    canRequestPermission = false;
  }

  @override
  Future<void> openSettings() async {
    settings++;
  }
}

class _Push extends PushNotificationService {
  final _Bridge bridge = _Bridge()
    ..enabled = false
    ..canRequestPermission = true;
  @override
  AndroidNotificationBridge get android => bridge;
  @override
  Future<void> requestPermission() => bridge.requestPermission();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final List<String> locationCalls = [];
  const MethodChannel location =
      MethodChannel('flutter.baseflow.com/geolocator');
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    locationCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(location, (call) async {
      locationCalls.add(call.method);
      return switch (call.method) {
        'checkPermission' => 0,
        'isLocationServiceEnabled' => true,
        _ => throw StateError('Unexpected access: ${call.method}'),
      };
    });
  });
  tearDown(() => TestDefaultBinaryMessengerBinding
      .instance.defaultBinaryMessenger
      .setMockMethodCallHandler(location, null));

  Future<SessionController> open(WidgetTester tester, _Push push) async {
    final session = SessionController(
        api: ApiClient(),
        pushNotifications: push,
        storage: const FlutterSecureStorage())
      ..user = const SessionUser(
          displayName: 'Development only',
          email: 'setup@example.invalid',
          employeeId: 'dev',
          id: 'dev',
          roles: ['EMPLOYEE'])
      ..needsPermissionSetup = true;
    addTearDown(session.dispose);
    addTearDown(push.dispose);
    await tester.pumpWidget(MaterialApp(
        home: ListenableBuilder(
            listenable: session,
            builder: (_, __) => session.needsPermissionSetup
                ? PermissionSetupScreen(session: session, firstRun: true)
                : const Scaffold(body: Text('Employee shell placeholder')))));
    await tester.pumpAndSettle();
    return session;
  }

  testWidgets(
      'entry/resume only checks status, never requests GPS or notification access',
      (tester) async {
    final push = _Push();
    await open(tester, push);
    expect(push.bridge.requests, 0);
    expect(push.bridge.settings, 0);
    expect(locationCalls, contains('checkPermission'));
    expect(locationCalls, isNot(contains('requestPermission')));
    expect(locationCalls, isNot(contains('getCurrentPosition')));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(push.bridge.requests, 0);
  });

  testWidgets('skip does not require any grants and persists setup dismissal',
      (tester) async {
    final push = _Push();
    final session = await open(tester, push);
    await tester.tap(find.text('Để sau'));
    await tester.pumpAndSettle();
    expect(session.needsPermissionSetup, isFalse);
    expect(push.bridge.requests, 0);
    expect(find.text('Employee shell placeholder'), findsOneWidget);
    expect(
        await const FlutterSecureStorage()
            .read(key: 'permission_setup_v1_seen'),
        'true');
  });

  testWidgets(
      'explicit notification action works without Firebase; enabled access opens settings',
      (tester) async {
    final push = _Push();
    await open(tester, push);
    await tester.ensureVisible(find.text('Cho phép thông báo'));
    await tester.tap(find.text('Cho phép thông báo'));
    await tester.pumpAndSettle();
    expect(push.bridge.requests, 1);
    expect(find.text('Đã bật'), findsOneWidget);
    expect(push.configured, isFalse);
    await tester.ensureVisible(find.text('Cài đặt thông báo'));
    await tester.tap(find.text('Cài đặt thông báo'));
    await tester.pumpAndSettle();
    expect(push.bridge.settings, 1);
    expect(push.bridge.requests, 1);
  });

  testWidgets(
      'blocked notification access opens settings without another request',
      (tester) async {
    final push = _Push()..bridge.canRequestPermission = false;
    await open(tester, push);
    expect(find.text('Chưa bật'), findsOneWidget);
    await tester.ensureVisible(find.text('Cài đặt thông báo'));
    await tester.tap(find.text('Cài đặt thông báo'));
    await tester.pumpAndSettle();
    expect(push.bridge.requests, 0);
    expect(push.bridge.settings, 1);
  });
}
