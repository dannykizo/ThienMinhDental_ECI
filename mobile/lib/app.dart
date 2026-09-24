import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'features/auth/login_screen.dart';
import 'features/shell/employee_shell.dart';
import 'services/api_client.dart';
import 'services/pending_explanation_queue.dart';
import 'services/push_notification_service.dart';

const Color brandPurple = Color(0xFF6E3786);
const Color brandPurpleDark = Color(0xFF351942);
const Color brandOrange = Color(0xFFED851F);
const Color brandCanvas = Color(0xFFF8F5F8);
const Color brandInk = Color(0xFF2D2330);

class SessionController extends ChangeNotifier {
  SessionController({
    required this.api,
    required this.pushNotifications,
    required FlutterSecureStorage storage,
  }) : _storage = storage {
    api.onTokensUpdated = _storeTokens;
    api.onSessionExpired = _expireSession;
    explanationQueue = PendingExplanationQueue(api: api, storage: storage);
  }

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _deviceIdKey = 'device_id';
  static const String _apiBaseUrlKey = 'api_base_url';
  final ApiClient api;
  final PushNotificationService pushNotifications;
  late final PendingExplanationQueue explanationQueue;
  final FlutterSecureStorage _storage;
  SessionUser? user;
  bool isBootstrapping = true;
  int inboxNavigationRequest = 0;
  int foregroundAnnouncementRequest = 0;
  int announcementRevision = 0;
  int unreadAnnouncementCount = 0;
  String? foregroundAnnouncementTitle;

  Future<void> bootstrap() async {
    try {
      await restore();
      await initializePush();
    } finally {
      isBootstrapping = false;
      notifyListeners();
    }
  }

  Future<void> initializePush() async {
    pushNotifications.onTokenChanged = (String token) async {
      if (user != null) await _registerPushToken(token);
    };
    pushNotifications.onInboxRequested = () {
      inboxNavigationRequest += 1;
      notifyListeners();
    };
    pushNotifications.onForegroundAnnouncement = (message) {
      foregroundAnnouncementTitle =
          message.notification?.title ?? 'Bạn có thông báo mới';
      foregroundAnnouncementRequest += 1;
      announcementRevision += 1;
      notifyListeners();
      unawaited(refreshUnreadAnnouncements());
    };
    try {
      await pushNotifications.initialize();
      if (user != null) {
        await pushNotifications.syncCurrentToken();
        await refreshUnreadAnnouncements();
      }
    } on Object {
      // Firebase chưa cấu hình không được làm gián đoạn Hộp thư hoặc đăng nhập.
    }
  }

  Future<void> restore() async {
    final String? savedBaseUrl = await _storage.read(key: _apiBaseUrlKey);
    if (savedBaseUrl != null && savedBaseUrl.isNotEmpty) {
      api.baseUrl = savedBaseUrl;
    }
    api.accessToken = await _storage.read(key: _accessTokenKey);
    api.refreshToken = await _storage.read(key: _refreshTokenKey);
    if (api.accessToken == null && api.refreshToken == null) return;

    try {
      user = await api.me();
    } on Object {
      await _clearSession();
    }
  }

  Future<void> updateBaseUrl(String newUrl) async {
    api.baseUrl = newUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    await _storage.write(key: _apiBaseUrlKey, value: api.baseUrl);
    notifyListeners();
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
    await _storeTokens(result.accessToken, result.refreshToken);
    await pushNotifications.syncCurrentToken();
    await refreshUnreadAnnouncements();
    notifyListeners();
  }

  Future<void> logout() async {
    final String? deviceId = await _storage.read(key: _deviceIdKey);
    if (deviceId != null && api.accessToken != null) {
      try {
        await api.unregisterPushDevice(deviceId: deviceId);
      } on Object {
        // Token hết hạn tự được Backend vô hiệu hóa khi FCM từ chối.
      }
    }
    try {
      await api.logout();
    } on Object {
      // Đăng xuất cục bộ vẫn phải thành công khi thiết bị mất mạng.
    }
    await _clearSession();
    notifyListeners();
  }

  Future<void> refreshUnreadAnnouncements() async {
    if (user == null) return;
    try {
      final List<EmployeeAnnouncement> items = await api.myAnnouncements();
      final int count = items.where((item) => item.readAt == null).length;
      if (count != unreadAnnouncementCount) {
        unreadAnnouncementCount = count;
        notifyListeners();
      }
    } on Object {
      // Badge giữ giá trị gần nhất khi mạng yếu; màn Hộp thư hiển thị lỗi chi tiết.
    }
  }

  void announceInboxChanged() {
    announcementRevision += 1;
    notifyListeners();
    unawaited(refreshUnreadAnnouncements());
  }

  void updateUnreadAnnouncementCount(int count) {
    if (count == unreadAnnouncementCount) return;
    unreadAnnouncementCount = count;
    notifyListeners();
  }

  Future<void> _storeTokens(
    String accessToken,
    String refreshToken,
  ) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  Future<void> _expireSession() async {
    await _clearSession();
    notifyListeners();
  }

  Future<void> _clearSession() async {
    user = null;
    api.accessToken = null;
    api.refreshToken = null;
    unreadAnnouncementCount = 0;
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }

  Future<void> _registerPushToken(String token) async {
    final String deviceId = await _getOrCreateDeviceId();
    try {
      await api.registerPushDevice(deviceId: deviceId, token: token);
    } on Object {
      // Hộp thư vẫn là nguồn dữ liệu chính nếu đăng ký push tạm thời thất bại.
    }
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
  Widget build(BuildContext context) {
    const BorderRadius controlRadius = BorderRadius.all(Radius.circular(6));
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Thiên Minh Workforce',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: brandPurple,
          brightness: Brightness.light,
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: brandCanvas,
        appBarTheme: const AppBarTheme(
          backgroundColor: brandCanvas,
          foregroundColor: brandInk,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: SystemUiOverlayStyle.dark,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: brandPurple,
            foregroundColor: Colors.white,
            minimumSize: const Size(48, 50),
            shape: const RoundedRectangleBorder(borderRadius: controlRadius),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: controlRadius),
          enabledBorder: OutlineInputBorder(
            borderRadius: controlRadius,
            borderSide: BorderSide(color: Color(0xFFE1D8E4)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: controlRadius,
            borderSide: BorderSide(color: brandPurple, width: 1.4),
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Colors.white,
          elevation: 0,
          height: 74,
          indicatorColor: Color(0xFFF0E3F4),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ),
        snackBarTheme: const SnackBarThemeData(
          backgroundColor: brandPurpleDark,
          behavior: SnackBarBehavior.floating,
          contentTextStyle: TextStyle(color: Colors.white),
        ),
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: brandInk,
              displayColor: brandInk,
            ),
        useMaterial3: true,
      ),
      builder: (BuildContext context, Widget? child) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: child ?? const SizedBox.shrink(),
      ),
      home: ListenableBuilder(
        listenable: session,
        builder: (BuildContext context, Widget? child) {
          if (session.isBootstrapping) return const _StartupScreen();
          return session.user == null
              ? LoginScreen(session: session)
              : EmployeeShell(session: session);
        },
      ),
    );
  }
}

class _StartupScreen extends StatelessWidget {
  const _StartupScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Semantics(
              label: 'Đang khởi động ứng dụng',
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Container(
                    width: 112,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: const <BoxShadow>[
                        BoxShadow(
                          color: Color(0x18351942),
                          blurRadius: 28,
                          offset: Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Image.asset('assets/brand/thien-minh-mark.png'),
                  ),
                  const SizedBox(height: 28),
                  const SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(
                      color: brandPurple,
                      strokeWidth: 2.4,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Đang kết nối hệ thống…',
                    style: TextStyle(
                      color: Color(0xFF746A77),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
