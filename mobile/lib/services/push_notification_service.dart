import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

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
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _tokenSubscription;

  bool configured = false;
  String? currentToken;
  void Function(RemoteMessage message)? onForegroundAnnouncement;
  void Function()? onInboxRequested;
  Future<void> Function(String token)? onTokenChanged;

  Future<void> initialize() async {
    final FirebaseOptions? options = firebaseOptions;
    if (options == null) return;

    await Firebase.initializeApp(options: options);
    configured = true;
    FirebaseMessaging.onBackgroundMessage(
      firebaseMessagingBackgroundHandler,
    );

    final FirebaseMessaging messaging = FirebaseMessaging.instance;
    await messaging.setAutoInitEnabled(true);
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    _foregroundSubscription = FirebaseMessaging.onMessage.listen(
      (RemoteMessage message) {
        if (_isAnnouncement(message)) onForegroundAnnouncement?.call(message);
      },
    );
    _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      (RemoteMessage message) {
        if (_isAnnouncement(message)) onInboxRequested?.call();
      },
    );
    _tokenSubscription = messaging.onTokenRefresh.listen(
      (String token) async {
        currentToken = token;
        await onTokenChanged?.call(token);
      },
    );

    currentToken = await messaging.getToken();
    final RemoteMessage? initialMessage = await messaging.getInitialMessage();
    if (initialMessage != null && _isAnnouncement(initialMessage)) {
      onInboxRequested?.call();
    }
  }

  Future<void> syncCurrentToken() async {
    final String? token = currentToken;
    if (configured && token != null && token.isNotEmpty) {
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
