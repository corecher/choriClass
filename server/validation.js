export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function field(value, label, max, required = true) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail(400, label + '을(를) 입력해 주세요.');
  const text = value.trim();
  if ((!text && required) || Array.from(text).length > max)
    fail(400, label + '은(는) ' + max + '자 이내로 입력해 주세요.');
  return text;
}
export function emailAddress(value) {
  const email = field(value, '이메일', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '이메일 주소를 확인해 주세요.');
  return email;
}
export function password(value) {
  // bcrypt가 처리하는 72바이트를 넘어가면 뒷부분이 검증에서 빠지므로 서버에서 먼저 거절한다.
  if (typeof value !== 'string' || Array.from(value).length < 8 || Buffer.byteLength(value) > 72)
    fail(400, '비밀번호는 8자 이상, UTF-8 기준 72바이트 이하로 입력해 주세요.');
  return value;
}
export function positive(value, label) {
  if (!Number.isSafeInteger(value) || value < 1)
    fail(400, label + '은(는) 1 이상의 정수여야 합니다.');
  return value;
}
export function id(value) {
  return positive(Number(value), '번호');
}
