import 'package:flutter/material.dart';

import '../../app.dart';
import '../../services/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.session, super.key});

  final SessionController session;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _email =
      TextEditingController(text: 'employee@demo.thienminh.local');
  final TextEditingController _password =
      TextEditingController(text: 'EmployeeDemo@2026');
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.login(_email.text, _password.text);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 34, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 150,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: const <BoxShadow>[
                      BoxShadow(
                          color: Color(0x18351942),
                          blurRadius: 28,
                          offset: Offset(0, 12)),
                    ],
                  ),
                  child: Image.asset('assets/brand/thien-minh-logo.png'),
                ),
                const SizedBox(height: 42),
                const Text(
                  'WORKFORCE · NHÂN VIÊN',
                  style: TextStyle(
                      color: brandPurple,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Chấm công rõ ràng,\nngay tại nơi làm việc.',
                  style: TextStyle(
                      fontFamily: 'serif',
                      fontSize: 38,
                      fontWeight: FontWeight.w500,
                      height: 1.08,
                      letterSpacing: -1.2),
                ),
                const SizedBox(height: 14),
                Text(
                  'Vị trí chỉ được lấy khi bạn chủ động check-in hoặc check-out.',
                  style: TextStyle(
                      color: brandInk.withValues(alpha: 0.64), height: 1.55),
                ),
                const SizedBox(height: 34),
                _FieldLabel(
                  label: 'Email',
                  child: TextField(
                    autocorrect: false,
                    controller: _email,
                    enabled: !_busy,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                  ),
                ),
                const SizedBox(height: 16),
                _FieldLabel(
                  label: 'Mật khẩu',
                  child: TextField(
                    controller: _password,
                    enabled: !_busy,
                    obscureText: _obscure,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                ),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 16),
                  _MessageBox(message: _error!),
                ],
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: brandPurple,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(5)),
                    ),
                    child: _busy
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Text('Đăng nhập',
                            style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(height: 20),
                const Center(
                  child: Text('DEVELOPMENT BUILD · API LOCAL',
                      style: TextStyle(
                          color: Color(0xFF948997),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1)),
                ),
              ],
            ),
          ),
        ),
      );
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.child, required this.label});

  final Widget child;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Theme(
            data: Theme.of(context).copyWith(
              inputDecorationTheme: InputDecorationTheme(
                filled: true,
                fillColor: Colors.white,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 15, vertical: 15),
                enabledBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: Color(0xFFE1D8E4)),
                    borderRadius: BorderRadius.circular(5)),
                focusedBorder: OutlineInputBorder(
                    borderSide:
                        const BorderSide(color: brandPurple, width: 1.4),
                    borderRadius: BorderRadius.circular(5)),
              ),
            ),
            child: child,
          ),
        ],
      );
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
            color: Color(0xFFFFEFEC),
            border:
                Border(left: BorderSide(color: Color(0xFFB85D50), width: 3))),
        child: Text(message,
            style: const TextStyle(
                color: Color(0xFF8E3D33), fontSize: 13, height: 1.4)),
      );
}
