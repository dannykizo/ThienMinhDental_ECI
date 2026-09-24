import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../services/api_client.dart';

class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  List<EmployeeLeaveRequest> _items = <EmployeeLeaveRequest>[];
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
      final List<EmployeeLeaveRequest> items =
          await widget.session.api.myLeaveRequests();
      if (mounted) setState(() => _items = items);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final bool? created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (BuildContext context) => CreateLeaveRequestScreen(
          session: widget.session,
        ),
      ),
    );
    if (created == true) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: brandCanvas,
          surfaceTintColor: Colors.transparent,
          title: const Text(
            'Đơn nghỉ phép',
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
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
            children: <Widget>[
              const Text(
                'NGHỈ PHÉP CỦA BẠN',
                style: TextStyle(
                  color: brandPurple,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Gửi đơn rõ ràng,\ntheo dõi dễ dàng.',
                style: TextStyle(
                  fontFamily: 'serif',
                  fontSize: 29,
                  fontWeight: FontWeight.w500,
                  height: 1.12,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Đơn hiện áp dụng cho cả ngày hoặc một khoảng ngày. Trạng thái duyệt được cập nhật từ Backend.',
                style: TextStyle(
                  color: Color(0xFF746A77),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 16),
                _LeaveError(message: _error!, onRetry: _load),
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
                const _EmptyLeaveRequests()
              else
                ..._items.map(
                  (EmployeeLeaveRequest item) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LeaveCard(item: item),
                  ),
                ),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _create,
          backgroundColor: brandPurple,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Tạo đơn nghỉ'),
        ),
      );
}

class CreateLeaveRequestScreen extends StatefulWidget {
  const CreateLeaveRequestScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<CreateLeaveRequestScreen> createState() =>
      _CreateLeaveRequestScreenState();
}

class _CreateLeaveRequestScreenState extends State<CreateLeaveRequestScreen> {
  final TextEditingController _reason = TextEditingController();
  late DateTime _endDate;
  String? _error;
  String _leaveType = 'ANNUAL';
  late DateTime _startDate;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
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
      if (_endDate.isBefore(_startDate)) _endDate = _startDate;
    });
  }

  Future<void> _pickEndDate() async {
    final DateTime? selected = await showDatePicker(
      context: context,
      firstDate: _startDate,
      initialDate: _endDate.isBefore(_startDate) ? _startDate : _endDate,
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) return;
    setState(() => _endDate = DateUtils.dateOnly(selected));
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final String reason = _reason.text.trim();
    if (reason.length < 3) {
      setState(() => _error = 'Lý do nghỉ cần ít nhất 3 ký tự.');
      return;
    }
    if (_endDate.isBefore(_startDate)) {
      setState(() => _error = 'Ngày kết thúc không thể trước ngày bắt đầu.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.session.api.createLeaveRequest(
        endDate: _apiDate(_endDate),
        leaveType: _leaveType,
        reason: reason,
        startDate: _apiDate(_startDate),
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
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text(
            'Tạo đơn nghỉ',
            style: TextStyle(fontFamily: 'serif', fontWeight: FontWeight.w600),
          ),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: <Widget>[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Color(0xFFF2EAF5),
                border: Border(left: BorderSide(color: brandPurple, width: 3)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(Icons.calendar_month_outlined, color: brandPurple),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Mỗi ngày trong khoảng đã chọn được tính là một ngày nghỉ nguyên ngày. App chưa hỗ trợ nghỉ nửa ngày hoặc theo giờ.',
                      style: TextStyle(fontSize: 12, height: 1.45),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            DropdownButtonFormField<String>(
              initialValue: _leaveType,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Loại nghỉ',
              ),
              items: const <DropdownMenuItem<String>>[
                DropdownMenuItem(value: 'ANNUAL', child: Text('Phép năm')),
                DropdownMenuItem(value: 'SICK', child: Text('Nghỉ bệnh')),
                DropdownMenuItem(
                  value: 'UNPAID',
                  child: Text('Nghỉ không lương'),
                ),
                DropdownMenuItem(value: 'OTHER', child: Text('Khác')),
              ],
              onChanged: _submitting
                  ? null
                  : (String? value) {
                      if (value != null) setState(() => _leaveType = value);
                    },
            ),
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                Expanded(
                  child: _DateField(
                    label: 'Từ ngày',
                    onTap: _submitting ? null : _pickStartDate,
                    value: _displayDate(_startDate),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DateField(
                    label: 'Đến ngày',
                    onTap: _submitting ? null : _pickEndDate,
                    value: _displayDate(_endDate),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _reason,
              enabled: !_submitting,
              maxLength: 2000,
              maxLines: 5,
              minLines: 4,
              decoration: const InputDecoration(
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
                hintText: 'Mô tả ngắn gọn lý do cần nghỉ…',
                labelText: 'Lý do nghỉ',
              ),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 4),
              _LeaveError(message: _error!),
            ],
            const SizedBox(height: 22),
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                icon: _submitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.send_rounded),
                label: Text(_submitting ? 'Đang gửi…' : 'Gửi đơn nghỉ'),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Backend sẽ kiểm tra trùng ngày, hồ sơ nhân viên và kỳ công đã khóa trước khi tiếp nhận.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF817683),
                fontSize: 11,
                height: 1.4,
              ),
            ),
          ],
        ),
      );
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.onTap,
    required this.value,
  });

  final String label;
  final VoidCallback? onTap;
  final String value;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            border: const OutlineInputBorder(),
            labelText: label,
            suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
          ),
          child: Text(value),
        ),
      );
}

class _LeaveCard extends StatelessWidget {
  const _LeaveCard({required this.item});

  final EmployeeLeaveRequest item;

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
                  child: Text(
                    _leaveTypeLabel(item.leaveType),
                    style: const TextStyle(
                      fontFamily: 'serif',
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                _LeaveStatus(status: item.status),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                const Icon(
                  Icons.date_range_outlined,
                  color: brandOrange,
                  size: 18,
                ),
                const SizedBox(width: 7),
                Text(
                  _dateRange(item.startDate, item.endDate),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 9),
            Text(
              item.reason,
              style: const TextStyle(color: Color(0xFF615764), height: 1.45),
            ),
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (item.reviewedByName != null)
                      Text(
                        'Người duyệt: ${item.reviewedByName}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    if (item.reviewNote != null) ...<Widget>[
                      const SizedBox(height: 4),
                      Text(
                        'Ghi chú: ${item.reviewNote}',
                        style: const TextStyle(fontSize: 12, height: 1.4),
                      ),
                    ],
                    if (item.reviewedAt != null) ...<Widget>[
                      const SizedBox(height: 4),
                      Text(
                        DateFormat('dd/MM/yyyy HH:mm').format(item.reviewedAt!),
                        style: const TextStyle(
                          color: Color(0xFF8B7F8E),
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ],
                ),
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
      'REJECTED' => const Color(0xFFA84C42),
      _ => brandPurple,
    };
    final Color background = switch (status) {
      'APPROVED' => const Color(0xFFE4F4EC),
      'REJECTED' => const Color(0xFFFFE9E5),
      _ => const Color(0xFFF2EAF5),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      color: background,
      child: Text(
        _statusLabel(status),
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _LeaveError extends StatelessWidget {
  const _LeaveError({required this.message, this.onRetry});

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

class _EmptyLeaveRequests extends StatelessWidget {
  const _EmptyLeaveRequests();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 50),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: const Column(
          children: <Widget>[
            Icon(Icons.event_available_rounded, color: brandPurple, size: 34),
            SizedBox(height: 12),
            Text(
              'Bạn chưa có đơn nghỉ nào',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 6),
            Text(
              'Nhấn “Tạo đơn nghỉ” để gửi yêu cầu đầu tiên.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF817683), fontSize: 12),
            ),
          ],
        ),
      );
}

String _apiDate(DateTime date) => DateFormat('yyyy-MM-dd').format(date);

String _displayDate(DateTime date) => DateFormat('dd/MM/yyyy').format(date);

String _dateRange(String start, String end) {
  final DateTime? startDate = DateTime.tryParse(start);
  final DateTime? endDate = DateTime.tryParse(end);
  if (startDate == null || endDate == null) return '$start → $end';
  if (DateUtils.isSameDay(startDate, endDate)) return _displayDate(startDate);
  return '${_displayDate(startDate)} → ${_displayDate(endDate)}';
}

String _leaveTypeLabel(String type) => switch (type) {
      'ANNUAL' => 'Phép năm',
      'SICK' => 'Nghỉ bệnh',
      'UNPAID' => 'Nghỉ không lương',
      'OTHER' => 'Nghỉ khác',
      _ => type,
    };

String _statusLabel(String status) => switch (status) {
      'SUBMITTED' => 'CHỜ DUYỆT',
      'APPROVED' => 'ĐÃ DUYỆT',
      'REJECTED' => 'TỪ CHỐI',
      _ => status,
    };
