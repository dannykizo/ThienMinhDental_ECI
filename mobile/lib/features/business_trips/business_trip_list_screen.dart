import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../app.dart';
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

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _error = null;
        _loading = _items.isEmpty;
      });
    }
    try {
      final List<BusinessTripAssignment> items =
          await widget.session.api.myBusinessTrips();
      if (mounted) setState(() => _items = items);
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
            style: TextStyle(fontFamily: 'serif', fontWeight: FontWeight.w600),
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
              const Text(
                'PHÂN CÔNG CỦA BẠN',
                style: TextStyle(
                  color: brandPurple,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Công việc hiện trường\nrõ ràng từng bước.',
                style: TextStyle(
                  fontFamily: 'serif',
                  fontSize: 29,
                  fontWeight: FontWeight.w500,
                  height: 1.12,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'GPS chỉ được lấy khi bạn bắt đầu hoặc hoàn tất công tác.',
                style: TextStyle(
                  color: Color(0xFF746A77),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 16),
                _TripError(message: _error!, onRetry: _load),
              ],
              const SizedBox(height: 20),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 80),
                  child: Center(
                    child: CircularProgressIndicator(color: brandPurple),
                  ),
                )
              else if (_items.isEmpty)
                const _EmptyTrips()
              else
                ..._items.map(
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
    FocusManager.instance.primaryFocus?.unfocus();
    if (widget.trip.requiresPhoto && _photoPath == null) {
      setState(() => _error = 'Phiếu này bắt buộc có ảnh hiện trường.');
      return;
    }
    setState(() {
      _error = null;
      _workingLabel = 'Đang chuẩn bị…';
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
    return Scaffold(
      appBar: AppBar(title: Text(trip.code)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: <Widget>[
          _TripSummary(trip: trip),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 16),
            _TripError(message: _error!),
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
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _busy ? null : _start,
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                icon: _busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.play_arrow_rounded),
                label: Text(_workingLabel ?? 'Bắt đầu công tác'),
              ),
            ),
          ],
          if (trip.participationStatus == 'IN_PROGRESS') ...<Widget>[
            const SizedBox(height: 22),
            TextField(
              controller: _note,
              enabled: !_busy,
              maxLength: 2000,
              maxLines: 5,
              minLines: 3,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Ghi chú kết quả',
                hintText: 'Nội dung đã thực hiện tại hiện trường',
              ),
            ),
            const SizedBox(height: 12),
            if (_photoPath == null)
              OutlinedButton.icon(
                onPressed: _busy ? null : _capturePhoto,
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(
                  trip.requiresPhoto
                      ? 'Chụp ảnh hiện trường (bắt buộc)'
                      : 'Chụp ảnh hiện trường (không bắt buộc)',
                ),
              )
            else
              _PhotoPreview(path: _photoPath!, onRetake: _capturePhoto),
            const SizedBox(height: 14),
            _PrivacyNotice(
              text:
                  'Khi hoàn tất, ứng dụng lấy một mẫu GPS mới. Không theo dõi vị trí trong thời gian làm việc.',
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _busy ? null : _complete,
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                icon: _busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.task_alt_rounded),
                label: Text(_workingLabel ?? 'Hoàn tất công tác'),
              ),
            ),
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
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        trip.code,
                        style: const TextStyle(
                          color: brandPurple,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .8,
                        ),
                      ),
                    ),
                    _TripStatus(status: trip.participationStatus),
                  ],
                ),
                const SizedBox(height: 9),
                Text(
                  trip.siteName,
                  style: const TextStyle(
                    fontFamily: 'serif',
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  trip.siteAddress,
                  style: const TextStyle(color: Color(0xFF675D69)),
                ),
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
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
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
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    trip.siteName,
                    style: const TextStyle(
                      fontFamily: 'serif',
                      fontSize: 25,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                _TripStatus(status: trip.participationStatus),
              ],
            ),
            const SizedBox(height: 9),
            _InfoLine(icon: Icons.place_outlined, text: trip.siteAddress),
            _InfoLine(
              icon: Icons.schedule_outlined,
              text: '${_dateTime(trip.startAt)} → ${_dateTime(trip.endAt)}',
            ),
            if (trip.customerName != null)
              _InfoLine(
                icon: Icons.apartment_outlined,
                text: trip.customerName!,
              ),
            if (trip.responsibleEmployeeName != null)
              _InfoLine(
                icon: Icons.badge_outlined,
                text: 'Phụ trách: ${trip.responsibleEmployeeName}',
              ),
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

class _PhotoPreview extends StatelessWidget {
  const _PhotoPreview({required this.onRetake, required this.path});

  final VoidCallback onRetake;
  final String path;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(
              File(path),
              height: 210,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox(
                height: 120,
                child: Center(child: Text('Không thể hiển thị ảnh.')),
              ),
            ),
          ),
          TextButton.icon(
            onPressed: onRetake,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Chụp lại'),
          ),
        ],
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

class _TripError extends StatelessWidget {
  const _TripError({required this.message, this.onRetry});

  final String message;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFFFEFEC),
          border: Border(left: BorderSide(color: Color(0xFFB85D50), width: 3)),
        ),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text(message, style: const TextStyle(fontSize: 12)),
            ),
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Thử lại')),
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

class _EmptyTrips extends StatelessWidget {
  const _EmptyTrips();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(left: BorderSide(color: brandPurple, width: 3)),
        ),
        child: const Column(
          children: <Widget>[
            Icon(Icons.work_outline_rounded, color: brandPurple, size: 36),
            SizedBox(height: 12),
            Text('Chưa có phiếu công tác',
                style: TextStyle(fontWeight: FontWeight.w800)),
            SizedBox(height: 6),
            Text(
              'Phiếu được Admin giao sẽ xuất hiện tại đây.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF746A77), fontSize: 12),
            ),
          ],
        ),
      );
}

String _dateTime(DateTime value) =>
    DateFormat('dd/MM/yyyy HH:mm').format(value);

String _statusLabel(String status) => switch (status) {
      'ASSIGNED' => 'ĐÃ GIAO',
      'IN_PROGRESS' => 'ĐANG THỰC HIỆN',
      'COMPLETED' => 'HOÀN TẤT',
      'CANCELLED' => 'ĐÃ HỦY',
      _ => status,
    };
