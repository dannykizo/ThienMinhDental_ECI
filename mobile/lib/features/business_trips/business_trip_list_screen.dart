import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_form_controls.dart';
import '../../presentation/widgets/app_list_controls.dart';
import '../../services/api_client.dart';
import '../../services/uuid_v4.dart';

class BusinessTripListScreen extends StatefulWidget {
  const BusinessTripListScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<BusinessTripListScreen> createState() => _BusinessTripListScreenState();
}

class _BusinessTripListScreenState extends State<BusinessTripListScreen> {
  List<BusinessTripAssignment> _items = <BusinessTripAssignment>[];
  String? _error;
  bool _loading = true;
  bool _hasLoaded = false;
  String _filter = 'ALL';

  List<BusinessTripAssignment> get _visibleItems => _items
      .where((BusinessTripAssignment item) =>
          _filter == 'ALL' || item.participationStatus == _filter)
      .toList();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _error = null;
        _loading = true;
      });
    }
    try {
      final List<BusinessTripAssignment> items =
          await widget.session.api.myBusinessTrips();
      if (mounted) {
        setState(() {
          _items = items;
          _hasLoaded = true;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(BusinessTripAssignment trip) async {
    final bool? changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (BuildContext context) => BusinessTripDetailScreen(
          session: widget.session,
          trip: trip,
        ),
      ),
    );
    if (changed == true) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: brandCanvas,
          surfaceTintColor: Colors.transparent,
          title: const Text(
            'Phiếu công tác',
          ),
          actions: <Widget>[
            IconButton(
              tooltip: 'Làm mới',
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
            children: <Widget>[
              const AppPageIntro(
                eyebrow: 'Phân công của bạn',
                title: 'Phân công công tác',
                description:
                    'GPS chỉ được lấy khi bạn bắt đầu hoặc hoàn tất công tác.',
              ),
              if (_error != null && _items.isNotEmpty) ...<Widget>[
                const SizedBox(height: 16),
                AppErrorState(
                  compact: true,
                  message: _error!,
                  onRetry: _load,
                  title: 'Chưa thể làm mới danh sách',
                ),
              ],
              const SizedBox(height: 20),
              if (_hasLoaded) ...<Widget>[
                AppListFilters(
                  label: 'Phần tham gia của bạn',
                  options: const <String, String>{
                    'ALL': 'Tất cả',
                    'ASSIGNED': 'Được giao',
                    'IN_PROGRESS': 'Đang thực hiện',
                    'COMPLETED': 'Hoàn tất',
                  },
                  selected: _filter,
                  onSelected: (String value) => setState(() => _filter = value),
                  visibleCount: _visibleItems.length,
                  loadedCount: _items.length,
                ),
                const SizedBox(height: 16),
              ],
              if (_loading && _items.isNotEmpty) ...<Widget>[
                const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 12),
              ],
              if (_loading && _items.isEmpty)
                const AppLoadingState(
                  label: 'Đang tải phiếu công tác…',
                )
              else if (_error != null && _items.isEmpty)
                AppErrorState(message: _error!, onRetry: _load)
              else if (_items.isEmpty)
                const AppEmptyState(
                  description: 'Phiếu được Admin giao sẽ xuất hiện tại đây.',
                  icon: Icons.work_outline_rounded,
                  title: 'Chưa có phiếu công tác',
                )
              else if (_visibleItems.isEmpty)
                AppFilteredEmptyState(
                  onClear: () => setState(() => _filter = 'ALL'),
                )
              else
                ..._visibleItems.map(
                  (BusinessTripAssignment trip) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _TripCard(
                      onTap: () => _open(trip),
                      trip: trip,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class BusinessTripDetailScreen extends StatefulWidget {
  const BusinessTripDetailScreen({
    required this.session,
    required this.trip,
    super.key,
  });

  final SessionController session;
  final BusinessTripAssignment trip;

  @override
  State<BusinessTripDetailScreen> createState() =>
      _BusinessTripDetailScreenState();
}

class _BusinessTripDetailScreenState extends State<BusinessTripDetailScreen> {
  final TextEditingController _note = TextEditingController();
  final String _evidenceId = createUuidV4();
  DateTime? _capturedAt;
  String? _error;
  String? _photoPath;
  String? _remoteReference;
  String? _workingLabel;
  String? _photoError;
  bool _completed = false;

  bool get _busy => _workingLabel != null;

  @override
  void initState() {
    super.initState();
    _note.text = widget.trip.note ?? '';
  }

  @override
  void dispose() {
    _note.dispose();
    if (_photoPath != null) {
      unawaited(
        File(_photoPath!).delete().catchError((Object _) => File(_photoPath!)),
      );
    }
    super.dispose();
  }

  Future<Position> _currentPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const ApiException('Hãy bật dịch vụ vị trí để tiếp tục công tác.');
    }
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const ApiException(
        'Ứng dụng cần quyền vị trí để ghi nhận bắt đầu và kết thúc công tác.',
      );
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
  }

  Future<void> _capturePhoto() async {
    if (_busy) return;
    setState(() {
      _error = null;
      _workingLabel = 'Đang mở camera…';
    });
    try {
      final XFile? photo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 82,
        maxWidth: 1800,
      );
      if (photo == null) return;
      final Directory appDirectory = await getApplicationDocumentsDirectory();
      final Directory evidenceDirectory = Directory(
        '${appDirectory.path}${Platform.pathSeparator}business-trip-evidence',
      );
      await evidenceDirectory.create(recursive: true);
      final String targetPath =
          '${evidenceDirectory.path}${Platform.pathSeparator}$_evidenceId.jpg';
      await File(photo.path).copy(targetPath);
      if (mounted) {
        setState(() {
          _capturedAt = DateTime.now();
          _photoPath = targetPath;
          _remoteReference = null;
          _photoError = null;
        });
      }
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Không thể chụp ảnh hiện trường. Hãy kiểm tra quyền Camera.');
      }
    } finally {
      if (mounted) setState(() => _workingLabel = null);
    }
  }

  Future<void> _start() async {
    if (_busy) return;
    setState(() {
      _error = null;
      _workingLabel = 'Đang lấy GPS…';
    });
    try {
      final Position position = await _currentPosition();
      if (mounted) setState(() => _workingLabel = 'Đang bắt đầu…');
      await widget.session.api.startBusinessTrip(
        accuracyMeters: position.accuracy,
        businessTripId: widget.trip.id,
        latitude: position.latitude,
        longitude: position.longitude,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã bắt đầu công tác.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) {
        setState(() => _error = 'Không thể lấy GPS để bắt đầu công tác.');
      }
    } finally {
      if (mounted) setState(() => _workingLabel = null);
    }
  }

  Future<void> _complete() async {
    if (_busy) return;
    FocusManager.instance.primaryFocus?.unfocus();
    if (widget.trip.requiresPhoto && _photoPath == null) {
      setState(() => _photoError = 'Phiếu này bắt buộc có ảnh hiện trường.');
      return;
    }
    setState(() {
      _error = null;
      _workingLabel = 'Đang chuẩn bị…';
      _photoError = null;
    });
    try {
      String? reference = _remoteReference;
      if (_photoPath != null && reference == null) {
        if (mounted) setState(() => _workingLabel = 'Đang tải ảnh…');
        reference = await widget.session.api.uploadBusinessTripEvidence(
          evidenceId: _evidenceId,
          filePath: _photoPath!,
        );
        _remoteReference = reference;
      }
      if (mounted) setState(() => _workingLabel = 'Đang lấy GPS…');
      final Position position = await _currentPosition();
      if (mounted) setState(() => _workingLabel = 'Đang hoàn tất…');
      await widget.session.api.completeBusinessTrip(
        accuracyMeters: position.accuracy,
        businessTripId: widget.trip.id,
        evidenceCapturedAt: _capturedAt,
        evidenceImageReference: reference,
        latitude: position.latitude,
        longitude: position.longitude,
        note: _note.text,
      );
      _completed = true;
      if (_photoPath != null) {
        await File(_photoPath!)
            .delete()
            .catchError((Object _) => File(_photoPath!));
        _photoPath = null;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã hoàn tất phần công tác của bạn.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) {
        setState(() => _error = 'Không thể hoàn tất công tác lúc này.');
      }
    } finally {
      if (mounted && !_completed) setState(() => _workingLabel = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final BusinessTripAssignment trip = widget.trip;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: Text(trip.code)),
        body: SafeArea(
          top: false,
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: <Widget>[
              _TripSummary(trip: trip),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 16),
                AppErrorState(
                  compact: true,
                  message: _error!,
                  title: null,
                ),
              ],
              if (trip.participationStatus == 'ASSIGNED' &&
                  !<String>['CANCELLED', 'COMPLETED']
                      .contains(trip.status)) ...<Widget>[
                const SizedBox(height: 22),
                _PrivacyNotice(
                  text:
                      'Khi bắt đầu, ứng dụng lấy đúng một mẫu GPS và gửi thời gian thiết bị lên Backend.',
                ),
                const SizedBox(height: 16),
                AppFormAction(
                    label: 'Bắt đầu công tác',
                    icon: Icons.play_arrow_rounded,
                    busy: _busy,
                    busyLabel: _workingLabel ?? 'Đang xử lý…',
                    onPressed: _start),
              ],
              if (trip.participationStatus == 'IN_PROGRESS') ...<Widget>[
                const SizedBox(height: 22),
                const AppFormSection(
                    title: '1. Kết quả công tác',
                    description:
                        'Ghi chú không bắt buộc. Kiểm tra thông tin trước khi hoàn tất.'),
                TextField(
                  controller: _note,
                  enabled: !_busy,
                  maxLength: 2000,
                  maxLines: 5,
                  minLines: 3,
                  decoration: const InputDecoration(
                    alignLabelWithHint: true,
                    border: OutlineInputBorder(),
                    labelText: 'Ghi chú kết quả',
                    hintText: 'Nội dung đã thực hiện tại hiện trường',
                  ),
                ),
                const SizedBox(height: 12),
                AppFormSection(
                    title: '2. Ảnh hiện trường',
                    description: trip.requiresPhoto
                        ? 'Bắt buộc chụp ảnh trước khi hoàn tất phiếu này.'
                        : 'Không bắt buộc. Có thể bổ sung ảnh hiện trường.'),
                if (_photoPath == null)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        padding: const EdgeInsets.all(16)),
                    onPressed: _busy ? null : _capturePhoto,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(
                      _workingLabel == 'Đang mở camera…'
                          ? _workingLabel!
                          : 'Chụp ảnh hiện trường',
                      textAlign: TextAlign.center,
                    ),
                  )
                else
                  AppEvidencePreview(
                    path: _photoPath!,
                    onRetake: _busy ? null : _capturePhoto,
                    status: _workingLabel == 'Đang tải ảnh…'
                        ? 'Đang tải ảnh lên Backend…'
                        : _remoteReference != null
                            ? 'Ảnh đã tải lên · phiếu chưa hoàn tất.'
                            : _error != null
                                ? 'Ảnh chưa tải xong. Giữ ảnh để thử lại.'
                                : 'Ảnh đã chọn trên thiết bị · chưa tải lên.',
                  ),
                if (_photoError != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(_photoError!,
                          style: const TextStyle(color: brandDanger))),
                const SizedBox(height: 14),
                _PrivacyNotice(
                  text:
                      'Khi hoàn tất, ứng dụng lấy một mẫu GPS mới. Không theo dõi vị trí trong thời gian làm việc.',
                ),
                const SizedBox(height: 16),
                AppFormAction(
                    label: 'Hoàn tất công tác',
                    icon: Icons.task_alt_rounded,
                    busy: _busy,
                    busyLabel: _workingLabel ?? 'Đang xử lý…',
                    onPressed: _complete),
              ],
              if (trip.participationStatus == 'COMPLETED') ...<Widget>[
                const SizedBox(height: 20),
                const _CompletedNotice(),
              ],
              if (trip.status == 'CANCELLED') ...<Widget>[
                const SizedBox(height: 20),
                _CancelledNotice(reason: trip.cancelReason),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.onTap, required this.trip});

  final VoidCallback onTap;
  final BusinessTripAssignment trip;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: const RoundedRectangleBorder(
          side: BorderSide(color: Color(0xFFE5DDE7)),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(17),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'MÃ PHIẾU · ${trip.code}',
                      style: const TextStyle(
                        color: brandPurple,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        _TripStatus(status: trip.participationStatus),
                        Text('Phiếu: ${_statusLabel(trip.status)}',
                            style: const TextStyle(
                                color: brandMuted, fontSize: 11)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 9),
                Text(
                  trip.siteName,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.35,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  trip.siteAddress,
                  style: const TextStyle(color: Color(0xFF675D69)),
                ),
                if (trip.customerName != null) ...<Widget>[
                  const SizedBox(height: 9),
                  _CompactTripInfo(
                    icon: Icons.apartment_outlined,
                    text: 'Khách hàng · ${trip.customerName}',
                  ),
                ],
                if (trip.responsibleEmployeeName != null) ...<Widget>[
                  const SizedBox(height: 7),
                  _CompactTripInfo(
                    icon: Icons.badge_outlined,
                    text: trip.isResponsible
                        ? 'Bạn là người phụ trách'
                        : 'Phụ trách · ${trip.responsibleEmployeeName}',
                  ),
                ],
                const SizedBox(height: 11),
                Text(
                  '${_dateTime(trip.startAt)} → ${_dateTime(trip.endAt)}',
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 12),
                Row(
                  children: <Widget>[
                    Icon(
                      trip.requiresPhoto
                          ? Icons.photo_camera_outlined
                          : Icons.location_on_outlined,
                      color: brandOrange,
                      size: 18,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        trip.requiresPhoto
                            ? 'Cần ảnh khi hoàn tất'
                            : 'Ghi nhận GPS đầu và cuối',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const AppListOpenHint(),
              ],
            ),
          ),
        ),
      );
}

class _TripSummary extends StatelessWidget {
  const _TripSummary({required this.trip});

  final BusinessTripAssignment trip;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(left: BorderSide(color: brandPurple, width: 3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'MÃ PHIẾU · ${trip.code}',
              style: const TextStyle(
                color: brandPurple,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: .8,
              ),
            ),
            const SizedBox(height: 9),
            Text(trip.siteName,
                style: const TextStyle(
                    fontSize: 25,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.45)),
            const SizedBox(height: 9),
            _TripStatus(status: trip.participationStatus),
            const SizedBox(height: 9),
            _InfoLine(icon: Icons.place_outlined, text: trip.siteAddress),
            _InfoLine(
              icon: Icons.schedule_outlined,
              text: '${_dateTime(trip.startAt)} → ${_dateTime(trip.endAt)}',
            ),
            if (trip.responsibleEmployeeName != null)
              _InfoLine(
                icon: Icons.badge_outlined,
                text: trip.isResponsible
                    ? 'Người phụ trách: ${trip.responsibleEmployeeName} (Bạn)'
                    : 'Người phụ trách: ${trip.responsibleEmployeeName}',
              ),
            if (_hasCustomerDetails(trip)) ...<Widget>[
              const SizedBox(height: 14),
              _CustomerDetails(trip: trip),
            ],
            const Divider(height: 26),
            Text(trip.content, style: const TextStyle(height: 1.5)),
            if (trip.startedAt != null) ...<Widget>[
              const SizedBox(height: 12),
              Text('Đã bắt đầu: ${_dateTime(trip.startedAt!)}',
                  style: const TextStyle(fontSize: 12)),
            ],
            if (trip.completedAt != null)
              Text('Đã hoàn tất: ${_dateTime(trip.completedAt!)}',
                  style: const TextStyle(fontSize: 12)),
            if (trip.note != null && trip.note!.isNotEmpty) ...<Widget>[
              const SizedBox(height: 10),
              Text('Ghi chú: ${trip.note}',
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
          ],
        ),
      );
}

class _CompactTripInfo extends StatelessWidget {
  const _CompactTripInfo({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        children: <Widget>[
          Icon(icon, color: brandOrange, size: 16),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: Color(0xFF675D69),
                fontSize: 11.5,
              ),
            ),
          ),
        ],
      );
}

class _CustomerDetails extends StatelessWidget {
  const _CustomerDetails({required this.trip});

  final BusinessTripAssignment trip;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: const Color(0xFFF8F4F8),
          border: Border.all(color: const Color(0xFFE8DFE9)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Row(
              children: <Widget>[
                Icon(Icons.apartment_outlined, color: brandPurple, size: 18),
                SizedBox(width: 8),
                Expanded(
                    child: Text(
                  'KHÁCH HÀNG / PHÒNG KHÁM',
                  style: TextStyle(
                    color: brandPurple,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .6,
                  ),
                )),
              ],
            ),
            if (trip.customerName case final String customerName) ...<Widget>[
              const SizedBox(height: 9),
              Text(
                customerName,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ],
            if (trip.customerAddress case final String address) ...<Widget>[
              const SizedBox(height: 6),
              Text(
                address,
                style: const TextStyle(
                  color: Color(0xFF675D69),
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
            if (trip.customerContactName
                case final String contactName) ...<Widget>[
              const SizedBox(height: 7),
              Text(
                'Liên hệ: $contactName',
                style: const TextStyle(fontSize: 12),
              ),
            ],
            if (trip.customerContactPhone case final String phone) ...<Widget>[
              const SizedBox(height: 4),
              Text(
                'Điện thoại: $phone',
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ],
        ),
      );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, color: brandOrange, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text,
                  style:
                      const TextStyle(color: Color(0xFF675D69), fontSize: 12)),
            ),
          ],
        ),
      );
}

class _PrivacyNotice extends StatelessWidget {
  const _PrivacyNotice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF6E7),
          border: Border(left: BorderSide(color: brandOrange, width: 3)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Icon(Icons.location_on_outlined,
                color: brandOrange, size: 20),
            const SizedBox(width: 9),
            Expanded(
              child: Text(text,
                  style: const TextStyle(fontSize: 12, height: 1.45)),
            ),
          ],
        ),
      );
}

class _TripStatus extends StatelessWidget {
  const _TripStatus({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        color: status == 'COMPLETED'
            ? const Color(0xFFE4F4EC)
            : status == 'CANCELLED'
                ? const Color(0xFFFFE9E5)
                : const Color(0xFFF2EAF5),
        child: Text(
          _statusLabel(status),
          style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800),
        ),
      );
}

class _CompletedNotice extends StatelessWidget {
  const _CompletedNotice();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        color: const Color(0xFFE4F4EC),
        child: const Row(
          children: <Widget>[
            Icon(Icons.task_alt_rounded, color: Color(0xFF287A55)),
            SizedBox(width: 10),
            Expanded(child: Text('Bạn đã hoàn tất phần công tác này.')),
          ],
        ),
      );
}

class _CancelledNotice extends StatelessWidget {
  const _CancelledNotice({required this.reason});

  final String? reason;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        color: const Color(0xFFFFE9E5),
        child: Text(
          reason?.isNotEmpty == true
              ? 'Phiếu đã hủy: $reason'
              : 'Phiếu công tác đã bị hủy.',
        ),
      );
}

String _dateTime(DateTime value) =>
    DateFormat('dd/MM/yyyy HH:mm').format(value);

bool _hasCustomerDetails(BusinessTripAssignment trip) => <String?>[
      trip.customerName,
      trip.customerAddress,
      trip.customerContactName,
      trip.customerContactPhone,
    ].any((String? value) => value?.trim().isNotEmpty ?? false);

String _statusLabel(String status) => switch (status) {
      'ASSIGNED' => 'ĐÃ GIAO',
      'IN_PROGRESS' => 'ĐANG THỰC HIỆN',
      'COMPLETED' => 'HOÀN TẤT',
      'CANCELLED' => 'ĐÃ HỦY',
      _ => status,
    };
