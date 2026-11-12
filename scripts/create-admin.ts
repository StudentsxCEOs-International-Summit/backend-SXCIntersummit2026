/**
 * Creates or updates a staff (admin) account.
 *
 *   npx tsx scripts/create-admin.ts <email> [name]
 *
 * The password comes from ADMIN_PASSWORD, or a random one is generated and printed once.
 * Run it against the target environment's .env so production never needs the seed's default admin.
 */
import crypto from 'crypto'
import prisma from '../src/configs/db'
import { hashPassword } from '../src/utils/bcrypt'

async function main() {
  const email = process.argv[2]?.toLowerCase().trim()
  const name = process.argv[3] || 'Administrator'
  if (!email) throw new Error('Usage: npx tsx scripts/create-admin.ts <email> [name]')

  const generated = !process.env.ADMIN_PASSWORD
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(15).toString('base64url')

  const division = await prisma.division.upsert({
    where: { name: 'IT' },
    update: {},
    create: { name: 'IT' },
  })

  const hashed = await hashPassword(password)
  await prisma.staff.upsert({
    where: { email },
    update: { password: hashed, name, role: 'ADMIN', divisionId: division.id },
    create: { email, name, password: hashed, role: 'ADMIN', divisionId: division.id },
  })

  console.log(`Admin ready: ${email}`)
  if (generated) console.log(`Generated password: ${password}`)

  const defaults = await prisma.staff.findUnique({ where: { email: 'admin@sxcintersummit.com' } })
  if (defaults && defaults.email !== email) {
    console.warn('WARNING: the seed admin admin@sxcintersummit.com (password "admin123") exists in this database.')
  }
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect().then(() => process.exit()))
