import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../services/api_client.dart';

String explanationStepLabel(AttendanceExplanation item) =>
    switch (item.approvalStage) {
      'EMPLOYEE_RESPONSE' => 'Chờ nhân viên phản hồi',
      'WAITING_ROUTING' => 'Chờ Admin phân tuyến',
      'LEADER_CONFIRMATION' => 'Chờ Leader xác nhận',
      'HEAD_APPROVAL' => 'Chờ Trưởng phòng duyệt',
      'COMPLETED' => explanationStatusLabel(item.status),
      _ => explanationStatusLabel(item.status),
    };

String explanationStatusLabel(String status) => switch (status) {
      'SUBMITTED' => 'Chờ xử lý',
      'REQUESTED' => 'Chờ phản hồi',
      'APPROVED' => 'Đã duyệt',
      'REJECTED' => 'Từ chối',
      _ => status,
    };

String explanationIssueLabel(String type) => switch (type) {
      'MISSING_CHECK_IN' => 'Thiếu check-in',
      'MISSING_CHECK_OUT' => 'Thiếu check-out',
      'DUPLICATE_ATTEMPT' => 'Thao tác trùng',
      'WRONG_DATE_OR_DEVICE_TIME' => 'Sai ngày hoặc giờ thiết bị',
      'GPS_RISK' => 'Bất thường GPS',
      _ => 'Vấn đề khác',
    };

String explanationTime(DateTime value) =>
    DateFormat('dd/MM/yyyy HH:mm').format(value);

class ExplanationWorkflowView extends StatelessWidget {
  const ExplanationWorkflowView({required this.item, super.key});
  final AttendanceExplanation item;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const SizedBox(height: 10),
          Text(explanationStepLabel(item),
              style: const TextStyle(
                  color: brandPurple, fontWeight: FontWeight.w800)),
          if (item.teamName != null || item.departmentName != null)
            Text(<String>[
              if (item.departmentName != null) item.departmentName!,
              if (item.teamName != null) item.teamName!
            ].join(' · ')),
          if (item.routingRequired)
            const Text(
                'Tuyến chưa đủ điều kiện. Admin cần phân tuyến lại; không bỏ bước.',
                style: TextStyle(color: brandMuted, fontSize: 12)),
          if (item.leaderName != null)
            Text('Leader được chỉ định: ${item.leaderName}'),
          if (item.headName != null)
            Text('Trưởng phòng được chỉ định: ${item.headName}'),
          if (item.confirmedAt != null) ...<Widget>[
            Text(
                'Đã xác nhận: ${item.confirmedByName ?? 'Người xử lý đã ghi nhận'} · ${explanationTime(item.confirmedAt!)}'),
            if (item.confirmationNote?.isNotEmpty == true)
              Text('Ghi chú xác nhận: ${item.confirmationNote}'),
          ],
          if (item.reviewedAt != null)
            Text(
                'Đã quyết định: ${item.reviewedByName ?? 'Người xử lý đã ghi nhận'} · ${explanationTime(item.reviewedAt!)}'),
        ],
      );
}
