/**
 * Checks every SMTP account configured in .env (SMTP_USER / SMTP_USER_2) by logging in to it.
 * Nothing is sent and no password is printed.
 *
 *   npm run smtp:check
 *
 * Run it on the server after changing the SMTP variables. The running app only reads them when it starts,
 * so restart it afterwards (for pm2: `pm2 restart <app> --update-env`).
 */
import 'dotenv/config'
import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST || 'smtp.gmail.com'
const port = Number(process.env.SMTP_PORT || 465)
const secure = (process.env.SMTP_SECURE ?? 'true') === 'true'

const accounts = [
  { name: 'smtp-1', user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM },
  { name: 'smtp-2', user: process.env.SMTP_USER_2, pass: process.env.SMTP_PASS_2, from: process.env.SMTP_FROM_2 },
]

async function main() {
  console.log(`SMTP server: ${host}:${port} (secure=${secure})\n`)
  let failed = 0

  for (const account of accounts) {
    if (!account.user && !account.pass) {
      console.log(`${account.name}: not configured`)
      continue
    }
    if (!account.user || !account.pass) {
      console.log(`${account.name}: INCOMPLETE (${account.user ? 'password' : 'user'} is missing)`)
      failed += 1
      continue
    }

    // An app password is 16 characters; a copied one with spaces or quotes is the usual reason a login fails.
    const note = account.pass.length !== 16 ? `  (note: the password is ${account.pass.length} characters, an app password has 16)` : ''
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: account.user, pass: account.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
      })
      await transporter.verify()
      console.log(`${account.name}: OK  ${account.user}  (from: ${account.from || account.user})${note}`)
    } catch (error) {
      failed += 1
      const e = error as { code?: string; message?: string }
      console.log(`${account.name}: FAILED  ${account.user}  ${e.code ?? ''} ${String(e.message).slice(0, 160)}${note}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main()
