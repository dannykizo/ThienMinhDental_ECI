import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';

const user = <String, dynamic>{
  'id': 'r1-development-only',
  'email': 'r1@development.invalid',
  'displayName': 'R1 Development only',
  'employeeId': null,
  'roles': ['EMPLOYEE'],
};
http.Response reply(int status, [Object body = const <String, dynamic>{}]) =>
    http.Response(jsonEncode(body), status);

ApiClient session() => ApiClient(baseUrl: 'https://development.invalid/api')
  ..accessToken = 'old-access'
  ..refreshToken = 'old-refresh';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('concurrent reads refresh once and persist the rotated tokens',
      () async {
    final api = session();
    int rotations = 0;
    int persisted = 0;
    api.onTokensUpdated = (access, refresh) async {
      persisted++;
    };
    await http.runWithClient(() async {
      final results = await Future.wait([api.me(), api.me()]);
      expect(results.map((item) => item.id), everyElement(user['id']));
    },
        () => MockClient((request) async {
              if (request.url.path.endsWith('/auth/refresh')) {
                rotations++;
                await Future<void>.delayed(Duration.zero);
                return reply(200, {
                  'accessToken': 'new-access',
                  'refreshToken': 'new-refresh'
                });
              }
              return request.headers['Authorization'] == 'Bearer new-access'
                  ? reply(200, {'user': user})
                  : reply(401);
            }));
    expect(rotations, 1);
    expect(persisted, 1);
    expect(api.refreshToken, 'new-refresh');
  });

  for (final status in [500, 502, 503, 504, 429]) {
    test('refresh $status keeps credentials and does not notify session expiry',
        () async {
      final api = session();
      int ended = 0;
      api.onSessionExpired = (error) async {
        ended++;
      };
      await http.runWithClient(() async {
        await expectLater(
            api.me(),
            throwsA(isA<ApiException>()
                .having((error) => error.status, 'status', status)));
      },
          () => MockClient((request) async => reply(
              request.url.path.endsWith('/auth/refresh') ? status : 401)));
      expect(api.accessToken, 'old-access');
      expect(api.refreshToken, 'old-refresh');
      expect(ended, 0);
    });
  }

  test('network loss during refresh preserves saved credentials', () async {
    final api = session();
    int ended = 0;
    api.onSessionExpired = (error) async {
      ended++;
    };
    await http.runWithClient(() async {
      await expectLater(
          api.me(),
          throwsA(isA<ApiException>().having(
              (error) => error.isConnectionFailure,
              'retryable connection',
              true)));
    },
        () => MockClient((request) async {
              if (request.url.path.endsWith('/auth/refresh'))
                throw http.ClientException('R1 offline');
              return reply(401);
            }));
    expect(api.refreshToken, 'old-refresh');
    expect(ended, 0);
  });

  test('refresh revocation clears credentials with the Backend reason',
      () async {
    final api = session();
    String? endedCode;
    api.onSessionExpired = (error) async {
      endedCode = error.code;
    };
    await http.runWithClient(() async {
      await expectLater(api.me(), throwsA(isA<ApiException>()));
    },
        () => MockClient(
            (request) async => reply(401, {'code': 'SESSION_REVOKED'})));
    expect(endedCode, 'SESSION_REVOKED');
    expect(api.accessToken, isNull);
    expect(api.refreshToken, isNull);
  });

  test('business 403 does not end or refresh the employee session', () async {
    final api = session();
    int calls = 0;
    int ended = 0;
    api.onSessionExpired = (error) async {
      ended++;
    };
    await http.runWithClient(() async {
      await expectLater(
          api.managementAccess(),
          throwsA(isA<ApiException>()
              .having((error) => error.status, 'status', 403)));
    },
        () => MockClient((request) async {
              calls++;
              return reply(403);
            }));
    expect(calls, 1);
    expect(ended, 0);
    expect(api.refreshToken, 'old-refresh');
  });

  test('late refresh success cannot restore tokens cleared by logout',
      () async {
    final api = session();
    final started = Completer<void>();
    final released = Completer<void>();
    int persisted = 0;
    api.onTokensUpdated = (access, refresh) async {
      persisted++;
    };
    await http.runWithClient(() async {
      final read = api.me();
      final checked = expectLater(read, throwsA(isA<ApiException>()));
      await started.future;
      api.accessToken = null;
      api.refreshToken = null;
      released.complete();
      await checked;
    },
        () => MockClient((request) async {
              if (request.url.path.endsWith('/auth/refresh')) {
                started.complete();
                await released.future;
                return reply(200, {
                  'accessToken': 'late-access',
                  'refreshToken': 'late-refresh'
                });
              }
              return reply(401);
            }));
    expect(persisted, 0);
    expect(api.refreshToken, isNull);
  });

  test(
      'late refresh rejection cannot clear a different newly signed-in session',
      () async {
    final api = session();
    final started = Completer<void>();
    final released = Completer<void>();
    int ended = 0;
    api.onSessionExpired = (error) async {
      ended++;
    };
    await http.runWithClient(() async {
      final checked = expectLater(api.me(), throwsA(isA<ApiException>()));
      await started.future;
      api.accessToken = 'other-access';
      api.refreshToken = 'other-refresh';
      released.complete();
      await checked;
    },
        () => MockClient((request) async {
              if (request.url.path.endsWith('/auth/refresh')) {
                started.complete();
                await released.future;
              }
              return reply(401);
            }));
    expect(ended, 0);
    expect(api.refreshToken, 'other-refresh');
  });
}
