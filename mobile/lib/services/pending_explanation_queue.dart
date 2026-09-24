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
      );

  final DateTime? capturedAt;
  final String evidenceId;
  final String explanationId;
  final double? latitude;
  final double? longitude;
  final String? photoPath;
  final String? remoteReference;
  final String responseText;

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
  }) : _storage = storage;

  static const String _storageKey = 'pending_explanation_submissions';
  final ApiClient api;
  final FlutterSecureStorage _storage;

  Future<List<PendingExplanationSubmission>> pending() async {
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
  ) async {
    await _upsert(submission);
    try {
      await _send(submission);
      return const ExplanationSubmissionOutcome(queued: false);
    } on ApiException catch (error) {
      if (_isRetryable(error)) {
        return const ExplanationSubmissionOutcome(queued: true);
      }
      await _remove(submission.explanationId, deletePhoto: false);
      rethrow;
    }
  }

  Future<ExplanationQueueSyncResult> syncAll() async {
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
      await api.respondToAttendanceExplanation(
        explanationId: submission.explanationId,
        responseText: submission.responseText,
        evidenceCapturedAt: submission.capturedAt,
        evidenceImageReference: reference,
        evidenceLatitude: submission.latitude,
        evidenceLongitude: submission.longitude,
      );
    } on ApiException catch (error) {
      if (error.code != 'EXPLANATION_NOT_AWAITING_RESPONSE') rethrow;
    }
    await _remove(submission.explanationId, deletePhoto: true);
  }

  Future<void> _upsert(PendingExplanationSubmission submission) async {
    final List<PendingExplanationSubmission> items = await pending();
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
    final List<PendingExplanationSubmission> items = await pending();
    final PendingExplanationSubmission? removed = items
        .where((PendingExplanationSubmission item) =>
            item.explanationId == explanationId)
        .firstOrNull;
    items.removeWhere((PendingExplanationSubmission item) =>
        item.explanationId == explanationId);
    await _write(items);
    if (deletePhoto && removed?.photoPath != null) {
      final File file = File(removed!.photoPath!);
      if (await file.exists()) await file.delete();
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

  bool _isRetryable(ApiException error) =>
      error.code == 'NETWORK_UNAVAILABLE' || (error.status ?? 0) >= 500;

  static String createEvidenceId() {
    return createUuidV4();
  }
}
