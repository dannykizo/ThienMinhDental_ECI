import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_form_controls.dart';
import '../../presentation/widgets/app_list_controls.dart';
import '../../services/api_client.dart';
import 'explanation_workflow_view.dart';

String explanationProcessingError(ApiException error) => switch (error.code) {
      'EXPLANATION_ROUTE_CHANGED' =>
        'Tuyến hoặc bước xử lý đã thay đổi. Hãy tải lại trước khi quyết định.',
      'EXPLANATION_STEP_FORBIDDEN' ||
      'EXPLANATION_SCOPE_REQUIRED' ||
      'EXPLANATION_NOT_FOUND' =>
        'Bạn không còn quyền xử lý hoặc đơn đã được chuyển tuyến. Hãy tải lại; phiên nhân viên vẫn được giữ.',
      'ATTENDANCE_PERIOD_LOCKED' =>
        'Kỳ công đã chốt. Chưa thể xử lý giải trình này.',
      _ => error.message,
    };

class ManagedExplanationsScreen extends StatefulWidget {
  const ManagedExplanationsScreen({required this.session, super.key});
  final SessionController session;

  @override
  State<ManagedExplanationsScreen> createState() =>
      _ManagedExplanationsScreenState();
}

class _ManagedExplanationsScreenState extends State<ManagedExplanationsScreen>
    with WidgetsBindingObserver {
  List<AttendanceExplanation> _items = <AttendanceExplanation>[];
  ManagementAccess? _access;
  bool _loading = false;
  String? _error;
  String _filter = 'ACTIONABLE';
  String _search = '';
  final TextEditingController _searchController = TextEditingController();
  int _page = 0;
  static const int _pageSize = 10;

  List<AttendanceExplanation> get _visible =>
      _items.where((AttendanceExplanation item) {
        final bool matches = switch (_filter) {
          'ACTIONABLE' => item.canConfirm || item.canReview,
          'ALL' => true,
          'COMPLETED' => item.status == 'APPROVED' || item.status == 'REJECTED',
          _ => item.approvalStage == _filter,
        };
        return matches &&
            '${item.employeeCode ?? ''} ${item.fullName ?? ''} ${item.workDate} ${item.teamName ?? ''}'
                .toLowerCase()
                .contains(_search.toLowerCase().trim());
      }).toList();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_onSessionChanged);
    unawaited(_load());
  }

  @override
  void dispose() {
    _searchController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (mounted && widget.session.user == null) {
      setState(() {
        _items = <AttendanceExplanation>[];
        _access = null;
        _error = 'Phiên đăng nhập đã kết thúc.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      _items = <AttendanceExplanation>[];
      _access = null;
      _page = 0;
    });
    final String? owner = widget.session.user?.id;
    try {
      final ManagementAccess access =
          await widget.session.api.managementAccess();
      if (!access.canReviewExplanations) {
        throw const ApiException(
            'Quyền quản lý giải trình không còn hiệu lực. Bạn vẫn có thể dùng các chức năng nhân viên.',
            code: 'EXPLANATION_SCOPE_REQUIRED',
            status: 403);
      }
      final List<AttendanceExplanation> items =
          await widget.session.api.managedExplanations();
      if (mounted && owner != null && widget.session.user?.id == owner) {
        setState(() {
          _items = items;
          _access = access;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = explanationProcessingError(error));
    } on Object {
      if (mounted) {
        setState(() => _error = 'Chưa thể tải khu vực quản lý. Hãy thử lại.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(AttendanceExplanation item) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
        builder: (_) =>
            ExplanationDetailScreen(session: widget.session, id: item.id)));
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final List<AttendanceExplanation> visible = _visible;
    final List<AttendanceExplanation> page =
        visible.skip(_page * _pageSize).take(_pageSize).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Xử lý giải trình'), actions: <Widget>[
        IconButton(
            tooltip: 'Tải lại quyền và danh sách',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded))
      ]),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              const AppPageIntro(
                  eyebrow: 'Khu vực quản lý',
                  title: 'Đơn được giao',
                  description:
                      'Leader xác nhận, Trưởng phòng duyệt hoặc từ chối. Chỉ hiển thị đơn Backend cho phép xem; không duyệt thay hoặc bỏ bước.'),
              const SizedBox(height: 20),
              if (_loading)
                const AppLoadingState(
                    label: 'Đang kiểm tra quyền và tải giải trình…')
              else if (_error != null)
                AppErrorState(message: _error!, onRetry: _load)
              else if (_access != null) ...<Widget>[
                ExpansionTile(
                    title: const Text('Phạm vi hiện hành'),
                    children: _access!.grants
                        .map((ManagementGrantView grant) => ListTile(
                              title: Text(
                                  '${grant.roleCode == 'TEAM_LEADER' ? 'Leader' : 'Trưởng phòng'} · ${grant.teamName ?? grant.departmentName ?? 'Phạm vi được cấp'}'),
                              subtitle: Text(
                                  '${grant.appointmentType == 'TEMPORARY' ? 'Tạm thời' : 'Chính thức'} · ${grant.validUntil == null ? 'Vô thời hạn' : 'Đến ${explanationTime(grant.validUntil!)}'}'),
                            ))
                        .toList()),
                const SizedBox(height: 16),
                TextField(
                    controller: _searchController,
                    decoration: const InputDecoration(
                        labelText: 'Tìm mã, tên nhân viên, ngày hoặc team',
                        prefixIcon: Icon(Icons.search_rounded)),
                    onChanged: (String value) => setState(() {
                          _search = value;
                          _page = 0;
                        })),
                const SizedBox(height: 16),
                AppListFilters(
                    options: const <String, String>{
                      'ACTIONABLE': 'Cần tôi xử lý',
                      'ALL': 'Tất cả',
                      'LEADER_CONFIRMATION': 'Chờ Leader',
                      'HEAD_APPROVAL': 'Chờ Trưởng phòng',
                      'WAITING_ROUTING': 'Chờ phân tuyến',
                      'COMPLETED': 'Đã quyết định'
                    },
                    selected: _filter,
                    onSelected: (String value) => setState(() {
                          _filter = value;
                          _page = 0;
                        }),
                    visibleCount: visible.length,
                    loadedCount: _items.length,
                    scopeNote:
                        'Lọc/phân trang trên danh sách được phép đã tải. Làm mới để kiểm tra lại quyền và bước xử lý.'),
                const SizedBox(height: 16),
                if (_items.isEmpty)
                  const AppEmptyState(
                      title: 'Chưa có đơn được giao',
                      description:
                          'Có quyền quản lý không đồng nghĩa được xem mọi đơn. Admin cần chỉ định bạn trong tuyến phù hợp.',
                      icon: Icons.assignment_turned_in_outlined)
                else if (visible.isEmpty)
                  AppFilteredEmptyState(
                      onClear: () => setState(() {
                            _searchController.clear();
                            _filter = 'ALL';
                            _search = '';
                            _page = 0;
                          }))
                else ...<Widget>[
                  ...page.map((AttendanceExplanation item) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Card(
                          child: InkWell(
                              onTap: () => _open(item),
                              child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: <Widget>[
                                        Text(
                                            '${item.fullName ?? 'Nhân viên'} · ${item.employeeCode ?? ''}',
                                            style: const TextStyle(
                                                fontSize: 17,
                                                fontWeight: FontWeight.w800)),
                                        Text(
                                            '${item.workDate} · ${explanationIssueLabel(item.issueType)}'),
                                        ExplanationWorkflowView(item: item),
                                        const SizedBox(height: 12),
                                        const AppListOpenHint(
                                            label: 'Xem đơn, ảnh và lịch sử'),
                                      ])))))),
                  Wrap(
                      spacing: 12,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        TextButton(
                            onPressed: _page == 0
                                ? null
                                : () => setState(() => _page--),
                            child: const Text('Trước')),
                        Text(
                            'Trang ${_page + 1} / ${(visible.length / _pageSize).ceil()}'),
                        TextButton(
                            onPressed: (_page + 1) * _pageSize >= visible.length
                                ? null
                                : () => setState(() => _page++),
                            child: const Text('Sau')),
                      ]),
                ],
              ],
            ]),
      ),
    );
  }
}

class ExplanationDetailScreen extends StatefulWidget {
  const ExplanationDetailScreen(
      {required this.session,
      required this.id,
      this.managed = true,
      super.key});
  final SessionController session;
  final String id;
  final bool managed;

  @override
  State<ExplanationDetailScreen> createState() =>
      _ExplanationDetailScreenState();
}

class _ExplanationDetailScreenState extends State<ExplanationDetailScreen>
    with WidgetsBindingObserver {
  AttendanceExplanation? _item;
  List<ExplanationHistoryEntry> _history = <ExplanationHistoryEntry>[];
  Uint8List? _image;
  bool _loading = false;
  bool _sending = false;
  bool _dialogOpen = false;
  bool _imageLoading = false;
  int _revision = 0;
  String? _error;
  String? _imageError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_onSessionChanged);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (mounted && widget.session.user == null) {
      _revision++;
      setState(() {
        _item = null;
        _history = <ExplanationHistoryEntry>[];
        _image = null;
        _error = 'Phiên đăng nhập đã kết thúc.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading || _sending) return;
    final int revision = ++_revision;
    final String? owner = widget.session.user?.id;
    setState(() {
      _loading = true;
      _item = null;
      _history = <ExplanationHistoryEntry>[];
      _image = null;
      _error = null;
      _imageError = null;
    });
    try {
      if (widget.managed &&
          !(await widget.session.api.managementAccess())
              .canReviewExplanations) {
        throw const ApiException('Quyền quản lý không còn hiệu lực.',
            code: 'EXPLANATION_SCOPE_REQUIRED', status: 403);
      }
      final List<AttendanceExplanation> items = widget.managed
          ? await widget.session.api.managedExplanations()
          : await widget.session.api.myAttendanceExplanations();
      final AttendanceExplanation item = items.firstWhere(
          (AttendanceExplanation item) => item.id == widget.id,
          orElse: () => throw ApiException(
              widget.managed
                  ? 'Đơn không còn trong phạm vi được xem.'
                  : 'Đơn không còn trong danh sách 100 đơn mới nhất. Hãy làm mới danh sách.',
              code: widget.managed
                  ? 'EXPLANATION_NOT_FOUND'
                  : 'EXPLANATION_NOT_LOADED',
              status: 404));
      final List<ExplanationHistoryEntry> history =
          await widget.session.api.explanationHistory(item.id);
      if (mounted &&
          revision == _revision &&
          owner != null &&
          owner == widget.session.user?.id) {
        setState(() {
          _item = item;
          _history = history;
        });
      }
    } on ApiException catch (error) {
      if (mounted && revision == _revision) {
        setState(() => _error = explanationProcessingError(error));
      }
    } on Object {
      if (mounted && revision == _revision) {
        setState(() => _error = 'Chưa thể tải chi tiết đơn. Hãy thử lại.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadImage() async {
    final AttendanceExplanation? item = _item;
    if (_imageLoading ||
        _loading ||
        _sending ||
        item?.evidenceImageReference == null) {
      return;
    }
    final int revision = _revision;
    setState(() {
      _imageLoading = true;
      _imageError = null;
      _image = null;
    });
    try {
      final Uint8List bytes = await widget.session.api
          .explanationEvidence(item!.evidenceImageReference!);
      if (mounted && revision == _revision) setState(() => _image = bytes);
    } on ApiException catch (error) {
      if (mounted && revision == _revision) {
        setState(() {
          _imageError = explanationProcessingError(error);
          _error =
              'Chưa thể xác minh quyền đọc ảnh. Tải lại đơn trước khi xử lý.';
        });
      }
    } on Object {
      if (mounted && revision == _revision) {
        setState(() => _error =
            'Chưa thể tải ảnh minh chứng. Hãy tải lại đơn trước khi xử lý.');
      }
    } finally {
      if (mounted) setState(() => _imageLoading = false);
    }
  }

  Future<void> _decide(String action) async {
    final AttendanceExplanation? item = _item;
    if (_loading ||
        _sending ||
        _dialogOpen ||
        _imageLoading ||
        _error != null ||
        item == null ||
        item.routeVersion == null) {
      return;
    }
    if (action == 'CONFIRM' ? !item.canConfirm : !item.canReview) return;
    _dialogOpen = true;
    final String title = action == 'CONFIRM'
        ? 'Xác nhận bước Leader'
        : action == 'APPROVE'
            ? 'Duyệt giải trình'
            : 'Từ chối giải trình';
    final int revision = _revision;
    String? message;
    try {
      message = await showDialog<String>(
          context: context,
          builder: (_) =>
              _DecisionDialog(title: title, confirm: action == 'CONFIRM'));
    } finally {
      _dialogOpen = false;
    }
    if (!mounted || message == null) return;
    if (revision != _revision ||
        _loading ||
        _error != null ||
        widget.session.user == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Đơn đã làm mới. Vui lòng kiểm tra lại trước khi quyết định.')));
      return;
    }
    setState(() => _sending = true);
    try {
      if (action == 'CONFIRM') {
        await widget.session.api.confirmExplanation(item, message);
      } else {
        await widget.session.api.reviewExplanation(item,
            approve: action == 'APPROVE', note: message);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(action == 'CONFIRM'
                ? 'Đã xác nhận. Đơn chuyển tới Trưởng phòng.'
                : 'Đã lưu quyết định.')));
      }
      widget.session.announceInboxChanged();
      if (mounted) {
        setState(() => _sending = false);
        await _load();
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _item = null;
          _history = <ExplanationHistoryEntry>[];
          _image = null;
          _error =
              '${explanationProcessingError(error)}\nKhông tự gửi lại quyết định. Tải lại để kiểm tra trạng thái đã lưu trước khi thử tiếp.';
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _item = null;
          _history = <ExplanationHistoryEntry>[];
          _image = null;
          _error =
              'Chưa xác định kết quả. Không tự gửi lại; hãy tải lại để kiểm tra.';
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AttendanceExplanation? item = _item;
    final bool actionable = widget.managed &&
        item != null &&
        item.routeVersion != null &&
        _error == null &&
        !_loading &&
        !_imageLoading;
    return PopScope(
        canPop: !_sending,
        child: Scaffold(
          appBar: AppBar(
              title: const Text('Chi tiết giải trình'),
              actions: <Widget>[
                IconButton(
                    tooltip: 'Tải lại đơn',
                    onPressed: _loading || _sending ? null : _load,
                    icon: const Icon(Icons.refresh_rounded))
              ]),
          body: RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: <Widget>[
                    if (_loading)
                      const AppLoadingState(
                          label: 'Đang kiểm tra đơn và lịch sử…')
                    else if (_error != null)
                      AppErrorState(
                          message: _error!, onRetry: _sending ? null : _load)
                    else if (item != null) ...<Widget>[
                      AppPageIntro(
                          eyebrow: item.employeeCode ?? 'Đơn của bạn',
                          title: item.fullName ?? 'Giải trình',
                          description:
                              '${item.workDate} · ${explanationIssueLabel(item.issueType)}'),
                      ExplanationWorkflowView(item: item),
                      const SizedBox(height: 20),
                      const Text('Nội dung giải trình',
                          style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      SelectableText(item.responseText ?? item.requestNote),
                      if (item.reviewNote?.isNotEmpty == true) ...<Widget>[
                        const SizedBox(height: 12),
                        Text('Ghi chú quyết định: ${item.reviewNote}')
                      ],
                      const SizedBox(height: 20),
                      if (item.evidenceImageReference != null) ...<Widget>[
                        OutlinedButton.icon(
                            onPressed:
                                _imageLoading || _sending ? null : _loadImage,
                            icon: const Icon(Icons.image_outlined),
                            label: Text(_imageLoading
                                ? 'Đang tải ảnh…'
                                : 'Xem ảnh minh chứng')),
                        if (_image != null)
                          Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Image.memory(_image!,
                                  gaplessPlayback: false,
                                  errorBuilder: (_, __, ___) => const Text(
                                      'Không thể hiển thị ảnh minh chứng.'))),
                        if (_imageError != null)
                          Text(_imageError!,
                              style: const TextStyle(color: brandDanger)),
                      ] else
                        const Text('Không có ảnh minh chứng.',
                            style: TextStyle(color: brandMuted)),
                      const SizedBox(height: 20),
                      const Text('Lịch sử xử lý',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w800)),
                      if (_history.isEmpty)
                        const Text('Chưa có bản ghi lịch sử từ Backend.'),
                      ..._history.map((ExplanationHistoryEntry entry) =>
                          _HistoryTile(entry: entry)),
                      if (widget.managed && !item.canConfirm && !item.canReview)
                        const Padding(
                            padding: EdgeInsets.only(top: 16),
                            child: Text(
                                'Bạn có thể xem đơn nhưng hiện không có bước được phép xử lý.',
                                style: TextStyle(color: brandMuted))),
                    ],
                  ])),
          bottomNavigationBar: !actionable
              ? null
              : SafeArea(
                  top: false,
                  child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            if (item.canConfirm)
                              AppFormAction(
                                  label: 'Xác nhận và chuyển Trưởng phòng',
                                  icon: Icons.verified_outlined,
                                  busy: _sending,
                                  onPressed: () => _decide('CONFIRM')),
                            if (item.canReview) ...<Widget>[
                              AppFormAction(
                                  label: 'Duyệt giải trình',
                                  icon: Icons.check_circle_outline_rounded,
                                  busy: _sending,
                                  onPressed: () => _decide('APPROVE')),
                              const SizedBox(height: 8),
                              OutlinedButton(
                                  onPressed:
                                      _sending ? null : () => _decide('REJECT'),
                                  child: const Text('Từ chối',
                                      style: TextStyle(color: brandDanger))),
                            ],
                          ]))),
        ));
  }
}

class _DecisionDialog extends StatefulWidget {
  const _DecisionDialog({required this.title, required this.confirm});
  final String title;
  final bool confirm;

  @override
  State<_DecisionDialog> createState() => _DecisionDialogState();
}

class _DecisionDialogState extends State<_DecisionDialog> {
  final TextEditingController _note = TextEditingController();
  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: SingleChildScrollView(
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
              Text(widget.confirm
                  ? 'Xác nhận chuyển đơn tới Trưởng phòng. Đây không phải quyết định duyệt cuối cùng.'
                  : 'Quyết định sẽ được lưu cùng người xử lý và gửi thông báo cho nhân viên. Không tự sửa bảng công.'),
              const SizedBox(height: 16),
              TextField(
                  controller: _note,
                  maxLength: 2000,
                  minLines: 2,
                  maxLines: 5,
                  decoration: const InputDecoration(
                      labelText: 'Ghi chú / lý do (không bắt buộc)')),
            ])),
        actions: <Widget>[
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Quay lại')),
          FilledButton(
              onPressed: () => Navigator.pop(context, _note.text),
              child: Text(widget.title)),
        ],
      );
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});
  final ExplanationHistoryEntry entry;

  @override
  Widget build(BuildContext context) {
    final String action = switch (entry.action) {
      'EMPLOYEE_SUBMIT' || 'SUBMIT' => 'Nhân viên gửi đơn',
      'LEGACY_RESPOND' => 'Nhân viên phản hồi yêu cầu cũ',
      'WORKFLOW_START' => 'Bắt đầu xử lý hai bước',
      'ADMIN_REROUTE' => 'Admin đổi tuyến',
      'LEADER_CONFIRM' => 'Leader xác nhận',
      'HEAD_REVIEW' => 'Trưởng phòng quyết định',
      'REVIEW' => 'Quyết định lịch sử',
      _ => entry.action,
    };
    final Map<String, dynamic>? value = entry.after;
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(action, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('${entry.actorName} · ${explanationTime(entry.createdAt)}',
                  style: const TextStyle(color: brandMuted, fontSize: 12)),
              if (value?['status'] is String)
                Text(
                    'Trạng thái: ${explanationStatusLabel(value!['status'] as String)}'),
              if (value?['confirmationNote'] is String)
                Text('Ghi chú xác nhận: ${value!['confirmationNote']}'),
              if (value?['reviewNote'] is String)
                Text('Ghi chú quyết định: ${value!['reviewNote']}'),
            ]));
  }
}
