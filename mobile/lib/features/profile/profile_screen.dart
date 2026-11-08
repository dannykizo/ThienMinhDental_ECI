import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../../app.dart';
import '../../services/api_client.dart';
import 'profile_portrait.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({required this.session, super.key});
  final SessionController session;
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with WidgetsBindingObserver {
  EmployeePortraitInfo? _info;
  Uint8List? _photo;
  Map<String, Uint8List>? _draft;
  bool _loading = true, _busy = false, _confirming = false;
  String? _error;
  int _readVersion = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    _readVersion++;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _draft == null &&
        !_busy &&
        !_loading) {
      _load();
    }
  }

  Future<void> _load() async {
    if (_busy) return;
    final int read = ++_readVersion;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final EmployeePortraitInfo info =
          await widget.session.api.myPortraitInfo();
      if (!mounted || read != _readVersion) return;
      setState(() {
        _info = info;
        _photo = null;
      });
      final Uint8List? photo = info.version == null
          ? null
          : await widget.session.api.myPortraitImage();
      if (mounted && read == _readVersion) {
        setState(() {
          _info = info;
          _photo = photo;
        });
      }
    } on ApiException catch (error) {
      if (mounted && read == _readVersion) {
        setState(() => _error = error.message);
      }
    } finally {
      if (mounted && read == _readVersion) setState(() => _loading = false);
    }
  }

  Future<bool> _discard() async {
    if (_busy || _confirming) return false;
    if (_draft == null) return true;
    _confirming = true;
    try {
      return await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                      title: const Text('Bỏ ảnh chưa lưu?'),
                      content: const Text(
                          'Ảnh đang xem trước chưa được lưu vào hồ sơ. Ảnh hiện tại trên hệ thống vẫn giữ nguyên.'),
                      actions: <Widget>[
                        TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Quay lại')),
                        FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Bỏ ảnh chưa lưu'))
                      ])) ??
          false;
    } finally {
      _confirming = false;
    }
  }

  Future<void> _pick(ImageSource source) async {
    if (_busy || _loading || _info == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    _readVersion++;
    try {
      final XFile? file = await ImagePicker().pickImage(
          source: source,
          maxWidth: 1200,
          maxHeight: 1200,
          imageQuality: 90,
          requestFullMetadata: false);
      if (file == null) return;
      final Map<String, Uint8List> prepared =
          await prepareProfilePortrait(await file.readAsBytes());
      if (mounted) setState(() => _draft = prepared);
    } on PlatformException {
      if (mounted) {
        setState(() => _error =
            'Chưa mở được camera/kho ảnh. Kiểm tra quyền trong Cài đặt hoặc chọn nguồn ảnh khác.');
      }
    } on Object catch (error) {
      if (mounted) {
        setState(() => _error = error is FormatException
            ? error.message.toString()
            : 'Không chuẩn hóa được ảnh. Thử ảnh JPEG, PNG hoặc WebP khác.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    final Map<String, Uint8List>? draft = _draft;
    if (_busy || _loading || draft == null || _info == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.api.updateMyPortrait(
          expectedVersion: _info!.version,
          portrait: draft['portrait']!,
          thumbnail: draft['thumbnail']!);
      if (!mounted) return;
      setState(() {
        _draft = null;
        _busy = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Đã cập nhật ảnh cá nhân. Admin cũng nhìn thấy ảnh này trong hồ sơ.')));
      await _load();
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error =
            '${error.message} Hãy tải lại để kiểm tra ảnh hiện tại trước khi lưu lại; hệ thống không tự gửi lại.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reload() async {
    if (!await _discard() || !mounted) return;
    setState(() => _draft = null);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final Uint8List? visible = _draft?['portrait'] ?? _photo;
    return PopScope<void>(
        canPop: !_busy && _draft == null,
        onPopInvokedWithResult: (didPop, result) async {
          if (!didPop && await _discard() && context.mounted) {
            setState(() => _draft = null);
            Navigator.of(context).pop();
          }
        },
        child: Scaffold(
            appBar: AppBar(title: const Text('Ảnh cá nhân'), actions: <Widget>[
              IconButton(
                  tooltip: 'Tải lại ảnh hồ sơ',
                  onPressed: _busy || _loading ? null : _reload,
                  icon: const Icon(Icons.refresh_rounded))
            ]),
            body: SafeArea(
                child: ListView(
                    padding: const EdgeInsets.all(22),
                    children: <Widget>[
                  if (_loading) const LinearProgressIndicator(),
                  const SizedBox(height: 20),
                  Center(
                      child: ClipRRect(
                          borderRadius: BorderRadius.circular(28),
                          child: Container(
                              width: 240,
                              height: 300,
                              color: brandPurpleLight,
                              child: visible == null
                                  ? const Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: <Widget>[
                                          Icon(Icons.person_outline_rounded,
                                              size: 88, color: brandPurple),
                                          SizedBox(height: 14),
                                          Text('Chưa có ảnh cá nhân',
                                              style:
                                                  TextStyle(color: brandMuted))
                                        ])
                                  : Image.memory(visible,
                                      fit: BoxFit.cover,
                                      errorBuilder: (context, error, stack) =>
                                          const Center(
                                              child: Text(
                                                  'Chưa hiển thị được ảnh.')))))),
                  const SizedBox(height: 22),
                  Text(
                      _info?.fullName ??
                          widget.session.user?.displayName ??
                          'Hồ sơ cá nhân',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 23, fontWeight: FontWeight.w700)),
                  if (_info != null)
                    Text(_info!.employeeCode,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: brandMuted)),
                  const SizedBox(height: 22),
                  if (_draft != null)
                    const Padding(
                        padding: EdgeInsets.only(bottom: 16),
                        child: Text('Ảnh xem trước · chưa lưu',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: brandPurple,
                                fontWeight: FontWeight.w600))),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 18),
                        child: Semantics(
                            liveRegion: true,
                            child: Text(_error!,
                                style: const TextStyle(
                                    color: brandDanger, height: 1.6)))),
                  if (_busy)
                    const Padding(
                        padding: EdgeInsets.only(bottom: 16),
                        child: Center(child: CircularProgressIndicator())),
                  Row(children: <Widget>[
                    Expanded(
                        child: OutlinedButton.icon(
                            onPressed: _busy || _loading || _info == null
                                ? null
                                : () => _pick(ImageSource.camera),
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: const Text('Chụp ảnh'))),
                    const SizedBox(width: 12),
                    Expanded(
                        child: OutlinedButton.icon(
                            onPressed: _busy || _loading || _info == null
                                ? null
                                : () => _pick(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Thư viện')))
                  ]),
                  if (_draft != null) ...<Widget>[
                    const SizedBox(height: 14),
                    FilledButton.icon(
                        onPressed: _busy || _loading ? null : _save,
                        icon: const Icon(Icons.check_rounded),
                        label: const Text('Lưu ảnh cá nhân')),
                    TextButton(
                        onPressed:
                            _busy ? null : () => setState(() => _draft = null),
                        child: const Text('Hủy ảnh vừa chọn'))
                  ],
                  const SizedBox(height: 22),
                  const Text(
                      'Ảnh này dùng chung trên app và hồ sơ Admin. Admin cũng có thể thay ảnh khi cần. Chọn ảnh rõ mặt, JPEG/PNG/WebP; không dùng ảnh chứa thông tin riêng tư của người khác. Ảnh chỉ được tải lên sau khi bấm Lưu.',
                      style: TextStyle(
                          color: brandMuted, height: 1.7, fontSize: 12)),
                  const SizedBox(height: 12),
                  const Text(
                      'Ảnh cá nhân không thay thế ảnh bằng chứng khi chấm công và không dùng để nhận diện khuôn mặt tự động.',
                      style: TextStyle(
                          color: brandMuted, height: 1.6, fontSize: 12)),
                ]))));
  }
}

class ProfileAvatarButton extends StatefulWidget {
  const ProfileAvatarButton(
      {required this.session, this.enabled = true, super.key});
  final SessionController session;
  final bool enabled;
  @override
  State<ProfileAvatarButton> createState() => _ProfileAvatarButtonState();
}

class _ProfileAvatarButtonState extends State<ProfileAvatarButton>
    with WidgetsBindingObserver {
  Uint8List? _image;
  bool _loading = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    _loading = true;
    try {
      final EmployeePortraitInfo info =
          await widget.session.api.myPortraitInfo();
      final Uint8List? image = info.version == null
          ? null
          : await widget.session.api.myPortraitImage(thumbnail: true);
      if (mounted) setState(() => _image = image);
    } on ApiException {
      /* Do not turn an image outage into an attendance error. */
    } finally {
      _loading = false;
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: 'Hồ sơ cá nhân / thay ảnh',
      onPressed: widget.enabled
          ? () async {
              await Navigator.of(context).push<void>(MaterialPageRoute<void>(
                  builder: (_) => ProfileScreen(session: widget.session)));
              if (mounted) await _load();
            }
          : null,
      icon: CircleAvatar(
          radius: 17,
          backgroundColor: brandPurpleLight,
          child: _image == null
              ? const Icon(Icons.person_outline_rounded,
                  color: brandPurple, size: 21)
              : ClipOval(
                  child: Image.memory(_image!,
                      width: 34,
                      height: 34,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stack) => const Icon(
                          Icons.person_outline_rounded,
                          color: brandPurple)))));
}
