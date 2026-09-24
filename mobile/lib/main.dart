import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app.dart';
import 'services/api_client.dart';
import 'services/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const FlutterSecureStorage storage = FlutterSecureStorage();
  final ApiClient api = ApiClient();
  final PushNotificationService pushNotifications = PushNotificationService();
  final SessionController session = SessionController(
    api: api,
    pushNotifications: pushNotifications,
    storage: storage,
  );
  runApp(WorkforceApp(session: session));
  unawaited(session.bootstrap());
}
