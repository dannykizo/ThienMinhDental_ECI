export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_MESSAGE = 'Mật khẩu phải có 6–128 ký tự.';

export function validatePassword(password: string): string | null {
  const valid =
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH;
  return valid ? null : PASSWORD_MESSAGE;
}
