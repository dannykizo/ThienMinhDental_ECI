import 'package:flutter/services.dart';

class AttendanceDevice {
  static const MethodChannel _channel =
      MethodChannel('vn.thienminh/attendance-proof');

  static Future<String> publicKey(String owner) async => (await _channel
      .invokeMethod<String>('publicKey', <String, dynamic>{'owner': owner}))!;

  static Future<String> sign(String owner, String payload) async =>
      (await _channel.invokeMethod<String>(
          'sign', <String, dynamic>{'owner': owner, 'payload': payload}))!;

  static Future<void> resetKey(String owner) async => _channel
      .invokeMethod<void>('resetKey', <String, dynamic>{'owner': owner});
}
