import { describe, expect, it } from "vitest";
import { INSECURE_JWT_DEFAULT, validateEnv } from "./env";

const strongJwt = "a-strong-secret-value-1234567890";
const prodDb = "postgresql://app:s3cret@db.internal:5432/family_manager?schema=public";

describe("validateEnv", () => {
  it("throws in production when JWT_SECRET is unset", () => {
    expect(() => validateEnv({ NODE_ENV: "production", DATABASE_URL: prodDb })).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is the insecure default", () => {
    expect(() =>
      validateEnv({ NODE_ENV: "production", JWT_SECRET: INSECURE_JWT_DEFAULT, DATABASE_URL: prodDb })
    ).toThrow(/JWT_SECRET/);
  });

  it("throws in production when DATABASE_URL uses the default family:family credentials", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        JWT_SECRET: strongJwt,
        DATABASE_URL: "postgresql://family:family@localhost:5433/family_manager?schema=public"
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is unset, regardless of environment", () => {
    expect(() => validateEnv({ NODE_ENV: "development", JWT_SECRET: strongJwt })).toThrow(/DATABASE_URL/);
  });

  it("accepts a valid production configuration with no warnings", () => {
    const result = validateEnv({ NODE_ENV: "production", JWT_SECRET: strongJwt, DATABASE_URL: prodDb });
    expect(result.warnings).toEqual([]);
  });

  it("does not throw in development with a missing JWT_SECRET but warns", () => {
    const result = validateEnv({ NODE_ENV: "development", DATABASE_URL: prodDb });
    expect(result.warnings.join(" ")).toMatch(/JWT_SECRET/);
  });
});
