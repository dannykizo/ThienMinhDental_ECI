import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/explanations/explanation_workflow_view.dart';
import 'package:thien_minh_dental_workforce/features/explanations/managed_explanations_screen.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

Map<String, dynamic> explanationJson(
        {bool confirm = false, bool review = false}) =>
    <String, dynamic>{
      'id': '00000000-0000-4000-8000-000000000001',
      'issueType': 'MISSING_CHECK_OUT',
      'requestNote': '',
      'responseText': 'Development-only explanation',
      'status': 'SUBMITTED',
      'workDate': '2026-10-06',
      'approvalStage': review ? 'HEAD_APPROVAL' : 'LEADER_CONFIRMATION',
      'routeVersion': 7,
      'canConfirm': confirm,
      'canReview': review,
      'fullName': 'Development employee',
      'employeeCode': 'PQ4-DEV',
    };

void main() {
  test('legacy records do not invent a confirmation, version or permission',
      () {
    final Map<String, dynamic> json = explanationJson()
      ..remove('approvalStage')
      ..remove('routeVersion');
    final AttendanceExplanation item = AttendanceExplanation.fromJson(json);
    expect(item.approvalStage, isNull);
    expect(item.routeVersion, isNull);
    expect(item.canConfirm, isFalse);
    expect(item.canReview, isFalse);
    expect(item.confirmedAt, isNull);
    expect(explanationStepLabel(item), 'Chờ xử lý');
  });

  test('scope is a Backend capability, not a role inferred from grants', () {
    final ManagementAccess access = ManagementAccess.fromJson(<String, dynamic>{
      'capabilities': <String, dynamic>{'reviewWorkflow': 'NOT_GRANTED'},
      'grants': <dynamic>[
        <String, dynamic>{
          'roleCode': 'TEAM_LEADER',
          'appointmentType': 'OFFICIAL'
        }
      ],
    });
    expect(access.canReviewExplanations, isFalse);
    expect(ManagementAccess.fromJson(<String, dynamic>{}).canReviewExplanations,
        isFalse);
  });

  test('stage and actual confirmation actor remain separate from final status',
      () {
    final AttendanceExplanation item =
        AttendanceExplanation.fromJson(explanationJson(review: true)
          ..addAll(<String, dynamic>{
            'confirmedByName': 'Original Leader',
            'leaderName': 'Assigned Leader',
            'confirmedAt': '2026-10-06T01:00:00Z',
            'confirmationNote': 'Confirmed',
          }));
    expect(item.status, 'SUBMITTED');
    expect(explanationStepLabel(item), 'Chờ Trưởng phòng duyệt');
    expect(item.confirmedByName, 'Original Leader');
    expect(item.canConfirm, isFalse);
    expect(item.canReview, isTrue);
  });

  test('workflow permission 403 never means ending employee session', () {
    expect(
        const ApiException('Forbidden',
                code: 'EXPLANATION_STEP_FORBIDDEN', status: 403)
            .endsSession,
        isFalse);
    expect(
        const ApiException('Forbidden',
                code: 'EXPLANATION_SCOPE_REQUIRED', status: 403)
            .endsSession,
        isFalse);
    expect(
        const ApiException('Revoked', code: 'SESSION_REVOKED', status: 401)
            .endsSession,
        isTrue);
    expect(
        const ApiException('Inactive', code: 'ACCOUNT_INACTIVE', status: 403)
            .endsSession,
        isTrue);
  });

  test(
      'confirmation and review send the displayed expectedVersion and optional notes',
      () async {
    final List<http.Request> sent = <http.Request>[];
    await http.runWithClient(() async {
      final ApiClient api = ApiClient()..accessToken = 'development-token';
      final AttendanceExplanation item =
          AttendanceExplanation.fromJson(explanationJson(confirm: true));
      await api.confirmExplanation(item, '  note  ');
      await api.reviewExplanation(item, approve: false, note: ' ');
    },
        () => MockClient((http.Request request) async {
              sent.add(request);
              return http.Response('{}', 200);
            }));
    expect(sent.length, 2);
    expect(sent[0].method, 'PATCH');
    expect(sent[0].url.path, endsWith('/confirm'));
    expect(jsonDecode(sent[0].body),
        <String, dynamic>{'expectedVersion': 7, 'confirmationNote': 'note'});
    expect(jsonDecode(sent[1].body),
        <String, dynamic>{'expectedVersion': 7, 'status': 'REJECTED'});
  });

  test('missing version fails before making a decision request', () async {
    final ApiClient api = ApiClient();
    final AttendanceExplanation item = AttendanceExplanation.fromJson(
        explanationJson()..remove('routeVersion'));
    await expectLater(
        api.confirmExplanation(item, ''),
        throwsA(isA<ApiException>().having((ApiException error) => error.code,
            'code', 'EXPLANATION_VERSION_REQUIRED')));
  });

  test('a stale or forbidden decision is not retried and preserves credentials',
      () async {
    for (final int status in <int>[403, 409]) {
      int calls = 0;
      int expired = 0;
      final ApiClient api = ApiClient()
        ..accessToken = 'development-token'
        ..refreshToken = 'development-refresh';
      api.onSessionExpired = (_) async {
        expired++;
      };
      await http.runWithClient(() async {
        await expectLater(
            api.confirmExplanation(
                AttendanceExplanation.fromJson(explanationJson(confirm: true)),
                ''),
            throwsA(isA<ApiException>().having(
                (ApiException error) => error.status, 'status', status)));
      },
          () => MockClient((_) async {
                calls++;
                return http.Response(
                    jsonEncode(<String, dynamic>{
                      'code': status == 403
                          ? 'EXPLANATION_STEP_FORBIDDEN'
                          : 'EXPLANATION_ROUTE_CHANGED',
                      'message': 'Development error'
                    }),
                    status);
              }));
      expect(calls, 1);
      expect(expired, 0);
      expect(api.accessToken, 'development-token');
      expect(api.refreshToken, 'development-refresh');
    }
  });

  test('evidence refuses arbitrary URLs before attaching credentials',
      () async {
    final ApiClient api = ApiClient()..accessToken = 'development-token';
    for (final String reference in <String>[
      'https://example.invalid/photo.png',
      '/api/attendance/evidence/../../other.jpg'
    ]) {
      await expectLater(
          api.explanationEvidence(reference),
          throwsA(isA<ApiException>().having((ApiException error) => error.code,
              'code', 'INVALID_EVIDENCE_REFERENCE')));
    }
  });

  test('evidence uses authenticated same-origin bytes, not a public image URL',
      () async {
    await http.runWithClient(() async {
      final ApiClient api = ApiClient(baseUrl: 'http://localhost:3001/api')
        ..accessToken = 'development-token';
      expect(
          await api.explanationEvidence(
              '/api/attendance/evidence/00000000-0000-4000-8000-000000000001.png'),
          <int>[137, 80, 78, 71]);
    },
        () => MockClient((http.Request request) async {
              expect(request.url.host, 'localhost');
              expect(request.url.path,
                  '/api/attendance/evidence/00000000-0000-4000-8000-000000000001.png');
              expect(
                  request.headers['Authorization'], 'Bearer development-token');
              return http.Response.bytes(<int>[137, 80, 78, 71], 200,
                  headers: <String, String>{'content-type': 'image/png'});
            }));
  });

  testWidgets(
      'Leader sees confirmation only; cancelling the dialog sends nothing',
      (WidgetTester tester) async {
    final _FakeApi api = _FakeApi(confirm: true);
    await _openDetail(tester, api);
    expect(find.text('Duyệt giải trình'), findsNothing);
    await tester.tap(find.text('Xác nhận và chuyển Trưởng phòng'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quay lại'));
    await tester.pumpAndSettle();
    expect(api.decisions, 0);
  });

  testWidgets(
      'Head only gets Backend review capability and stale error requires reload',
      (WidgetTester tester) async {
    final _FakeApi api = _FakeApi(review: true);
    await _openDetail(tester, api);
    expect(find.text('Xác nhận và chuyển Trưởng phòng'), findsNothing);
    await tester.tap(find.text('Duyệt giải trình'));
    await tester.pumpAndSettle();
    await tester
        .tap(find.widgetWithText(FilledButton, 'Duyệt giải trình').last);
    await tester.pumpAndSettle();
    expect(api.decisions, 1);
    expect(find.textContaining('Không tự gửi lại quyết định'), findsOneWidget);
    expect(find.text('Duyệt giải trình'), findsNothing);
  });

  testWidgets('revoked scope does not expose cached content or review buttons',
      (WidgetTester tester) async {
    final _FakeApi api = _FakeApi(review: true)..allowed = false;
    await _openDetail(tester, api);
    expect(find.text('Development-only explanation'), findsNothing);
    expect(find.text('Duyệt giải trình'), findsNothing);
    expect(api.queueReads, 0);
  });

  testWidgets(
      'owner details never show manager actions even if a faulty response has capabilities',
      (WidgetTester tester) async {
    await _openDetail(tester, _FakeApi(confirm: true, review: true),
        managed: false);
    expect(find.text('Duyệt giải trình'), findsNothing);
    expect(find.text('Xác nhận và chuyển Trưởng phòng'), findsNothing);
  });
}

class _FakeApi extends ApiClient {
  _FakeApi({this.confirm = false, this.review = false});
  final bool confirm;
  final bool review;
  bool allowed = true;
  int decisions = 0;
  int queueReads = 0;

  @override
  Future<ManagementAccess> managementAccess() async => ManagementAccess(
      canReviewExplanations: allowed, grants: <ManagementGrantView>[]);
  @override
  Future<List<AttendanceExplanation>> managedExplanations() async {
    queueReads++;
    return <AttendanceExplanation>[
      AttendanceExplanation.fromJson(
          explanationJson(confirm: confirm, review: review))
    ];
  }

  @override
  Future<List<AttendanceExplanation>> myAttendanceExplanations() =>
      managedExplanations();
  @override
  Future<List<ExplanationHistoryEntry>> explanationHistory(String id) async =>
      <ExplanationHistoryEntry>[];
  @override
  Future<void> reviewExplanation(AttendanceExplanation item,
      {required bool approve, required String note}) async {
    decisions++;
    throw const ApiException('Development stale route',
        code: 'EXPLANATION_ROUTE_CHANGED', status: 409);
  }

  @override
  Future<void> confirmExplanation(
      AttendanceExplanation item, String note) async {
    decisions++;
  }
}

Future<void> _openDetail(WidgetTester tester, _FakeApi api,
    {bool managed = true}) async {
  final SessionController session = SessionController(
      api: api,
      pushNotifications: PushNotificationService(),
      storage: const FlutterSecureStorage())
    ..user = const SessionUser(
        displayName: 'Development manager',
        email: 'pq4@example.invalid',
        employeeId: 'development-employee',
        id: 'development-user',
        roles: <String>['EMPLOYEE']);
  addTearDown(session.dispose);
  await tester.pumpWidget(MaterialApp(
      home: ExplanationDetailScreen(
          session: session,
          id: explanationJson()['id'] as String,
          managed: managed)));
  await tester.pumpAndSettle();
}
