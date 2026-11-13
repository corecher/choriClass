// 학교 시연용 단일 서버에서 반복 로그인 시도를 제한한다. 서버를 재시작하면 제한은 초기화된다.
export function rateLimit({ limit = 30, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) {
      if (value.expires <= now) attempts.delete(key);
    }
    const key = req.ip;
    const value = attempts.get(key) || { count: 0, expires: now + windowMs };
    value.count += 1;
    attempts.set(key, value);
    if (value.count > limit) {
      res.setHeader('Retry-After', Math.ceil((value.expires - now) / 1000));
      return res.status(429).json({ message: '시도 횟수가 많습니다. 잠시 후 다시 이용해 주세요.' });
    }
    next();
  };
}
