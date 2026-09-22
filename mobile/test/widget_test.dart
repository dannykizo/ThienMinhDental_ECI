import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thien_minh_dental_workforce/app.dart';

void main() {
  test('brand palette remains aligned with the approved logo', () {
    expect(brandPurple, const Color(0xFF6E3786));
    expect(brandOrange, const Color(0xFFED851F));
  });
}
