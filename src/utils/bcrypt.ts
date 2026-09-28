import bcrypt from 'bcrypt'

export async function hashPassword(plain: string, saltRounds = 10) {
  return bcrypt.hash(plain, saltRounds)
}

export async function comparePassword(plain: string, hashed: string) {
  return bcrypt.compare(plain, hashed)
}
