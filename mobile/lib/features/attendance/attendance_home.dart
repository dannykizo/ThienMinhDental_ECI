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
  String? _success;
  bool _loading = true;
  bool _retryAttendance = false;
  double? _lastAccuracyMeters;
  _AttendanceActionState _actionState = _AttendanceActionState.idle;
  _LocationRecovery? _locationRecovery;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool clearFeedback = true}) async {
    setState(() {
      _error = null;
      if (clearFeedback) _success = null;
      _loading = true;
      _retryAttendance = false;
      _locationRecovery = null;
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
      _success = null;
      _retryAttendance = true;
      _locationRecovery = null;
      _actionState = _AttendanceActionState.locating;
    });
    try {
      final bool enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        if (mounted) {
          setState(() {
            _error = 'Hãy bật dịch vụ vị trí trên điện thoại để chấm công.';
            _locationRecovery = _LocationRecovery.locationSettings;
          });
        }
        return;
      }
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        if (mounted) {
          setState(() => _error =
              'Bạn cần cấp quyền vị trí chính xác để chấm công tại văn phòng.');
        }
        return;
      }
      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          setState(() {
            _error =
                'Quyền vị trí đang bị tắt. Hãy mở Cài đặt ứng dụng để cấp lại.';
            _locationRecovery = _LocationRecovery.appSettings;
          });
        }
        return;
      }
      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      if (mounted) {
        setState(() {
          _actionState = _AttendanceActionState.sending;
          _lastAccuracyMeters = position.accuracy;
        });
      }
      final RecordedAttendanceEvent event =
          await widget.session.api.recordOfficeEvent(
        accuracyMeters: position.accuracy,
        eventType: today.status == 'NOT_CHECKED_IN' ? 'CHECK_IN' : 'CHECK_OUT',
        latitude: position.latitude,
        longitude: position.longitude,
        mockLocationSignal: position.isMocked,
      );
      if (mounted) {
        setState(() {
          _success = event.eventType == 'CHECK_IN'
              ? 'Check-in thành công lúc ${DateFormat('HH:mm').format(event.serverTime)}.'
              : 'Check-out thành công lúc ${DateFormat('HH:mm').format(event.serverTime)}.';
          _retryAttendance = false;
        });
      }
      await _load(clearFeedback: false);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.code == 'OFFICE_LOCATION_NOT_CONFIGURED'
            ? 'Chi nhánh của bạn chưa có tọa độ văn phòng chính thức. Vui lòng liên hệ Admin cấu hình trước khi chấm công.'
            : error.message);
      }
    } on TimeoutException {
      if (mounted) {
        setState(() => _error =
            'Không lấy được vị trí đủ nhanh. Hãy ra khu vực thoáng và thử lại.');
      }
    } on LocationServiceDisabledException {
      if (mounted) {
        setState(() {
          _error = 'Dịch vụ vị trí vừa bị tắt. Hãy bật lại để tiếp tục.';
          _locationRecovery = _LocationRecovery.locationSettings;
        });
      }
    } on PermissionDeniedException {
      if (mounted) {
        setState(() {
          _error = 'Ứng dụng chưa được phép lấy vị trí để chấm công.';
          _locationRecovery = _LocationRecovery.appSettings;
        });
      }
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Không thể lấy vị trí lúc này. Hãy kiểm tra GPS và thử lại.');
      }
    } finally {
      if (mounted) {
        setState(() => _actionState = _AttendanceActionState.idle);
      }
    }
  }

  Future<void> _recoverLocation() async {
    switch (_locationRecovery) {
      case _LocationRecovery.locationSettings:
        await Geolocator.openLocationSettings();
      case _LocationRecovery.appSettings:
        await Geolocator.openAppSettings();
      case null:
        break;
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
              Text(_formatDate(_today?.date),
                  style:
                      const TextStyle(color: Color(0xFF807482), fontSize: 13)),
              const SizedBox(height: 24),
              if (_success != null) ...<Widget>[
                _SuccessBanner(message: _success!),
                const SizedBox(height: 16),
              ],
              if (_error != null) ...<Widget>[
                _ErrorBanner(
                  message: _error!,
                  onRecover:
                      _locationRecovery == null ? null : _recoverLocation,
                  onRetry: _retryAttendance ? _record : _load,
                ),
                const SizedBox(height: 16),
              ],
              if (_loading && _today == null)
                const SizedBox(
                    height: 300,
                    child: Center(
                        child: CircularProgressIndicator(color: brandPurple)))
              else if (_today != null)
                _AttendanceCard(
                  actionState: _actionState,
                  onRecord: _record,
                  today: _today!,
                ),
              if (_lastAccuracyMeters != null) ...<Widget>[
                const SizedBox(height: 12),
                _GpsSampleNotice(accuracyMeters: _lastAccuracyMeters!),
              ],
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

  static String _formatDate(String? date) {
    final DateTime value =
        (date == null ? null : DateTime.tryParse(date)) ?? DateTime.now();
    const List<String> weekdays = <String>[
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
      'Chủ Nhật',
    ];
    return '${weekdays[value.weekday - 1]}, ${DateFormat('dd/MM/yyyy').format(value)}';
  }
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard(
      {required this.actionState, required this.onRecord, required this.today});

  final _AttendanceActionState actionState;
  final VoidCallback onRecord;
  final TodayAttendance today;

  bool get _submitting => actionState != _AttendanceActionState.idle;

  String get _title => switch (today.status) {
        'CHECKED_IN' => 'Đang trong ca',
        'CHECKED_OUT' => 'Đã hoàn tất ngày công',
        _ => 'Chưa check-in',
      };

  String get _button => today.status == 'CHECKED_IN'
      ? 'Check-out tại văn phòng'
      : 'Check-in tại văn phòng';

  String get _statusLabel => switch (today.status) {
        'CHECKED_IN' => 'ĐANG TRONG CA',
        'CHECKED_OUT' => 'ĐÃ CHECK-OUT',
        _ => 'CHƯA CHECK-IN',
      };

  String get _progressLabel => switch (actionState) {
        _AttendanceActionState.locating => 'Đang lấy vị trí…',
        _AttendanceActionState.sending => 'Đang ghi nhận…',
        _AttendanceActionState.idle => _button,
      };

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
                      Text(_statusLabel,
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
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFAF8FA),
                      border: Border.all(color: const Color(0xFFEDE7EE)),
                    ),
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: _MetricCell(
                            label: 'ĐÃ LÀM',
                            value: today.status == 'CHECKED_OUT'
                                ? _formatDuration(today.workedMinutes)
                                : '—',
                          ),
                        ),
                        Expanded(
                          child: _MetricCell(
                            label: 'ĐỊNH MỨC',
                            value: _formatDuration(today.requiredWorkMinutes),
                          ),
                        ),
                        Expanded(
                          child: _MetricCell(
                            label: 'TĂNG CA',
                            value: today.status == 'CHECKED_OUT'
                                ? _formatDuration(today.overtimeMinutes)
                                : '—',
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (today.status == 'CHECKED_OUT') ...<Widget>[
                    const SizedBox(height: 12),
                    Row(
                      children: <Widget>[
                        Icon(
                          today.isFullWorkday
                              ? Icons.check_circle_outline_rounded
                              : Icons.info_outline_rounded,
                          color: today.isFullWorkday
                              ? const Color(0xFF338865)
                              : brandOrange,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            today.isFullWorkday
                                ? 'Đã đạt định mức ngày công.'
                                : 'Chưa đạt định mức ngày công; Backend sẽ đưa vào đối soát.',
                            style: const TextStyle(
                              color: Color(0xFF746A77),
                              fontSize: 11,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: _submitting || today.status == 'CHECKED_OUT'
                          ? null
                          : onRecord,
                      style: FilledButton.styleFrom(
                          backgroundColor: brandPurple,
                          disabledBackgroundColor: const Color(0xFFE3DCE5),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(5))),
                      icon: _submitting
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
                              : _submitting
                                  ? _progressLabel
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

  static String _formatDuration(int minutes) {
    final int hours = minutes ~/ 60;
    final int remainder = minutes % 60;
    if (hours == 0) return '${remainder}p';
    if (remainder == 0) return '${hours}h';
    return '${hours}h ${remainder}p';
  }

  static String _riskLabel(String flag) => switch (flag) {
        'LATE' => 'đi muộn',
        'EARLY_LEAVE' => 'về sớm',
        'OUTSIDE_GEOFENCE' => 'ngoài vùng văn phòng',
        'LOW_ACCURACY' => 'GPS độ chính xác thấp',
        'MOCK_LOCATION_SIGNAL' => 'thiết bị báo vị trí mô phỏng',
        _ => flag,
      };
}

class _MetricCell extends StatelessWidget {
  const _MetricCell({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        children: <Widget>[
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF948997),
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8)),
          const SizedBox(height: 5),
          Text(value,
              style: const TextStyle(
                  color: brandInk, fontSize: 13, fontWeight: FontWeight.w800)),
        ],
      );
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
  const _ErrorBanner({
    required this.message,
    required this.onRetry,
    this.onRecover,
  });

  final String message;
  final Future<void> Function()? onRecover;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: const BoxDecoration(
            color: Color(0xFFFFEFEC),
            border:
                Border(left: BorderSide(color: Color(0xFFB85D50), width: 3))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(message,
                style: const TextStyle(
                    color: Color(0xFF8E3D33), fontSize: 12, height: 1.4)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: <Widget>[
                TextButton(onPressed: onRetry, child: const Text('Thử lại')),
                if (onRecover != null)
                  TextButton(
                    onPressed: onRecover,
                    child: const Text('Mở cài đặt'),
                  ),
              ],
            ),
          ],
        ),
      );
}

class _SuccessBanner extends StatelessWidget {
  const _SuccessBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFEAF7F1),
          border: Border(left: BorderSide(color: Color(0xFF338865), width: 3)),
        ),
        child: Row(
          children: <Widget>[
            const Icon(Icons.check_circle_outline_rounded,
                size: 18, color: Color(0xFF338865)),
            const SizedBox(width: 9),
            Expanded(
              child: Text(message,
                  style: const TextStyle(
                      color: Color(0xFF286E52),
                      fontSize: 12,
                      fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      );
}

class _GpsSampleNotice extends StatelessWidget {
  const _GpsSampleNotice({required this.accuracyMeters});

  final double accuracyMeters;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7EA),
          border: Border.all(color: const Color(0xFFF1DEC1)),
        ),
        child: Row(
          children: <Widget>[
            const Icon(Icons.gps_fixed_rounded, size: 17, color: brandOrange),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                'Mẫu GPS vừa dùng có độ chính xác khoảng ±${accuracyMeters.round()} m. Tọa độ không hiển thị trên màn hình.',
                style: const TextStyle(
                    color: Color(0xFF77582F), fontSize: 11, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

enum _AttendanceActionState { idle, locating, sending }

enum _LocationRecovery { locationSettings, appSettings }
