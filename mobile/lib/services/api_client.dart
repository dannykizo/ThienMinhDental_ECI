import 'dart:convert';

import 'package:http/http.dart' as http;

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:3001/api',
);

class ApiException implements Exception {
  const ApiException(this.message, {this.code, this.status});

  final String? code;
  final String message;
  final int? status;

  @override
  String toString() => message;
}

class SessionUser {
  const SessionUser({
    required this.displayName,
    required this.email,
    required this.employeeId,
    required this.id,
    required this.roles,
  });

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
        displayName: json['displayName'] as String,
        email: json['email'] as String,
        employeeId: json['employeeId'] as String?,
        id: json['id'] as String,
        roles: (json['roles'] as List<dynamic>).cast<String>(),
      );

  final String displayName;
  final String email;
  final String? employeeId;
  final String id;
  final List<String> roles;
}

class LoginSession {
  const LoginSession({required this.accessToken, required this.user});

  final String accessToken;
  final SessionUser user;
}

class TodayAttendance {
  const TodayAttendance({
    required this.checkedInAt,
    required this.checkedOutAt,
    required this.date,
    required this.riskFlags,
    required this.status,
  });

  factory TodayAttendance.fromJson(Map<String, dynamic> json) =>
      TodayAttendance(
        checkedInAt: json['checkedInAt'] == null
            ? null
            : DateTime.parse(json['checkedInAt'] as String).toLocal(),
        checkedOutAt: json['checkedOutAt'] == null
            ? null
            : DateTime.parse(json['checkedOutAt'] as String).toLocal(),
        date: json['date'] as String,
        riskFlags: (json['riskFlags'] as List<dynamic>).cast<String>(),
        status: json['status'] as String,
      );

  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;
  final String date;
  final List<String> riskFlags;
  final String status;
}

class ApiClient {
  String? accessToken;

  Future<LoginSession> login(
    String email,
    String password, {
    required String deviceId,
    required String deviceName,
  }) async {
    final Map<String, dynamic> json = await _request(
      '/auth/login',
      body: <String, dynamic>{
        'email': email,
        'password': password,
        'clientType': 'MOBILE',
        'deviceId': deviceId,
        'deviceName': deviceName,
      },
      method: 'POST',
    );
    final String? token = json['accessToken'] as String?;
    if (token == null || token.isEmpty) {
      throw const ApiException('Backend không trả access token.',
          code: 'TOKEN_MISSING');
    }
    accessToken = token;
    return LoginSession(
      accessToken: token,
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<void> logout() async {
    await _request('/auth/logout', method: 'POST');
  }

  Future<SessionUser> me() async {
    final Map<String, dynamic> json = await _request('/auth/me');
    return SessionUser.fromJson(json['user'] as Map<String, dynamic>);
  }

  Future<TodayAttendance> today() async {
    final Map<String, dynamic> json = await _request('/attendance/me/today');
    return TodayAttendance.fromJson(json);
  }

  Future<void> recordOfficeEvent({
    required double accuracyMeters,
    required String eventType,
    required bool mockLocationSignal,
    required double latitude,
    required double longitude,
  }) async {
    await _request(
      '/attendance/events',
      body: <String, dynamic>{
        'accuracyMeters': accuracyMeters,
        'attendanceType': 'OFFICE',
        'deviceTime': DateTime.now().toUtc().toIso8601String(),
        'eventType': eventType,
        'latitude': latitude,
        'longitude': longitude,
        'mockLocationSignal': mockLocationSignal,
      },
      method: 'POST',
    );
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    Map<String, dynamic>? body,
    String method = 'GET',
  }) async {
    final Uri uri = Uri.parse('$apiBaseUrl$path');
    final Map<String, String> headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
    try {
      final http.Response response = method == 'POST'
          ? await http.post(uri, headers: headers, body: jsonEncode(body))
          : await http.get(uri, headers: headers);
      final dynamic decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final Map<String, dynamic> error =
            decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
        throw ApiException(
          error['message'] as String? ?? 'Yêu cầu không thành công.',
          code: error['code'] as String?,
          status: response.statusCode,
        );
      }
      if (decoded is! Map<String, dynamic>) {
        throw const ApiException('Phản hồi API không hợp lệ.',
            code: 'INVALID_RESPONSE');
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on Object {
      throw const ApiException(
        'Không thể kết nối Backend. Kiểm tra cáp/Wi-Fi debugging và dev server.',
        code: 'NETWORK_UNAVAILABLE',
      );
    }
  }
}
