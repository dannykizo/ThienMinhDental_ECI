import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app.dart';
import '../../services/api_client.dart';
import '../announcements/announcement_inbox_screen.dart';
import '../attendance/attendance_home.dart';
import '../business_trips/business_trip_list_screen.dart';
import '../explanations/explanation_list_screen.dart';
import '../leave/leave_request_screen.dart';

class EmployeeShell extends StatefulWidget {
  const EmployeeShell({required this.session, super.key});

  final SessionController session;

  @override
  State<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends State<EmployeeShell>
    with WidgetsBindingObserver {
  int _selectedIndex = 0;
  late int _inboxNavigationRequest;
  late int _foregroundAnnouncementRequest;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _inboxNavigationRequest = widget.session.inboxNavigationRequest;
    _foregroundAnnouncementRequest =
        widget.session.foregroundAnnouncementRequest;
    widget.session.addListener(_onSessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(widget.session.refreshUnreadAnnouncements());
      unawaited(widget.session.refreshManagementAccess());
    });
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.session.refreshManagementAccess());
    }
  }

  void _onSessionChanged() {
    if (!mounted) return;
    if (_inboxNavigationRequest != widget.session.inboxNavigationRequest) {
      _inboxNavigationRequest = widget.session.inboxNavigationRequest;
      setState(() => _selectedIndex = 4);
    }
    if (_foregroundAnnouncementRequest !=
        widget.session.foregroundAnnouncementRequest) {
      _foregroundAnnouncementRequest =
          widget.session.foregroundAnnouncementRequest;
      final String title =
          widget.session.foregroundAnnouncementTitle ?? 'Bạn có thông báo mới';
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(title),
            action: SnackBarAction(
              label: 'Mở hộp thư',
              onPressed: () => setState(() => _selectedIndex = 4),
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      });
    }
  }

  void _selectDestination(int index) {
    HapticFeedback.selectionClick();
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _selectedIndex,
          children: <Widget>[
            AttendanceHome(
              session: widget.session,
              onOpenBusinessTrips: () => _selectDestination(1),
              onOpenLeave: () => _selectDestination(2),
              onOpenExplanations: () => _selectDestination(3),
              onOpenInbox: () => _selectDestination(4),
            ),
            BusinessTripListScreen(session: widget.session),
            LeaveRequestScreen(session: widget.session),
            ExplanationListScreen(session: widget.session),
            AnnouncementInboxScreen(session: widget.session),
          ],
        ),
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (widget.session.apiAvailability != ApiAvailability.available)
              _ApiAvailabilityBanner(session: widget.session),
            NavigationBar(
              selectedIndex: _selectedIndex,
              onDestinationSelected: _selectDestination,
              destinations: <NavigationDestination>[
                const NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home_rounded, color: brandPurple),
                  label: 'Hôm nay',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.work_outline_rounded),
                  selectedIcon: Icon(Icons.work_rounded, color: brandPurple),
                  label: 'Công tác',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.event_note_outlined),
                  selectedIcon:
                      Icon(Icons.event_note_rounded, color: brandPurple),
                  label: 'Nghỉ phép',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.fact_check_outlined),
                  selectedIcon:
                      Icon(Icons.fact_check_rounded, color: brandPurple),
                  label: 'Giải trình',
                ),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: widget.session.unreadAnnouncementCount > 0,
                    label: Text(
                      widget.session.unreadAnnouncementCount > 99
                          ? '99+'
                          : '${widget.session.unreadAnnouncementCount}',
                    ),
                    child: const Icon(Icons.mail_outline_rounded),
                  ),
                  selectedIcon: Badge(
                    isLabelVisible: widget.session.unreadAnnouncementCount > 0,
                    label: Text(
                      widget.session.unreadAnnouncementCount > 99
                          ? '99+'
                          : '${widget.session.unreadAnnouncementCount}',
                    ),
                    child: const Icon(Icons.mail_rounded, color: brandPurple),
                  ),
                  label: 'Hộp thư',
                ),
              ],
            ),
          ],
        ),
      );
}

class _ApiAvailabilityBanner extends StatelessWidget {
  const _ApiAvailabilityBanner({required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final bool offline = session.apiAvailability == ApiAvailability.offline;
    final Color accent =
        offline ? const Color(0xFF9A681A) : const Color(0xFF9D433A);
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
        decoration: BoxDecoration(
          color: offline ? const Color(0xFFFFF6E5) : const Color(0xFFFFEFEC),
          border: Border(top: BorderSide(color: accent, width: 2)),
        ),
        child: Row(
          children: <Widget>[
            Icon(
              offline ? Icons.wifi_off_rounded : Icons.cloud_off_outlined,
              color: accent,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    offline
                        ? 'Thiết bị đang mất mạng'
                        : 'Backend tạm gián đoạn',
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Phiên vẫn được giữ. Bạn có thể thử lại khi kết nối ổn định.',
                    style: TextStyle(color: accent, fontSize: 11),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: session.isCheckingAvailability
                  ? null
                  : session.retryBackendConnection,
              style: TextButton.styleFrom(foregroundColor: accent),
              child: session.isCheckingAvailability
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Thử lại'),
            ),
          ],
        ),
      ),
    );
  }
}
