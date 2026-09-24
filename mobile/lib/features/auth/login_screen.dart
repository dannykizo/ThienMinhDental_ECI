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
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
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
    if (!(_formKey.currentState?.validate() ?? false)) return;
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
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(24, 34, 24, 24),
            child: AutofillGroup(
              child: Form(
                key: _formKey,
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
                          color: brandInk.withValues(alpha: 0.64),
                          height: 1.55),
                    ),
                    const SizedBox(height: 34),
                    _FieldLabel(
                      label: 'Email',
                      child: TextFormField(
                        autofillHints: const <String>[
                          AutofillHints.username,
                          AutofillHints.email,
                        ],
                        autocorrect: false,
                        controller: _email,
                        enabled: !_busy,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        validator: (String? value) {
                          final String email = value?.trim() ?? '';
                          if (email.isEmpty) {
                            return 'Nhập email hoặc tên đăng nhập.';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                    _FieldLabel(
                      label: 'Mật khẩu',
                      child: TextFormField(
                        autofillHints: const <String>[AutofillHints.password],
                        autocorrect: false,
                        controller: _password,
                        enabled: !_busy,
                        enableSuggestions: false,
                        obscureText: _obscure,
                        onFieldSubmitted: (_) => _submit(),
                        textInputAction: TextInputAction.done,
                        validator: (String? value) =>
                            value == null || value.isEmpty
                                ? 'Nhập mật khẩu.'
                                : null,
                        decoration: InputDecoration(
                          suffixIcon: IconButton(
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
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
                    Center(
                      child: InkWell(
                        onTap: _showServerConfigSheet,
                        borderRadius: BorderRadius.circular(4),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              const Icon(Icons.settings_ethernet_rounded,
                                  size: 14, color: Color(0xFF948997)),
                              const SizedBox(width: 6),
                              Text(
                                'SERVER: ${widget.session.api.baseUrl}',
                                style: const TextStyle(
                                    color: Color(0xFF948997),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.8),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

  void _showServerConfigSheet() {
    final TextEditingController urlController =
        TextEditingController(text: widget.session.api.baseUrl);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (BuildContext ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text('Cấu hình API Backend',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text(
              'USB debugging dùng localhost qua ADB reverse. Khi dùng Wi-Fi, nhập IP hiện tại của máy dev.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: urlController,
              decoration: const InputDecoration(
                labelText: 'Base API URL',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: <Widget>[
                ActionChip(
                  label: const Text('USB (127.0.0.1)'),
                  onPressed: () =>
                      urlController.text = 'http://127.0.0.1:3001/api',
                ),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: brandPurple),
                onPressed: () async {
                  await widget.session.updateBaseUrl(urlController.text);
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) setState(() {});
                },
                child: const Text('Lưu cấu hình'),
              ),
            ),
          ],
        ),
      ),
    );
  }
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
