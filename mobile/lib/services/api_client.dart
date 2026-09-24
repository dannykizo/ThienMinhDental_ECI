import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

const String kDefaultApiBaseUrl = String.fromEnvironment(
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
  const LoginSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final SessionUser user;
}

class TodayAttendance {
  const TodayAttendance({
    required this.checkedInAt,
    required this.checkedOutAt,
    required this.date,
    required this.isFullWorkday,
    required this.overtimeMinutes,
    required this.requiredWorkMinutes,
    required this.riskFlags,
    required this.status,
    required this.workedMinutes,
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
        isFullWorkday: json['isFullWorkday'] as bool? ?? false,
        overtimeMinutes: (json['overtimeMinutes'] as num?)?.toInt() ?? 0,
        requiredWorkMinutes:
            (json['requiredWorkMinutes'] as num?)?.toInt() ?? 480,
        riskFlags: (json['riskFlags'] as List<dynamic>).cast<String>(),
        status: json['status'] as String,
        workedMinutes: (json['workedMinutes'] as num?)?.toInt() ?? 0,
      );

  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;
  final String date;
  final bool isFullWorkday;
  final int overtimeMinutes;
  final int requiredWorkMinutes;
  final List<String> riskFlags;
  final String status;
  final int workedMinutes;
}

class RecordedAttendanceEvent {
  const RecordedAttendanceEvent({
    required this.eventType,
    required this.riskFlags,
    required this.serverTime,
  });

  factory RecordedAttendanceEvent.fromJson(Map<String, dynamic> json) =>
      RecordedAttendanceEvent(
        eventType: json['eventType'] as String,
        riskFlags: (json['riskFlags'] as List<dynamic>).cast<String>(),
        serverTime: DateTime.parse(json['serverTime'] as String).toLocal(),
      );

  final String eventType;
  final List<String> riskFlags;
  final DateTime serverTime;
}

class AttendanceExplanation {
  const AttendanceExplanation({
    required this.dueAt,
    required this.evidenceImageReference,
    required this.id,
    required this.issueType,
    required this.requestNote,
    required this.responseText,
    required this.reviewNote,
    required this.status,
    required this.workDate,
  });

  factory AttendanceExplanation.fromJson(Map<String, dynamic> json) =>
      AttendanceExplanation(
        dueAt: DateTime.parse(json['dueAt'] as String).toLocal(),
        evidenceImageReference: json['evidenceImageReference'] as String?,
        id: json['id'] as String,
        issueType: json['issueType'] as String,
        requestNote: json['requestNote'] as String,
        responseText: json['responseText'] as String?,
        reviewNote: json['reviewNote'] as String?,
        status: json['status'] as String,
        workDate: json['workDate'] as String,
      );

  final DateTime dueAt;
  final String? evidenceImageReference;
  final String id;
  final String issueType;
  final String requestNote;
  final String? responseText;
  final String? reviewNote;
  final String status;
  final String workDate;
}

class BusinessTripAssignment {
  const BusinessTripAssignment({
    required this.cancelReason,
    required this.code,
    required this.completedAt,
    required this.content,
    required this.customerContactName,
    required this.customerContactPhone,
    required this.customerName,
    required this.endAt,
    required this.evidenceCapturedAt,
    required this.evidenceImageReference,
    required this.id,
    required this.note,
    required this.participationStatus,
    required this.requiresPhoto,
    required this.responsibleEmployeeName,
    required this.siteAddress,
    required this.siteName,
    required this.startAt,
    required this.startedAt,
    required this.status,
  });

  factory BusinessTripAssignment.fromJson(Map<String, dynamic> json) =>
      BusinessTripAssignment(
        cancelReason: json['cancelReason'] as String?,
        code: json['code'] as String,
        completedAt: json['completedAt'] == null
            ? null
            : DateTime.parse(json['completedAt'] as String).toLocal(),
        content: json['content'] as String,
        customerContactName: json['customerContactName'] as String?,
        customerContactPhone: json['customerContactPhone'] as String?,
        customerName: json['customerName'] as String?,
        endAt: DateTime.parse(json['endAt'] as String).toLocal(),
        evidenceCapturedAt: json['evidenceCapturedAt'] == null
            ? null
            : DateTime.parse(json['evidenceCapturedAt'] as String).toLocal(),
        evidenceImageReference: json['evidenceImageReference'] as String?,
        id: json['id'] as String,
        note: json['note'] as String?,
        participationStatus: json['participationStatus'] as String,
        requiresPhoto: json['requiresPhoto'] as bool? ?? false,
        responsibleEmployeeName: json['responsibleEmployeeName'] as String?,
        siteAddress: json['siteAddress'] as String,
        siteName: json['siteName'] as String,
        startAt: DateTime.parse(json['startAt'] as String).toLocal(),
        startedAt: json['startedAt'] == null
            ? null
            : DateTime.parse(json['startedAt'] as String).toLocal(),
        status: json['status'] as String,
      );

  final String? cancelReason;
  final String code;
  final DateTime? completedAt;
  final String content;
  final String? customerContactName;
  final String? customerContactPhone;
  final String? customerName;
  final DateTime endAt;
  final DateTime? evidenceCapturedAt;
  final String? evidenceImageReference;
  final String id;
  final String? note;
  final String participationStatus;
  final bool requiresPhoto;
  final String? responsibleEmployeeName;
  final String siteAddress;
  final String siteName;
  final DateTime startAt;
  final DateTime? startedAt;
  final String status;
}

class EmployeeLeaveRequest {
  const EmployeeLeaveRequest({
    required this.departmentName,
    required this.endDate,
    required this.id,
    required this.leaveType,
    required this.reason,
    required this.reviewedAt,
    required this.reviewedByName,
    required this.reviewNote,
    required this.startDate,
    required this.status,
    required this.submittedAt,
  });

  factory EmployeeLeaveRequest.fromJson(Map<String, dynamic> json) =>
      EmployeeLeaveRequest(
        departmentName: json['departmentName'] as String?,
        endDate: json['endDate'] as String,
        id: json['id'] as String,
        leaveType: json['leaveType'] as String,
        reason: json['reason'] as String,
        reviewedAt: json['reviewedAt'] == null
            ? null
            : DateTime.parse(json['reviewedAt'] as String).toLocal(),
        reviewedByName: json['reviewedByName'] as String?,
        reviewNote: json['reviewNote'] as String?,
        startDate: json['startDate'] as String,
        status: json['status'] as String,
        submittedAt: DateTime.parse(json['submittedAt'] as String).toLocal(),
      );

  final String? departmentName;
  final String endDate;
  final String id;
  final String leaveType;
  final String reason;
  final DateTime? reviewedAt;
  final String? reviewedByName;
  final String? reviewNote;
  final String startDate;
  final String status;
  final DateTime submittedAt;
}

class EmployeeAnnouncement {
  const EmployeeAnnouncement({
    required this.acknowledgedAt,
    required this.body,
    required this.deliveredAt,
    required this.id,
    required this.publishedAt,
    required this.readAt,
    required this.requiresAcknowledgement,
    required this.title,
  });

  factory EmployeeAnnouncement.fromJson(Map<String, dynamic> json) =>
      EmployeeAnnouncement(
        acknowledgedAt: json['acknowledgedAt'] == null
            ? null
            : DateTime.parse(json['acknowledgedAt'] as String).toLocal(),
        body: json['body'] as String,
        deliveredAt: json['deliveredAt'] == null
            ? null
            : DateTime.parse(json['deliveredAt'] as String).toLocal(),
        id: json['id'] as String,
        publishedAt: DateTime.parse(json['publishedAt'] as String).toLocal(),
        readAt: json['readAt'] == null
            ? null
            : DateTime.parse(json['readAt'] as String).toLocal(),
        requiresAcknowledgement:
            json['requiresAcknowledgement'] as bool? ?? false,
        title: json['title'] as String,
      );

  final DateTime? acknowledgedAt;
  final String body;
  final DateTime? deliveredAt;
  final String id;
  final DateTime publishedAt;
  final DateTime? readAt;
  final bool requiresAcknowledgement;
  final String title;
}

typedef TokensUpdated = Future<void> Function(
  String accessToken,
  String refreshToken,
);

class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? kDefaultApiBaseUrl;

  String baseUrl;
  String? accessToken;
  String? refreshToken;
  TokensUpdated? onTokensUpdated;
  Future<void> Function()? onSessionExpired;
  Future<void>? _refreshing;

  Future<LoginSession> login(
    String email,
    String password, {
    required String deviceId,
    required String deviceName,
  }) async {
    final Map<String, dynamic> json = await _request(
      '/auth/login',
      allowRefresh: false,
      body: <String, dynamic>{
        'email': email,
        'password': password,
        'clientType': 'MOBILE',
        'deviceId': deviceId,
        'deviceName': deviceName,
      },
      method: 'POST',
    );
    final String nextAccessToken = _requiredToken(json, 'accessToken');
    final String nextRefreshToken = _requiredToken(json, 'refreshToken');
    accessToken = nextAccessToken;
    refreshToken = nextRefreshToken;
    return LoginSession(
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
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

  Future<RecordedAttendanceEvent> recordOfficeEvent({
    required double accuracyMeters,
    required String eventType,
    required bool mockLocationSignal,
    required double latitude,
    required double longitude,
  }) async {
    final Map<String, dynamic> json = await _request(
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
    return RecordedAttendanceEvent.fromJson(json);
  }

  Future<List<AttendanceExplanation>> myAttendanceExplanations() async {
    final List<dynamic> json =
        await _requestList('/attendance/explanations/mine');
    return json
        .map((dynamic item) =>
            AttendanceExplanation.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<String> uploadAttendanceEvidence({
    required String evidenceId,
    required String filePath,
  }) async {
    if (!await File(filePath).exists()) {
      throw const ApiException(
        'Ảnh chờ gửi không còn trên thiết bị. Vui lòng chụp lại.',
        code: 'EVIDENCE_FILE_MISSING',
      );
    }
    http.Response response = await _sendEvidence(
      evidenceId: evidenceId,
      filePath: filePath,
      path: '/attendance/evidence',
    );
    if (response.statusCode == 401 && refreshToken != null) {
      await _refreshAccessToken();
      response = await _sendEvidence(
        evidenceId: evidenceId,
        filePath: filePath,
        path: '/attendance/evidence',
      );
    }
    final Map<String, dynamic> json = _parseResponse(response);
    final String? reference = json['reference'] as String?;
    if (reference == null || reference.isEmpty) {
      throw const ApiException(
        'Backend không trả tham chiếu ảnh bằng chứng.',
        code: 'EVIDENCE_REFERENCE_MISSING',
      );
    }
    return reference;
  }

  Future<List<BusinessTripAssignment>> myBusinessTrips() async {
    final List<dynamic> json = await _requestList('/business-trips/mine');
    return json
        .map((dynamic item) =>
            BusinessTripAssignment.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> startBusinessTrip({
    required double accuracyMeters,
    required String businessTripId,
    required double latitude,
    required double longitude,
  }) async {
    await _request(
      '/business-trips/$businessTripId/start',
      body: <String, dynamic>{
        'accuracyMeters': accuracyMeters,
        'deviceTime': DateTime.now().toUtc().toIso8601String(),
        'latitude': latitude,
        'longitude': longitude,
      },
      method: 'POST',
    );
  }

  Future<String> uploadBusinessTripEvidence({
    required String evidenceId,
    required String filePath,
  }) async {
    if (!await File(filePath).exists()) {
      throw const ApiException(
        'Ảnh hiện trường không còn trên thiết bị. Vui lòng chụp lại.',
        code: 'BUSINESS_TRIP_EVIDENCE_FILE_MISSING',
      );
    }
    http.Response response = await _sendEvidence(
      evidenceId: evidenceId,
      filePath: filePath,
      path: '/business-trips/evidence',
    );
    if (response.statusCode == 401 && refreshToken != null) {
      await _refreshAccessToken();
      response = await _sendEvidence(
        evidenceId: evidenceId,
        filePath: filePath,
        path: '/business-trips/evidence',
      );
    }
    final Map<String, dynamic> json = _parseResponse(response);
    final String? reference = json['reference'] as String?;
    if (reference == null || reference.isEmpty) {
      throw const ApiException(
        'Backend không trả tham chiếu ảnh hiện trường.',
        code: 'BUSINESS_TRIP_EVIDENCE_REFERENCE_MISSING',
      );
    }
    return reference;
  }

  Future<void> completeBusinessTrip({
    required double accuracyMeters,
    required String businessTripId,
    DateTime? evidenceCapturedAt,
    String? evidenceImageReference,
    required double latitude,
    required double longitude,
    String? note,
  }) async {
    await _request(
      '/business-trips/$businessTripId/complete',
      body: <String, dynamic>{
        'accuracyMeters': accuracyMeters,
        'deviceTime': DateTime.now().toUtc().toIso8601String(),
        if (evidenceCapturedAt != null)
          'evidenceCapturedAt': evidenceCapturedAt.toUtc().toIso8601String(),
        if (evidenceImageReference != null)
          'evidenceImageReference': evidenceImageReference,
        'latitude': latitude,
        'longitude': longitude,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
      method: 'POST',
    );
  }

  Future<List<EmployeeLeaveRequest>> myLeaveRequests() async {
    final List<dynamic> json = await _requestList('/leave-requests/mine');
    return json
        .map((dynamic item) =>
            EmployeeLeaveRequest.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> createLeaveRequest({
    required String endDate,
    required String leaveType,
    required String reason,
    required String startDate,
  }) async {
    await _request(
      '/leave-requests/mine',
      body: <String, dynamic>{
        'endDate': endDate,
        'leaveType': leaveType,
        'reason': reason,
        'startDate': startDate,
      },
      method: 'POST',
    );
  }

  Future<List<EmployeeAnnouncement>> myAnnouncements() async {
    final List<dynamic> json = await _requestList('/announcements/mine');
    return json
        .map((dynamic item) =>
            EmployeeAnnouncement.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> markAnnouncementRead(String announcementId) async {
    await _request(
      '/announcements/$announcementId/read',
      method: 'POST',
    );
  }

  Future<void> acknowledgeAnnouncement(String announcementId) async {
    await _request(
      '/announcements/$announcementId/acknowledge',
      method: 'POST',
    );
  }

  Future<void> registerPushDevice({
    required String deviceId,
    required String token,
  }) async {
    await _request(
      '/announcements/push-devices',
      body: <String, dynamic>{
        'deviceId': deviceId,
        'platform': 'ANDROID',
        'token': token,
      },
      method: 'POST',
    );
  }

  Future<void> unregisterPushDevice({required String deviceId}) async {
    await _request(
      '/announcements/push-devices/unregister',
      body: <String, dynamic>{'deviceId': deviceId},
      method: 'POST',
    );
  }

  Future<void> respondToAttendanceExplanation({
    required String explanationId,
    required String responseText,
    String? evidenceImageReference,
    DateTime? evidenceCapturedAt,
    double? evidenceLatitude,
    double? evidenceLongitude,
  }) async {
    await _request(
      '/attendance/explanations/$explanationId/respond',
      body: <String, dynamic>{
        'responseText': responseText,
        if (evidenceImageReference != null)
          'evidenceImageReference': evidenceImageReference,
        if (evidenceCapturedAt != null)
          'evidenceCapturedAt': evidenceCapturedAt.toUtc().toIso8601String(),
        if (evidenceLatitude != null) 'evidenceLatitude': evidenceLatitude,
        if (evidenceLongitude != null) 'evidenceLongitude': evidenceLongitude,
      },
      method: 'PATCH',
    );
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    bool allowRefresh = true,
    Map<String, dynamic>? body,
    String method = 'GET',
  }) async {
    http.Response response =
        await _sendRequest(path, body: body, method: method);
    if (response.statusCode == 401 && allowRefresh && refreshToken != null) {
      await _refreshAccessToken();
      response = await _sendRequest(path, body: body, method: method);
    }
    return _parseResponse(response);
  }

  Future<List<dynamic>> _requestList(String path) async {
    http.Response response = await _sendRequest(path, method: 'GET');
    if (response.statusCode == 401 && refreshToken != null) {
      await _refreshAccessToken();
      response = await _sendRequest(path, method: 'GET');
    }
    final dynamic decoded = _decodeResponse(response);
    if (decoded is! List<dynamic>) {
      throw const ApiException(
        'Phản hồi danh sách từ API không hợp lệ.',
        code: 'INVALID_RESPONSE',
      );
    }
    return decoded;
  }

  Future<void> _refreshAccessToken() async {
    final Future<void>? activeRefresh = _refreshing;
    if (activeRefresh != null) return activeRefresh;
    final Future<void> refresh = _performRefresh();
    _refreshing = refresh;
    try {
      await refresh;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> _performRefresh() async {
    try {
      final String? currentRefreshToken = refreshToken;
      if (currentRefreshToken == null) throw _sessionExpired();
      final http.Response response = await _sendRequest(
        '/auth/refresh',
        body: <String, dynamic>{'refreshToken': currentRefreshToken},
        includeAccessToken: false,
        method: 'POST',
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw _sessionExpired();
      }
      final Map<String, dynamic> json = _parseResponse(response);
      final String nextAccessToken = _requiredToken(json, 'accessToken');
      final String nextRefreshToken = _requiredToken(json, 'refreshToken');
      accessToken = nextAccessToken;
      refreshToken = nextRefreshToken;
      await onTokensUpdated?.call(nextAccessToken, nextRefreshToken);
    } on Object {
      accessToken = null;
      refreshToken = null;
      await onSessionExpired?.call();
      rethrow;
    }
  }

  Future<http.Response> _sendRequest(
    String path, {
    Map<String, dynamic>? body,
    bool includeAccessToken = true,
    required String method,
  }) async {
    try {
      return await _send(
        baseUrl,
        path,
        body: body,
        includeAccessToken: includeAccessToken,
        method: method,
      );
    } on Object {
      throw ApiException(
        'Không thể kết nối Backend tại $baseUrl. Kiểm tra USB/Wi-Fi và máy chủ.',
        code: 'NETWORK_UNAVAILABLE',
      );
    }
  }

  Future<http.Response> _send(
    String targetBaseUrl,
    String path, {
    Map<String, dynamic>? body,
    required bool includeAccessToken,
    required String method,
  }) {
    final Uri uri = Uri.parse('$targetBaseUrl$path');
    final Map<String, String> headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (includeAccessToken && accessToken != null)
        'Authorization': 'Bearer $accessToken',
    };
    return switch (method) {
      'POST' => http
          .post(
            uri,
            headers: headers,
            body: jsonEncode(body ?? <String, dynamic>{}),
          )
          .timeout(const Duration(seconds: 10)),
      'PATCH' => http
          .patch(
            uri,
            headers: headers,
            body: jsonEncode(body ?? <String, dynamic>{}),
          )
          .timeout(const Duration(seconds: 10)),
      _ => http.get(uri, headers: headers).timeout(const Duration(seconds: 10)),
    };
  }

  Future<http.Response> _sendEvidence({
    required String evidenceId,
    required String filePath,
    required String path,
  }) async {
    try {
      final http.MultipartRequest request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl$path'),
      )
        ..headers['Accept'] = 'application/json'
        ..fields['evidenceId'] = evidenceId
        ..files.add(await http.MultipartFile.fromPath('file', filePath));
      if (accessToken != null) {
        request.headers['Authorization'] = 'Bearer $accessToken';
      }
      final http.StreamedResponse streamed =
          await request.send().timeout(const Duration(seconds: 20));
      return await http.Response.fromStream(streamed);
    } on ApiException {
      rethrow;
    } on Object {
      throw ApiException(
        'Không thể tải ảnh lên Backend tại $baseUrl.',
        code: 'NETWORK_UNAVAILABLE',
      );
    }
  }

  Map<String, dynamic> _parseResponse(http.Response response) {
    final dynamic decoded = _decodeResponse(response);
    if (decoded is! Map<String, dynamic>) {
      throw const ApiException(
        'Phản hồi API không hợp lệ.',
        code: 'INVALID_RESPONSE',
      );
    }
    return decoded;
  }

  dynamic _decodeResponse(http.Response response) {
    final dynamic decoded =
        response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final Map<String, dynamic> error =
          decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
      throw ApiException(
        error['message'] as String? ?? 'Yêu cầu không thành công.',
        code: error['code'] as String?,
        status: response.statusCode,
      );
    }
    return decoded;
  }

  String _requiredToken(Map<String, dynamic> json, String key) {
    final String? token = json[key] as String?;
    if (token == null || token.isEmpty) {
      throw ApiException('Backend không trả $key.', code: 'TOKEN_MISSING');
    }
    return token;
  }

  ApiException _sessionExpired() => const ApiException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        code: 'SESSION_EXPIRED',
        status: 401,
      );
}
