import 'package:flutter/material.dart';
import '../../app.dart';
import '../../services/api_client.dart';
import '../../services/uuid_v4.dart';

class OvertimeForm extends StatefulWidget {
  const OvertimeForm({required this.session, super.key});
  final SessionController session;
  @override
  State<OvertimeForm> createState() => _OvertimeFormState();
}

int? overtimeMinutesFromHours(String value) {
  final double? hours = double.tryParse(value.trim().replaceAll(',', '.'));
  if (hours == null || !hours.isFinite || hours <= 0 || hours > 24) return null;
  final double minutes = hours * 60;
  return (minutes - minutes.round()).abs() < 0.000001 ? minutes.round() : null;
}

class _OvertimeFormState extends State<OvertimeForm> {
  final _form = GlobalKey<FormState>();
  final _hours = TextEditingController();
  final _reason = TextEditingController();
  final _content = TextEditingController();
  final String _submissionId = createUuidV4();
  late final String? _owner;
  late DateTime _date;
  bool _sending = false, _attempted = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _owner = widget.session.user?.id;
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    _date = DateTime(now.year, now.month, now.day);
  }

  @override
  void dispose() {
    _hours.dispose();
    _reason.dispose();
    _content.dispose();
    super.dispose();
  }

  String get _workDate =>
      '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
  Future<void> _submit() async {
    if (_sending || !_form.currentState!.validate()) return;
    if (_owner == null || _owner != widget.session.user?.id) {
      setState(
          () => _error = 'Phiên đã thay đổi. Đóng biểu mẫu và đăng nhập lại.');
      return;
    }
    setState(() {
      _sending = true;
      _attempted = true;
      _error = null;
    });
    try {
      await widget.session.api.createOvertime(
          submissionId: _submissionId,
          workDate: _workDate,
          requestedMinutes: overtimeMinutesFromHours(_hours.text)!,
          reason: _reason.text,
          workContent: _content.text);
      if (mounted && _owner == widget.session.user?.id) {
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error =
            '${e.message}\nTải lại danh sách để kiểm tra. Nếu thử gửi lại ở đây, hệ thống dùng cùng mã gửi để không tạo trùng.');
      }
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Chưa rõ kết quả. Kiểm tra danh sách trước khi tạo phiếu khác; biểu mẫu này giữ nguyên mã gửi.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !_sending,
      child: Scaffold(
        appBar: AppBar(title: const Text('Tạo phiếu tăng ca')),
        body: Form(
            key: _form,
            child: ListView(
                padding: const EdgeInsets.all(20),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  const Text(
                      'Gửi sau khi đã OT. Một phiếu đang chờ/đã duyệt mỗi ngày; chỉ số phút được duyệt mới vào báo cáo. Tuyến OT được Admin cấu hình riêng.'),
                  const SizedBox(height: 20),
                  OutlinedButton.icon(
                      onPressed: _sending || _attempted
                          ? null
                          : () async {
                              final now = DateTime.now()
                                  .toUtc()
                                  .add(const Duration(hours: 7));
                              final picked = await showDatePicker(
                                  context: context,
                                  initialDate: _date,
                                  firstDate: DateTime(2000),
                                  lastDate:
                                      DateTime(now.year, now.month, now.day));
                              if (picked != null && mounted) {
                                setState(() => _date = picked);
                              }
                            },
                      icon: const Icon(Icons.calendar_today_outlined),
                      label: Text('Ngày OT: $_workDate')),
                  const SizedBox(height: 16),
                  TextFormField(
                      controller: _hours,
                      enabled: !_sending && !_attempted,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                          labelText: 'Số giờ OT *',
                          helperText:
                              'Ví dụ 1,5 giờ = 90 phút. Nhập chính xác đến phút.'),
                      validator: (v) => overtimeMinutesFromHours(v ?? '') ==
                              null
                          ? 'Nhập số giờ > 0, tối đa 24, quy đổi được thành phút nguyên.'
                          : null),
                  const SizedBox(height: 16),
                  TextFormField(
                      controller: _reason,
                      enabled: !_sending && !_attempted,
                      minLines: 2,
                      maxLines: 4,
                      maxLength: 2000,
                      decoration:
                          const InputDecoration(labelText: 'Lý do tăng ca *'),
                      validator: (v) => (v?.trim().length ?? 0) < 5
                          ? 'Nhập ít nhất 5 ký tự.'
                          : null),
                  const SizedBox(height: 16),
                  TextFormField(
                      controller: _content,
                      enabled: !_sending && !_attempted,
                      minLines: 3,
                      maxLines: 6,
                      maxLength: 2000,
                      decoration: const InputDecoration(
                          labelText: 'Công việc đã thực hiện *'),
                      validator: (v) => (v?.trim().length ?? 0) < 5
                          ? 'Nhập ít nhất 5 ký tự.'
                          : null),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(_error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                ])),
        bottomNavigationBar: SafeArea(
            top: false,
            child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: FilledButton.icon(
                    onPressed: _sending ? null : _submit,
                    icon: const Icon(Icons.send_outlined),
                    label: Text(_sending
                        ? 'Đang gửi…'
                        : _attempted
                            ? 'Thử gửi lại cùng phiếu'
                            : 'Gửi phiếu OT')))),
      ));
}
