// JPEG-only normalized portraits, never executable SVG/HTML or external URLs.
// Structural validation is deliberately not a biometric/identity verification.
export function normalizePortraitJpeg(input: Buffer, thumbnail = false): Buffer {
  const limit = thumbnail ? 40 * 1024 : 768 * 1024;
  if (!input.length || input.length > limit) throw new Error('PORTRAIT_SIZE_INVALID');
  if (input.length < 24 || input.readUInt16BE(0) !== 0xffd8 || input.readUInt16BE(input.length - 2) !== 0xffd9) throw new Error('PORTRAIT_JPEG_REQUIRED');
  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2, dimensions = false;
  while (offset < input.length - 2) {
    if (input[offset] !== 0xff) throw new Error('PORTRAIT_JPEG_INVALID');
    const start = offset;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (offset + 2 > input.length || marker === 0xd8 || marker === 0xd9 || marker === 0x00) throw new Error('PORTRAIT_JPEG_INVALID');
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length - 2) throw new Error('PORTRAIT_JPEG_INVALID');
    if (marker === 0xc2) throw new Error('PORTRAIT_BASELINE_REQUIRED');
    if (marker === 0xc0) {
      if (dimensions || length < 11) throw new Error('PORTRAIT_JPEG_INVALID');
      const components = input[offset + 7];
      if (input[offset + 2] !== 8 || ![1,3].includes(components) || length !== 8 + 3 * components) throw new Error('PORTRAIT_JPEG_INVALID');
      const height = input.readUInt16BE(offset + 3), width = input.readUInt16BE(offset + 5);
      const max = thumbnail ? 200 : 1600;
      if (!width || !height || width > max || height > max || width * height > (thumbnail ? 40000 : 2560000)) throw new Error('PORTRAIT_DIMENSIONS_INVALID');
      dimensions = true;
    }
    if (marker === 0xda) {
      if (!dimensions || length < 6) throw new Error('PORTRAIT_JPEG_INVALID');
      // Browser canvas emits one baseline scan. Refuse metadata/additional scans
      // after SOS instead of accidentally retaining an EXIF/comment segment there.
      if (length !== 6 + 2 * input[offset + 2] || input[offset + length - 3] !== 0 || input[offset + length - 2] !== 63 || input[offset + length - 1] !== 0) throw new Error('PORTRAIT_JPEG_INVALID');
      for (let cursor = offset + length; cursor < input.length - 2; cursor++) {
        if (input[cursor] !== 0xff) continue;
        const next = input[cursor + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { cursor++; continue; }
        if (next === 0xff) continue;
        throw new Error('PORTRAIT_JPEG_INVALID');
      }
      parts.push(input.subarray(start));
      return Buffer.concat(parts);
    }
    // Remove APP/EXIF/ICC/IPTC and comments: no original filename/GPS metadata retained.
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) parts.push(input.subarray(start, offset + length));
    offset += length;
  }
  throw new Error('PORTRAIT_JPEG_INVALID');
}
