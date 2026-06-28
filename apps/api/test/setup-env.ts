// Runs before every test module is imported. Points the app at the dedicated
// integration test database (never the dev DB) and pins a deterministic JWT secret.
// Set explicitly here so @nestjs/config's .env loading (which does not override
// already-set vars) can't redirect tests at the dev database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://family:family@localhost:5433/family_manager_test?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "integration-test-secret";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
