import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client"
import { env } from "./env"
import { createChildLogger } from "./logger"

const dbLogger = createChildLogger("DB")

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const isProduction = env.NODE_ENV === "production"

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: isProduction ? 10 : 5,
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  })

  pool.on("error", (err) => {
    dbLogger.error({ err, msg: "Unexpected error on idle database client" })
  })

  dbLogger.info({
    max: isProduction ? 10 : 5,
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 10_000,
    msg: "Database connection pool initialized",
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["query", "error", "warn"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
