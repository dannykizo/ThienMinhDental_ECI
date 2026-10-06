import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../services/api_client.dart';

class AttendanceHome extends StatefulWidget {
  const AttendanceHome({
    required this.session,
    required this.onOpenBusinessTrips,
    required this.onOpenExplanations,
    required this.onOpenLeave,
    required this.onOpenInbox,
    super.key,
  });

  final SessionController session;
  final VoidCallback onOpenBusinessTrips;
  final VoidCallback onOpenExplanations;
  final VoidCallback onOpenLeave;
  final VoidCallback onOpenInbox;

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
  RecordedAttendanceEvent? _lastEvent;
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
        // ApiClient đã kết thúc phiên và giữ đúng thông báo thu hồi/hết hạn.
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
      _lastEvent = null;
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
          _lastEvent = event;
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
                    width: 72,
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: brandLine)),
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
              const SizedBox(height: 16),
              Text('Xin chào, ${user.displayName}',
                  style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      height: 1.25,
                      letterSpacing: -0.4)),
              const SizedBox(height: 16),
              if (_success != null) ...<Widget>[
                _SuccessBanner(message: _success!),
                const SizedBox(height: 16),
              ],
              if (_error != null) ...<Widget>[
                AppErrorState(
                  compact: true,
                  message: _error!,
                  onRetry: _retryAttendance ? _record : _load,
                  onSecondaryAction:
                      _locationRecovery == null ? null : _recoverLocation,
                  secondaryActionLabel:
                      _locationRecovery == null ? null : 'Mở cài đặt',
                  title: _retryAttendance
                      ? 'Chưa thể ghi nhận chấm công'
                      : 'Chưa thể tải trạng thái hôm nay',
                ),
                const SizedBox(height: 16),
              ],
              if (_loading && _today != null) ...<Widget>[
                const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 12),
              ],
              if (_loading && _today == null)
                const AppLoadingState(
                  label: 'Đang tải trạng thái chấm công…',
                )
              else if (_today != null)
                _AttendanceCard(
                  actionState: _actionState,
                  dateLabel: _formatDate(_today!.date),
                  onRecord: _record,
                  today: _today!,
                ),
              if (_lastEvent != null) ...<Widget>[
                const SizedBox(height: 12),
                _GeofenceResultCard(event: _lastEvent!),
              ] else if (_lastAccuracyMeters != null) ...<Widget>[
                const SizedBox(height: 12),
                _GpsSampleNotice(accuracyMeters: _lastAccuracyMeters!),
              ],
              const SizedBox(height: 18),
              _HomeShortcuts(
                onOpenBusinessTrips: widget.onOpenBusinessTrips,
                onOpenExplanations: widget.onOpenExplanations,
                onOpenLeave: widget.onOpenLeave,
                onOpenInbox: widget.onOpenInbox,
              ),
              const SizedBox(height: 18),
              Container(
                decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: brandLine)),
                child: const ExpansionTile(
                  shape: Border(),
                  collapsedShape: Border(),
                  leading: Icon(Icons.location_on_outlined,
                      color: brandOrange, size: 22),
                  title: Text('Quyền riêng tư vị trí',
                      style:
                          TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  childrenPadding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                  children: <Widget>[
                    Text(
                      'Ứng dụng chỉ lấy một mẫu GPS khi bạn bấm nút chấm công. Không theo dõi vị trí nền hoặc liên tục.',
                      style: TextStyle(
                          color: brandMuted, fontSize: 12, height: 1.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              Text(widget.session.appVersionLabel,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: brandMuted, fontSize: 11)),
              const SizedBox(height: 6),
              const Text('THIÊN MINH WORKFORCE · DEVELOPMENT',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: brandMuted,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1)),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatDate(String date) {
    final DateTime? value = DateTime.tryParse(date);
    if (value == null) return date;
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

class _HomeShortcuts extends StatelessWidget {
  const _HomeShortcuts({
    required this.onOpenBusinessTrips,
    required this.onOpenExplanations,
    required this.onOpenLeave,
    required this.onOpenInbox,
  });

  final VoidCallback onOpenBusinessTrips;
  final VoidCallback onOpenExplanations;
  final VoidCallback onOpenLeave;
  final VoidCallback onOpenInbox;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text('Truy cập nhanh',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final int columns = constraints.maxWidth < 280 ||
                      MediaQuery.textScalerOf(context).scale(14) > 21
                  ? 1
                  : constraints.maxWidth >= 600
                      ? 4
                      : 2;
              final double width =
                  (constraints.maxWidth - (columns - 1) * 10) / columns;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  _shortcut(width, Icons.work_outline_rounded, 'Công tác',
                      onOpenBusinessTrips),
                  _shortcut(width, Icons.fact_check_outlined, 'Giải trình',
                      onOpenExplanations),
                  _shortcut(width, Icons.event_note_outlined, 'Nghỉ phép',
                      onOpenLeave),
                  _shortcut(width, Icons.mail_outline_rounded, 'Hộp thư',
                      onOpenInbox),
                ],
              );
            },
          ),
        ],
      );

  Widget _shortcut(
          double width, IconData icon, String label, VoidCallback onPressed) =>
      SizedBox(
        width: width,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: brandPurple,
            side: const BorderSide(color: brandLine),
            minimumSize: const Size(0, 64),
            padding: const EdgeInsets.all(14),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: Row(
            children: <Widget>[
              Icon(icon, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        color: brandInk,
                        fontSize: 13,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      );
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard(
      {required this.actionState,
      required this.dateLabel,
      required this.onRecord,
      required this.today});

  final _AttendanceActionState actionState;
  final String dateLabel;
  final VoidCallback onRecord;
  final TodayAttendance today;

  bool get _submitting => actionState != _AttendanceActionState.idle;

  String get _title => switch (today.status) {
        'CHECKED_IN' => 'Đang trong ca',
        'CHECKED_OUT' => 'Đã check-out',
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
          border: Border.all(color: brandLine),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
              decoration: const BoxDecoration(
                borderRadius: BorderRadius.vertical(top: Radius.circular(11)),
                gradient: LinearGradient(
                    colors: <Color>[brandPurpleDark, brandPurple],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('HÔM NAY · $dateLabel',
                      style: const TextStyle(
                          color: Color(0xFFF2EAF5),
                          fontSize: 12,
                          height: 1.4,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 14),
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
                      Expanded(
                          child: Text(_statusLabel,
                              style: const TextStyle(
                                  color: Color(0xFFF2EAF5),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.1))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(_title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.6)),
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
              padding: const EdgeInsets.all(18),
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
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _submitting || today.status == 'CHECKED_OUT'
                          ? null
                          : onRecord,
                      style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 54),
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
                              ? 'Đã ghi nhận check-out'
                              : _submitting
                                  ? _progressLabel
                                  : _button,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text('Thời gian chính thức do Backend ghi nhận',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: brandMuted, fontSize: 11)),
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
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5)),
        ],
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

class _GeofenceResultCard extends StatelessWidget {
  const _GeofenceResultCard({required this.event});

  final RecordedAttendanceEvent event;

  @override
  Widget build(BuildContext context) {
    final bool outside = event.riskFlags.contains('OUTSIDE_GEOFENCE');
    final bool lowAccuracy = event.riskFlags.contains('LOW_ACCURACY');
    final Color statusColor = outside
        ? const Color(0xFFB85143)
        : lowAccuracy
            ? const Color(0xFF9A6B22)
            : const Color(0xFF338865);
    final Color backgroundColor = outside
        ? const Color(0xFFFFF0EE)
        : lowAccuracy
            ? const Color(0xFFFFF7EA)
            : const Color(0xFFEAF7F1);

    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: statusColor.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(
                outside
                    ? Icons.location_off_outlined
                    : Icons.location_on_outlined,
                color: statusColor,
                size: 21,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  outside
                      ? 'Ngoài vùng chấm công'
                      : lowAccuracy
                          ? 'Trong vùng, GPS cần đối soát'
                          : 'Trong vùng chấm công',
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (event.officeLocationName case final String name)
            _GeofenceMetric(
              icon: Icons.apartment_rounded,
              label: 'Vị trí đối chiếu',
              value: name,
            ),
          if (event.officeLocationAddress case final String address)
            _GeofenceMetric(
              icon: Icons.signpost_outlined,
              label: 'Địa chỉ',
              value: address,
            ),
          if (event.distanceMeters case final double distance)
            _GeofenceMetric(
              icon: Icons.social_distance_rounded,
              label: 'Khoảng cách tới tâm',
              value: '${distance.round()} m',
            ),
          if (event.allowedRadiusMeters case final double radius)
            _GeofenceMetric(
              icon: Icons.radio_button_checked_rounded,
              label: 'Bán kính cho phép',
              value: '${radius.round()} m',
            ),
          if (event.accuracyMeters case final double accuracy)
            _GeofenceMetric(
              icon: Icons.gps_fixed_rounded,
              label: 'Độ chính xác GPS',
              value: '±${accuracy.round()} m',
              isLast: true,
            ),
          const SizedBox(height: 5),
          const Text(
            'Kết quả do Backend đối chiếu với cấu hình văn phòng. App không hiển thị tọa độ chi tiết.',
            style: TextStyle(
              color: Color(0xFF746A77),
              fontSize: 10.5,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _GeofenceMetric extends StatelessWidget {
  const _GeofenceMetric({
    required this.icon,
    required this.label,
    required this.value,
    this.isLast = false,
  });

  final IconData icon;
  final bool isLast;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, size: 16, color: const Color(0xFF746A77)),
            const SizedBox(width: 8),
            SizedBox(
              width: 124,
              child: Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF746A77),
                  fontSize: 11,
                ),
              ),
            ),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                  color: Color(0xFF2F2732),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
}

enum _AttendanceActionState { idle, locating, sending }

enum _LocationRecovery { locationSettings, appSettings }
