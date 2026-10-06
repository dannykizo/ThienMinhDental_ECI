import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../../presentation/widgets/app_form_controls.dart';
import '../../presentation/widgets/app_list_controls.dart';
import '../../services/api_client.dart';

class AnnouncementInboxScreen extends StatefulWidget {
  const AnnouncementInboxScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<AnnouncementInboxScreen> createState() =>
      _AnnouncementInboxScreenState();
}

class _AnnouncementInboxScreenState extends State<AnnouncementInboxScreen> {
  List<EmployeeAnnouncement> _items = <EmployeeAnnouncement>[];
  String? _error;
  bool _loading = true;
  bool _hasLoaded = false;
  String _filter = 'ALL';

  List<EmployeeAnnouncement> get _visibleItems => _items
      .where((EmployeeAnnouncement item) => switch (_filter) {
            'UNREAD' => item.readAt == null,
            'NEEDS_ACK' =>
              item.requiresAcknowledgement && item.acknowledgedAt == null,
            'DISCIPLINARY' => item.isDisciplinary,
            _ => true,
          })
      .toList();
  late int _revision;

  @override
  void initState() {
    super.initState();
    _revision = widget.session.announcementRevision;
    widget.session.addListener(_onSessionChanged);
    unawaited(_load());
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (_revision == widget.session.announcementRevision) return;
    _revision = widget.session.announcementRevision;
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
      final List<EmployeeAnnouncement> items =
          await widget.session.api.myAnnouncements();
      widget.session.updateUnreadAnnouncementCount(
        items.where((EmployeeAnnouncement item) => item.readAt == null).length,
      );
      if (mounted) {
        setState(() {
          _items = items;
          _hasLoaded = true;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(EmployeeAnnouncement item) async {
    if (item.readAt == null) {
      try {
        await widget.session.api.markAnnouncementRead(item.id);
        widget.session.announceInboxChanged();
      } on ApiException catch (error) {
        if (mounted) setState(() => _error = error.message);
        return;
      }
    }
    if (!mounted) return;
    final bool? changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (BuildContext context) => AnnouncementDetailScreen(
          announcement: item,
          session: widget.session,
        ),
      ),
    );
    if (changed == true || item.readAt == null) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: brandCanvas,
          surfaceTintColor: Colors.transparent,
          title: const Text(
            'Hộp thư',
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
                eyebrow: 'Thông báo nội bộ',
                title: 'Thông báo của bạn',
                description:
                    'Tin chưa đọc được đánh dấu rõ. Một số thông báo quan trọng cần bạn xác nhận sau khi xem.',
              ),
              if (!widget.session.pushNotifications.configured) ...<Widget>[
                const SizedBox(height: 16),
                const _PushNotConfigured(),
              ] else if (!widget
                  .session.pushNotifications.permissionGranted) ...<Widget>[
                const SizedBox(height: 16),
                const _PushPermissionRequired(),
              ] else if (widget.session.pushNotifications.currentToken ==
                  null) ...<Widget>[
                const SizedBox(height: 16),
                const _PushTokenPending(),
              ],
              if (_error != null && _items.isNotEmpty) ...<Widget>[
                const SizedBox(height: 16),
                AppErrorState(
                  compact: true,
                  message: _error!,
                  onRetry: _load,
                  title: 'Chưa thể làm mới hộp thư',
                ),
              ],
              const SizedBox(height: 20),
              if (_hasLoaded) ...<Widget>[
                AppListFilters(
                  label: 'Lọc hộp thư',
                  options: const <String, String>{
                    'ALL': 'Tất cả',
                    'UNREAD': 'Chưa đọc',
                    'NEEDS_ACK': 'Cần xác nhận',
                    'DISCIPLINARY': 'Kỷ luật',
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
                  label: 'Đang tải hộp thư…',
                )
              else if (_error != null && _items.isEmpty)
                AppErrorState(message: _error!, onRetry: _load)
              else if (_items.isEmpty)
                const AppEmptyState(
                  description:
                      'Thông báo được Admin xuất bản cho bạn sẽ xuất hiện tại đây.',
                  icon: Icons.mark_email_read_outlined,
                  title: 'Hộp thư đang trống',
                )
              else if (_visibleItems.isEmpty)
                AppFilteredEmptyState(
                  onClear: () => setState(() => _filter = 'ALL'),
                )
              else
                ..._visibleItems.map(
                  (EmployeeAnnouncement item) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: item.isDisciplinary
                        ? _DisciplinaryCard(
                            item: item,
                            onTap: () => _open(item),
                          )
                        : _AnnouncementCard(
                            item: item,
                            onTap: () => _open(item),
                          ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class AnnouncementDetailScreen extends StatefulWidget {
  const AnnouncementDetailScreen({
    required this.announcement,
    required this.session,
    super.key,
  });

  final EmployeeAnnouncement announcement;
  final SessionController session;

  @override
  State<AnnouncementDetailScreen> createState() =>
      _AnnouncementDetailScreenState();
}

class _AnnouncementDetailScreenState extends State<AnnouncementDetailScreen> {
  String? _error;
  bool _acknowledged = false;
  bool _submitting = false;

  Future<void> _acknowledge() async {
    if (_submitting) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.session.api.acknowledgeAnnouncement(widget.announcement.id);
      _acknowledged = true;
      widget.session.announceInboxChanged();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã xác nhận thông báo.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      setState(() {});
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final EmployeeAnnouncement item = widget.announcement;
    final bool disciplinary = item.isDisciplinary;
    final bool needsAcknowledgement = item.requiresAcknowledgement &&
        item.acknowledgedAt == null &&
        !_acknowledged;
    return PopScope(
      canPop: !_submitting,
      child: Scaffold(
        appBar: AppBar(title: const Text('Chi tiết thông báo')),
        body: SafeArea(
          top: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: <Widget>[
              if (disciplinary)
                _DisciplinaryWarningBanner(
                  item: item,
                  required: needsAcknowledgement,
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    _AudienceBadge(item: item),
                    if (item.requiresAcknowledgement) ...<Widget>[
                      const _ImportantBadge(),
                    ],
                  ],
                ),
              const SizedBox(height: 12),
              Text(
                DateFormat('dd/MM/yyyy · HH:mm').format(item.publishedAt),
                style: const TextStyle(
                  color: brandPurple,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .8,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                disciplinary ? _disciplinaryTitle(item) : item.title,
                style: const TextStyle(
                  fontSize: 29,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                  letterSpacing: -0.6,
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border:
                      Border(left: BorderSide(color: brandPurple, width: 3)),
                ),
                child: Text(
                  item.body,
                  style: const TextStyle(fontSize: 15, height: 1.65),
                ),
              ),
              const SizedBox(height: 14),
              if (!disciplinary) _AudienceNotice(item: item),
              if (item.requiresAcknowledgement) ...<Widget>[
                const SizedBox(height: 18),
                _AcknowledgementNotice(done: !needsAcknowledgement),
              ],
              if (_error != null) ...<Widget>[
                const SizedBox(height: 14),
                AppErrorState(
                  compact: true,
                  message: _error!,
                  title: null,
                ),
              ],
              if (needsAcknowledgement) ...<Widget>[
                const SizedBox(height: 18),
                AppFormAction(
                    label: 'Tôi đã đọc và xác nhận',
                    icon: Icons.verified_outlined,
                    busy: _submitting,
                    busyLabel: 'Đang xác nhận…',
                    onPressed: _acknowledge),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  const _AnnouncementCard({required this.item, required this.onTap});

  final EmployeeAnnouncement item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool unread = item.readAt == null;
    final bool waitingForAcknowledgement =
        item.requiresAcknowledgement && item.acknowledgedAt == null;
    return Material(
      color: unread ? const Color(0xFFF7F0F9) : Colors.white,
      shape: RoundedRectangleBorder(
        side: BorderSide(
          color: unread ? brandPurple : const Color(0xFFE5DDE7),
        ),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  _AudienceBadge(item: item),
                  _InboxStatus(
                    unread: unread,
                    waitingForAcknowledgement: false,
                    acknowledged: item.acknowledgedAt != null,
                  ),
                  if (waitingForAcknowledgement)
                    const _InboxStatus(
                        unread: false, waitingForAcknowledgement: true),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                DateFormat('dd/MM/yyyy · HH:mm').format(item.publishedAt),
                style: const TextStyle(
                  color: Color(0xFF8B7F8E),
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 9),
              Text(
                item.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: unread ? FontWeight.w800 : FontWeight.w700,
                  letterSpacing: -0.35,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                item.body,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF615764),
                  fontSize: 12,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 10),
              const AppListOpenHint(),
            ],
          ),
        ),
      ),
    );
  }
}

class _InboxStatus extends StatelessWidget {
  const _InboxStatus({
    required this.unread,
    required this.waitingForAcknowledgement,
    this.acknowledged = false,
  });

  final bool unread;
  final bool waitingForAcknowledgement;
  final bool acknowledged;

  @override
  Widget build(BuildContext context) {
    final String label = unread
        ? 'CHƯA ĐỌC'
        : waitingForAcknowledgement
            ? 'CẦN XÁC NHẬN'
            : acknowledged
                ? 'ĐÃ XÁC NHẬN'
                : 'ĐÃ ĐỌC';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      color: unread
          ? const Color(0xFFF0E3F4)
          : waitingForAcknowledgement
              ? const Color(0xFFFFF0DD)
              : const Color(0xFFE8F3ED),
      child: Text(
        label,
        style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _AcknowledgementNotice extends StatelessWidget {
  const _AcknowledgementNotice({required this.done});

  final bool done;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: done ? const Color(0xFFE8F3ED) : const Color(0xFFFFF6E7),
          border: Border(
            left: BorderSide(
              color: done ? const Color(0xFF338865) : brandOrange,
              width: 3,
            ),
          ),
        ),
        child: Row(
          children: <Widget>[
            Icon(
              done ? Icons.verified_rounded : Icons.priority_high_rounded,
              color: done ? const Color(0xFF338865) : brandOrange,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                done
                    ? 'Bạn đã xác nhận thông báo quan trọng này.'
                    : 'Thông báo quan trọng này yêu cầu xác nhận đã đọc.',
                style: const TextStyle(fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

class _AudienceBadge extends StatelessWidget {
  const _AudienceBadge({required this.item});

  final EmployeeAnnouncement item;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        color: item.audienceType == 'ALL'
            ? const Color(0xFFE8F3ED)
            : const Color(0xFFF2EAF5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              _audienceIcon(item.audienceType),
              size: 13,
              color: item.audienceType == 'ALL'
                  ? const Color(0xFF287A55)
                  : brandPurple,
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                _audienceLabel(item),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: item.audienceType == 'ALL'
                      ? const Color(0xFF287A55)
                      : brandPurple,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      );
}

class _ImportantBadge extends StatelessWidget {
  const _ImportantBadge();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        color: const Color(0xFFFFF0DD),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.priority_high_rounded, color: brandOrange, size: 13),
            SizedBox(width: 4),
            Text(
              'QUAN TRỌNG',
              style: TextStyle(
                color: Color(0xFF8D5D1B),
                fontSize: 9,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      );
}

class _AudienceNotice extends StatelessWidget {
  const _AudienceNotice({required this.item});

  final EmployeeAnnouncement item;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: item.audienceType == 'ALL'
              ? const Color(0xFFEAF7F1)
              : const Color(0xFFF8F4F8),
          border: Border.all(
            color: item.audienceType == 'ALL'
                ? const Color(0xFFC7E4D7)
                : const Color(0xFFE8DFE9),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(
              _audienceIcon(item.audienceType),
              color: item.audienceType == 'ALL'
                  ? const Color(0xFF287A55)
                  : brandPurple,
              size: 20,
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                _audienceDescription(item),
                style: const TextStyle(fontSize: 12, height: 1.45),
              ),
            ),
          ],
        ),
      );
}

class _PushNotConfigured extends StatelessWidget {
  const _PushNotConfigured();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF6E7),
          border: Border(left: BorderSide(color: brandOrange, width: 3)),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.notifications_off_outlined, color: brandOrange),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Bản build này chưa có cấu hình Firebase. Hộp thư vẫn đồng bộ đầy đủ khi bạn mở ứng dụng.',
                style: TextStyle(fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

class _PushPermissionRequired extends StatelessWidget {
  const _PushPermissionRequired();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF6E7),
          border: Border(left: BorderSide(color: brandOrange, width: 3)),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.notifications_paused_outlined, color: brandOrange),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Thông báo hệ thống đang bị tắt. Hãy cho phép thông báo trong Cài đặt của điện thoại; Hộp thư trong ứng dụng vẫn hoạt động bình thường.',
                style: TextStyle(fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

class _PushTokenPending extends StatelessWidget {
  const _PushTokenPending();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF6E7),
          border: Border(left: BorderSide(color: brandOrange, width: 3)),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.sync_problem_outlined, color: brandOrange),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Thiết bị chưa nhận được mã push. Hãy kiểm tra Internet và mở lại ứng dụng; Hộp thư vẫn có thể làm mới thủ công.',
                style: TextStyle(fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

IconData _audienceIcon(String audienceType) => switch (audienceType) {
      'ALL' => Icons.campaign_outlined,
      'DEPARTMENT' => Icons.groups_outlined,
      _ => Icons.person_outline_rounded,
    };

String _audienceLabel(EmployeeAnnouncement item) => switch (item.audienceType) {
      'ALL' => 'TOÀN CÔNG TY',
      'DEPARTMENT' when item.targetName?.isNotEmpty == true =>
        'PHÒNG BAN · ${item.targetName}',
      'DEPARTMENT' => 'PHÒNG BAN',
      _ => 'CÁ NHÂN',
    };

String _audienceDescription(EmployeeAnnouncement item) =>
    switch (item.audienceType) {
      'ALL' =>
        'Thông báo này được gửi tới toàn bộ nhân viên đang hoạt động tại thời điểm phát hành.',
      'DEPARTMENT' when item.targetName?.isNotEmpty == true =>
        'Thông báo dành cho phòng ban ${item.targetName}.',
      'DEPARTMENT' => 'Thông báo dành cho phòng ban được Admin chỉ định.',
      _ => 'Thông báo này được gửi riêng tới tài khoản nhân viên của bạn.',
    };

const Color _disciplinaryWarningSurface = Color(0xFFFFF4EC);
const Color _disciplinaryRevokedSurface = Color(0xFFF2F0F3);
const Color _disciplinaryRevokedAccent = Color(0xFF8B7F8E);

String _disciplineLabel(String? type) => switch (type) {
      'WARNING' => 'Cảnh cáo',
      'SUSPENSION' => 'Đình chỉ',
      'DISCIPLINARY_ACTION' => 'Xử lý vi phạm',
      _ => 'Quyết định kỷ luật',
    };

IconData _disciplineIcon(String? type) => switch (type) {
      'WARNING' => Icons.warning_amber_rounded,
      'SUSPENSION' => Icons.pause_circle_outline_rounded,
      _ => Icons.gavel_rounded,
    };

Color _disciplineColor(String? type) => switch (type) {
      'WARNING' => brandOrange,
      'SUSPENSION' => const Color(0xFFB3261E),
      'DISCIPLINARY_ACTION' => const Color(0xFF8B3A62),
      _ => brandPurple,
    };

String _disciplinaryTitle(EmployeeAnnouncement item) =>
    item.disciplinaryTitle?.isNotEmpty == true
        ? item.disciplinaryTitle!
        : item.title;

String _disciplinaryEffectivePeriod(EmployeeAnnouncement item) {
  final DateTime? from = item.disciplinaryEffectiveFrom;
  final DateTime? to = item.disciplinaryEffectiveTo;
  if (from == null) return 'Không xác định';
  final DateFormat format = DateFormat('dd/MM/yyyy');
  final String fromText = format.format(from);
  if (to == null) return 'Từ $fromText';
  return '$fromText - ${format.format(to)}';
}

class _DisciplinaryCard extends StatelessWidget {
  const _DisciplinaryCard({required this.item, required this.onTap});

  final EmployeeAnnouncement item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool unread = item.readAt == null;
    final bool waitingForAcknowledgement =
        item.requiresAcknowledgement && item.acknowledgedAt == null;
    final bool revoked = item.disciplinaryRevoked;
    final Color accent = revoked
        ? _disciplinaryRevokedAccent
        : _disciplineColor(item.disciplinaryActionType);
    final String category = _disciplineLabel(item.disciplinaryActionType);
    return Material(
      color:
          revoked ? _disciplinaryRevokedSurface : _disciplinaryWarningSurface,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: accent, width: unread ? 2 : 1),
      ),
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: accent, width: 5)),
          ),
          padding: const EdgeInsets.all(17),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        revoked
                            ? Icons.history_rounded
                            : _disciplineIcon(item.disciplinaryActionType),
                        size: 15,
                        color: accent,
                      ),
                      const SizedBox(width: 5),
                      Flexible(
                        child: Text(
                          revoked
                              ? 'THU HỒI · ${category.toUpperCase()}'
                              : 'KỶ LUẬT · ${category.toUpperCase()}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: accent,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .6,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      _DisciplinaryStatus(
                        unread: unread,
                        waitingForAcknowledgement: waitingForAcknowledgement,
                        revoked: revoked,
                      ),
                      if (unread && revoked)
                        const _InboxStatus(
                            unread: true, waitingForAcknowledgement: false),
                      if (waitingForAcknowledgement && (unread || revoked))
                        const _InboxStatus(
                            unread: false, waitingForAcknowledgement: true),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                DateFormat('dd/MM/yyyy · HH:mm').format(item.publishedAt),
                style: const TextStyle(color: Color(0xFF8B7F8E), fontSize: 10),
              ),
              const SizedBox(height: 9),
              Text(
                _disciplinaryTitle(item),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: unread ? FontWeight.w800 : FontWeight.w700,
                  letterSpacing: -0.35,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: <Widget>[
                  const Icon(
                    Icons.event_available_outlined,
                    size: 14,
                    color: Color(0xFF6E646F),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      'Hiệu lực: ${_disciplinaryEffectivePeriod(item)}',
                      style: const TextStyle(
                        color: Color(0xFF615764),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const AppListOpenHint(),
            ],
          ),
        ),
      ),
    );
  }
}

class _DisciplinaryStatus extends StatelessWidget {
  const _DisciplinaryStatus({
    required this.unread,
    required this.waitingForAcknowledgement,
    required this.revoked,
  });

  final bool unread;
  final bool waitingForAcknowledgement;
  final bool revoked;

  @override
  Widget build(BuildContext context) {
    final String label = revoked
        ? 'ĐÃ THU HỒI'
        : unread
            ? 'CHƯA ĐỌC'
            : waitingForAcknowledgement
                ? 'CẦN XÁC NHẬN'
                : 'ĐÃ XÁC NHẬN';
    final Color background = revoked
        ? const Color(0xFFECE7EF)
        : unread
            ? const Color(0xFFF0E3F4)
            : waitingForAcknowledgement
                ? const Color(0xFFFFE7D1)
                : const Color(0xFFE8F3ED);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      color: background,
      child: Text(
        label,
        style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _DisciplinaryWarningBanner extends StatelessWidget {
  const _DisciplinaryWarningBanner(
      {required this.item, required this.required});

  final EmployeeAnnouncement item;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final bool revoked = item.disciplinaryRevoked;
    final Color accent = revoked
        ? _disciplinaryRevokedAccent
        : _disciplineColor(item.disciplinaryActionType);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color:
            revoked ? _disciplinaryRevokedSurface : _disciplinaryWarningSurface,
        border: Border(left: BorderSide(color: accent, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(
                revoked
                    ? Icons.history_rounded
                    : _disciplineIcon(item.disciplinaryActionType),
                color: accent,
                size: 22,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      revoked ? 'THÔNG BÁO THU HỒI' : 'QUYẾT ĐỊNH KỶ LUẬT',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _disciplineLabel(item.disciplinaryActionType),
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.35,
                        color: accent,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _DisciplinaryMetaRow(
            icon: Icons.event_available_outlined,
            label: 'Hiệu lực',
            value: _disciplinaryEffectivePeriod(item),
          ),
          if (revoked) ...<Widget>[
            const SizedBox(height: 8),
            const _DisciplinaryMetaRow(
              icon: Icons.info_outline_rounded,
              label: 'Trạng thái',
              value: 'Quyết định đã bị thu hồi',
            ),
          ],
          if (required) ...<Widget>[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(11),
              color: Colors.white,
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(Icons.assignment_turned_in_outlined, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Quyết định này bắt buộc bạn xác nhận đã đọc.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DisciplinaryMetaRow extends StatelessWidget {
  const _DisciplinaryMetaRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 16, color: const Color(0xFF6E646F)),
          const SizedBox(width: 7),
          Text(
            '$label: ',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF6E646F),
            ),
          ),
          Expanded(
            child:
                Text(value, style: const TextStyle(fontSize: 12, height: 1.4)),
          ),
        ],
      );
}
