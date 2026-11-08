import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/attendance/attendance_home.dart';
import 'package:thien_minh_dental_workforce/features/attendance/checkin_photo.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

class _Api extends ApiClient {
  @override
  Future<TodayAttendance> today() async => const TodayAttendance(
      checkedInAt: null,
      checkedOutAt: null,
      date: '2026-10-10',
      isFullWorkday: false,
      overtimeMinutes: 0,
      requiredWorkMinutes: 480,
      riskFlags: <String>[],
      status: 'NOT_CHECKED_IN',
      workedMinutes: 0);
}

class _RecoveryDeviceApi extends _Api {
  _RecoveryDeviceApi({this.failFirstRegistration = false});
  final bool failFirstRegistration;
  int todayReads = 0;
  int registrations = 0;
  @override
  Future<TodayAttendance> today() async {
    if (++todayReads == 1) {
      throw const ApiException('Development-only temporary read failure');
    }
    return super.today();
  }

  @override
  Future<Map<String, dynamic>> registerAttendanceDevice(
      String publicKey) async {
    if (++registrations == 1 && failFirstRegistration) {
      throw const ApiException(
          'Development-only temporary registration failure');
    }
    return <String, dynamic>{
      'status': 'ACTIVE',
      'fingerprint': 'development-key'
    };
  }
}

class _ApprovedOvertimeApi extends _Api {
  _ApprovedOvertimeApi(this.status);
  final String status;

  @override
  Future<TodayAttendance> today() async => TodayAttendance(
      checkedInAt: status == 'CHECKED_IN' ? DateTime.utc(2026, 10, 14, 1) : null,
      checkedOutAt: null,
      date: '2026-10-14',
      isFullWorkday: false,
      overtimeMinutes: 90,
      requiredWorkMinutes: 480,
      riskFlags: const <String>[],
      status: status,
      workedMinutes: 0);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const deviceChannel = MethodChannel('vn.thienminh/attendance-proof');
  Future<void> mountHome(WidgetTester tester, ApiClient api) async {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    final push = PushNotificationService();
    addTearDown(push.dispose);
    final session = SessionController(
        api: api,
        pushNotifications: push,
        storage: const FlutterSecureStorage())
      ..user = const SessionUser(
          displayName: 'Development only',
          email: 'daily@example.invalid',
          employeeId: 'dev',
          id: '12345678-1234-4234-8234-123456789012',
          roles: <String>['EMPLOYEE']);
    addTearDown(session.dispose);
    await tester.pumpWidget(MaterialApp(
        home: AttendanceHome(
            session: session,
            onOpenBusinessTrips: () {},
            onOpenExplanations: () {},
            onOpenLeave: () {},
            onOpenInbox: () {})));
    await tester.pumpAndSettle();
    addTearDown(() => TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceChannel, null));
  }

  for (final status in ['NOT_CHECKED_IN', 'CHECKED_IN']) {
    testWidgets('approved OT is visible before checkout: $status',
        (tester) async {
      await mountHome(tester, _ApprovedOvertimeApi(status));
      expect(find.text('1h 30p'), findsOneWidget);
      expect(find.text('TĂNG CA'), findsOneWidget);
      expect(find.text(status == 'CHECKED_IN'
          ? 'Chấm công ra'
          : 'Chấm công vào'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'device recovery error has its own title and preserves loaded Today',
      (tester) async {
    await mountHome(tester, _Api());
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            deviceChannel,
            (_) async => throw PlatformException(
                code: 'BIOMETRIC_UNAVAILABLE',
                message: 'Development-only biometric failure'));
    await tester.tap(find.byTooltip('Tạo lại khóa thiết bị (cần Admin duyệt)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tạo khóa mới'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa thể khôi phục khóa điện thoại'), findsOneWidget);
    expect(find.text('Development-only biometric failure'), findsOneWidget);
    expect(find.text('Chưa thể tải trạng thái hôm nay'), findsNothing);
    expect(find.text('Chấm công vào'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('device recovery rereads Today instead of retaining stale error',
      (tester) async {
    final api = _RecoveryDeviceApi();
    await mountHome(tester, api);
    expect(find.text('Chưa thể tải trạng thái hôm nay'), findsOneWidget);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceChannel,
            (call) async => call.method == 'publicKey' ? 'public-key' : null);
    await tester.tap(find.byTooltip('Tạo lại khóa thiết bị (cần Admin duyệt)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tạo khóa mới'));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Đã gắn khóa thiết bị đầu tiên'), findsOneWidget);
    expect(api.todayReads, 2);
    expect(find.text('Chưa thể tải trạng thái hôm nay'), findsNothing);
    expect(find.text('Chấm công vào'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'device recovery cancel never creates a key or registers a device',
      (tester) async {
    final api = _RecoveryDeviceApi();
    await mountHome(tester, api);
    int nativeCalls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceChannel, (_) async {
      nativeCalls++;
      return null;
    });
    expect(find.text('Đăng ký / xem mã khóa'), findsNothing);
    await tester.tap(find.byTooltip('Tạo lại khóa thiết bị (cần Admin duyệt)'));
    await tester.pumpAndSettle();
    expect(find.text('Tạo lại khóa điện thoại?'), findsOneWidget);
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(nativeCalls, 0);
    expect(api.registrations, 0);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'device recovery retries registration without resetting the key again',
      (tester) async {
    final api = _RecoveryDeviceApi(failFirstRegistration: true);
    await mountHome(tester, api);
    int resetCalls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceChannel, (call) async {
      if (call.method == 'resetKey') {
        resetCalls++;
        return null;
      }
      return 'public-key';
    });
    await tester.tap(find.byTooltip('Tạo lại khóa thiết bị (cần Admin duyệt)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tạo khóa mới'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa thể khôi phục khóa điện thoại'), findsOneWidget);
    expect(resetCalls, 1);
    await tester.tap(find.text('Thử kết nối lại'));
    await tester.pumpAndSettle();
    expect(resetCalls, 1);
    expect(api.registrations, 2);
    expect(find.text('Chưa thể khôi phục khóa điện thoại'), findsNothing);
    expect(find.text('Chưa thể tải trạng thái hôm nay'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  test('today decodes field mode without checkout GPS fields', () {
    final result = TodayAttendance.fromJson(<String, dynamic>{
      'date': '2026-10-10',
      'status': 'CHECKED_OUT',
      'attendanceType': 'BUSINESS_TRIP',
      'checkedInAt': '2026-10-10T01:00:00Z',
      'checkedOutAt': '2026-10-10T09:00:00Z',
      'riskFlags': <String>[],
      'workedMinutes': 480,
      'isFullWorkday': true,
    });
    expect(result.attendanceType, 'BUSINESS_TRIP');
    expect(result.workedMinutes, 480);
  });
  test('capture timemark parses Backend time, not the phone clock', () {
    final capture = CheckInCapture.fromJson(<String, dynamic>{
      'id': '12345678-1234-4234-8234-123456789012',
      'serverTime': '2026-10-10T01:15:00Z',
      'attendanceType': 'BUSINESS_TRIP',
      'latitude': 10,
      'longitude': 106,
    });
    expect(capture.serverTime.toUtc(), DateTime.utc(2026, 10, 10, 1, 15));
    expect(capture.latitude, 10);
    expect(capture.longitude, 106);
  });
  testWidgets(
      'check-in selector requires field content and cancels without GPS or record',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    final push = PushNotificationService();
    addTearDown(push.dispose);
    final session = SessionController(
        api: _Api(),
        pushNotifications: push,
        storage: const FlutterSecureStorage())
      ..user = const SessionUser(
          displayName: 'Development only',
          email: 'daily@example.invalid',
          employeeId: 'dev',
          id: 'dev',
          roles: <String>['EMPLOYEE']);
    addTearDown(session.dispose);
    await tester.pumpWidget(MaterialApp(
        home: AttendanceHome(
            session: session,
            onOpenBusinessTrips: () {},
            onOpenExplanations: () {},
            onOpenLeave: () {},
            onOpenInbox: () {})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chấm công vào').last);
    // The disabled action bar keeps a spinner behind the open dialog.
    await tester.pump(const Duration(milliseconds: 400));
    expect(
        find.textContaining(
            'Check-in chụp ảnh mới; check-out lấy vị trí chỉ Admin xem.'),
        findsOneWidget);
    await tester.tap(find.text('Tại văn phòng'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Tại hiện trường').last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Tiếp tục chụp ảnh'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Nhập nội dung ít nhất 5 ký tự.'), findsOneWidget);
    expect(find.textContaining('Không cần phiếu công tác'), findsOneWidget);
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(find.text('Tiếp tục chụp ảnh'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('stamps a camera image into PNG without new packages',
      (tester) async {
    await tester.runAsync(() async {
      final root = await Directory.systemTemp.createTemp('r4-camera-test-');
      const channel = MethodChannel('plugins.flutter.io/path_provider');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async => root.path);
      try {
        final recorder = ui.PictureRecorder();
        // Keep source image separate from the output so test cleanup owns every file.
        final painter = Canvas(recorder);
        painter.drawColor(Colors.blue, BlendMode.src);
        final picture = recorder.endRecording(),
            source = await picture.toImage(320, 640);
        final bytes = await source.toByteData(format: ui.ImageByteFormat.png);
        final input = File('${root.path}/camera.png');
        await input.writeAsBytes(bytes!.buffer.asUint8List());
        final output = await stampCheckInPhoto(
            input.path,
            CheckInCapture(
                id: '12345678-1234-4234-8234-123456789012',
                serverTime: DateTime.utc(2026, 10, 10, 1, 15),
                attendanceType: 'OFFICE',
                latitude: 10,
                longitude: 106));
        final codec =
            await ui.instantiateImageCodec(await output.readAsBytes());
        final frame = await codec.getNextFrame();
        expect(frame.image.width, 320);
        expect(frame.image.height, 640);
        expect(await output.readAsBytes(), isNot(await input.readAsBytes()));
        frame.image.dispose();
        codec.dispose();
        source.dispose();
        picture.dispose();
      } finally {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null);
        if (root.parent.path == Directory.systemTemp.path &&
            root.path
                .split(Platform.pathSeparator)
                .last
                .startsWith('r4-camera-test-')) {
          await root.delete(recursive: true);
        }
      }
    });
  });
}
