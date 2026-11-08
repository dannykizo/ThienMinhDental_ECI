import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/attendance_device.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const bridge = MethodChannel('vn.thienminh/attendance-proof');
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(bridge, null));
  test('native bridge sends exact owner/payload and never returns private key', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(bridge, (call) async {
      calls.add(call); return call.method == 'publicKey' ? 'public-key' : 'signature';
    });
    expect(await AttendanceDevice.publicKey('owner'), 'public-key');
    expect(await AttendanceDevice.sign('owner', '{"server":"challenge"}'), 'signature');
    expect(calls.last.arguments, <String, dynamic>{'owner': 'owner', 'payload': '{"server":"challenge"}'});
  });
  test('cancelled biometric never returns a success signature', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(bridge, (_) async => throw PlatformException(code: 'BIOMETRIC_CANCELLED'));
    await expectLater(AttendanceDevice.sign('owner', 'challenge'), throwsA(isA<PlatformException>()));
  });
  test('request binds mode/GPS/capture and submits device proof unchanged', () async {
    final api = ApiClient(baseUrl: 'https://development.invalid/api')..accessToken = 'development-token';
    final requests = <http.Request>[];
    await http.runWithClient(() async {
      await api.attendanceChallenge(eventType: 'CHECK_IN', attendanceType: 'BUSINESS_TRIP', latitude: 10, longitude: 106, accuracyMeters: 5, mockLocationSignal: false, checkinCaptureId: 'capture');
      await api.recordOfficeEvent(eventType: 'CHECK_IN', attendanceType: 'BUSINESS_TRIP', latitude: 10, longitude: 106, accuracyMeters: 5, mockLocationSignal: false, checkinCaptureId: 'capture', challengeId: 'challenge', signature: 'signed');
    }, () => MockClient((request) async {
      requests.add(request);
      return http.Response(jsonEncode(request.url.path.endsWith('device-challenges') ? <String,dynamic>{'id':'challenge','payload':'exact'} : <String,dynamic>{'id':'event','eventType':'CHECK_IN','attendanceType':'BUSINESS_TRIP','serverTime':'2026-10-10T01:00:00Z','riskFlags':<String>[]}),200);
    }));
    expect(requests, hasLength(2));
    final payload = jsonDecode(requests.last.body) as Map<String,dynamic>;
    expect(payload['checkinCaptureId'],'capture'); expect(payload['challengeId'],'challenge'); expect(payload['signature'],'signed');
    expect(payload['latitude'],10); expect(payload['attendanceType'],'BUSINESS_TRIP');
  });
  test('rate-limit does not replay an attendance write', () async {
    final api = ApiClient(baseUrl:'https://development.invalid/api')..accessToken='development-token';
    var writes = 0;
    await http.runWithClient(() async {
      await expectLater(api.recordOfficeEvent(eventType:'CHECK_OUT', latitude:10, longitude:106, accuracyMeters:5, mockLocationSignal:false,challengeId:'challenge',signature:'signed'),throwsA(isA<ApiException>()));
    }, () => MockClient((request) async { writes++; return http.Response(jsonEncode(<String,dynamic>{'code':'ATTENDANCE_RATE_LIMITED','message':'Wait','retryAfterSeconds':30}),429); }));
    expect(writes,1);
  });
}
