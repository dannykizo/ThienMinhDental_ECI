import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_form_controls.dart';
import '../../presentation/widgets/app_list_controls.dart';
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
  bool _hasLoaded = false;
  String _filter = 'ALL';

  List<AttendanceExplanation> get _visibleItems => _items
      .where((AttendanceExplanation item) =>
          _filter == 'ALL' || item.status == _filter)
      .toList();

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
        _loading = true;
      });
    }
    if (syncQueue) await _syncPending(showResult: false);
    try {
      final List<AttendanceExplanation> items =
          await widget.session.api.myAttendanceExplanations();
      if (mounted) {
        setState(() {
          _items = items;
          _hasLoaded = true;
        });
      }
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

  Future<void> _openResponse([AttendanceExplanation? item]) async {
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
        title: const Text('Giải trình chấm công'),
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
            const AppPageIntro(
              eyebrow: 'Đơn của bạn',
              title: 'Giải trình của bạn',
              description:
                  'Chủ động báo cáo vấn đề để Admin xem xét. Có thể chụp hoặc đính kèm ảnh minh chứng; không bắt buộc.',
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
              ..._pending
                  .where((item) => item.workDate != null)
                  .map((item) => Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          color: const Color(0xFFFFF6E7),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('CHỜ MẠNG · CHƯA GỬI TỚI ADMIN',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 11)),
                                const SizedBox(height: 8),
                                Text(
                                    '${_issueLabel(item.issueType!)} · ${_date(item.workDate!)}'),
                                const SizedBox(height: 8),
                                Text(item.responseText),
                                if (item.photoPath != null)
                                  const Text('Có ảnh minh chứng lưu trên máy.',
                                      style: TextStyle(
                                          color: brandMuted, fontSize: 12)),
                              ]),
                        ),
                      )),
            ],
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
                scopeNote: 'Chỉ lọc tối đa 100 đơn mới nhất từ Backend. '
                    'Hàng đợi chờ mạng được hiển thị riêng phía trên.',
                options: <String, String>{
                  'ALL': 'Tất cả',
                  if (_items.any((AttendanceExplanation item) =>
                      item.status == 'REQUESTED'))
                    'REQUESTED': 'Yêu cầu cũ',
                  'SUBMITTED': 'Chờ duyệt',
                  'APPROVED': 'Đã duyệt',
                  'REJECTED': 'Từ chối',
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
                label: 'Đang tải đơn giải trình…',
              )
            else if (_error != null && _items.isEmpty)
              AppErrorState(message: _error!, onRetry: _load)
            else if (_items.isEmpty)
              const AppEmptyState(
                description:
                    'Bấm Tạo giải trình để báo cáo vấn đề. Minh chứng không bắt buộc.',
                icon: Icons.task_alt_rounded,
                title: 'Chưa có đơn giải trình',
              )
            else if (_visibleItems.isEmpty)
              AppFilteredEmptyState(
                onClear: () => setState(() => _filter = 'ALL'),
              )
            else
              ..._visibleItems.map(
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
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: SafeArea(
            top: false,
            child: AppFormAction(
                label: 'Tạo giải trình',
                icon: Icons.add_rounded,
                onPressed: () => _openResponse())),
      ),
    );
  }
}

class ExplanationResponseScreen extends StatefulWidget {
  const ExplanationResponseScreen({
    this.explanation,
    required this.session,
    super.key,
  });

  final AttendanceExplanation? explanation;
  final SessionController session;

  @override
  State<ExplanationResponseScreen> createState() =>
      _ExplanationResponseScreenState();
}

class _ExplanationResponseScreenState extends State<ExplanationResponseScreen> {
  final TextEditingController _response = TextEditingController();
  final String _evidenceId = PendingExplanationQueue.createEvidenceId();
  final String _submissionId = PendingExplanationQueue.createEvidenceId();
  DateTime _workDate = DateUtils.dateOnly(DateTime.now());
  String _issueType = 'MISSING_CHECK_OUT';
  String? _photoPath;
  DateTime? _capturedAt;
  String? _error;
  bool _busy = false;
  String? _responseError;
  bool _capturing = false;
  bool _preservePhoto = false;

  Future<void> _pickWorkDate() async {
    final DateTime? selected = await showDatePicker(
        context: context,
        initialDate: _workDate,
        firstDate: DateTime(2020),
        lastDate: DateTime(2100));
    if (mounted && selected != null) setState(() => _workDate = selected);
  }

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

  Future<void> _capturePhoto([ImageSource source = ImageSource.camera]) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _capturing = true;
      _error = null;
    });
    try {
      final XFile? photo = await ImagePicker().pickImage(
        source: source,
        imageQuality: 82,
        maxWidth: 1800,
      );
      if (photo == null) return;
      final Directory appDirectory = await getApplicationDocumentsDirectory();
      final Directory evidenceDirectory = Directory(
        '${appDirectory.path}${Platform.pathSeparator}pending-attendance-evidence',
      );
      await evidenceDirectory.create(recursive: true);
      final String targetPath =
          '${evidenceDirectory.path}${Platform.pathSeparator}$_evidenceId.jpg';
      await File(photo.path).copy(targetPath);
      await FileImage(File(targetPath)).evict();
      if (mounted) {
        setState(() {
          _photoPath = targetPath;
          _capturedAt = source == ImageSource.camera ? DateTime.now() : null;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Không thể chọn ảnh minh chứng. Hãy kiểm tra quyền Camera/Ảnh hoặc thử tệp khác.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _capturing = false;
        });
      }
    }
  }

  Future<void> _removePhoto() async {
    if (_busy || _photoPath == null) return;
    final File photo = File(_photoPath!);
    setState(() {
      _busy = true;
      _photoPath = null;
      _capturedAt = null;
    });
    try {
      if (await photo.exists()) await photo.delete();
    } on FileSystemException {
      // An unsubmitted temporary image can be removed on a later capture.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final String responseText = _response.text.trim();
    if (responseText.length < 5) {
      setState(
          () => _responseError = 'Nội dung giải trình cần ít nhất 5 ký tự.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _responseError = null;
    });
    try {
      final ExplanationSubmissionOutcome outcome =
          await widget.session.explanationQueue.submitOrQueue(
        PendingExplanationSubmission(
          capturedAt: _capturedAt,
          evidenceId: _evidenceId,
          explanationId: widget.explanation?.id ?? _submissionId,
          ownerUserId: widget.session.user!.id,
          workDate: widget.explanation == null
              ? DateFormat('yyyy-MM-dd').format(_workDate)
              : null,
          issueType: widget.explanation == null ? _issueType : null,
          latitude: null,
          longitude: null,
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
  Widget build(BuildContext context) => PopScope(
        canPop: !_busy,
        child: Scaffold(
          appBar: AppBar(
              title: Text(widget.explanation == null
                  ? 'Tạo giải trình'
                  : 'Phản hồi yêu cầu cũ')),
          body: SafeArea(
            top: false,
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: <Widget>[
                if (widget.explanation != null) ...<Widget>[
                  _ExplanationSummary(item: widget.explanation!),
                  const SizedBox(height: 20),
                ] else ...<Widget>[
                  const AppFormSection(
                      title: '1. Vấn đề cần giải trình',
                      description:
                          'Chọn ngày công và loại vấn đề để Admin đối soát.'),
                  OutlinedButton.icon(
                      onPressed: _busy ? null : _pickWorkDate,
                      icon: const Icon(Icons.calendar_month_outlined),
                      label: Text(
                          'Ngày công *: ${DateFormat('dd/MM/yyyy').format(_workDate)}')),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _issueType,
                    isExpanded: true,
                    decoration: const InputDecoration(
                        labelText: 'Loại vấn đề *',
                        border: OutlineInputBorder()),
                    items: const <String>[
                      'MISSING_CHECK_IN',
                      'MISSING_CHECK_OUT',
                      'DUPLICATE_ATTEMPT',
                      'WRONG_DATE_OR_DEVICE_TIME',
                      'GPS_RISK',
                      'OTHER'
                    ]
                        .map((value) => DropdownMenuItem(
                            value: value, child: Text(_issueLabel(value))))
                        .toList(),
                    onChanged: _busy
                        ? null
                        : (value) => setState(() => _issueType = value!),
                  ),
                  const SizedBox(height: 20),
                ],
                AppFormSection(
                    title:
                        '${widget.explanation == null ? 2 : 1}. Nội dung giải trình',
                    description:
                        'Các mục có * là bắt buộc. Nội dung và ảnh được giữ khi gửi thất bại.'),
                TextField(
                  controller: _response,
                  enabled: !_busy,
                  maxLines: 5,
                  minLines: 4,
                  maxLength: 2000,
                  onChanged: (_) {
                    if (_responseError != null) {
                      setState(() => _responseError = null);
                    }
                  },
                  decoration: InputDecoration(
                    errorText: _responseError,
                    errorMaxLines: 3,
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                    labelText: 'Nội dung giải trình *',
                    hintText:
                        'Mô tả ngắn gọn sự việc và thông tin cần đối soát…',
                  ),
                ),
                const SizedBox(height: 16),
                AppFormSection(
                    title:
                        '${widget.explanation == null ? 3 : 2}. Ảnh minh chứng',
                    description:
                        'Không bắt buộc. Chụp ảnh hoặc chọn một ảnh có sẵn, tối đa 5 MB. Không yêu cầu vị trí GPS.'),
                if (_photoPath != null) ...<Widget>[
                  AppEvidencePreview(
                    path: _photoPath!,
                    status: _busy && !_capturing
                        ? 'Đang xử lý ảnh và gửi giải trình…'
                        : _error != null
                            ? 'Ảnh vẫn được giữ trên thiết bị. Kiểm tra lỗi phía dưới trước khi thử lại.'
                            : 'Ảnh đã chọn trên thiết bị · chưa gửi cùng giải trình.',
                    onRetake: _busy ? null : () => _capturePhoto(),
                  ),
                  TextButton.icon(
                      onPressed: _busy ? null : _removePhoto,
                      icon: const Icon(Icons.close_rounded),
                      label: const Text('Bỏ ảnh đã chọn')),
                ],
                Wrap(spacing: 12, runSpacing: 8, children: <Widget>[
                  OutlinedButton.icon(
                      onPressed: _busy ? null : () => _capturePhoto(),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Chụp ảnh')),
                  OutlinedButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _capturePhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Đính kèm ảnh')),
                ]),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 14),
                  AppErrorState(
                    compact: true,
                    message: _error!,
                    onRetry: _busy ? null : _submit,
                    title: null,
                  ),
                ],
                const SizedBox(height: 22),
                AppFormAction(
                    label: 'Gửi giải trình',
                    icon: Icons.send_rounded,
                    busy: _busy,
                    busyLabel:
                        _capturing ? 'Đang chọn ảnh…' : 'Đang xử lý và gửi…',
                    onPressed: _submit),
                const SizedBox(height: 10),
                const Text(
                  'Nếu mất mạng trong lúc gửi, app giữ nội dung và ảnh trong bộ nhớ riêng của ứng dụng.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Color(0xFF817683), fontSize: 11, height: 1.4),
                ),
              ],
            ),
          ),
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
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(_issueLabel(item.issueType),
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    _StatusPill(status: item.status),
                    // Local queue is not a replacement for the Backend status.
                    if (pending) const _StatusPill(status: 'QUEUED'),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (item.requestNote.isNotEmpty)
              Text(item.requestNote,
                  style:
                      const TextStyle(color: Color(0xFF615764), height: 1.45)),
            const SizedBox(height: 10),
            Text(
              'Ngày công: ${_date(item.workDate)}${item.dueAt == null ? '' : '\nHạn phản hồi: ${DateFormat('dd/MM/yyyy HH:mm').format(item.dueAt!)}'}',
              style:
                  const TextStyle(color: brandMuted, fontSize: 12, height: 1.5),
            ),
            if (item.responseText != null) ...<Widget>[
              const SizedBox(height: 10),
              Text('Nội dung: ${item.responseText}',
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
            if (item.evidenceImageReference != null)
              const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text('Đã gửi ảnh minh chứng.',
                      style: TextStyle(color: brandMuted, fontSize: 12))),
            if (item.reviewNote != null) ...<Widget>[
              const SizedBox(height: 6),
              Text('Ghi chú duyệt: ${item.reviewNote}',
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
            if (item.status == 'REJECTED' &&
                (item.reviewNote == null || item.reviewNote!.isEmpty))
              const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text('Admin không ghi thêm lý do từ chối.',
                      style: TextStyle(color: brandMuted, fontSize: 12))),
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
            if (item.dueAt != null)
              Text(
                  'Hạn phản hồi ${DateFormat('dd/MM/yyyy HH:mm').format(item.dueAt!)}',
                  style:
                      const TextStyle(color: Color(0xFF786B7B), fontSize: 11)),
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
      'SUBMITTED' => 'CHỜ DUYỆT',
      'APPROVED' => 'ĐÃ DUYỆT',
      'REJECTED' => 'TỪ CHỐI',
      'QUEUED' => 'CHỜ MẠNG',
      _ => status,
    };
