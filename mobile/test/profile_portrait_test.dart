import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:thien_minh_dental_workforce/features/profile/profile_portrait.dart';

void main() {
  test('normalizes a synthetic transparent image to bounded opaque JPEGs',
      () async {
    // Development-only pixels, not an employee photo.
    final img.Image source =
        img.Image(width: 1500, height: 900, numChannels: 4);
    final Map<String, Uint8List> result =
        await prepareProfilePortrait(img.encodePng(source));
    final img.Image portrait = img.decodeJpg(result['portrait']!)!;
    final img.Image thumbnail = img.decodeJpg(result['thumbnail']!)!;
    expect(portrait.width, 1200);
    expect(portrait.height, 720);
    expect(thumbnail.width, 160);
    expect(result['portrait']!.length, lessThanOrEqualTo(768 * 1024));
    expect(result['thumbnail']!.length, lessThanOrEqualTo(40 * 1024));
    expect(portrait.getPixel(0, 0).r, greaterThan(230));
    expect(portrait.exif.exifIfd.isEmpty, isTrue);
  });
  test('rejects empty, oversized and non-image input', () async {
    for (final Uint8List bytes in <Uint8List>[
      Uint8List(0),
      Uint8List(8 * 1024 * 1024 + 1),
      Uint8List.fromList(<int>[1, 2, 3])
    ]) {
      await expectLater(prepareProfilePortrait(bytes), throwsFormatException);
    }
  });
}
