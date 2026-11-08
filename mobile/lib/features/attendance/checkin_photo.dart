import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import '../../services/api_client.dart';

// Camera output only; no gallery, background location, weather or microphone.
// The server-issued context supplies the timemark, not the phone clock.
Future<File> stampCheckInPhoto(
    String cameraPath, CheckInCapture capture) async {
  final ui.Codec codec = await ui.instantiateImageCodec(
    await File(cameraPath).readAsBytes(),
    targetWidth: 1000,
    allowUpscaling: false,
  );
  final ui.FrameInfo frame = await codec.getNextFrame();
  final ui.PictureRecorder recorder = ui.PictureRecorder();
  final Canvas canvas = Canvas(recorder);
  final int width = frame.image.width, height = frame.image.height;
  canvas.drawImage(frame.image, Offset.zero, Paint());
  final DateTime vietnamTime =
      capture.serverTime.toUtc().add(const Duration(hours: 7));
  String two(int value) => value.toString().padLeft(2, '0');
  final TextPainter text = TextPainter(
    textDirection: TextDirection.ltr,
    text: TextSpan(
      style:
          TextStyle(color: Colors.white, fontSize: width * 0.025, height: 1.5),
      text:
          'THIÊN MINH · ${capture.attendanceType == 'OFFICE' ? 'VĂN PHÒNG' : 'HIỆN TRƯỜNG'}\n'
          '${two(vietnamTime.hour)}:${two(vietnamTime.minute)}:${two(vietnamTime.second)} · '
          '${two(vietnamTime.day)}/${two(vietnamTime.month)}/${vietnamTime.year} · UTC+7\n'
          'GPS ${capture.latitude.toStringAsFixed(6)}, ${capture.longitude.toStringAsFixed(6)}\n'
          'Mốc chụp từ Backend · ${capture.id.substring(0, 8)}',
    ),
  )..layout(maxWidth: width - 40);
  canvas.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), text.height + 32),
      Paint()..color = const Color(0xB3000000));
  text.paint(canvas, const Offset(20, 16));
  final ui.Picture picture = recorder.endRecording();
  final ui.Image stamped = await picture.toImage(width, height);
  final data = await stamped.toByteData(format: ui.ImageByteFormat.png);
  frame.image.dispose();
  codec.dispose();
  stamped.dispose();
  picture.dispose();
  text.dispose();
  if (data == null) throw StateError('Không thể tạo ảnh timemark.');
  final Directory directory = await getTemporaryDirectory();
  final File result = File('${directory.path}/checkin-${capture.id}.png');
  await result.writeAsBytes(data.buffer.asUint8List());
  return result;
}
