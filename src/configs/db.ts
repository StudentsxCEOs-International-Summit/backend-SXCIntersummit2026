import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const isProduction = env.NODE_ENV === "production";

  const pool = new Pool({
    // Runtime application must use DATABASE_URL (Supavisor Transaction Pooler port 6543)
    // to preserve the 60-connection ceiling on Supabase Nano.
    // DIRECT_URL (port 5432) remains reserved for Prisma schema migrations.
    connectionString: env.DATABASE_URL,
    max: isProduction ? 10 : 5,
    // Keep idle connections for 5 minutes with TCP keep-alive to avoid frequent TLS handshakes on external DBaaS
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["query", "error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
