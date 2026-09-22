import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'features/attendance/attendance_home.dart';
import 'features/auth/login_screen.dart';
import 'services/api_client.dart';

const Color brandPurple = Color(0xFF6E3786);
const Color brandPurpleDark = Color(0xFF351942);
const Color brandOrange = Color(0xFFED851F);
const Color brandCanvas = Color(0xFFF8F5F8);
const Color brandInk = Color(0xFF2D2330);

class SessionController extends ChangeNotifier {
  SessionController({required this.api, required FlutterSecureStorage storage})
      : _storage = storage;

  static const String _tokenKey = 'access_token';
  static const String _deviceIdKey = 'device_id';
  final ApiClient api;
  final FlutterSecureStorage _storage;
  SessionUser? user;

  Future<void> restore() async {
    final String? token = await _storage.read(key: _tokenKey);
    if (token == null) return;
    api.accessToken = token;
    try {
      user = await api.me();
    } on Object {
      api.accessToken = null;
      await _storage.delete(key: _tokenKey);
    }
  }

  Future<void> login(String email, String password) async {
    final String deviceId = await _getOrCreateDeviceId();
    final LoginSession result = await api.login(
      email,
      password,
      deviceId: deviceId,
      deviceName: '${Platform.operatingSystem} · Thiên Minh Workforce',
    );
    user = result.user;
    await _storage.write(key: _tokenKey, value: result.accessToken);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.logout();
    } on Object {
      // Local logout must still succeed when the device is offline.
    }
    user = null;
    api.accessToken = null;
    await _storage.delete(key: _tokenKey);
    notifyListeners();
  }

  Future<String> _getOrCreateDeviceId() async {
    final String? existing = await _storage.read(key: _deviceIdKey);
    if (existing != null && existing.length >= 8) return existing;

    final Random random = Random.secure();
    final String generated = List<String>.generate(
      32,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    await _storage.write(key: _deviceIdKey, value: generated);
    return generated;
  }
}

class WorkforceApp extends StatelessWidget {
  const WorkforceApp({required this.session, super.key});

  final SessionController session;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Thiên Minh Workforce',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: brandPurple,
            brightness: Brightness.light,
            surface: Colors.white,
          ),
          scaffoldBackgroundColor: brandCanvas,
          textTheme: ThemeData.light().textTheme.apply(
                bodyColor: brandInk,
                displayColor: brandInk,
              ),
          useMaterial3: true,
        ),
        home: ListenableBuilder(
          listenable: session,
          builder: (BuildContext context, Widget? child) => session.user == null
              ? LoginScreen(session: session)
              : AttendanceHome(session: session),
        ),
      );
}
