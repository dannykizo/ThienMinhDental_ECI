import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../../app.dart';

/// Explains access, but never requests GPS/camera/gallery on entry.
class PermissionSetupScreen extends StatefulWidget {
  const PermissionSetupScreen(
      {required this.session, this.firstRun = false, super.key});

  final SessionController session;
  final bool firstRun;

  @override
  State<PermissionSetupScreen> createState() => _PermissionSetupScreenState();
}

class _PermissionSetupScreenState extends State<PermissionSetupScreen>
    with WidgetsBindingObserver {
  bool _busy = false;
  bool? _notificationsEnabled;
  bool _canRequestNotifications = false;
  LocationPermission? _locationPermission;
  bool? _locationServiceEnabled;
  LocationAccuracyStatus? _accuracy;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _readStatus() async {
    bool? notifications;
    bool canRequest = false;
    LocationPermission? location;
    bool? locationService;
    LocationAccuracyStatus? accuracy;
    String? error;
    try {
      if (widget.session.pushNotifications.android.supported) {
        final bridge = widget.session.pushNotifications.android;
        await bridge.refreshStatus().timeout(const Duration(seconds: 5));
        notifications = bridge.enabled && bridge.importance > 0;
        canRequest = bridge.canRequestPermission;
      }
    } on Object {
      error =
          'Chưa thể kiểm tra quyền thông báo. Bạn có thể thử lại hoặc tiếp tục sử dụng app.';
    }
    try {
      location = await Geolocator.checkPermission()
          .timeout(const Duration(seconds: 5));
      locationService = await Geolocator.isLocationServiceEnabled()
          .timeout(const Duration(seconds: 5));
      if (location == LocationPermission.whileInUse ||
          location == LocationPermission.always) {
        accuracy = await Geolocator.getLocationAccuracy()
            .timeout(const Duration(seconds: 5));
      }
    } on Object {
      error =
          'Chưa thể kiểm tra đầy đủ quyền thiết bị. Không có vị trí nào được lấy; bạn có thể thử lại.';
    }
    if (!mounted) return;
    setState(() {
      _notificationsEnabled = notifications;
      _canRequestNotifications = canRequest;
      _locationPermission = location;
      _locationServiceEnabled = locationService;
      _accuracy = accuracy;
      _error = error;
    });
  }

  Future<void> _refresh() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _readStatus();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _readStatus();
    } on Object {
      if (mounted) {
        setState(() => _error =
            'Chưa thể mở thiết lập quyền. Hãy thử lại hoặc mở Cài đặt ứng dụng trên điện thoại.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _enableNotifications() async {
    if (widget.session.user == null) return;
    await _act(() async {
      if (_canRequestNotifications) {
        await widget.session.pushNotifications.requestPermission();
        // Do not hold optional setup controls while Backend/Firebase retries.
        unawaited(widget.session.syncPush(retryInitialization: true));
      } else {
        await widget.session.pushNotifications.android.openSettings();
      }
    });
  }

  Future<void> _finish() async {
    if (_busy) return;
    if (!widget.firstRun) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _busy = true);
    await widget.session.dismissPermissionSetup();
  }

  @override
  Widget build(BuildContext context) {
    final bool locationGranted =
        _locationPermission == LocationPermission.whileInUse ||
            _locationPermission == LocationPermission.always;
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) => PopScope(
        canPop: !_busy && !widget.firstRun,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && widget.firstRun && !_busy) unawaited(_finish());
        },
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: !widget.firstRun,
            title: const Text('Thiết lập ứng dụng'),
            actions: [
              IconButton(
                  tooltip: 'Kiểm tra lại',
                  onPressed: _busy ? null : _refresh,
                  icon: const Icon(Icons.refresh_rounded))
            ],
          ),
          body: SafeArea(
            child: widget.session.user == null
                ? const Center(
                    child: Text('Phiên đã kết thúc. Hãy quay lại đăng nhập.'))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                    children: [
                      const Icon(Icons.shield_outlined,
                          size: 42, color: brandPurple),
                      const SizedBox(height: 16),
                      Text(
                          widget.firstRun
                              ? 'Sẵn sàng cho ngày làm việc'
                              : 'Quyền của bạn, lựa chọn của bạn',
                          style: const TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.w800,
                              height: 1.2)),
                      const SizedBox(height: 10),
                      const Text(
                          'Bạn có thể thiết lập ngay hoặc để sau. Không cấp quyền vẫn đăng nhập, xem hộp thư và gửi đơn nghỉ được.',
                          style: TextStyle(color: brandMuted, height: 1.5)),
                      const SizedBox(height: 20),
                      if (_busy) const LinearProgressIndicator(),
                      if (_error != null)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(_error!,
                                style: const TextStyle(color: brandDanger))),
                      _PermissionCard(
                        icon: Icons.notifications_active_outlined,
                        title: 'Thông báo',
                        status: _notificationsEnabled == null
                            ? 'Chưa xác định'
                            : _notificationsEnabled!
                                ? 'Đã bật'
                                : 'Chưa bật',
                        ready: _notificationsEnabled == true,
                        description:
                            'Nhận thông báo nội bộ và kết quả duyệt đơn ngoài màn hình app. Banner và âm thanh theo cài đặt điện thoại.',
                        action: widget
                                .session.pushNotifications.android.supported
                            ? TextButton.icon(
                                onPressed: _busy ? null : _enableNotifications,
                                icon: Icon(_canRequestNotifications
                                    ? Icons.notifications_outlined
                                    : Icons.settings_outlined),
                                label: Text(_canRequestNotifications
                                    ? 'Cho phép thông báo'
                                    : 'Cài đặt thông báo'),
                              )
                            : null,
                      ),
                      if (!widget.session.pushNotifications.configured)
                        const Padding(
                            padding: EdgeInsets.fromLTRB(4, 0, 4, 16),
                            child: Text(
                                'Firebase chưa sẵn sàng: bật quyền không có nghĩa push từ Backend đã hoạt động. Hộp thư vẫn sử dụng được.',
                                style: TextStyle(
                                    color: brandMuted,
                                    fontSize: 12,
                                    height: 1.5))),
                      _PermissionCard(
                        icon: Icons.location_on_outlined,
                        title: 'Vị trí',
                        status: _locationPermission == null
                            ? 'Chưa xác định'
                            : locationGranted
                                ? (_accuracy == LocationAccuracyStatus.reduced
                                    ? 'Vị trí gần đúng'
                                    : 'Đã cấp')
                                : 'Chưa cấp',
                        ready: locationGranted &&
                            _accuracy == LocationAccuracyStatus.precise,
                        description:
                            'Chỉ xin và lấy vị trí khi bạn bấm chấm công hoặc bắt đầu/kết thúc công tác. Chọn vị trí chính xác, khi dùng ứng dụng; không theo dõi nền.'
                            '${_locationServiceEnabled == false ? '\nDịch vụ vị trí đang tắt.' : ''}',
                        action: _locationPermission ==
                                    LocationPermission.deniedForever ||
                                (locationGranted &&
                                    _accuracy == LocationAccuracyStatus.reduced)
                            ? TextButton.icon(
                                onPressed: _busy
                                    ? null
                                    : () => _act(() async {
                                          await Geolocator.openAppSettings();
                                        }),
                                icon: const Icon(Icons.settings_outlined),
                                label: const Text('Cài đặt vị trí'))
                            : _locationServiceEnabled == false
                                ? TextButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _act(() async {
                                              await Geolocator
                                                  .openLocationSettings();
                                            }),
                                    icon: const Icon(Icons.gps_fixed_rounded),
                                    label: const Text('Bật dịch vụ vị trí'))
                                : null,
                      ),
                      const _PermissionCard(
                        icon: Icons.camera_alt_outlined,
                        title: 'Camera',
                        status: 'Khi chụp ảnh',
                        description:
                            'Mở camera hệ thống khi bạn chọn Chụp minh chứng. Không mở camera hay chụp ảnh trong bước thiết lập này.',
                      ),
                      const _PermissionCard(
                        icon: Icons.photo_library_outlined,
                        title: 'Ảnh minh chứng',
                        status: 'Chỉ ảnh bạn chọn',
                        description:
                            'Dùng trình chọn ảnh hệ thống khi đính kèm. App không yêu cầu quyền đọc toàn bộ kho ảnh; hủy chọn không ảnh hưởng đơn.',
                      ),
                    ],
                  ),
          ),
          bottomNavigationBar: SafeArea(
            child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FilledButton(
                          onPressed: _busy ? null : _finish,
                          child: Text(widget.firstRun
                              ? 'Tiếp tục vào ứng dụng'
                              : 'Xong')),
                      if (widget.firstRun)
                        TextButton(
                            onPressed: _busy ? null : _finish,
                            child: const Text('Để sau')),
                    ])),
          ),
        ),
      ),
    );
  }
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard(
      {required this.icon,
      required this.title,
      required this.status,
      required this.description,
      this.ready = false,
      this.action});
  final IconData icon;
  final String title;
  final String status;
  final String description;
  final bool ready;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: brandLine)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: brandPurple, size: 23),
            const SizedBox(width: 10),
            Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 16)))
          ]),
          const SizedBox(height: 8),
          Text(status,
              style: TextStyle(
                  color: ready ? const Color(0xFF15803D) : brandPurple,
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(description,
              style: const TextStyle(
                  color: brandMuted, height: 1.5, fontSize: 13)),
          if (action != null)
            Padding(padding: const EdgeInsets.only(top: 8), child: action),
        ]),
      );
}
