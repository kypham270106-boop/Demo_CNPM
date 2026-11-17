import 'dotenv/config';

function int(name: string, fallback: number, min = 1, max = 86400) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function config() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  };
  if (Object.values(google).some(Boolean) && !Object.values(google).every(Boolean)) {
    throw new Error('Configure all GOOGLE_* variables or leave them blank');
  }
  return {
    jwtSecret, google, port: int('PORT', 3000, 1, 65535),
    tokenSeconds: int('JWT_TTL_SECONDS', 3600),
    holdMinutes: int('HOLD_MINUTES', 5, 1, 60),
    pickupMinutes: int('PICKUP_GRACE_MINUTES', 15, 1, 120),
    pollSeconds: int('JOB_INTERVAL_SECONDS', 10),
    mockSeconds: int('HUB_SYNC_SECONDS', 30),
    staleSeconds: int('HUB_STALE_SECONDS', 120),
    dispatchSeconds: int('DISPATCH_TIMEOUT_SECONDS', 60),
    mockFailure: int('MOCK_DISPATCH_FAILURE_PERCENT', 0, 0, 100),
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(',').map(value => value.trim()).filter(Boolean),
    secureCookies: process.env.NODE_ENV === 'production',
  };
}

export const minutes = (value: number) => value * 60_000;
export const after = (now: Date, ms: number) => new Date(now.getTime() + ms);
