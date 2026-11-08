import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:thien_minh_dental_workforce/app.dart';
import 'package:thien_minh_dental_workforce/features/business_trips/business_trip_list_screen.dart';
import 'package:thien_minh_dental_workforce/services/api_client.dart';
import 'package:thien_minh_dental_workforce/services/push_notification_service.dart';

// Synthetic R8 fixtures only: no live employee, camera, GPS or Backend access.
Map<String, dynamic> fixture({String status = 'IN_PROGRESS'}) => {
      'id': 'development-trip',
      'code': 'CT-202610-0001',
      'siteName': 'Development only site',
      'siteAddress': 'Development only address',
      'content': 'Development only task',
      'startAt': '2026-10-12T01:00:00Z',
      'endAt': '2026-10-12T10:00:00Z',
      'participationStatus': 'IN_PROGRESS',
      'status': status,
      'requiresPhoto': true,
      'isResponsible': true,
      'customerName': 'Development only customer',
      'responsibleEmployeeName': 'Development only employee',
      if (status == 'CANCELLED')
        'cancelReason': 'Development only cancellation',
    };

class _Api extends ApiClient {
  final List<String> uploads = [];
  int reads = 0;
  String status = 'IN_PROGRESS';
  bool unavailable = false;

  @override
  Future<List<BusinessTripAssignment>> myBusinessTrips() async {
    reads++;
    if (unavailable) throw const ApiException('R8 development-only offline');
    return [BusinessTripAssignment.fromJson(fixture(status: status))];
  }

  @override
  Future<String> uploadBusinessTripEvidence({
    required String evidenceId,
    required String filePath,
  }) async {
    uploads.add(evidenceId);
    throw const ApiException('R8 development-only ambiguous upload');
  }
}

class _Camera extends ImagePickerPlatform {
  _Camera(this.path);
  final String path;
  int captures = 0;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    expect(source, ImageSource.camera);
    captures++;
    return XFile(path);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<SessionController> session(ApiClient api) async {
    FlutterSecureStorage.setMockInitialValues({});
    final push = PushNotificationService();
    final controller = SessionController(
        api: api,
        pushNotifications: push,
        storage: const FlutterSecureStorage());
    addTearDown(controller.dispose);
    addTearDown(push.dispose);
    return controller;
  }

  Future<void> tap(WidgetTester tester, String text) async {
    final finder = find.text(text);
    if (finder.evaluate().isEmpty) {
      await tester.scrollUntilVisible(finder, 250,
          scrollable: find.byType(Scrollable).first);
    }
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  test('mine parses customer, responsible and independent participation status',
      () async {
    final api = ApiClient(baseUrl: 'https://development.invalid/api');
    await http.runWithClient(() async {
      final items = await api.myBusinessTrips();
      expect(items.single.code, 'CT-202610-0001');
      expect(items.single.customerName, 'Development only customer');
      expect(items.single.isResponsible, isTrue);
      expect(items.single.participationStatus, 'IN_PROGRESS');
      expect(items.single.status, 'CANCELLED');
    },
        () => MockClient((request) async {
              expect(request.method, 'GET');
              expect(request.url.path, '/api/business-trips/mine');
              return http.Response(
                  jsonEncode([fixture(status: 'CANCELLED')]), 200);
            }));
  });

  test(
      'start and complete never call the attendance endpoint or assign an actor',
      () async {
    final api = ApiClient(baseUrl: 'https://development.invalid/api');
    final paths = <String>[];
    await http.runWithClient(() async {
      await api.startBusinessTrip(
          accuracyMeters: 5,
          businessTripId: 'trip',
          latitude: 10,
          longitude: 106);
      await api.completeBusinessTrip(
          accuracyMeters: 5,
          businessTripId: 'trip',
          latitude: 10,
          longitude: 106,
          note: '  development only result  ',
          evidenceImageReference: '/api/business-trips/evidence/test.jpg',
          evidenceCapturedAt: DateTime.utc(2026, 10, 12));
    },
        () => MockClient((request) async {
              paths.add(request.url.path);
              expect(request.method, 'POST');
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              expect(body.keys, isNot(contains('employeeId')));
              expect(body.keys, isNot(contains('workedMinutes')));
              expect(body['deviceTime'], isA<String>());
              if (request.url.path.endsWith('/complete')) {
                expect(body['note'], 'development only result');
                expect(body['evidenceCapturedAt'], '2026-10-12T00:00:00.000Z');
              }
              return http.Response('{}', 201);
            }));
    expect(paths, [
      '/api/business-trips/trip/start',
      '/api/business-trips/trip/complete'
    ]);
  });

  for (final unavailable in [false, true]) {
    test(
        'conflict/network failure does not automatically replay a mutation ($unavailable)',
        () async {
      final api = ApiClient(baseUrl: 'https://development.invalid/api');
      int calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            api.startBusinessTrip(
                accuracyMeters: 5,
                businessTripId: 'trip',
                latitude: 10,
                longitude: 106),
            throwsA(isA<ApiException>()));
      },
          () => MockClient((request) async {
                calls++;
                if (unavailable) {
                  throw http.ClientException('R8 development offline');
                }
                return http.Response('{"message":"Already started"}', 409);
              }));
      expect(calls, 1);
    });
  }

  testWidgets('cancelled trip hides completion even with stale member status',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: BusinessTripDetailScreen(
            session: await session(_Api()),
            trip: BusinessTripAssignment.fromJson(
                fixture(status: 'CANCELLED')))));
    await tester.pumpAndSettle();
    expect(find.text('Hoàn tất công tác'), findsNothing);
    expect(find.text('Chụp ảnh hiện trường'), findsNothing);
    expect(
        find.textContaining('Development only cancellation'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('list read failure can retry without any submission',
      (tester) async {
    final api = _Api()..unavailable = true;
    await tester.pumpWidget(
        MaterialApp(home: BusinessTripListScreen(session: await session(api))));
    await tester.pumpAndSettle();
    expect(find.text('R8 development-only offline'), findsOneWidget);
    api.unavailable = false;
    await tester.tap(find.byTooltip('Làm mới'));
    await tester.pumpAndSettle();
    expect(find.text('Development only site'), findsOneWidget);
    expect(api.reads, 2);
    expect(api.uploads, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'recapture uses a new upload ID; ambiguous response requires read first',
      (tester) async {
    late Directory root;
    late File source;
    await tester.runAsync(() async {
      root = await Directory.systemTemp.createTemp('r8-trip-camera-test-');
      source = File('${root.path}/source.png');
      await source.writeAsBytes(base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII='));
    });
    final previousCamera = ImagePickerPlatform.instance;
    final camera = _Camera(source.path);
    ImagePickerPlatform.instance = camera;
    const channel = MethodChannel('plugins.flutter.io/path_provider');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => root.path);
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox());
      imageCache.clear();
      imageCache.clearLiveImages();
      await tester.runAsync(
          () async => Future<void>.delayed(const Duration(milliseconds: 100)));
      ImagePickerPlatform.instance = previousCamera;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
      // Owned random test directory only, never a user directory.
      expect(root.parent.absolute.path, Directory.systemTemp.absolute.path);
      expect(root.uri.pathSegments.where((segment) => segment.isNotEmpty).last,
          startsWith('r8-trip-camera-test-'));
      await root.delete(recursive: true);
    });
    final api = _Api();
    await tester.pumpWidget(MaterialApp(
        home: BusinessTripDetailScreen(
            session: await session(api),
            trip: BusinessTripAssignment.fromJson(fixture()))));
    await tester.pumpAndSettle();
    Future<void> capture(String label) async {
      if (find.text(label).evaluate().isEmpty) {
        await tester.scrollUntilVisible(find.text(label), 250,
            scrollable: find.byType(Scrollable).first);
      }
      await tester.ensureVisible(find.text(label));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(find.text(label));
        await Future<void>.delayed(const Duration(milliseconds: 150));
      });
      await tester.pumpAndSettle();
    }

    await capture('Chụp ảnh hiện trường');
    await tap(tester, 'Hoàn tất công tác');
    expect(api.uploads.length, 1);
    expect(find.text('Hoàn tất công tác'), findsNothing);
    expect(find.text('Tải lại trạng thái phiếu'), findsOneWidget);
    await tap(tester, 'Tải lại trạng thái phiếu');
    expect(api.reads, 1);
    await capture('Chụp lại');
    await tap(tester, 'Hoàn tất công tác');
    expect(api.uploads.length, 2);
    expect(api.uploads[1], isNot(api.uploads[0]));
    expect(camera.captures, 2);
    api.status = 'CANCELLED';
    await tap(tester, 'Tải lại trạng thái phiếu');
    expect(find.text('Hoàn tất công tác'), findsNothing);
    expect(api.uploads.length, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(
        () async => Future<void>.delayed(const Duration(milliseconds: 50)));
  });
}
