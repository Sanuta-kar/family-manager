import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive()
});

describe("ZodValidationPipe", () => {
  it("returns the parsed value for valid input", () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ email: "a@b.com", age: 7 });
    expect(result).toEqual({ email: "a@b.com", age: 7 });
  });

  it("throws BadRequestException with flattened errors for invalid input", () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: "not-an-email", age: -1 });
      throw new Error("expected pipe to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        statusCode: number;
        message: string;
        errors: Array<{ path: string; message: string }>;
      };
      expect(response.statusCode).toBe(400);
      expect(response.message).toBe("Validation failed");
      const paths = response.errors.map((e) => e.path).sort();
      expect(paths).toEqual(["age", "email"]);
    }
  });
});
