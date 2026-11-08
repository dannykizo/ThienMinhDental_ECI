import 'package:flutter/material.dart';
import '../../app.dart';
import '../../presentation/widgets/app_async_state.dart';
import '../explanations/explanation_list_screen.dart';
import '../leave/leave_request_screen.dart';
import '../overtime/managed_overtime_screen.dart';

class FormsHome extends StatelessWidget {
  const FormsHome({required this.session, super.key});
  final SessionController session;
  void _open(BuildContext context, Widget page) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Đơn từ')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          const AppPageIntro(
              eyebrow: 'ĐƠN TỪ CÁ NHÂN',
              title: 'Bạn cần gửi loại đơn nào?',
              description:
                  'Tạo đơn, theo dõi trạng thái và xem người xử lý. Chấm công hiện trường thực hiện tại Hôm nay, không cần đơn công tác.'),
          const SizedBox(height: 20),
          _entry(
              context,
              'Giải trình',
              'Báo cáo vấn đề và minh chứng nếu có',
              Icons.fact_check_outlined,
              const Color(0xFF7953AB),
              ExplanationListScreen(session: session)),
          _entry(
              context,
              'Đơn nghỉ phép',
              'Tạo đơn, xem chính sách và số dư phép',
              Icons.event_note_outlined,
              const Color(0xFF3478B9),
              LeaveRequestScreen(session: session)),
          _entry(
              context,
              'Đơn tăng ca (OT)',
              'Gửi sau OT, theo dõi tuyến duyệt riêng',
              Icons.more_time_rounded,
              const Color(0xFF18856B),
              ManagedOvertimeScreen(session: session, mine: true)),
        ]),
      );
  Widget _entry(BuildContext context, String title, String description,
          IconData icon, Color color, Widget page) =>
      Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14)),
                child: Icon(icon, color: color)),
            title: Text(title,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(description),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _open(context, page)),
      );
}
