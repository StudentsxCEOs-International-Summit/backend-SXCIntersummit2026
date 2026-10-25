import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: env.DIRECT_URL || env.DATABASE_URL,
    max: 10,
    // pg closes idle connections after 10s by default, so the first request after a quiet moment
    // pays for a new TLS connection to the database. Keep them for 5 minutes instead.
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
