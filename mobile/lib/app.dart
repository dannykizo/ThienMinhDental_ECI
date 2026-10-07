import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'features/auth/login_screen.dart';
import 'features/permissions/permission_setup_screen.dart';
import 'features/shell/employee_shell.dart';
import 'services/api_client.dart';
import 'services/pending_explanation_queue.dart';
import 'services/push_notification_service.dart';

const Color brandPurple = Color(0xFF5E2D91);
const Color brandPurpleDark = Color(0xFF381559);
const Color brandPurpleLight = Color(0xFFF5F0FA);
const Color brandOrange = Color(0xFFF97316);
const Color brandCanvas = Color(0xFFF8FAFC);
const Color brandInk = Color(0xFF0F172A);
const Color brandMuted = Color(0xFF64748B);
const Color brandLine = Color(0xFFE2E8F0);
const Color brandDanger = Color(0xFFEF4444);
const Color brandDangerLight = Color(0xFFFEF2F2);

enum SessionNoticeKind { connection, ended }

class SessionNotice {
  const SessionNotice({
    required this.kind,
    required this.message,
    required this.title,
  });

  final SessionNoticeKind kind;
  final String message;
  final String title;
}

class SessionController extends ChangeNotifier {
  SessionController({
    required this.api,
    required this.pushNotifications,
    required FlutterSecureStorage storage,
  }) : _storage = storage {
    api.onTokensUpdated = _storeTokens;
    api.onSessionExpired = _expireSession;
    api.onAvailabilityChanged = _handleAvailabilityChanged;
    explanationQueue = PendingExplanationQueue(
        api: api, storage: storage, currentUserId: () => user?.id);
  }

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _deviceIdKey = 'device_id';
  static const String _apiBaseUrlKey = 'api_base_url';
  static const String _permissionSetupKey = 'permission_setup_v1_seen';
  final ApiClient api;
  final PushNotificationService pushNotifications;
  late final PendingExplanationQueue explanationQueue;
  final FlutterSecureStorage _storage;
  SessionUser? user;
  ManagementAccess? managementAccess;
  Future<void>? _managementRefresh;
  bool isBootstrapping = true;
  bool isCheckingAvailability = false;
  bool isRestoringSession = false;
  ApiAvailability apiAvailability = ApiAvailability.available;
  String appVersionLabel = 'Phiên bản chưa xác định';
  SessionNotice? sessionNotice;
  int inboxNavigationRequest = 0;
  int foregroundAnnouncementRequest = 0;
  int announcementRevision = 0;
  int unreadAnnouncementCount = 0;
  String? foregroundAnnouncementTitle;
  String? pendingAnnouncementId;
  bool isSyncingPush = false;
  bool needsPermissionSetup = false;
  bool _permissionSetupSeen = false;

  Future<void> _loadPermissionSetup() async {
    if (_permissionSetupSeen) return;
    try {
      _permissionSetupSeen =
          await _storage.read(key: _permissionSetupKey) == 'true';
    } on Object {
      // Storage failure must not block login or optional setup dismissal.
    }
    needsPermissionSetup = !_permissionSetupSeen;
  }

  Future<void> dismissPermissionSetup() async {
    _permissionSetupSeen = true;
    try {
      await _storage.write(key: _permissionSetupKey, value: 'true');
    } on Object {
      // Remember for this run; a future launch may show setup again.
    }
    needsPermissionSetup = false;
    notifyListeners();
  }

  Future<void> bootstrap() async {
    try {
      await _loadAppVersion();
      await _restoreSession();
      unawaited(initializePush());
    } finally {
      isBootstrapping = false;
      notifyListeners();
    }
  }

  Future<void> initializePush() async {
    pushNotifications.currentUserId = () => user?.id;
    pushNotifications.onTokenChanged = (String token) async {
      if (user != null) await _registerPushToken(token);
    };
    pushNotifications.onInboxRequested = (String? id) {
      pendingAnnouncementId = id;
      inboxNavigationRequest += 1;
      announcementRevision += 1;
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
    notifyListeners();
  }

  Future<void> syncPush({bool retryInitialization = false}) async {
    if (isSyncingPush) return;
    isSyncingPush = true;
    notifyListeners();
    try {
      if (retryInitialization) await pushNotifications.initialize();
      await pushNotifications.refreshStatus();
      if (user != null) await pushNotifications.syncCurrentToken();
    } on Object {
      if (user != null) {
        pushNotifications.registered = false;
        pushNotifications.registrationError = 'PUSH_REGISTRATION_FAILED';
      }
    } finally {
      isSyncingPush = false;
      notifyListeners();
    }
  }

  Future<void> retryRestoreSession() async {
    if (isRestoringSession) return;
    isRestoringSession = true;
    sessionNotice = null;
    notifyListeners();
    try {
      await _restoreSession();
    } finally {
      isRestoringSession = false;
      notifyListeners();
    }
  }

  Future<void> _restoreSession() async {
    final String? savedBaseUrl = await _storage.read(key: _apiBaseUrlKey);
    if (savedBaseUrl != null && savedBaseUrl.isNotEmpty) {
      api.baseUrl = savedBaseUrl;
    }
    api.accessToken = await _storage.read(key: _accessTokenKey);
    api.refreshToken = await _storage.read(key: _refreshTokenKey);
    if (api.accessToken == null && api.refreshToken == null) return;

    try {
      final SessionUser restored = await api.me();
      await _loadPermissionSetup();
      user = restored;
      sessionNotice = null;
      await refreshManagementAccess();
    } on ApiException catch (error) {
      if (error.isConnectionFailure) {
        sessionNotice = SessionNotice(
          kind: SessionNoticeKind.connection,
          title: error.code == 'NETWORK_OFFLINE'
              ? 'Thiết bị đang mất mạng'
              : 'Backend tạm gián đoạn',
          message: error.message,
        );
        return;
      }
      if (error.endsSession &&
          (api.accessToken != null || api.refreshToken != null)) {
        await _expireSession(error);
        return;
      }
      sessionNotice = SessionNotice(
        kind: SessionNoticeKind.connection,
        title: 'Chưa thể kiểm tra phiên',
        message:
            '${error.message} Phiên trên thiết bị vẫn được giữ để thử lại.',
      );
    } on Object {
      sessionNotice = const SessionNotice(
        kind: SessionNoticeKind.connection,
        title: 'Chưa thể khôi phục phiên',
        message:
            'Ứng dụng chưa thể xác minh phiên hiện tại. Dữ liệu đăng nhập vẫn được giữ để bạn thử lại.',
      );
    }
  }

  Future<void> updateBaseUrl(String newUrl) async {
    api.baseUrl = newUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    await _storage.write(key: _apiBaseUrlKey, value: api.baseUrl);
    notifyListeners();
  }

  Future<void> retryBackendConnection() async {
    if (isCheckingAvailability) return;
    isCheckingAvailability = true;
    notifyListeners();
    try {
      await api.checkAvailability();
    } on ApiException {
      // ApiClient đã phân loại trạng thái để banner hiển thị đúng nguyên nhân.
    } finally {
      isCheckingAvailability = false;
      notifyListeners();
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
    await _loadPermissionSetup();
    user = result.user;
    sessionNotice = null;
    await _storeTokens(result.accessToken, result.refreshToken);
    await refreshManagementAccess();
    unawaited(syncPush());
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
    sessionNotice = null;
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

  Future<void> refreshManagementAccess() async {
    if (_managementRefresh != null) return _managementRefresh;
    final Future<void> refresh = _loadManagementAccess();
    _managementRefresh = refresh;
    try {
      await refresh;
    } finally {
      _managementRefresh = null;
    }
  }

  Future<void> _loadManagementAccess() async {
    final String? ownerId = user?.id;
    if (ownerId == null) return;
    ManagementAccess? next;
    try {
      next = await api.managementAccess();
    } on Object {
      // No stale grant creates an entry point on a failed permission refresh.
    }
    if (user?.id != ownerId) return;
    managementAccess = next;
    notifyListeners();
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

  Future<void> _expireSession(ApiException error) async {
    sessionNotice = SessionNotice(
      kind: SessionNoticeKind.ended,
      title: _sessionEndedTitle(error.code),
      message: error.message,
    );
    await _clearSession();
    notifyListeners();
  }

  String _sessionEndedTitle(String? code) => switch (code) {
        'SESSION_USER_UNAVAILABLE' ||
        'ACCOUNT_INACTIVE' =>
          'Tài khoản đã ngừng hoạt động',
        'SESSION_REVOKED' => 'Phiên đã bị thu hồi',
        _ => 'Phiên đăng nhập đã kết thúc',
      };

  Future<void> _clearSession() async {
    user = null;
    managementAccess = null;
    api.accessToken = null;
    api.refreshToken = null;
    unreadAnnouncementCount = 0;
    pendingAnnouncementId = null;
    await pushNotifications.clearAccount();
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }

  Future<void> _registerPushToken(String token) async {
    final String? owner = user?.id;
    if (owner == null) return;
    try {
      final String deviceId = await _getOrCreateDeviceId();
      final bool configured =
          await api.registerPushDevice(deviceId: deviceId, token: token);
      if (user?.id != owner) return;
      pushNotifications.backendConfigured = configured;
      pushNotifications.registered = true;
      pushNotifications.registrationError = null;
    } on Object {
      if (user?.id != owner) return;
      pushNotifications.registered = false;
      pushNotifications.registrationError = 'PUSH_REGISTRATION_FAILED';
    }
    notifyListeners();
  }

  Future<void> _loadAppVersion() async {
    try {
      final PackageInfo info = await PackageInfo.fromPlatform();
      appVersionLabel = 'v${info.version} (${info.buildNumber})';
    } on Object {
      appVersionLabel = 'Phiên bản chưa xác định';
    }
  }

  void _handleAvailabilityChanged(ApiAvailability availability) {
    if (apiAvailability == availability) return;
    apiAvailability = availability;
    if (availability == ApiAvailability.available && user != null) {
      unawaited(syncPush());
    }
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
          titleTextStyle: TextStyle(
            color: brandInk,
            fontSize: 19,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.35,
          ),
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
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: brandPurple,
        ),
        dividerTheme: const DividerThemeData(color: brandLine, thickness: 1),
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
          if (session.user == null) return LoginScreen(session: session);
          if (session.needsPermissionSetup) {
            return PermissionSetupScreen(session: session, firstRun: true);
          }
          return EmployeeShell(session: session);
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
