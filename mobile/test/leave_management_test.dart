import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thien_minh_dental_workforce/features/leave/managed_leave_screen.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';

Map<String, dynamic> leaveJson() => <String, dynamic>{
      'id': '00000000-0000-4000-8000-000000000001',
      'policyId': 'policy',
      'leaveType': 'ANNUAL',
      'policyName': 'Development only',
      'startDate': '2026-11-02',
      'endDate': '2026-11-02',
      'reason': 'Development only',
      'status': 'SUBMITTED',
      'submittedAt': '2026-10-06T01:00:00Z',
      'requestedMinutes': 480,
      'approvalStage': 'LEADER_CONFIRMATION',
      'routeVersion': 2,
      'canConfirm': true
    };
void main() {
  test(
      'leave and read capabilities are additive, absent capabilities grant nothing',
      () {
    final ManagementAccess missing =
        ManagementAccess.fromJson(<String, dynamic>{});
    expect(missing.canReviewLeave, isFalse);
    expect(missing.canReadManagedModules, isFalse);
    final ManagementAccess current =
        ManagementAccess.fromJson(<String, dynamic>{
      'capabilities': <String, dynamic>{
        'leaveWorkflow': 'LEAVE_TWO_STEP',
        'readManagedModules': true
      }
    });
    expect(current.canReviewLeave, isTrue);
    expect(current.canReadManagedModules, isTrue);
    expect(current.canReviewExplanations, isFalse);
  });
  test('legacy metadata never invents a confirmation, version or permission',
      () {
    final ManagedLeaveRequest item = ManagedLeaveRequest.fromJson(leaveJson()
      ..remove('routeVersion')
      ..remove('approvalStage')
      ..remove('canConfirm'));
    expect(item.routeVersion, isNull);
    expect(item.canConfirm, isFalse);
    expect(item.canReview, isFalse);
    expect(item.confirmedAt, isNull);
    expect(leaveStageLabel(item), contains('lịch sử'));
  });
  test(
      'confirmation and rejection send the displayed version, with required trimmed reason',
      () async {
    final List<http.Request> requests = [];
    await http.runWithClient(() async {
      final ApiClient api = ApiClient()..accessToken = 'development-token';
      final ManagedLeaveRequest item =
          ManagedLeaveRequest.fromJson(leaveJson());
      await api.processLeave(item, action: 'CONFIRM', note: ' note ');
      await api.processLeave(item, action: 'REJECTED', note: ' reason ');
    },
        () => MockClient((request) async {
              requests.add(request);
              return http.Response('{}', 200);
            }));
    expect(requests.length, 2);
    expect(requests[0].method, 'PATCH');
    expect(requests[0].url.path, endsWith('/confirm'));
    expect(jsonDecode(requests[0].body),
        <String, dynamic>{'expectedVersion': 2, 'confirmationNote': 'note'});
    expect(jsonDecode(requests[1].body), <String, dynamic>{
      'expectedVersion': 2,
      'status': 'REJECTED',
      'reviewNote': 'reason'
    });
  });
  test('missing version and short rejection fail before HTTP', () async {
    final ApiClient api = ApiClient();
    await expectLater(
        api.processLeave(
            ManagedLeaveRequest.fromJson(leaveJson()..remove('routeVersion')),
            action: 'CONFIRM',
            note: ''),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'LEAVE_VERSION_REQUIRED')));
    await expectLater(
        api.processLeave(ManagedLeaveRequest.fromJson(leaveJson()),
            action: 'REJECTED', note: '  no  '),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'LEAVE_REJECTION_REASON_REQUIRED')));
  });
  test('403 and 409 preserve session and never retry a decision automatically',
      () async {
    for (final int status in <int>[403, 409]) {
      int calls = 0, ended = 0;
      final ApiClient api = ApiClient()
        ..accessToken = 'development-token'
        ..refreshToken = 'development-refresh';
      api.onSessionExpired = (_) async {
        ended++;
      };
      await http.runWithClient(() async {
        await expectLater(
            api.processLeave(ManagedLeaveRequest.fromJson(leaveJson()),
                action: 'CONFIRM', note: ''),
            throwsA(
                isA<ApiException>().having((e) => e.status, 'status', status)));
      },
          () => MockClient((request) async {
                calls++;
                return http.Response(
                    jsonEncode(<String, dynamic>{
                      'code': status == 409
                          ? 'LEAVE_ROUTE_CHANGED'
                          : 'LEAVE_STEP_FORBIDDEN',
                      'message': 'Development only'
                    }),
                    status);
              }));
      expect(calls, 1);
      expect(ended, 0);
      expect(api.accessToken, 'development-token');
    }
  });
  test(
      'report route never calls global export and only returns scoped employee rows',
      () async {
    await http.runWithClient(() async {
      final ApiClient api = ApiClient()..accessToken = 'development-token';
      expect(
          await api.managedModule('reports', month: '2026-10'),
          <Map<String, dynamic>>[
            <String, dynamic>{'employeeCode': 'DEV'}
          ]);
    },
        () => MockClient((request) async {
              expect(request.method, 'GET');
              expect(
                  request.url.path, endsWith('/organization/managed/reports'));
              expect(request.url.queryParameters['month'], '2026-10');
              return http.Response(
                  jsonEncode(<String, dynamic>{
                    'employees': <dynamic>[
                      <String, dynamic>{'employeeCode': 'DEV'}
                    ],
                    'summary': <String, dynamic>{}
                  }),
                  200);
            }));
  });
}
