import 'package:flutter/material.dart';

import '../../app.dart';
import 'app_async_state.dart';

/// Filters only the loaded collection. Selecting a chip never requests data.
class AppListFilters extends StatelessWidget {
  const AppListFilters({
    required this.options,
    required this.selected,
    required this.onSelected,
    required this.visibleCount,
    required this.loadedCount,
    this.label = 'Lọc trạng thái',
    this.scopeNote,
    super.key,
  });

  final Map<String, String> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final int visibleCount;
  final int loadedCount;
  final String label;
  final String? scopeNote;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style: const TextStyle(
                  color: brandInk, fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: options.entries
                .map((MapEntry<String, String> option) => ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: ChoiceChip(
                        showCheckmark: false,
                        label: Text(option.value),
                        selected: selected == option.key,
                        onSelected: (_) => onSelected(option.key),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text('Hiển thị $visibleCount / $loadedCount mục đã tải',
                style: const TextStyle(color: brandMuted, fontSize: 11)),
          ),
          if (scopeNote != null) ...<Widget>[
            const SizedBox(height: 4),
            Text(scopeNote!,
                style: const TextStyle(
                    color: brandMuted, fontSize: 11, height: 1.4)),
          ],
        ],
      );
}

class AppFilteredEmptyState extends StatelessWidget {
  const AppFilteredEmptyState({required this.onClear, super.key});

  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Column(
        children: <Widget>[
          const AppEmptyState(
            description: 'Không có mục phù hợp trong danh sách đã tải. '
                'Bỏ lọc để xem lại danh sách.',
            icon: Icons.filter_list_off_rounded,
            title: 'Không có kết quả theo bộ lọc',
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onClear,
            icon: const Icon(Icons.filter_list_off_rounded),
            label: const Text('Bỏ lọc'),
          ),
        ],
      );
}

class AppListOpenHint extends StatelessWidget {
  const AppListOpenHint({this.label = 'Xem chi tiết', super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: <Widget>[
          Flexible(
            child: Text(label,
                style: const TextStyle(
                    color: brandPurple,
                    fontSize: 12,
                    fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right_rounded, color: brandPurple, size: 20),
        ],
      );
}
