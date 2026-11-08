import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

Future<Map<String, Uint8List>> prepareProfilePortrait(Uint8List bytes) =>
    compute(_normalizePortrait, bytes);

Map<String, Uint8List> _normalizePortrait(Uint8List bytes) {
  if (bytes.isEmpty || bytes.length > 8 * 1024 * 1024) {
    throw const FormatException('Ảnh tối đa 8 MB.');
  }
  final img.Decoder? decoder = img.findDecoderForData(bytes);
  if (decoder == null ||
      !<img.ImageFormat>[
        img.ImageFormat.jpg,
        img.ImageFormat.png,
        img.ImageFormat.webp
      ].contains(decoder.format)) {
    throw const FormatException('Chọn ảnh JPEG, PNG hoặc WebP.');
  }
  final img.DecodeInfo? info = decoder.startDecode(bytes);
  if (info == null ||
      info.width < 1 ||
      info.height < 1 ||
      info.width * info.height > 40000000) {
    throw const FormatException('Ảnh quá lớn hoặc không đọc được.');
  }
  final img.Image? decoded = decoder.decodeFrame(0);
  if (decoded == null) throw const FormatException('Không đọc được ảnh.');
  final img.Image oriented = img.bakeOrientation(decoded);
  img.Image resized = oriented;
  if (oriented.width > 1200 || oriented.height > 1200) {
    resized = oriented.width >= oriented.height
        ? img.copyResize(oriented, width: 1200)
        : img.copyResize(oriented, height: 1200);
  }
  final img.Image opaque =
      img.Image(width: resized.width, height: resized.height, numChannels: 3);
  img.fill(opaque, color: img.ColorRgb8(241, 238, 237));
  img.compositeImage(opaque, resized);
  resized = opaque;
  resized.exif = img.ExifData();
  Uint8List portrait = img.encodeJpg(resized, quality: 88);
  if (portrait.length > 768 * 1024) {
    portrait = img.encodeJpg(resized, quality: 65);
  }
  if (portrait.length > 768 * 1024) {
    throw const FormatException('Ảnh vẫn quá lớn sau nén. Chọn ảnh khác.');
  }
  final img.Image small = resized.width >= resized.height
      ? img.copyResize(resized, width: 160)
      : img.copyResize(resized, height: 160);
  small.exif = img.ExifData();
  final Uint8List thumbnail = img.encodeJpg(small, quality: 80);
  if (thumbnail.length > 40 * 1024) {
    throw const FormatException('Không tạo được ảnh thu nhỏ phù hợp.');
  }
  return <String, Uint8List>{'portrait': portrait, 'thumbnail': thumbnail};
}
