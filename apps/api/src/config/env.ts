/** The hardcoded fallback secret used for local dev; never acceptable in production. */
export const INSECURE_JWT_DEFAULT = "development-only-change-me";

const MIN_JWT_LENGTH = 16;

export interface ValidatedEnv {
  warnings: string[];
}

/**
 * Validates security-sensitive configuration. In production, missing/default/weak secrets
 * are fatal (throws); in development they downgrade to warnings so local runs still work.
 * Pure over its `env` argument so it can be unit-tested and called once at bootstrap.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const isProd = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  const fail = (message: string) => (isProd ? errors : warnings).push(message);

  const jwt = env.JWT_SECRET;
  if (!jwt || jwt === INSECURE_JWT_DEFAULT) {
    fail("JWT_SECRET must be set to a strong, non-default value");
  } else if (jwt.length < MIN_JWT_LENGTH) {
    fail(`JWT_SECRET should be at least ${MIN_JWT_LENGTH} characters`);
  }

  const db = env.DATABASE_URL;
  if (!db) {
    // A missing database URL is fatal everywhere — nothing works without it.
    errors.push("DATABASE_URL must be set");
  } else if (isProd && /:\/\/family:family@/.test(db)) {
    errors.push("DATABASE_URL must not use the default 'family:family' credentials in production");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n - ${errors.join("\n - ")}`);
  }

  return { warnings };
}
