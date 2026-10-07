import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'android_notification_bridge.dart';
import 'push_message_policy.dart';

const String _firebaseApiKey = String.fromEnvironment(
  'FIREBASE_ANDROID_API_KEY',
);
const String _firebaseAppId = String.fromEnvironment(
  'FIREBASE_ANDROID_APP_ID',
);
const String _firebaseMessagingSenderId = String.fromEnvironment(
  'FIREBASE_MESSAGING_SENDER_ID',
);
const String _firebaseProjectId = String.fromEnvironment(
  'FIREBASE_PROJECT_ID',
);
const String _firebaseStorageBucket = String.fromEnvironment(
  'FIREBASE_STORAGE_BUCKET',
);

FirebaseOptions? get firebaseOptions {
  if (_firebaseApiKey.isEmpty ||
      _firebaseAppId.isEmpty ||
      _firebaseMessagingSenderId.isEmpty ||
      _firebaseProjectId.isEmpty) {
    return null;
  }
  return FirebaseOptions(
    apiKey: _firebaseApiKey,
    appId: _firebaseAppId,
    messagingSenderId: _firebaseMessagingSenderId,
    projectId: _firebaseProjectId,
    storageBucket:
        _firebaseStorageBucket.isEmpty ? null : _firebaseStorageBucket,
  );
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  final FirebaseOptions? options = firebaseOptions;
  if (options != null && Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: options);
  }
}

class PushNotificationService {
  final AndroidNotificationBridge android = AndroidNotificationBridge();
  Future<void>? _initializing;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _tokenSubscription;

  bool configured = false;
  AuthorizationStatus authorizationStatus = AuthorizationStatus.notDetermined;
  String? initializationError;
  String? currentToken;
  String? registrationError;
  bool? backendConfigured;
  bool registered = false;
  String? Function()? currentUserId;
  void Function(RemoteMessage message)? onForegroundAnnouncement;
  void Function(String? announcementId)? onInboxRequested;
  Future<void> Function(String token)? onTokenChanged;

  Future<void> initialize() async {
    if (_initializing != null) return _initializing;
    final Future<void> future = _initialize();
    _initializing = future;
    try {
      await future;
    } finally {
      _initializing = null;
    }
  }

  Future<void> _initialize() async {
    initializationError = null;
    try {
      android.onTap = (String id, String owner) {
        if (currentUserId?.call() == owner) {
          onInboxRequested?.call(
              pushAnnouncementId(<String, dynamic>{'announcementId': id}));
        }
      };
      await android.initialize();
    } on Object {
      initializationError = 'NOTIFICATION_CHANNEL_UNAVAILABLE';
    }
    final FirebaseOptions? options = firebaseOptions;
    if (options == null) return;

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: options)
            .timeout(const Duration(seconds: 15));
      }
      configured = true;
      FirebaseMessaging.onBackgroundMessage(
        firebaseMessagingBackgroundHandler,
      );

      final FirebaseMessaging messaging = FirebaseMessaging.instance;
      await messaging.setAutoInitEnabled(true);
      final NotificationSettings settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      authorizationStatus = settings.authorizationStatus;

      _foregroundSubscription ??= FirebaseMessaging.onMessage.listen(
        (RemoteMessage message) {
          if (_isAnnouncement(message) && _forCurrentUser(message)) {
            final String? owner = currentUserId?.call();
            final String? id = pushAnnouncementId(message.data);
            if (owner != null && id != null) {
              unawaited(_showForeground(message, id, owner));
            }
            onForegroundAnnouncement?.call(message);
          }
        },
      );
      _openedSubscription ??= FirebaseMessaging.onMessageOpenedApp.listen(
        (RemoteMessage message) {
          if (_isAnnouncement(message) && _forCurrentUser(message)) {
            onInboxRequested?.call(pushAnnouncementId(message.data));
          }
        },
      );
      _tokenSubscription ??= messaging.onTokenRefresh.listen(
        (String token) async {
          currentToken = token;
          try {
            await onTokenChanged?.call(token);
          } on Object {
            registered = false;
            registrationError = 'PUSH_REGISTRATION_FAILED';
          }
        },
      );

      if (permissionGranted) {
        currentToken =
            await messaging.getToken().timeout(const Duration(seconds: 10));
      }
      final RemoteMessage? initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null &&
          _isAnnouncement(initialMessage) &&
          _forCurrentUser(initialMessage)) {
        onInboxRequested?.call(pushAnnouncementId(initialMessage.data));
      }
    } on Object {
      initializationError = 'FIREBASE_INITIALIZATION_FAILED';
    }
  }

  bool _forCurrentUser(RemoteMessage message) {
    return acceptsAnnouncementPush(message.data, currentUserId?.call());
  }

  Future<void> _showForeground(
      RemoteMessage message, String id, String owner) async {
    try {
      await android.show(
          id: id,
          owner: owner,
          title: message.notification?.title ?? 'Thiên Minh Workforce',
          body: message.notification?.body ?? 'Bạn có thông báo mới');
    } on Object {
      initializationError = 'NOTIFICATION_CHANNEL_UNAVAILABLE';
    }
  }

  Future<void> refreshStatus() async {
    try {
      await android.refreshStatus();
      if (configured) {
        authorizationStatus =
            (await FirebaseMessaging.instance.getNotificationSettings())
                .authorizationStatus;
        if (permissionGranted && currentToken == null) {
          currentToken = await FirebaseMessaging.instance
              .getToken()
              .timeout(const Duration(seconds: 10));
        }
      }
    } on Object {
      initializationError = 'PUSH_STATUS_UNAVAILABLE';
    }
  }

  Future<void> clearAccount() async {
    registered = false;
    backendConfigured = null;
    registrationError = null;
    try {
      await android.clear();
    } on Object {/* No credential stored in notifications. */}
  }

  bool get permissionGranted =>
      authorizationStatus == AuthorizationStatus.authorized ||
      authorizationStatus == AuthorizationStatus.provisional;

  Future<void> syncCurrentToken() async {
    final String? token = currentToken;
    if (configured && permissionGranted && token != null && token.isNotEmpty) {
      await onTokenChanged?.call(token);
    }
  }

  void dispose() {
    unawaited(_foregroundSubscription?.cancel());
    unawaited(_openedSubscription?.cancel());
    unawaited(_tokenSubscription?.cancel());
  }

  bool _isAnnouncement(RemoteMessage message) =>
      message.data['type'] == 'ANNOUNCEMENT';
}
