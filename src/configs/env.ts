import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRE: z.string().min(1).default("1h"),
    CORS_ORIGIN: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.CORS_ORIGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN is required in production",
      });
    }
  });

type Env = z.infer<typeof envSchema>;

const testEnvDefaults = {
  DATABASE_URL: "postgresql://postgres:test@localhost:5432/sxc_test",
  DIRECT_URL: "postgresql://postgres:test@localhost:5432/sxc_test",
  JWT_SECRET: "test_jwt_secret_with_at_least_32_characters_long",
  JWT_EXPIRE: "1h",
};

const rawEnv =
  process.env.NODE_ENV === "test"
    ? {
        ...testEnvDefaults,
        ...process.env,
      }
    : process.env;

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n  - ");
  throw new Error(`\n❌ Invalid environment variables:\n  - ${details}\n`);
}

export const env: Env = parsed.data;
