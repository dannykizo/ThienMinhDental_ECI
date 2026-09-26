const STRONG_PASSWORD_MESSAGE =
  'Mật khẩu phải có 12–128 ký tự, gồm chữ thường, chữ hoa, số và ký tự đặc biệt.';

export function validateStrongPassword(password: string): string | null {
  const valid =
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  return valid ? null : STRONG_PASSWORD_MESSAGE;
}
