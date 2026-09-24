import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
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
        _loading = _items.isEmpty;
      });
    }
    try {
      final List<EmployeeAnnouncement> items =
          await widget.session.api.myAnnouncements();
      widget.session.updateUnreadAnnouncementCount(
        items.where((EmployeeAnnouncement item) => item.readAt == null).length,
      );
      if (mounted) setState(() => _items = items);
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
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
            children: <Widget>[
              const Text(
                'THÔNG BÁO NỘI BỘ',
                style: TextStyle(
                  color: brandPurple,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Thông tin quan trọng,\nkhông bỏ sót.',
                style: TextStyle(
                  fontFamily: 'serif',
                  fontSize: 29,
                  fontWeight: FontWeight.w500,
                  height: 1.12,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Tin chưa đọc được đánh dấu rõ. Một số thông báo quan trọng cần bạn xác nhận sau khi xem.',
                style: TextStyle(
                  color: Color(0xFF746A77),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
              if (!widget.session.pushNotifications.configured) ...<Widget>[
                const SizedBox(height: 16),
                const _PushNotConfigured(),
              ],
              if (_error != null) ...<Widget>[
                const SizedBox(height: 16),
                _InboxError(message: _error!, onRetry: _load),
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
                const _EmptyInbox()
              else
                ..._items.map(
                  (EmployeeAnnouncement item) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _AnnouncementCard(
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
    final bool needsAcknowledgement = item.requiresAcknowledgement &&
        item.acknowledgedAt == null &&
        !_acknowledged;
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết thông báo')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: <Widget>[
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
            item.title,
            style: const TextStyle(
              fontFamily: 'serif',
              fontSize: 29,
              fontWeight: FontWeight.w600,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(left: BorderSide(color: brandPurple, width: 3)),
            ),
            child: Text(
              item.body,
              style: const TextStyle(fontSize: 15, height: 1.65),
            ),
          ),
          if (item.requiresAcknowledgement) ...<Widget>[
            const SizedBox(height: 18),
            _AcknowledgementNotice(done: !needsAcknowledgement),
          ],
          if (_error != null) ...<Widget>[
            const SizedBox(height: 14),
            _InboxError(message: _error!),
          ],
          if (needsAcknowledgement) ...<Widget>[
            const SizedBox(height: 18),
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _acknowledge,
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                icon: _submitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.verified_outlined),
                label: Text(
                  _submitting ? 'Đang xác nhận…' : 'Tôi đã đọc và xác nhận',
                ),
              ),
            ),
          ],
        ],
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
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      DateFormat('dd/MM/yyyy · HH:mm').format(item.publishedAt),
                      style: const TextStyle(
                        color: Color(0xFF8B7F8E),
                        fontSize: 10,
                      ),
                    ),
                  ),
                  _InboxStatus(
                    unread: unread,
                    waitingForAcknowledgement: waitingForAcknowledgement,
                  ),
                ],
              ),
              const SizedBox(height: 9),
              Text(
                item.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'serif',
                  fontSize: 20,
                  fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
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
              const Align(
                alignment: Alignment.centerRight,
                child: Icon(Icons.chevron_right_rounded),
              ),
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
  });

  final bool unread;
  final bool waitingForAcknowledgement;

  @override
  Widget build(BuildContext context) {
    final String label = unread
        ? 'CHƯA ĐỌC'
        : waitingForAcknowledgement
            ? 'CẦN XÁC NHẬN'
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

class _InboxError extends StatelessWidget {
  const _InboxError({required this.message, this.onRetry});

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

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 50),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5DDE7)),
        ),
        child: const Column(
          children: <Widget>[
            Icon(Icons.mark_email_read_outlined, color: brandPurple, size: 34),
            SizedBox(height: 12),
            Text(
              'Hộp thư đang trống',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 6),
            Text(
              'Thông báo được Admin xuất bản cho bạn sẽ xuất hiện tại đây.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF817683), fontSize: 12),
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
