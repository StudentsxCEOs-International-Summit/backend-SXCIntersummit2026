import cron from 'node-cron'
import prisma from '../configs/db'
import { createChildLogger } from '../configs/logger'

const tokenCleanupLogger = createChildLogger('TOKEN_CLEANUP')

export function startTokenCleanupJob() {
  // Runs every hour at minute 0 (0 * * * *)
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await prisma.blacklist.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      })

      if (result.count > 0) {
        tokenCleanupLogger.info({ purgedCount: result.count }, 'Purged expired tokens from blacklist')
      }
    } catch (error) {
      tokenCleanupLogger.error({ err: error }, 'Failed to purge expired tokens')
    }
  })
}

/**
 * One-off trigger function for external cron services (e.g. cronjob.org).
 */
export async function triggerTokenCleanup(): Promise<{ purgedCount: number }> {
  const result = await prisma.blacklist.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })

  if (result.count > 0) {
    tokenCleanupLogger.info({ purgedCount: result.count }, 'Purged expired tokens from blacklist')
  }

  return { purgedCount: result.count }
}

