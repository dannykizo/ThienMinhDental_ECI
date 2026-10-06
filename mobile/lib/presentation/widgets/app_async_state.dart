import 'package:flutter/material.dart';

import '../../app.dart';

class AppPageIntro extends StatelessWidget {
  const AppPageIntro({
    required this.description,
    required this.eyebrow,
    required this.title,
    super.key,
  });

  final String description;
  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            eyebrow.toUpperCase(),
            style: const TextStyle(
              color: brandPurple,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.25,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              color: brandInk,
              fontSize: 28,
              fontWeight: FontWeight.w800,
              height: 1.14,
              letterSpacing: -0.7,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            description,
            style: const TextStyle(
              color: brandMuted,
              fontSize: 12,
              height: 1.55,
            ),
          ),
        ],
      );
}

class AppLoadingState extends StatelessWidget {
  const AppLoadingState({
    this.label = 'Đang tải dữ liệu…',
    super.key,
  });

  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
        excludeSemantics: true,
        label: label,
        liveRegion: true,
        child: Container(
          constraints: const BoxConstraints(minHeight: 220),
          width: double.infinity,
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: brandLine),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              const SizedBox.square(
                dimension: 30,
                child: CircularProgressIndicator(
                  color: brandPurple,
                  strokeWidth: 2.4,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: brandMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
}

class AppErrorState extends StatelessWidget {
  const AppErrorState({
    required this.message,
    this.compact = false,
    this.onRetry,
    this.onSecondaryAction,
    this.retryLabel = 'Thử lại',
    this.secondaryActionLabel,
    this.title = 'Chưa thể tải dữ liệu',
    super.key,
  });

  final bool compact;
  final String message;
  final Future<void> Function()? onRetry;
  final Future<void> Function()? onSecondaryAction;
  final String retryLabel;
  final String? secondaryActionLabel;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final Widget content = Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment:
          compact ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      children: <Widget>[
        Container(
          width: compact ? 36 : 48,
          height: compact ? 36 : 48,
          decoration: BoxDecoration(
            color: brandDangerLight,
            border: Border.all(color: const Color(0xFFFECACA)),
            borderRadius: BorderRadius.circular(compact ? 8 : 12),
          ),
          child: Icon(
            Icons.error_outline_rounded,
            color: brandDanger,
            size: compact ? 20 : 24,
          ),
        ),
        SizedBox(height: compact ? 10 : 16),
        if (title != null) ...<Widget>[
          Text(
            title!,
            textAlign: compact ? TextAlign.start : TextAlign.center,
            style: const TextStyle(
              color: brandInk,
              fontSize: 16,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 6),
        ],
        Text(
          message,
          textAlign: compact ? TextAlign.start : TextAlign.center,
          style: const TextStyle(
            color: brandMuted,
            fontSize: 12,
            height: 1.5,
          ),
        ),
        if (onRetry != null || onSecondaryAction != null) ...<Widget>[
          SizedBox(height: compact ? 8 : 16),
          Wrap(
            alignment: compact ? WrapAlignment.start : WrapAlignment.center,
            spacing: 8,
            runSpacing: 4,
            children: <Widget>[
              if (onRetry != null)
                TextButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: Text(retryLabel),
                ),
              if (onSecondaryAction != null && secondaryActionLabel != null)
                TextButton(
                  onPressed: onSecondaryAction,
                  child: Text(secondaryActionLabel!),
                ),
            ],
          ),
        ],
      ],
    );

    return Semantics(
      liveRegion: true,
      child: Container(
        constraints: BoxConstraints(minHeight: compact ? 0 : 220),
        width: double.infinity,
        padding: EdgeInsets.all(compact ? 16 : 28),
        decoration: BoxDecoration(
          color: compact ? brandDangerLight : Colors.white,
          border: Border.all(
            color: compact ? const Color(0xFFFECACA) : brandLine,
          ),
          borderRadius: BorderRadius.circular(compact ? 10 : 12),
        ),
        child: content,
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    required this.description,
    required this.icon,
    required this.title,
    super.key,
  });

  final String description;
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 220),
        width: double.infinity,
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: brandLine),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: brandPurpleLight,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: brandPurple, size: 24),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: brandInk,
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: brandMuted,
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
      );
}
