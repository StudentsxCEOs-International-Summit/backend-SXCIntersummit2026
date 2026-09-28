import cron from 'node-cron'
import prisma from '../configs/db'

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
        console.log(`[CLEANUP JOB] Purged ${result.count} expired token(s) from blacklist.`)
      }
    } catch (error) {
      console.error('[CLEANUP JOB] Failed to purge expired tokens:', error)
    }
  })
}
