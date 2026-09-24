import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../app.dart';
import '../../services/api_client.dart';
import '../../services/pending_explanation_queue.dart';

class ExplanationListScreen extends StatefulWidget {
  const ExplanationListScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<ExplanationListScreen> createState() => _ExplanationListScreenState();
}

class _ExplanationListScreenState extends State<ExplanationListScreen>
    with WidgetsBindingObserver {
  List<AttendanceExplanation> _items = <AttendanceExplanation>[];
  List<PendingExplanationSubmission> _pending =
      <PendingExplanationSubmission>[];
  String? _error;
  bool _loading = true;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load(syncQueue: true));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_load(syncQueue: true));
    }
  }

  Future<void> _load({bool syncQueue = false}) async {
    if (mounted) {
      setState(() {
        _error = null;
        _loading = _items.isEmpty;
      });
    }
    if (syncQueue) await _syncPending(showResult: false);
    try {
      final List<AttendanceExplanation> items =
          await widget.session.api.myAttendanceExplanations();
      if (mounted) setState(() => _items = items);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      final List<PendingExplanationSubmission> pending =
          await widget.session.explanationQueue.pending();
      if (mounted) {
        setState(() {
          _pending = pending;
          _loading = false;
        });
      }
    }
  }

  Future<void> _syncPending({required bool showResult}) async {
    if (_syncing) return;
    if (mounted) setState(() => _syncing = true);
    final ExplanationQueueSyncResult result =
        await widget.session.explanationQueue.syncAll();
    if (!mounted) return;
    setState(() => _syncing = false);
    if (showResult) {
      final String message = result.sent > 0
          ? 'Đã gửi ${result.sent} giải trình đang chờ.'
          : result.failed > 0
              ? result.errorMessage ??
                  'Chưa thể gửi. App sẽ giữ dữ liệu và thử lại sau.'
              : 'Không có giải trình chờ gửi.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
      );
    }
  }

  Future<void> _openResponse(AttendanceExplanation item) async {
    final String? result = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (BuildContext context) => ExplanationResponseScreen(
          explanation: item,
          session: widget.session,
        ),
      ),
    );
    if (!mounted || result == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result == 'queued'
            ? 'Mạng chưa ổn định. Giải trình đã được lưu trên máy để gửi lại.'
            : 'Đã gửi giải trình thành công.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final Set<String> pendingIds = _pending
        .map((PendingExplanationSubmission item) => item.explanationId)
        .toSet();
    return Scaffold(
      appBar: AppBar(
        backgroundColor: brandCanvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Giải trình chấm công',
            style: TextStyle(fontFamily: 'serif', fontWeight: FontWeight.w600)),
        actions: <Widget>[
          IconButton(
            tooltip: 'Làm mới',
            onPressed: _loading ? null : () => _load(syncQueue: true),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(syncQueue: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
          children: <Widget>[
            const Text('YÊU CẦU CỦA BẠN',
                style: TextStyle(
                    color: brandPurple,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4)),
            const SizedBox(height: 8),
            const Text(
              'Phản hồi bất thường\nkhông để thất lạc dữ liệu.',
              style: TextStyle(
                  fontFamily: 'serif',
                  fontSize: 29,
                  fontWeight: FontWeight.w500,
                  height: 1.12),
            ),
            const SizedBox(height: 10),
            const Text(
              'Nếu mạng yếu, nội dung và ảnh được giữ cục bộ trên thiết bị rồi gửi lại khi có kết nối.',
              style: TextStyle(
                  color: Color(0xFF746A77), fontSize: 12, height: 1.5),
            ),
            if (_pending.isNotEmpty) ...<Widget>[
              const SizedBox(height: 18),
              _PendingQueueCard(
                count: _pending.length,
                syncing: _syncing,
                onSync: () async {
                  await _syncPending(showResult: true);
                  await _load();
                },
              ),
            ],
            if (_error != null) ...<Widget>[
              const SizedBox(height: 16),
              _ExplanationError(message: _error!, onRetry: _load),
            ],
            const SizedBox(height: 20),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 80),
                child: Center(
                    child: CircularProgressIndicator(color: brandPurple)),
              )
            else if (_items.isEmpty)
              const _EmptyExplanations()
            else
              ..._items.map(
                (AttendanceExplanation item) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _ExplanationCard(
                    item: item,
                    pending: pendingIds.contains(item.id),
                    onRespond: () => _openResponse(item),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ExplanationResponseScreen extends StatefulWidget {
  const ExplanationResponseScreen({
    required this.explanation,
    required this.session,
    super.key,
  });

  final AttendanceExplanation explanation;
  final SessionController session;

  @override
  State<ExplanationResponseScreen> createState() =>
      _ExplanationResponseScreenState();
}

class _ExplanationResponseScreenState extends State<ExplanationResponseScreen> {
  final TextEditingController _response = TextEditingController();
  final String _evidenceId = PendingExplanationQueue.createEvidenceId();
  String? _photoPath;
  DateTime? _capturedAt;
  double? _latitude;
  double? _longitude;
  String? _error;
  bool _busy = false;
  bool _preservePhoto = false;

  bool get _photoRequired => widget.explanation.issueType == 'GPS_RISK';

  @override
  void dispose() {
    _response.dispose();
    if (!_preservePhoto && _photoPath != null) {
      unawaited(File(_photoPath!)
          .delete()
          .catchError((Object _) => File(_photoPath!)));
    }
    super.dispose();
  }

  Future<void> _capturePhoto() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final XFile? photo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 82,
        maxWidth: 1800,
      );
      if (photo == null) return;
      final Position position = await _positionForEvidence();
      final Directory appDirectory = await getApplicationDocumentsDirectory();
      final Directory evidenceDirectory = Directory(
        '${appDirectory.path}${Platform.pathSeparator}pending-attendance-evidence',
      );
      await evidenceDirectory.create(recursive: true);
      final String targetPath =
          '${evidenceDirectory.path}${Platform.pathSeparator}$_evidenceId.jpg';
      await File(photo.path).copy(targetPath);
      if (mounted) {
        setState(() {
          _photoPath = targetPath;
          _capturedAt = DateTime.now();
          _latitude = position.latitude;
          _longitude = position.longitude;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Không thể chụp ảnh hoặc lấy vị trí bằng chứng. Hãy kiểm tra quyền Camera/GPS.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Position> _positionForEvidence() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const ApiException('Hãy bật GPS để ghi nhận ảnh bằng chứng.');
    }
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const ApiException(
          'Cần cấp quyền vị trí để ảnh bằng chứng có đủ thời gian và tọa độ.');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final String responseText = _response.text.trim();
    if (responseText.length < 5) {
      setState(() => _error = 'Nội dung giải trình cần ít nhất 5 ký tự.');
      return;
    }
    if (_photoRequired && _photoPath == null) {
      setState(() => _error = 'Yêu cầu GPS bắt buộc phải có ảnh bằng chứng.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ExplanationSubmissionOutcome outcome =
          await widget.session.explanationQueue.submitOrQueue(
        PendingExplanationSubmission(
          capturedAt: _capturedAt,
          evidenceId: _evidenceId,
          explanationId: widget.explanation.id,
          latitude: _latitude,
          longitude: _longitude,
          photoPath: _photoPath,
          remoteReference: null,
          responseText: responseText,
        ),
      );
      _preservePhoto = outcome.queued;
      if (mounted) {
        Navigator.of(context).pop(outcome.queued ? 'queued' : 'sent');
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Phản hồi giải trình')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: <Widget>[
            _ExplanationSummary(item: widget.explanation),
            const SizedBox(height: 20),
            TextField(
              controller: _response,
              enabled: !_busy,
              maxLines: 5,
              minLines: 4,
              decoration: const InputDecoration(
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
                labelText: 'Nội dung giải trình',
                hintText: 'Mô tả ngắn gọn sự việc và thông tin cần đối soát…',
              ),
            ),
            const SizedBox(height: 16),
            if (_photoPath == null)
              OutlinedButton.icon(
                onPressed: _busy ? null : _capturePhoto,
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(_photoRequired
                    ? 'Chụp ảnh bằng chứng · bắt buộc'
                    : 'Chụp ảnh bằng chứng · không bắt buộc'),
              )
            else
              _EvidencePreview(
                path: _photoPath!,
                onRetake: _busy ? null : _capturePhoto,
              ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 14),
              _ExplanationError(message: _error!, onRetry: _submit),
            ],
            const SizedBox(height: 22),
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _busy ? null : _submit,
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                icon: _busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded),
                label: Text(_busy ? 'Đang xử lý…' : 'Gửi giải trình'),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Nếu mất mạng trong lúc gửi, app giữ nội dung và ảnh trong bộ nhớ riêng của ứng dụng.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Color(0xFF817683), fontSize: 11, height: 1.4),
            ),
          ],
        ),
      );
}

class _ExplanationCard extends StatelessWidget {
  const _ExplanationCard({
    required this.item,
    required this.onRespond,
    required this.pending,
  });

  final AttendanceExplanation item;
  final VoidCallback onRespond;
  final bool pending;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(_issueLabel(item.issueType),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                _StatusPill(status: pending ? 'QUEUED' : item.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(item.requestNote,
                style: const TextStyle(color: Color(0xFF615764), height: 1.45)),
            const SizedBox(height: 10),
            Text(
              'Ngày công ${_date(item.workDate)} · Hạn ${DateFormat('dd/MM HH:mm').format(item.dueAt)}',
              style: const TextStyle(color: Color(0xFF8B7F8E), fontSize: 11),
            ),
            if (item.responseText != null) ...<Widget>[
              const SizedBox(height: 10),
              Text('Phản hồi: ${item.responseText}',
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
            if (item.reviewNote != null) ...<Widget>[
              const SizedBox(height: 6),
              Text('Ghi chú duyệt: ${item.reviewNote}',
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
            if (item.status == 'REQUESTED' && !pending) ...<Widget>[
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: onRespond,
                  style: FilledButton.styleFrom(backgroundColor: brandPurple),
                  child: const Text('Phản hồi'),
                ),
              ),
            ],
          ],
        ),
      );
}

class _ExplanationSummary extends StatelessWidget {
  const _ExplanationSummary({required this.item});

  final AttendanceExplanation item;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(17),
        color: const Color(0xFFF2EAF5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(_issueLabel(item.issueType),
                style: const TextStyle(
                    color: brandPurple, fontWeight: FontWeight.w800)),
            const SizedBox(height: 7),
            Text(item.requestNote,
                style: const TextStyle(color: brandInk, height: 1.45)),
            const SizedBox(height: 7),
            Text(
                'Hạn phản hồi ${DateFormat('dd/MM/yyyy HH:mm').format(item.dueAt)}',
                style: const TextStyle(color: Color(0xFF786B7B), fontSize: 11)),
          ],
        ),
      );
}

class _EvidencePreview extends StatelessWidget {
  const _EvidencePreview({required this.onRetake, required this.path});

  final VoidCallback? onRetake;
  final String path;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: Column(
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.file(File(path),
                  height: 210, width: double.infinity, fit: BoxFit.cover),
            ),
            TextButton.icon(
              onPressed: onRetake,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Chụp lại'),
            ),
          ],
        ),
      );
}

class _PendingQueueCard extends StatelessWidget {
  const _PendingQueueCard({
    required this.count,
    required this.onSync,
    required this.syncing,
  });

  final int count;
  final Future<void> Function() onSync;
  final bool syncing;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF6E7),
          border: Border(left: BorderSide(color: brandOrange, width: 3)),
        ),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text('$count giải trình đang chờ mạng',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            TextButton(
              onPressed: syncing ? null : onSync,
              child: Text(syncing ? 'Đang gửi…' : 'Gửi lại'),
            ),
          ],
        ),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        color: status == 'APPROVED'
            ? const Color(0xFFE4F4EC)
            : status == 'REJECTED'
                ? const Color(0xFFFFE9E5)
                : const Color(0xFFF2EAF5),
        child: Text(_statusLabel(status),
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800)),
      );
}

class _ExplanationError extends StatelessWidget {
  const _ExplanationError({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

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
                child: Text(message, style: const TextStyle(fontSize: 12))),
            TextButton(onPressed: onRetry, child: const Text('Thử lại')),
          ],
        ),
      );
}

class _EmptyExplanations extends StatelessWidget {
  const _EmptyExplanations();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 50),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: const Column(
          children: <Widget>[
            Icon(Icons.task_alt_rounded, color: Color(0xFF338865), size: 34),
            SizedBox(height: 12),
            Text('Không có yêu cầu cần phản hồi',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w800)),
            SizedBox(height: 6),
            Text('Các yêu cầu mới từ Admin sẽ xuất hiện tại đây.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF817683), fontSize: 12)),
          ],
        ),
      );
}

String _date(String value) {
  final DateTime? date = DateTime.tryParse(value);
  return date == null ? value : DateFormat('dd/MM/yyyy').format(date);
}

String _issueLabel(String issueType) => switch (issueType) {
      'MISSING_CHECK_IN' => 'Thiếu check-in',
      'MISSING_CHECK_OUT' => 'Thiếu check-out',
      'DUPLICATE_ATTEMPT' => 'Thao tác trùng',
      'WRONG_DATE_OR_DEVICE_TIME' => 'Sai ngày hoặc giờ thiết bị',
      'GPS_RISK' => 'Bất thường GPS',
      _ => 'Vấn đề khác',
    };

String _statusLabel(String status) => switch (status) {
      'REQUESTED' => 'CHỜ PHẢN HỒI',
      'SUBMITTED' => 'ĐÃ GỬI',
      'APPROVED' => 'ĐÃ DUYỆT',
      'REJECTED' => 'TỪ CHỐI',
      'QUEUED' => 'CHỜ MẠNG',
      _ => status,
    };
