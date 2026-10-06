import 'dart:io';

import 'package:flutter/material.dart';

import '../../app.dart';

/// Presentation only: callers supply the actual operation state.
class AppFormSection extends StatelessWidget {
  const AppFormSection(
      {required this.title, required this.description, super.key});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 5),
            Text(description,
                style: const TextStyle(
                    color: brandMuted, fontSize: 12, height: 1.45)),
          ],
        ),
      );
}

class AppFormAction extends StatelessWidget {
  const AppFormAction(
      {required this.label,
      required this.icon,
      required this.onPressed,
      this.busy = false,
      this.busyLabel = 'Đang gửi…',
      super.key});

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool busy;
  final String busyLabel;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: busy ? null : onPressed,
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 54),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            backgroundColor: brandPurple,
          ),
          icon: busy
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Icon(icon),
          label: Text(busy ? busyLabel : label, textAlign: TextAlign.center),
        ),
      );
}

class AppEvidencePreview extends StatelessWidget {
  const AppEvidencePreview(
      {required this.path,
      required this.status,
      required this.onRetake,
      super.key});

  final String path;
  final String status;
  final VoidCallback? onRetake;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: Colors.white, border: Border.all(color: brandLine)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(path),
                height: 210,
                fit: BoxFit.cover,
                semanticLabel: 'Ảnh bằng chứng đã chụp',
                errorBuilder: (_, __, ___) => const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text(
                      'Không thể hiển thị ảnh. Hãy chụp lại nếu ảnh không còn trên thiết bị.',
                      style: TextStyle(color: brandDanger)),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Semantics(
                liveRegion: true,
                child: Text(status,
                    style: const TextStyle(
                        color: brandMuted, fontSize: 12, height: 1.45))),
            const SizedBox(height: 8),
            TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size(0, 48)),
              onPressed: onRetake,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Chụp lại'),
            ),
          ],
        ),
      );
}
