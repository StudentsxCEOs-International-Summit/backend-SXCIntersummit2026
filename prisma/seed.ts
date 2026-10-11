import prisma from '../src/configs/db'
import { hashPassword } from '../src/utils/bcrypt'
import { seedTeamCodes } from './seeds/seedTeamCodes'

async function main() {
  const defaultStatus = await prisma.status.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      code: 'ACTIVE_USER',
      description: 'Akun user aktif dan terverifikasi',
    },
  })

  const itDivision = await prisma.division.upsert({
    where: { name: 'IT' },
    update: {},
    create: {
      name: 'IT',
    },
  })

  const adminPassword = await hashPassword('admin123')
  await prisma.staff.upsert({
    where: { email: 'admin@sxcintersummit.com' },
    update: {
      password: adminPassword,
      divisionId: itDivision.id,
      role: 'ADMIN',
    },
    create: {
      name: 'Super Admin',
      email: 'admin@sxcintersummit.com',
      password: adminPassword,
      role: 'ADMIN',
      divisionId: itDivision.id,
    },
  })

  const userPassword = await hashPassword('password123')
  await prisma.user.upsert({
    where: { email: 'user@sxcintersummit.com' },
    update: {
      password: userPassword,
      status: defaultStatus.id,
      role: 'USER',
    },
    create: {
      name: 'Peserta Contoh',
      email: 'user@sxcintersummit.com',
      password: userPassword,
      status: defaultStatus.id,
      role: 'USER',
    },
  })

  console.log('Seeding finished.')

  await seedTeamCodes()
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
