import 'dart:async';
import 'package:flutter/material.dart';
import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_list_controls.dart';
import '../../services/api_client.dart';

String leaveStageLabel(ManagedLeaveRequest item) =>
    switch (item.approvalStage) {
      'WAITING_ROUTING' => 'Chờ Admin phân tuyến',
      'LEADER_CONFIRMATION' => 'Bước 1 · Chờ Leader xác nhận',
      'HEAD_APPROVAL' => 'Bước 2 · Chờ Trưởng phòng duyệt',
      'COMPLETED' => item.request.status == 'CANCELLED' ? 'Đã hủy' : 'Đã xử lý',
      _ => 'Đơn lịch sử · không có bước xác nhận mới',
    };
String leaveStateLabel(String status) => switch (status) {
      'SUBMITTED' => 'Đang chờ',
      'APPROVED' => 'Đã duyệt',
      'REJECTED' => 'Từ chối',
      'CANCELLED' => 'Đã hủy',
      _ => status
    };

class ManagedLeaveScreen extends StatefulWidget {
  const ManagedLeaveScreen(
      {required this.session, this.mine = false, super.key});
  final SessionController session;
  final bool mine;
  @override
  State<ManagedLeaveScreen> createState() => _ManagedLeaveScreenState();
}

class _ManagedLeaveScreenState extends State<ManagedLeaveScreen>
    with WidgetsBindingObserver {
  List<ManagedLeaveRequest> _items = <ManagedLeaveRequest>[];
  bool _loading = false;
  String? _error;
  String _filter = 'OPEN', _search = '';
  int _page = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_sessionChanged);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }

  void _sessionChanged() {
    if (mounted && widget.session.user == null) {
      setState(() {
        _items = [];
        _error = 'Phiên đã kết thúc.';
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
      _items = [];
      _error = null;
      _page = 0;
    });
    final String? owner = widget.session.user?.id;
    try {
      if (!widget.mine &&
          !(await widget.session.api.managementAccess()).canReviewLeave) {
        throw const ApiException('Quyền xử lý nghỉ phép không còn hiệu lực.',
            status: 403);
      }
      final List<ManagedLeaveRequest> rows =
          await widget.session.api.managedLeaveRequests(mine: widget.mine);
      if (mounted && owner != null && owner == widget.session.user?.id) {
        setState(() => _items = rows);
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) {
        setState(() => _error = 'Không tải được đơn nghỉ. Hãy thử lại.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(ManagedLeaveRequest item) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
        builder: (_) => LeaveWorkflowDetailScreen(
            session: widget.session, id: item.request.id, mine: widget.mine)));
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final List<ManagedLeaveRequest> visible = _items
        .where((item) =>
            (switch (_filter) {
              'ALL' => true,
              'ACTION' => item.canConfirm || item.canReview,
              'OPEN' => item.request.status == 'SUBMITTED',
              _ => item.request.status == _filter
            }) &&
            '${item.employeeCode ?? ''} ${item.fullName ?? ''} ${item.request.startDate} ${item.request.policyName}'
                .toLowerCase()
                .contains(_search.trim().toLowerCase()))
        .toList();
    final int maxPage = visible.isEmpty ? 0 : (visible.length - 1) ~/ 10;
    final int page = _page.clamp(0, maxPage);
    return Scaffold(
        appBar: AppBar(
            title: Text(
                widget.mine ? 'Tuyến đơn nghỉ của tôi' : 'Xử lý nghỉ phép'),
            actions: [
              IconButton(
                  tooltip: 'Tải lại quyền',
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh_rounded))
            ]),
        body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [
                  AppPageIntro(
                      eyebrow:
                          widget.mine ? 'Nghỉ phép cá nhân' : 'Khu vực quản lý',
                      title: widget.mine
                          ? 'Theo dõi tuyến duyệt'
                          : 'Leader → Trưởng phòng',
                      description:
                          'Xác nhận không phải quyết định cuối cùng. Backend quản lý thời lượng, số dư và quyền hiện hành; không duyệt offline.'),
                  const SizedBox(height: 16),
                  if (_loading)
                    const AppLoadingState(label: 'Đang tải quyền và đơn nghỉ…')
                  else if (_error != null)
                    AppErrorState(message: _error!, onRetry: _load)
                  else ...[
                    AppListFilters(
                        options: {
                          'OPEN': 'Đang chờ',
                          if (!widget.mine) 'ACTION': 'Đến lượt tôi',
                          'ALL': 'Tất cả',
                          'APPROVED': 'Đã duyệt',
                          'REJECTED': 'Từ chối',
                          'CANCELLED': 'Đã hủy'
                        },
                        selected: _filter,
                        onSelected: (value) => setState(() {
                              _filter = value;
                              _page = 0;
                            }),
                        loadedCount: _items.length,
                        visibleCount: visible.length),
                    const SizedBox(height: 12),
                    TextField(
                        decoration: const InputDecoration(
                            labelText: 'Tìm nhân viên / ngày / chính sách',
                            prefixIcon: Icon(Icons.search_rounded)),
                        onChanged: (value) => setState(() {
                              _search = value;
                              _page = 0;
                            })),
                    const SizedBox(height: 16),
                    if (visible.isEmpty)
                      const AppEmptyState(
                          title: 'Chưa có đơn phù hợp',
                          description: 'Thử đổi bộ lọc hoặc tải lại.',
                          icon: Icons.event_available_outlined),
                    ...visible.skip(page * 10).take(10).map((item) => Card(
                        child: ListTile(
                            contentPadding: const EdgeInsets.all(16),
                            title: Text(widget.mine
                                ? item.request.policyName
                                : '${item.employeeCode ?? ''} · ${item.fullName ?? ''}'),
                            subtitle: Text(
                                '${item.request.startDate} — ${item.request.endDate}\n${item.request.requestedMinutes} phút · ${leaveStateLabel(item.request.status)}\n${leaveStageLabel(item)}'),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: () => _open(item)))),
                    if (visible.length > 10)
                      Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            TextButton(
                                onPressed: page == 0
                                    ? null
                                    : () => setState(() => _page = page - 1),
                                child: const Text('Trước')),
                            Text('${page + 1}/${maxPage + 1}'),
                            TextButton(
                                onPressed: page >= maxPage
                                    ? null
                                    : () => setState(() => _page = page + 1),
                                child: const Text('Sau'))
                          ]),
                  ],
                ])));
  }
}

class LeaveWorkflowDetailScreen extends StatefulWidget {
  const LeaveWorkflowDetailScreen(
      {required this.session, required this.id, this.mine = false, super.key});
  final SessionController session;
  final String id;
  final bool mine;
  @override
  State<LeaveWorkflowDetailScreen> createState() =>
      _LeaveWorkflowDetailScreenState();
}

class _LeaveWorkflowDetailScreenState extends State<LeaveWorkflowDetailScreen>
    with WidgetsBindingObserver {
  ManagedLeaveRequest? _item;
  List<ExplanationHistoryEntry> _history = [];
  bool _loading = false, _sending = false;
  String? _error;
  int _revision = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_sessionChanged);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }

  void _sessionChanged() {
    if (mounted && widget.session.user == null) {
      setState(() {
        _item = null;
        _history = [];
        _revision++;
        _error = 'Phiên đã kết thúc.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _revision++;
      if (!_sending) unawaited(_load());
    }
  }

  Future<void> _load() async {
    if (_loading || _sending) return;
    setState(() {
      _loading = true;
      _item = null;
      _history = [];
      _error = null;
      _revision++;
    });
    final String? owner = widget.session.user?.id;
    try {
      if (!widget.mine &&
          !(await widget.session.api.managementAccess()).canReviewLeave) {
        throw const ApiException('Quyền quản lý đã thay đổi.', status: 403);
      }
      final List<ManagedLeaveRequest> rows =
          await widget.session.api.managedLeaveRequests(mine: widget.mine);
      final ManagedLeaveRequest? item =
          rows.where((r) => r.request.id == widget.id).firstOrNull;
      if (item == null) {
        throw const ApiException(
            'Đơn không còn trong phạm vi. Hãy quay lại danh sách.');
      }
      final List<ExplanationHistoryEntry> history =
          await widget.session.api.leaveHistory(widget.id);
      if (mounted && owner != null && owner == widget.session.user?.id) {
        setState(() {
          _item = item;
          _history = history;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on Object {
      if (mounted) setState(() => _error = 'Chưa thể tải chi tiết đơn.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(String action) async {
    final ManagedLeaveRequest? item = _item;
    if (_sending || _loading || item == null || widget.mine) return;
    if (action == 'CONFIRM' ? !item.canConfirm : !item.canReview) return;
    final int revision = _revision;
    setState(() => _sending = true);
    try {
      final String? note = await showDialog<String>(
          context: context,
          builder: (_) => _LeaveDecisionDialog(action: action));
      if (note == null) return;
      if (!mounted || _revision != revision || widget.session.user == null) {
        if (mounted) {
          setState(() {
            _item = null;
            _history = [];
            _error =
                'Ứng dụng vừa trở lại hoặc quyền đã thay đổi. Tải lại trước khi xử lý.';
          });
        }
        return;
      }
      await widget.session.api.processLeave(item, action: action, note: note);
      if (mounted) {
        setState(() {
          _item = null;
          _history = [];
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Đã ghi nhận bước xử lý và thông báo trong hộp thư.')));
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _item = null;
          _history = [];
          _error =
              '${error.message}\nTải lại để kiểm tra kết quả; không tự gửi lại quyết định.';
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _item = null;
          _history = [];
          _error =
              'Chưa rõ kết quả. Tải lại để kiểm tra; không gửi lại tự động.';
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
    if (mounted && _error == null) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final ManagedLeaveRequest? item = _item;
    return PopScope(
        canPop: !_sending,
        child: Scaffold(
            appBar: AppBar(title: const Text('Chi tiết đơn nghỉ'), actions: [
              IconButton(
                  tooltip: 'Tải lại quyền và đơn',
                  onPressed: _loading || _sending ? null : _load,
                  icon: const Icon(Icons.refresh_rounded))
            ]),
            body: ListView(padding: const EdgeInsets.all(20), children: [
              if (_loading)
                const AppLoadingState(label: 'Đang tải chi tiết…')
              else if (_error != null)
                AppErrorState(message: _error!, onRetry: _load)
              else if (item != null) ...[
                Text(item.fullName ?? 'Đơn nghỉ của tôi',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                    '${item.request.policyName} · ${leaveStateLabel(item.request.status)}'),
                Text(leaveStageLabel(item)),
                const SizedBox(height: 16),
                Text(
                    '${item.request.startDate} — ${item.request.endDate} · ${item.request.requestedMinutes} phút'),
                if (item.request.durationType == 'HALF_DAY')
                  Text(item.request.halfDayPeriod == 'AM'
                      ? 'Nửa ngày · buổi sáng'
                      : 'Nửa ngày · buổi chiều'),
                if (item.request.durationType == 'HOURS')
                  Text(
                      '${item.request.startTime ?? ''} — ${item.request.endTime ?? ''}'),
                const SizedBox(height: 12),
                Text(item.request.reason),
                const Divider(height: 32),
                if (item.teamName != null)
                  Text(
                      '${item.request.departmentName ?? ''} / ${item.teamName}'),
                if (item.leaderName != null)
                  Text('Leader được chỉ định: ${item.leaderName}'),
                if (item.headName != null)
                  Text('Trưởng phòng được chỉ định: ${item.headName}'),
                if (item.confirmedAt != null)
                  Text(
                      'Đã xác nhận: ${item.confirmedByName ?? '—'} · ${item.confirmedAt}${item.confirmationNote == null ? '' : '\n${item.confirmationNote}'}'),
                if (item.request.reviewedAt != null)
                  Text(
                      'Người quyết định: ${item.request.reviewedByName ?? '—'} · ${item.request.reviewedAt}${item.request.reviewNote == null ? '' : '\n${item.request.reviewNote}'}'),
                if (item.request.cancelledAt != null)
                  Text(
                      'Đã hủy: ${item.request.cancelledAt}\n${item.request.cancellationReason ?? ''}'),
                const Divider(height: 32),
                Text('Lịch sử xử lý',
                    style: Theme.of(context).textTheme.titleMedium),
                if (_history.isEmpty)
                  const Text(
                      'Chưa có audit theo luồng mới; không tạo lịch sử giả.'),
                ..._history.map((entry) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(switch (entry.action) {
                      'SUBMIT' => 'Gửi đơn',
                      'WORKFLOW_START' => 'Tiếp nhận hai bước',
                      'ADMIN_REROUTE' => 'Admin đổi tuyến',
                      'LEADER_CONFIRM' => 'Leader xác nhận',
                      'HEAD_REVIEW' => 'Trưởng phòng quyết định',
                      'CANCEL' => 'Hủy đơn',
                      _ => entry.action
                    }),
                    subtitle: Text(
                        '${entry.actorName} · ${entry.createdAt}\n${entry.after?['reviewNote'] ?? entry.after?['confirmationNote'] ?? entry.after?['reason'] ?? ''}'))),
                if (!widget.mine && !item.canConfirm && !item.canReview)
                  const Text('Hiện chưa có bước bạn được phép xử lý.'),
              ],
            ]),
            bottomNavigationBar: item == null ||
                    widget.mine ||
                    (!item.canConfirm && !item.canReview)
                ? null
                : SafeArea(
                    top: false,
                    child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          if (item.canConfirm)
                            FilledButton(
                                onPressed:
                                    _sending ? null : () => _decide('CONFIRM'),
                                child: Text(_sending
                                    ? 'Đang xử lý…'
                                    : 'Xác nhận và chuyển Trưởng phòng')),
                          if (item.canReview) ...[
                            FilledButton(
                                onPressed:
                                    _sending ? null : () => _decide('APPROVED'),
                                child: Text(_sending
                                    ? 'Đang xử lý…'
                                    : 'Duyệt đơn nghỉ')),
                            OutlinedButton(
                                onPressed:
                                    _sending ? null : () => _decide('REJECTED'),
                                child: const Text('Từ chối'))
                          ],
                        ])))));
  }
}

class _LeaveDecisionDialog extends StatefulWidget {
  const _LeaveDecisionDialog({required this.action});
  final String action;
  @override
  State<_LeaveDecisionDialog> createState() => _LeaveDecisionDialogState();
}

class _LeaveDecisionDialogState extends State<_LeaveDecisionDialog> {
  final TextEditingController _note = TextEditingController();
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(widget.action == 'CONFIRM'
              ? 'Xác nhận bước 1'
              : widget.action == 'APPROVED'
                  ? 'Duyệt đơn nghỉ'
                  : 'Từ chối đơn nghỉ'),
          content: SingleChildScrollView(
              child: Form(
                  key: _form,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(widget.action == 'CONFIRM'
                        ? 'Đơn vẫn chờ Trưởng phòng; chưa trừ phép thành đã duyệt.'
                        : 'Quyết định cuối được lưu cùng người xử lý và thông báo cho nhân viên.'),
                    const SizedBox(height: 16),
                    TextFormField(
                        controller: _note,
                        minLines: 2,
                        maxLines: 5,
                        maxLength: 2000,
                        decoration: InputDecoration(
                            labelText: widget.action == 'REJECTED'
                                ? 'Lý do từ chối (bắt buộc)'
                                : 'Ghi chú (tùy chọn)'),
                        validator: (value) => widget.action == 'REJECTED' &&
                                (value?.trim().length ?? 0) < 5
                            ? 'Cần ít nhất 5 ký tự.'
                            : null),
                  ]))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Quay lại')),
            FilledButton(
                onPressed: () {
                  if (_form.currentState!.validate()) {
                    Navigator.pop(context, _note.text.trim());
                  }
                },
                child: const Text('Xác nhận'))
          ]);
}
