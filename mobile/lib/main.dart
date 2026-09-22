import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app.dart';
import 'services/api_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const FlutterSecureStorage storage = FlutterSecureStorage();
  final ApiClient api = ApiClient();
  final SessionController session =
      SessionController(api: api, storage: storage);
  await session.restore();
  runApp(WorkforceApp(session: session));
}
