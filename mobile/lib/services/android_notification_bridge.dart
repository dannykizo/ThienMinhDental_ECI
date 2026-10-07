import 'dart:io';

import 'package:flutter/services.dart';

class AndroidNotificationBridge {
  static const MethodChannel _channel =
      MethodChannel('vn.thienminh/notifications');
  void Function(String id, String owner)? onTap;
  bool enabled = true;
  int importance = 4;

  Future<void> initialize() async {
    if (!Platform.isAndroid) return;
    _channel.setMethodCallHandler((MethodCall call) async {
      if (call.method == 'tap') _handleTap(call.arguments);
    });
    _handleTap(await _channel.invokeMethod<dynamic>('initialTap'));
    await refreshStatus();
  }

  void _handleTap(dynamic value) {
    if (value is! Map) return;
    final dynamic id = value['id'];
    final dynamic owner = value['owner'];
    if (id is String && owner is String) onTap?.call(id, owner);
  }

  Future<void> refreshStatus() async {
    if (!Platform.isAndroid) return;
    final Map<dynamic, dynamic>? status =
        await _channel.invokeMapMethod<dynamic, dynamic>('status');
    enabled = status?['enabled'] == true;
    importance = status?['importance'] as int? ?? 0;
  }

  Future<bool> show(
      {required String id,
      required String owner,
      required String title,
      required String body}) async {
    if (!Platform.isAndroid) return false;
    return await _channel.invokeMethod<bool>('show', <String, String>{
          'id': id,
          'owner': owner,
          'title': title,
          'body': body,
        }) ??
        false;
  }

  Future<void> clear() async {
    if (Platform.isAndroid) await _channel.invokeMethod<void>('clear');
  }

  Future<void> openSettings() async {
    if (Platform.isAndroid) await _channel.invokeMethod<void>('settings');
  }
}
