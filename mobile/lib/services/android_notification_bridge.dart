import 'dart:io';

import 'package:flutter/services.dart';

class AndroidNotificationBridge {
  static const MethodChannel _channel =
      MethodChannel('vn.thienminh/notifications');
  void Function(String id, String owner)? onTap;
  bool enabled = true;
  bool permissionGranted = false;
  bool canRequestPermission = false;
  int importance = 4;
  bool get supported => Platform.isAndroid;

  Future<void> initialize() async {
    if (!supported) return;
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
    if (!supported) return;
    final Map<dynamic, dynamic>? status =
        await _channel.invokeMapMethod<dynamic, dynamic>('status');
    _applyStatus(status);
  }

  void _applyStatus(Map<dynamic, dynamic>? status) {
    enabled = status?['enabled'] == true;
    permissionGranted = status?['permissionGranted'] == true;
    canRequestPermission = status?['canRequestPermission'] == true;
    importance = status?['importance'] as int? ?? 0;
  }

  Future<void> requestPermission() async {
    if (!supported) return;
    _applyStatus(
        await _channel.invokeMapMethod<dynamic, dynamic>('requestPermission'));
  }

  Future<bool> show(
      {required String id,
      required String owner,
      required String title,
      required String body}) async {
    if (!supported) return false;
    return await _channel.invokeMethod<bool>('show', <String, String>{
          'id': id,
          'owner': owner,
          'title': title,
          'body': body,
        }) ??
        false;
  }

  Future<void> clear() async {
    if (supported) await _channel.invokeMethod<void>('clear');
  }

  Future<void> openSettings() async {
    if (supported) await _channel.invokeMethod<void>('settings');
  }
}
