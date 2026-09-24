import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app.dart';
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

class _EmployeeShellState extends State<EmployeeShell> {
  int _selectedIndex = 0;
  late int _inboxNavigationRequest;
  late int _foregroundAnnouncementRequest;

  @override
  void initState() {
    super.initState();
    _inboxNavigationRequest = widget.session.inboxNavigationRequest;
    _foregroundAnnouncementRequest =
        widget.session.foregroundAnnouncementRequest;
    widget.session.addListener(_onSessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(widget.session.refreshUnreadAnnouncements());
    });
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    super.dispose();
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

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _selectedIndex,
          children: <Widget>[
            AttendanceHome(session: widget.session),
            BusinessTripListScreen(session: widget.session),
            LeaveRequestScreen(session: widget.session),
            ExplanationListScreen(session: widget.session),
            AnnouncementInboxScreen(session: widget.session),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _selectedIndex,
          onDestinationSelected: (int index) {
            HapticFeedback.selectionClick();
            setState(() => _selectedIndex = index);
          },
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
              selectedIcon: Icon(Icons.event_note_rounded, color: brandPurple),
              label: 'Nghỉ phép',
            ),
            const NavigationDestination(
              icon: Icon(Icons.fact_check_outlined),
              selectedIcon: Icon(Icons.fact_check_rounded, color: brandPurple),
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
      );
}
