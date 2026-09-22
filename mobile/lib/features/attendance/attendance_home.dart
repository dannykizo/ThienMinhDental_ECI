import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../services/api_client.dart';

class AttendanceHome extends StatefulWidget {
  const AttendanceHome({required this.session, super.key});

  final SessionController session;

  @override
  State<AttendanceHome> createState() => _AttendanceHomeState();
}

class _AttendanceHomeState extends State<AttendanceHome> {
  TodayAttendance? _today;
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      final TodayAttendance today = await widget.session.api.today();
      if (mounted) setState(() => _today = today);
    } on ApiException catch (error) {
      if (error.status == 401) {
        await widget.session.logout();
        return;
      }
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _record() async {
    final TodayAttendance? today = _today;
    if (today == null || today.status == 'CHECKED_OUT') return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final bool enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw const ApiException(
            'Hãy bật dịch vụ vị trí trên điện thoại để chấm công.');
      }
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        throw const ApiException('Bạn chưa cấp quyền vị trí cho ứng dụng.');
      }
      if (permission == LocationPermission.deniedForever) {
        throw const ApiException(
            'Quyền vị trí đã bị từ chối vĩnh viễn. Hãy mở Cài đặt ứng dụng để cấp lại.');
      }
      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      await widget.session.api.recordOfficeEvent(
        accuracyMeters: position.accuracy,
        eventType: today.status == 'NOT_CHECKED_IN' ? 'CHECK_IN' : 'CHECK_OUT',
        latitude: position.latitude,
        longitude: position.longitude,
        mockLocationSignal: position.isMocked,
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Đã ghi nhận bằng thời gian máy chủ.'),
              behavior: SnackBarBehavior.floating),
        );
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on TimeoutException {
      if (mounted) {
        setState(() => _error =
            'Không lấy được vị trí đủ nhanh. Hãy ra khu vực thoáng và thử lại.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final SessionUser user = widget.session.user!;
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 34),
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 82,
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: const Color(0xFFE7E0E9))),
                    child: Image.asset('assets/brand/thien-minh-logo.png'),
                  ),
                  const Spacer(),
                  IconButton.filledTonal(
                    tooltip: 'Đăng xuất',
                    onPressed: widget.session.logout,
                    icon: const Icon(Icons.logout_rounded, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 30),
              const Text('HÔM NAY',
                  style: TextStyle(
                      color: brandPurple,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5)),
              const SizedBox(height: 8),
              Text('Xin chào, ${user.displayName}',
                  style: const TextStyle(
                      fontFamily: 'serif',
                      fontSize: 31,
                      fontWeight: FontWeight.w500,
                      height: 1.12,
                      letterSpacing: -0.7)),
              const SizedBox(height: 7),
              Text(DateFormat('dd/MM/yyyy').format(DateTime.now()),
                  style:
                      const TextStyle(color: Color(0xFF807482), fontSize: 13)),
              const SizedBox(height: 24),
              if (_error != null) ...<Widget>[
                _ErrorBanner(message: _error!, onRetry: _load),
                const SizedBox(height: 16),
              ],
              if (_loading && _today == null)
                const SizedBox(
                    height: 300,
                    child: Center(
                        child: CircularProgressIndicator(color: brandPurple)))
              else if (_today != null)
                _AttendanceCard(
                    today: _today!, submitting: _submitting, onRecord: _record),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFE7E0E9))),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(Icons.location_on_outlined,
                        color: brandOrange, size: 22),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('Quyền riêng tư vị trí',
                              style: TextStyle(fontWeight: FontWeight.w800)),
                          SizedBox(height: 6),
                          Text(
                              'Ứng dụng chỉ lấy một mẫu GPS khi bạn bấm nút chấm công. Không theo dõi vị trí nền hoặc liên tục.',
                              style: TextStyle(
                                  color: Color(0xFF746A77),
                                  fontSize: 12,
                                  height: 1.5)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              const Center(
                  child: Text('THIÊN MINH WORKFORCE · DEVELOPMENT',
                      style: TextStyle(
                          color: Color(0xFF998E9B),
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1))),
            ],
          ),
        ),
      ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard(
      {required this.onRecord, required this.submitting, required this.today});

  final VoidCallback onRecord;
  final bool submitting;
  final TodayAttendance today;

  String get _title => switch (today.status) {
        'CHECKED_IN' => 'Đang trong ca',
        'CHECKED_OUT' => 'Đã hoàn tất ngày công',
        _ => 'Chưa check-in',
      };

  String get _button => today.status == 'CHECKED_IN'
      ? 'Check-out tại văn phòng'
      : 'Check-in tại văn phòng';

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE2D9E5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                    colors: <Color>[brandPurpleDark, brandPurple],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                              color: today.status == 'CHECKED_OUT'
                                  ? const Color(0xFF67C79E)
                                  : brandOrange,
                              shape: BoxShape.circle)),
                      const SizedBox(width: 8),
                      Text(today.status,
                          style: const TextStyle(
                              color: Color(0xFFF2EAF5),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1)),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(_title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontFamily: 'serif',
                          fontSize: 29,
                          fontWeight: FontWeight.w500)),
                  if (today.riskFlags.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 10),
                    Text(
                        'Cần đối soát: ${today.riskFlags.map(_riskLabel).join(', ')}',
                        style: const TextStyle(
                            color: Color(0xFFFFD88C),
                            fontSize: 12,
                            height: 1.4)),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                          child: _TimeCell(
                              label: 'CHECK-IN',
                              value: _formatTime(today.checkedInAt))),
                      Container(
                          width: 1, height: 52, color: const Color(0xFFE8E1EA)),
                      Expanded(
                          child: _TimeCell(
                              label: 'CHECK-OUT',
                              value: _formatTime(today.checkedOutAt))),
                    ],
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: submitting || today.status == 'CHECKED_OUT'
                          ? null
                          : onRecord,
                      style: FilledButton.styleFrom(
                          backgroundColor: brandPurple,
                          disabledBackgroundColor: const Color(0xFFE3DCE5),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(5))),
                      icon: submitting
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(
                                  color: Colors.white, strokeWidth: 2))
                          : Icon(today.status == 'CHECKED_IN'
                              ? Icons.logout_rounded
                              : Icons.login_rounded),
                      label: Text(
                          today.status == 'CHECKED_OUT'
                              ? 'Ngày công đã hoàn tất'
                              : submitting
                                  ? 'Đang lấy vị trí…'
                                  : _button,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text('Thời gian chính thức do Backend ghi nhận',
                      style: TextStyle(color: Color(0xFF8A7F8C), fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      );

  static String _formatTime(DateTime? time) =>
      time == null ? '—' : DateFormat('HH:mm').format(time);

  static String _riskLabel(String flag) => switch (flag) {
        'LATE' => 'đi muộn',
        'EARLY_LEAVE' => 'về sớm',
        'OUTSIDE_GEOFENCE' => 'ngoài vùng văn phòng',
        'LOW_ACCURACY' => 'GPS độ chính xác thấp',
        'MOCK_LOCATION_SIGNAL' => 'thiết bị báo vị trí mô phỏng',
        _ => flag,
      };
}

class _TimeCell extends StatelessWidget {
  const _TimeCell({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        children: <Widget>[
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF8C818F),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.1)),
          const SizedBox(height: 7),
          Text(value,
              style: const TextStyle(
                  fontFamily: 'serif',
                  fontSize: 28,
                  fontWeight: FontWeight.w500)),
        ],
      );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: const BoxDecoration(
            color: Color(0xFFFFEFEC),
            border:
                Border(left: BorderSide(color: Color(0xFFB85D50), width: 3))),
        child: Row(
          children: <Widget>[
            Expanded(
                child: Text(message,
                    style: const TextStyle(
                        color: Color(0xFF8E3D33), fontSize: 12, height: 1.4))),
            TextButton(onPressed: onRetry, child: const Text('Thử lại')),
          ],
        ),
      );
}
