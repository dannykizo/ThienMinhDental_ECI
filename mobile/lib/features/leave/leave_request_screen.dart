import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_form_controls.dart';
import '../../presentation/widgets/app_list_controls.dart';
import '../../services/api_client.dart';

class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  List<EmployeeLeaveRequest> _items = <EmployeeLeaveRequest>[];
  List<LeavePolicy> _policies = <LeavePolicy>[];
  List<LeaveBalance> _balances = <LeaveBalance>[];
  String? _error;
  bool _loading = true;
  bool _hasLoaded = false;
  String _filter = 'ALL';

  List<EmployeeLeaveRequest> get _visibleItems => _items
      .where((EmployeeLeaveRequest item) =>
          _filter == 'ALL' || item.status == _filter)
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
      final List<dynamic> result = await Future.wait<dynamic>(<Future<dynamic>>[
        widget.session.api.myLeaveRequests(),
        widget.session.api.leavePolicies(),
        widget.session.api.myLeaveBalances(DateTime.now().year),
      ]);
      if (!mounted) return;
      setState(() {
        _items = result[0] as List<EmployeeLeaveRequest>;
        _policies = result[1] as List<LeavePolicy>;
        _balances = result[2] as List<LeaveBalance>;
        _hasLoaded = true;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    if (_policies.isEmpty) {
      setState(() => _error = 'Chưa có chính sách nghỉ phép đang áp dụng.');
      return;
    }
    final bool? created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (BuildContext context) => CreateLeaveRequestScreen(
          policies: _policies,
          session: widget.session,
        ),
      ),
    );
    if (created == true) await _load();
  }

  Future<void> _cancel(EmployeeLeaveRequest item) async {
    final TextEditingController controller = TextEditingController();
    final String? reason = await showDialog<String>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const Text('Hủy đơn nghỉ'),
        content: TextField(
          autofocus: true,
          controller: controller,
          maxLength: 2000,
          maxLines: 3,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            labelText: 'Lý do hủy',
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Quay lại'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().length >= 5) {
                Navigator.of(context).pop(controller.text.trim());
              }
            },
            child: const Text('Xác nhận hủy'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null || !mounted) return;
    try {
      await widget.session.api.cancelLeaveRequest(
        leaveRequestId: item.id,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã hủy đơn nghỉ và hoàn lại số dư.')),
      );
      await _load();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: brandCanvas,
          surfaceTintColor: Colors.transparent,
          title: const Text(
            'Đơn nghỉ phép',
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
                eyebrow: 'Nghỉ phép của bạn',
                title: 'Đơn nghỉ của bạn',
                description:
                    'Loại nghỉ, thời lượng và quyền hủy do công ty cấu hình. App hiển thị đúng kết quả do Backend tính toán.',
              ),
              if (_error != null && _items.isNotEmpty) ...<Widget>[
                const SizedBox(height: 16),
                AppErrorState(
                  compact: true,
                  message: _error!,
                  onRetry: _load,
                  title: 'Chưa thể làm mới dữ liệu phép',
                ),
              ],
              if (_balances.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                const Text(
                  'SỐ DƯ NĂM NAY',
                  style: TextStyle(
                    color: Color(0xFF817683),
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                ..._balances.map(
                  (LeaveBalance item) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _BalanceCard(item: item),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              if (_hasLoaded) ...<Widget>[
                AppListFilters(
                  options: const <String, String>{
                    'ALL': 'Tất cả',
                    'SUBMITTED': 'Chờ duyệt',
                    'APPROVED': 'Đã duyệt',
                    'REJECTED': 'Từ chối',
                    'CANCELLED': 'Đã hủy',
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
                  label: 'Đang tải đơn và số dư phép…',
                )
              else if (_error != null && _items.isEmpty)
                AppErrorState(message: _error!, onRetry: _load)
              else if (_items.isEmpty)
                const AppEmptyState(
                  description: 'Nhấn “Tạo đơn nghỉ” để gửi yêu cầu đầu tiên.',
                  icon: Icons.event_available_rounded,
                  title: 'Bạn chưa có đơn nghỉ nào',
                )
              else if (_visibleItems.isEmpty)
                AppFilteredEmptyState(
                  onClear: () => setState(() => _filter = 'ALL'),
                )
              else
                ..._visibleItems.map(
                  (EmployeeLeaveRequest item) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LeaveCard(
                      item: item,
                      onCancel: item.status == 'SUBMITTED' ||
                              (item.status == 'APPROVED' &&
                                  item.allowApprovedCancellation)
                          ? () => _cancel(item)
                          : null,
                    ),
                  ),
                ),
            ],
          ),
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: brandLine)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
              child: FilledButton.icon(
                onPressed: _loading ? null : _create,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 54),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                ),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Tạo đơn nghỉ'),
              ),
            ),
          ),
        ),
      );
}

class CreateLeaveRequestScreen extends StatefulWidget {
  const CreateLeaveRequestScreen({
    required this.policies,
    required this.session,
    super.key,
  });

  final List<LeavePolicy> policies;
  final SessionController session;

  @override
  State<CreateLeaveRequestScreen> createState() =>
      _CreateLeaveRequestScreenState();
}

class _CreateLeaveRequestScreenState extends State<CreateLeaveRequestScreen> {
  final TextEditingController _reason = TextEditingController();
  String _durationType = 'FULL_DAY';
  late DateTime _endDate;
  TimeOfDay _endTime = const TimeOfDay(hour: 17, minute: 0);
  String? _error;
  String? _reasonError;
  String _halfDayPeriod = 'AM';
  late LeavePolicy _policy;
  late DateTime _startDate;
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _policy = widget.policies.first;
    final DateTime tomorrow = DateUtils.dateOnly(
      DateTime.now().add(const Duration(days: 1)),
    );
    _startDate = tomorrow;
    _endDate = tomorrow;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickStartDate() async {
    final DateTime? selected = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      initialDate: _startDate,
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) return;
    setState(() {
      _startDate = DateUtils.dateOnly(selected);
      if (_durationType != 'FULL_DAY' || _endDate.isBefore(_startDate)) {
        _endDate = _startDate;
      }
    });
  }

  Future<void> _pickEndDate() async {
    final DateTime? selected = await showDatePicker(
      context: context,
      firstDate: _startDate,
      initialDate: _endDate.isBefore(_startDate) ? _startDate : _endDate,
      lastDate: DateTime(2100),
    );
    if (selected != null && mounted) {
      setState(() => _endDate = DateUtils.dateOnly(selected));
    }
  }

  Future<void> _pickTime({required bool start}) async {
    final TimeOfDay? selected = await showTimePicker(
      context: context,
      initialTime: start ? _startTime : _endTime,
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (start) {
        _startTime = selected;
      } else {
        _endTime = selected;
      }
    });
  }

  Future<void> _submit() async {
    if (_submitting) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final String reason = _reason.text.trim();
    if (reason.length < 3) {
      setState(() => _reasonError = 'Lý do nghỉ cần ít nhất 3 ký tự.');
      return;
    }
    setState(() {
      _error = null;
      _reasonError = null;
      _submitting = true;
    });
    try {
      await widget.session.api.createLeaveRequest(
        durationType: _durationType,
        endDate: _apiDate(_durationType == 'FULL_DAY' ? _endDate : _startDate),
        endTime: _durationType == 'HOURS' ? _apiTime(_endTime) : null,
        halfDayPeriod: _durationType == 'HALF_DAY' ? _halfDayPeriod : null,
        policyId: _policy.id,
        reason: reason,
        startDate: _apiDate(_startDate),
        startTime: _durationType == 'HOURS' ? _apiTime(_startTime) : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã gửi đơn nghỉ để chờ duyệt.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !_submitting,
        child: Scaffold(
          appBar: AppBar(
            title: const Text(
              'Tạo đơn nghỉ',
            ),
          ),
          body: SafeArea(
            top: false,
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: <Widget>[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: const BoxDecoration(
                    color: Color(0xFFF2EAF5),
                    border:
                        Border(left: BorderSide(color: brandPurple, width: 3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Icon(Icons.policy_outlined, color: brandPurple),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _policy.minimumNoticeDays > 0
                              ? 'Chính sách này yêu cầu gửi trước ít nhất ${_policy.minimumNoticeDays} ngày. Backend sẽ kiểm tra số dư và lịch làm việc.'
                              : 'Backend sẽ kiểm tra số dư, lịch làm việc, ngày trùng và kỳ công trước khi tiếp nhận.',
                          style: const TextStyle(fontSize: 12, height: 1.45),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const AppFormSection(
                    title: '1. Thời gian nghỉ',
                    description:
                        'Chọn chính sách và thời gian. Các mục có * là bắt buộc.'),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  itemHeight: null,
                  initialValue: _policy.id,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: 'Chính sách nghỉ *',
                  ),
                  items: widget.policies
                      .map((LeavePolicy item) => DropdownMenuItem<String>(
                            value: item.id,
                            child: Text(item.name),
                          ))
                      .toList(),
                  onChanged: _submitting
                      ? null
                      : (String? value) {
                          final LeavePolicy? selected = widget.policies
                              .where((LeavePolicy item) => item.id == value)
                              .firstOrNull;
                          if (selected != null) {
                            setState(() {
                              _policy = selected;
                              _durationType = 'FULL_DAY';
                            });
                          }
                        },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  key: ValueKey<String>('${_policy.id}:$_durationType'),
                  initialValue: _durationType,
                  isExpanded: true,
                  itemHeight: null,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: 'Hình thức nghỉ *',
                  ),
                  items: <DropdownMenuItem<String>>[
                    const DropdownMenuItem(
                      value: 'FULL_DAY',
                      child: Text('Cả ngày / nhiều ngày'),
                    ),
                    if (_policy.allowHalfDay)
                      const DropdownMenuItem(
                        value: 'HALF_DAY',
                        child: Text('Nửa ngày'),
                      ),
                    if (_policy.allowHourly)
                      const DropdownMenuItem(
                        value: 'HOURS',
                        child: Text('Theo giờ'),
                      ),
                  ],
                  onChanged: _submitting
                      ? null
                      : (String? value) {
                          if (value != null) {
                            setState(() {
                              _durationType = value;
                              if (value != 'FULL_DAY') _endDate = _startDate;
                            });
                          }
                        },
                ),
                const SizedBox(height: 16),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: _DateField(
                        label: _durationType == 'FULL_DAY'
                            ? 'Từ ngày'
                            : 'Ngày nghỉ',
                        onTap: _submitting ? null : _pickStartDate,
                        value: _displayDate(_startDate),
                      ),
                    ),
                    if (_durationType == 'FULL_DAY') ...<Widget>[
                      const SizedBox(width: 12),
                      Expanded(
                        child: _DateField(
                          label: 'Đến ngày',
                          onTap: _submitting ? null : _pickEndDate,
                          value: _displayDate(_endDate),
                        ),
                      ),
                    ],
                  ],
                ),
                if (_durationType == 'HALF_DAY') ...<Widget>[
                  const SizedBox(height: 16),
                  const Text('Buổi nghỉ *',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      for (final String period in <String>['AM', 'PM'])
                        ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 48),
                          child: ChoiceChip(
                            label: Text(
                                period == 'AM' ? 'Buổi sáng' : 'Buổi chiều'),
                            selected: _halfDayPeriod == period,
                            onSelected: _submitting
                                ? null
                                : (_) =>
                                    setState(() => _halfDayPeriod = period),
                          ),
                        ),
                    ],
                  ),
                ],
                if (_durationType == 'HOURS') ...<Widget>[
                  const SizedBox(height: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      _TimeField(
                        label: 'Từ giờ',
                        onTap:
                            _submitting ? null : () => _pickTime(start: true),
                        value: _startTime.format(context),
                      ),
                      const SizedBox(height: 16),
                      _TimeField(
                        label: 'Đến giờ',
                        onTap:
                            _submitting ? null : () => _pickTime(start: false),
                        value: _endTime.format(context),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                const AppFormSection(
                    title: '2. Lý do nghỉ',
                    description: 'Mô tả rõ để người duyệt có đủ thông tin.'),
                TextField(
                  controller: _reason,
                  enabled: !_submitting,
                  maxLength: 2000,
                  maxLines: 5,
                  minLines: 4,
                  onChanged: (_) {
                    if (_reasonError != null) {
                      setState(() => _reasonError = null);
                    }
                  },
                  decoration: InputDecoration(
                    errorText: _reasonError,
                    errorMaxLines: 3,
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder(),
                    hintText: 'Mô tả ngắn gọn lý do cần nghỉ…',
                    labelText: 'Lý do nghỉ *',
                  ),
                ),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 4),
                  AppErrorState(
                    compact: true,
                    message: _error!,
                    title: null,
                  ),
                ],
                const SizedBox(height: 22),
                AppFormAction(
                    label: 'Gửi đơn nghỉ',
                    icon: Icons.send_rounded,
                    busy: _submitting,
                    onPressed: _submit),
                const SizedBox(height: 12),
                const Text(
                    'Đơn chỉ được ghi nhận sau khi Backend tiếp nhận thành công.',
                    style: TextStyle(
                        color: brandMuted, fontSize: 12, height: 1.45)),
              ],
            ),
          ),
        ),
      );
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.item});

  final LeaveBalance item;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: const Color(0xFFF8F5F8),
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: Row(
          children: <Widget>[
            const Icon(Icons.account_balance_wallet_outlined,
                color: brandPurple),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(item.policyName,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 3),
                  Text(
                    'Còn ${_minutesLabel(item.availableMinutes, item.dayMinutes)} · Đang chờ ${_minutesLabel(item.pendingMinutes, item.dayMinutes)}',
                    style: const TextStyle(
                      color: Color(0xFF746A77),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _DateField extends StatelessWidget {
  const _DateField(
      {required this.label, required this.onTap, required this.value});
  final String label;
  final VoidCallback? onTap;
  final String value;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            border: const OutlineInputBorder(),
            labelText: '$label *',
            constraints: const BoxConstraints(minHeight: 48),
            suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
          ),
          child: Text(value),
        ),
      );
}

class _TimeField extends StatelessWidget {
  const _TimeField(
      {required this.label, required this.onTap, required this.value});
  final String label;
  final VoidCallback? onTap;
  final String value;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            border: const OutlineInputBorder(),
            labelText: '$label *',
            constraints: const BoxConstraints(minHeight: 48),
            suffixIcon: const Icon(Icons.schedule_outlined, size: 18),
          ),
          child: Text(value),
        ),
      );
}

class _LeaveCard extends StatelessWidget {
  const _LeaveCard({required this.item, this.onCancel});

  final EmployeeLeaveRequest item;
  final VoidCallback? onCancel;

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
                Text(
                  item.policyName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.35,
                  ),
                ),
                const SizedBox(height: 8),
                _LeaveStatus(status: item.status),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                const Icon(Icons.date_range_outlined,
                    color: brandOrange, size: 18),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    '${_dateRange(item.startDate, item.endDate)} · ${_durationLabel(item)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              'Thời lượng ${_minutesLabel(item.requestedMinutes, item.dayMinutes)}',
              style: const TextStyle(color: brandPurple, fontSize: 11),
            ),
            const SizedBox(height: 9),
            Text(item.reason,
                style: const TextStyle(color: Color(0xFF615764), height: 1.45)),
            const SizedBox(height: 10),
            Text(
              'Gửi lúc ${DateFormat('dd/MM/yyyy HH:mm').format(item.submittedAt)}',
              style: const TextStyle(color: Color(0xFF8B7F8E), fontSize: 11),
            ),
            if (item.reviewedAt != null || item.reviewNote != null) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                color: const Color(0xFFF8F5F8),
                child: Text(
                  '${item.reviewedByName ?? 'Người duyệt'}${item.reviewNote == null ? '' : ': ${item.reviewNote}'}',
                  style: const TextStyle(fontSize: 12, height: 1.4),
                ),
              ),
            ],
            if (item.cancelledAt != null) ...<Widget>[
              const SizedBox(height: 10),
              Text('Lý do hủy: ${item.cancellationReason ?? 'Không có'}',
                  style: const TextStyle(fontSize: 12)),
            ],
            if (onCancel != null) ...<Widget>[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onCancel,
                icon: const Icon(Icons.cancel_outlined, size: 18),
                label: const Text('Hủy đơn'),
              ),
            ],
          ],
        ),
      );
}

class _LeaveStatus extends StatelessWidget {
  const _LeaveStatus({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final Color color = switch (status) {
      'APPROVED' => const Color(0xFF26704F),
      'REJECTED' || 'CANCELLED' => const Color(0xFFA84C42),
      _ => brandPurple,
    };
    final Color background = switch (status) {
      'APPROVED' => const Color(0xFFE4F4EC),
      'REJECTED' || 'CANCELLED' => const Color(0xFFFFE9E5),
      _ => const Color(0xFFF2EAF5),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      color: background,
      child: Text(_statusLabel(status),
          style: TextStyle(
              color: color, fontSize: 9, fontWeight: FontWeight.w800)),
    );
  }
}

String _apiDate(DateTime date) => DateFormat('yyyy-MM-dd').format(date);
String _apiTime(TimeOfDay time) =>
    '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
String _displayDate(DateTime date) => DateFormat('dd/MM/yyyy').format(date);

String _dateRange(String start, String end) {
  final DateTime? startDate = DateTime.tryParse(start);
  final DateTime? endDate = DateTime.tryParse(end);
  if (startDate == null || endDate == null) return '$start → $end';
  if (DateUtils.isSameDay(startDate, endDate)) return _displayDate(startDate);
  return '${_displayDate(startDate)} → ${_displayDate(endDate)}';
}

String _durationLabel(EmployeeLeaveRequest item) => switch (item.durationType) {
      'HALF_DAY' =>
        item.halfDayPeriod == 'AM' ? 'Nửa ngày sáng' : 'Nửa ngày chiều',
      'HOURS' =>
        '${item.startTime?.substring(0, 5)}–${item.endTime?.substring(0, 5)}',
      _ => 'Cả ngày',
    };

String _minutesLabel(int minutes, int dayMinutes) {
  final double days = minutes / dayMinutes;
  return days == days.roundToDouble()
      ? '${days.toInt()} ngày'
      : '${days.toStringAsFixed(2)} ngày';
}

String _statusLabel(String status) => switch (status) {
      'SUBMITTED' => 'CHỜ DUYỆT',
      'APPROVED' => 'ĐÃ DUYỆT',
      'REJECTED' => 'TỪ CHỐI',
      'CANCELLED' => 'ĐÃ HỦY',
      _ => status,
    };
