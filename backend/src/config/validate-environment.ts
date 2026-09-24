const allowedNodeEnvironments = new Set(['development', 'test', 'production']);

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function required(config: Record<string, unknown>, key: string): string {
  const value = stringValue(config[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function positiveInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(config[key] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function validateDatabaseUrl(value: string): void {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
}

function validateProductionOrigins(value: string): void {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('CORS_ORIGIN is required');
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/') {
      throw new Error(
        'Production CORS_ORIGIN entries must be HTTPS origins without a path',
      );
    }
  }
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const config = { ...input };
  const nodeEnvironment = stringValue(config.NODE_ENV, 'development');
  if (!allowedNodeEnvironments.has(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  config.NODE_ENV = nodeEnvironment;

  const databaseUrl = required(config, 'DATABASE_URL');
  validateDatabaseUrl(databaseUrl);
  positiveInteger(config, 'PORT', 3001);
  positiveInteger(config, 'AUTH_ACCESS_TOKEN_MINUTES', 15);
  positiveInteger(config, 'AUTH_WEB_SESSION_HOURS', 24);
  positiveInteger(config, 'AUTH_WEB_IDLE_MINUTES', 30);
  positiveInteger(config, 'AUTH_MOBILE_SESSION_DAYS', 30);

  if (nodeEnvironment === 'production') {
    const jwtSecret = required(config, 'JWT_SECRET');
    if (
      jwtSecret.length < 48 ||
      jwtSecret.toLowerCase().includes('development') ||
      jwtSecret.toLowerCase().includes('replace-with')
    ) {
      throw new Error(
        'JWT_SECRET must be a non-placeholder secret with at least 48 characters',
      );
    }
    validateProductionOrigins(required(config, 'CORS_ORIGIN'));
    required(config, 'EVIDENCE_STORAGE_DIR');
    required(config, 'BUSINESS_TRIP_EVIDENCE_STORAGE_DIR');
  }

  const pushEnabled =
    stringValue(config.FIREBASE_PUSH_ENABLED, 'false').toLowerCase() === 'true';
  if (pushEnabled) {
    required(config, 'FIREBASE_PROJECT_ID');
    required(config, 'GOOGLE_APPLICATION_CREDENTIALS');
  }

  return config;
}
