import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../services/api_client.dart';

const Map<String, String> _modules = {
  'attendance': 'Chấm công',
  'business-trips': 'Công tác',
  'reports': 'Báo cáo',
  'announcements': 'Theo dõi thông báo'
};
const Map<String, List<(String, String)>> _fields = {
  'attendance': [
    ('workDate', 'Ngày'),
    ('status', 'Trạng thái'),
    ('checkedInAt', 'Giờ vào'),
    ('checkedOutAt', 'Giờ ra'),
    ('workedMinutes', 'Phút làm'),
    ('overtimeMinutes', 'Phút OT')
  ],
  'business-trips': [
    ('code', 'Mã phiếu'),
    ('siteName', 'Địa điểm'),
    ('startAt', 'Bắt đầu'),
    ('endAt', 'Kết thúc'),
    ('participationStatus', 'Tham gia'),
    ('status', 'Phiếu')
  ],
  'reports': [
    ('scheduledDays', 'Ngày theo lịch'),
    ('presentDays', 'Hiện diện'),
    ('leaveDays', 'Nghỉ phép'),
    ('businessTripDays', 'Công tác'),
    ('incompleteDays', 'Thiếu công'),
    ('absentDays', 'Vắng'),
    ('workedMinutes', 'Phút làm'),
    ('overtimeMinutes', 'Phút OT')
  ],
  'announcements': [
    ('title', 'Thông báo'),
    ('publishedAt', 'Ban hành'),
    ('requiresAcknowledgement', 'Cần xác nhận'),
    ('readAt', 'Đã đọc'),
    ('acknowledgedAt', 'Đã xác nhận'),
    ('status', 'Trạng thái')
  ],
};
String _value(Object? value) {
  if (value == null) return '—';
  if (value is bool) return value ? 'Có' : 'Không';
  final String text = value.toString();
  if (text.contains('T')) {
    final DateTime? time = DateTime.tryParse(text);
    if (time != null) {
      return DateFormat('dd/MM/yyyy HH:mm').format(time.toLocal());
    }
  }
  return switch (text) {
    'ASSIGNED' => 'Đã giao',
    'IN_PROGRESS' => 'Đang thực hiện',
    'COMPLETED' => 'Hoàn tất',
    'CANCELLED' => 'Đã hủy',
    'PUBLISHED' => 'Đã ban hành',
    'WITHDRAWN' => 'Đã thu hồi',
    'PRESENT' => 'Hiện diện',
    'INCOMPLETE' => 'Thiếu check-out',
    'ABSENT' => 'Vắng',
    'LEAVE' => 'Nghỉ phép',
    'PARTIAL_LEAVE' => 'Nghỉ một phần ngày',
    'BUSINESS_TRIP' => 'Công tác',
    _ => text
  };
}

class ManagedModulesScreen extends StatefulWidget {
  const ManagedModulesScreen({required this.session, super.key});
  final SessionController session;
  @override
  State<ManagedModulesScreen> createState() => _ManagedModulesScreenState();
}

class _ManagedModulesScreenState extends State<ManagedModulesScreen>
    with WidgetsBindingObserver {
  String _module = 'attendance', _search = '';
  DateTime _month = DateTime.now();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = false;
  String? _error;
  int _revision = 0, _page = 0;
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
        _rows = [];
        _revision++;
        _loading = false;
        _error = 'Phiên đã kết thúc.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_load());
  }

  Future<void> _load() async {
    final int revision = ++_revision;
    final String? owner = widget.session.user?.id;
    final String module = _module, month = DateFormat('yyyy-MM').format(_month);
    setState(() {
      _loading = true;
      _rows = [];
      _error = null;
      _page = 0;
    });
    try {
      if (!(await widget.session.api.managementAccess())
          .canReadManagedModules) {
        throw const ApiException(
            'Không còn quyền quản lý hiện hành. Chức năng nhân viên vẫn được giữ.',
            status: 403);
      }
      final List<Map<String, dynamic>> rows = await widget.session.api
          .managedModule(module,
              month:
                  module == 'attendance' || module == 'reports' ? month : null);
      if (mounted &&
          revision == _revision &&
          owner != null &&
          owner == widget.session.user?.id) {
        setState(() => _rows = rows);
      }
    } on ApiException catch (error) {
      if (mounted && revision == _revision) {
        setState(() => _error = error.message);
      }
    } on Object {
      if (mounted && revision == _revision) {
        setState(() => _error = 'Chưa thể tải dữ liệu. Hãy thử lại.');
      }
    } finally {
      if (mounted && revision == _revision) setState(() => _loading = false);
    }
  }

  Future<void> _chooseMonth() async {
    final DateTime? date = await showDatePicker(
        context: context,
        initialDate: _month,
        firstDate: DateTime(2000),
        lastDate: DateTime(2200, 12, 31),
        helpText: 'Chọn một ngày trong tháng cần xem');
    if (date != null && mounted) {
      setState(() => _month = date);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> rows = _rows
        .where((row) =>
            '${row['employeeCode']} ${row['fullName']} ${row['code'] ?? ''} ${row['title'] ?? ''}'
                .toLowerCase()
                .contains(_search.trim().toLowerCase()))
        .toList();
    final int last = rows.isEmpty ? 0 : (rows.length - 1) ~/ 10,
        page = _page.clamp(0, last);
    return Scaffold(
        appBar: AppBar(title: const Text('Theo dõi phạm vi quản lý'), actions: [
          IconButton(
              tooltip: 'Tải lại quyền và dữ liệu',
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh_rounded))
        ]),
        body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [
                  const AppPageIntro(
                      eyebrow: 'Chỉ đọc',
                      title: 'Vận hành trong phạm vi',
                      description:
                          'Không có quyền chỉnh công, quản trị công tác, chốt kỳ, xuất Excel hoặc ban hành thông báo. Dữ liệu ngoài quyền không được trả về.'),
                  const SizedBox(height: 16),
                  SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                          children: _modules.entries
                              .map((entry) => Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                      label: Text(entry.value),
                                      selected: _module == entry.key,
                                      onSelected: _loading
                                          ? null
                                          : (_) {
                                              setState(
                                                  () => _module = entry.key);
                                              unawaited(_load());
                                            })))
                              .toList())),
                  if (_module == 'attendance' || _module == 'reports')
                    TextButton.icon(
                        onPressed: _loading ? null : _chooseMonth,
                        icon: const Icon(Icons.calendar_month_outlined),
                        label: Text(
                            'Tháng ${DateFormat('MM/yyyy').format(_month)}')),
                  const SizedBox(height: 12),
                  TextField(
                      decoration: const InputDecoration(
                          labelText: 'Tìm nhân viên / mã / tiêu đề',
                          prefixIcon: Icon(Icons.search_rounded)),
                      onChanged: (value) => setState(() {
                            _search = value;
                            _page = 0;
                          })),
                  const SizedBox(height: 16),
                  if (_loading)
                    const AppLoadingState(
                        label: 'Đang kiểm tra quyền và tải dữ liệu…')
                  else if (_error != null)
                    AppErrorState(message: _error!, onRetry: _load)
                  else ...[
                    Text(
                        'Hiển thị ${rows.length}/${_rows.length} mục trong phạm vi'),
                    const SizedBox(height: 12),
                    if (rows.isEmpty)
                      const AppEmptyState(
                          title: 'Chưa có dữ liệu phù hợp',
                          description:
                              'Thử đổi bộ lọc hoặc tháng. Chấm công/báo cáo cần lịch đã cấu hình.',
                          icon: Icons.folder_open_outlined),
                    ...rows.skip(page * 10).take(10).map((row) => Card(
                        child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      '${row['employeeCode']} · ${row['fullName']}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 10),
                                  ..._fields[_module]!.map((field) => Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Text(
                                          '${field.$2}: ${_value(row[field.$1])}'))),
                                ])))),
                    if (rows.length > 10)
                      Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            TextButton(
                                onPressed: page == 0
                                    ? null
                                    : () => setState(() => _page = page - 1),
                                child: const Text('Trước')),
                            Text('${page + 1}/${last + 1}'),
                            TextButton(
                                onPressed: page == last
                                    ? null
                                    : () => setState(() => _page = page + 1),
                                child: const Text('Sau'))
                          ]),
                  ],
                ])));
  }
}
