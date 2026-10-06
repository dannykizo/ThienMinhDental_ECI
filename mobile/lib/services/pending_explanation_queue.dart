import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'uuid_v4.dart';

class PendingExplanationSubmission {
  const PendingExplanationSubmission({
    required this.capturedAt,
    required this.evidenceId,
    required this.explanationId,
    required this.latitude,
    required this.longitude,
    required this.photoPath,
    required this.remoteReference,
    required this.responseText,
    this.workDate,
    this.issueType,
    this.ownerUserId,
  });

  factory PendingExplanationSubmission.fromJson(Map<String, dynamic> json) =>
      PendingExplanationSubmission(
        capturedAt: json['capturedAt'] == null
            ? null
            : DateTime.parse(json['capturedAt'] as String),
        evidenceId: json['evidenceId'] as String,
        explanationId: json['explanationId'] as String,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        photoPath: json['photoPath'] as String?,
        remoteReference: json['remoteReference'] as String?,
        responseText: json['responseText'] as String,
        workDate: json['workDate'] as String?,
        issueType: json['issueType'] as String?,
        ownerUserId: json['ownerUserId'] as String?,
      );

  final DateTime? capturedAt;
  final String evidenceId;
  final String explanationId;
  final double? latitude;
  final double? longitude;
  final String? photoPath;
  final String? remoteReference;
  final String responseText;
  final String? workDate;
  final String? issueType;
  final String? ownerUserId;

  PendingExplanationSubmission copyWith({String? remoteReference}) =>
      PendingExplanationSubmission(
        capturedAt: capturedAt,
        evidenceId: evidenceId,
        explanationId: explanationId,
        latitude: latitude,
        longitude: longitude,
        photoPath: photoPath,
        remoteReference: remoteReference ?? this.remoteReference,
        responseText: responseText,
        workDate: workDate,
        issueType: issueType,
        ownerUserId: ownerUserId,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'capturedAt': capturedAt?.toUtc().toIso8601String(),
        'evidenceId': evidenceId,
        'explanationId': explanationId,
        'latitude': latitude,
        'longitude': longitude,
        'photoPath': photoPath,
        'remoteReference': remoteReference,
        'responseText': responseText,
        'workDate': workDate,
        'issueType': issueType,
        'ownerUserId': ownerUserId,
      };
}

class ExplanationSubmissionOutcome {
  const ExplanationSubmissionOutcome({required this.queued});

  final bool queued;
}

class ExplanationQueueSyncResult {
  const ExplanationQueueSyncResult({
    required this.errorMessage,
    required this.failed,
    required this.sent,
  });

  final String? errorMessage;
  final int failed;
  final int sent;
}

class PendingExplanationQueue {
  PendingExplanationQueue({
    required this.api,
    required FlutterSecureStorage storage,
    required this.currentUserId,
  }) : _storage = storage;

  static const String _storageKey = 'pending_explanation_submissions';
  final ApiClient api;
  final FlutterSecureStorage _storage;
  final String? Function() currentUserId;
  Future<void> _operations = Future<void>.value();

  Future<T> _exclusive<T>(Future<T> Function() operation) {
    final Completer<T> result = Completer<T>();
    _operations = _operations.then((_) async {
      try {
        result.complete(await operation());
      } on Object catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }

  Future<List<PendingExplanationSubmission>> pending() async =>
      (await _allPending())
          .where((PendingExplanationSubmission item) =>
              currentUserId() != null &&
              (item.ownerUserId == null || item.ownerUserId == currentUserId()))
          .toList();

  Future<List<PendingExplanationSubmission>> _allPending() async {
    final String? raw = await _storage.read(key: _storageKey);
    if (raw == null || raw.isEmpty) return <PendingExplanationSubmission>[];
    try {
      final List<dynamic> decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .map((dynamic item) => PendingExplanationSubmission.fromJson(
              item as Map<String, dynamic>))
          .toList();
    } on Object {
      await _storage.delete(key: _storageKey);
      return <PendingExplanationSubmission>[];
    }
  }

  Future<ExplanationSubmissionOutcome> submitOrQueue(
    PendingExplanationSubmission submission,
  ) =>
      _exclusive(() => _submitOrQueue(submission));

  Future<ExplanationSubmissionOutcome> _submitOrQueue(
      PendingExplanationSubmission submission) async {
    await _upsert(submission);
    try {
      await _send(submission);
      return const ExplanationSubmissionOutcome(queued: false);
    } on ApiException catch (error) {
      if (_isRetryable(error) ||
          error.endsSession ||
          error.code == 'EXPLANATION_ACCOUNT_CHANGED') {
        return const ExplanationSubmissionOutcome(queued: true);
      }
      await _remove(submission.explanationId, deletePhoto: false);
      rethrow;
    }
  }

  Future<ExplanationQueueSyncResult> syncAll() => _exclusive(_syncAll);

  Future<ExplanationQueueSyncResult> _syncAll() async {
    int sent = 0;
    int failed = 0;
    String? errorMessage;
    for (final PendingExplanationSubmission submission in await pending()) {
      try {
        await _send(submission);
        sent += 1;
      } on Object catch (error) {
        failed += 1;
        errorMessage ??= error is ApiException
            ? error.message
            : 'Không thể gửi giải trình đang chờ.';
      }
    }
    return ExplanationQueueSyncResult(
      errorMessage: errorMessage,
      failed: failed,
      sent: sent,
    );
  }

  Future<void> _send(PendingExplanationSubmission submission) async {
    final String? sendingUserId = currentUserId();
    if (currentUserId() == null ||
        (submission.ownerUserId != null &&
            submission.ownerUserId != currentUserId())) {
      throw const ApiException(
          'Giải trình thuộc tài khoản khác. Vui lòng đăng nhập lại đúng tài khoản.',
          code: 'EXPLANATION_ACCOUNT_CHANGED');
    }
    // Legacy queue records lack owner metadata: verify the request before any upload.
    if (submission.ownerUserId == null) {
      final List<AttendanceExplanation> mine =
          await api.myAttendanceExplanations();
      if (!mine.any((AttendanceExplanation item) =>
          item.id == submission.explanationId)) {
        throw const ApiException('Không tìm thấy yêu cầu cũ của tài khoản này.',
            code: 'EXPLANATION_NOT_FOUND');
      }
    }
    String? reference = submission.remoteReference;
    if (submission.photoPath != null && reference == null) {
      reference = await api.uploadAttendanceEvidence(
        evidenceId: submission.evidenceId,
        filePath: submission.photoPath!,
      );
      submission = submission.copyWith(remoteReference: reference);
      await _upsert(submission);
    }
    try {
      if (sendingUserId != currentUserId()) {
        throw const ApiException(
            'Tài khoản đã thay đổi. Giải trình được giữ lại cho tài khoản gửi.',
            code: 'EXPLANATION_ACCOUNT_CHANGED');
      }
      if (submission.workDate != null) {
        await api.submitAttendanceExplanation(
            submissionId: submission.explanationId,
            workDate: submission.workDate!,
            issueType: submission.issueType!,
            responseText: submission.responseText,
            evidenceImageReference: reference,
            evidenceCapturedAt: submission.capturedAt);
      } else {
        await api.respondToAttendanceExplanation(
          explanationId: submission.explanationId,
          responseText: submission.responseText,
          evidenceCapturedAt: submission.capturedAt,
          evidenceImageReference: reference,
          evidenceLatitude: submission.latitude,
          evidenceLongitude: submission.longitude,
        );
      }
    } on ApiException catch (error) {
      if (error.code != 'EXPLANATION_NOT_AWAITING_RESPONSE') rethrow;
    }
    await _remove(submission.explanationId, deletePhoto: true);
  }

  Future<void> _upsert(PendingExplanationSubmission submission) async {
    final List<PendingExplanationSubmission> items = await _allPending();
    final int index = items.indexWhere(
      (PendingExplanationSubmission item) =>
          item.explanationId == submission.explanationId,
    );
    if (index == -1) {
      items.add(submission);
    } else {
      items[index] = submission;
    }
    await _write(items);
  }

  Future<void> _remove(
    String explanationId, {
    required bool deletePhoto,
  }) async {
    final List<PendingExplanationSubmission> items = await _allPending();
    final PendingExplanationSubmission? removed = items
        .where((PendingExplanationSubmission item) =>
            item.explanationId == explanationId)
        .firstOrNull;
    items.removeWhere((PendingExplanationSubmission item) =>
        item.explanationId == explanationId);
    await _write(items);
    if (deletePhoto && removed?.photoPath != null) {
      final File file = File(removed!.photoPath!);
      try {
        if (await file.exists()) await file.delete();
      } on FileSystemException {
        // Server accepted the submission; local cleanup must not turn it into a failure.
      }
    }
  }

  Future<void> _write(List<PendingExplanationSubmission> items) async {
    if (items.isEmpty) {
      await _storage.delete(key: _storageKey);
      return;
    }
    await _storage.write(
      key: _storageKey,
      value: jsonEncode(items
          .map((PendingExplanationSubmission item) => item.toJson())
          .toList()),
    );
  }

  bool _isRetryable(ApiException error) => error.isRetryable;

  static String createEvidenceId() {
    return createUuidV4();
  }
}
