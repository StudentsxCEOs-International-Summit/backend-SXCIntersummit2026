import { Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../../configs/env'
import { badRequest } from '../../utils/response'
import { escapeHtml } from '../../utils/html'

function getDriveOAuthClient(): OAuth2Client {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    env.GOOGLE_DRIVE_REDIRECT_URI || `${env.APP_URL}/api/admin/drive/callback`

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  })
}

export function adminDriveSetupRedirect(_req: Request, res: Response) {
  try {
    const oauth2Client = getDriveOAuthClient()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
      state: 'admin_drive_setup',
    })
    return res.redirect(url)
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function adminDriveCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string | undefined
    const errorParam = req.query.error as string | undefined

    if (errorParam) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Setup Failed</title><meta charset="utf-8"></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 650px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
            <h2 style="color: #ef4444; margin-top: 0;">❌ Autorisasi Dibatalkan / Gagal</h2>
            <p>Error dari Google: <code>${escapeHtml(errorParam)}</code></p>
            <p><a href="/api/admin/drive/setup" style="color: #38bdf8;">Klik di sini untuk mencoba lagi</a></p>
          </body>
        </html>
      `)
    }

    if (!code) {
      return badRequest(res, 'Authorization code is missing from Google callback.')
    }

    const oauth2Client = getDriveOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Setup</title><meta charset="utf-8"></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 650px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
            <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Refresh Token Tidak Dikirim oleh Google</h2>
            <p>Google mendeteksi akun ini sebelumnya sudah pernah memberikan izin ke aplikasi ini.</p>
            <p><b>Solusi Cepat (15 detik):</b></p>
            <ol style="line-height: 1.8;">
              <li>Buka <a href="https://myaccount.google.com/connections" target="_blank" style="color: #38bdf8;">Google Account Connections (myaccount.google.com/connections)</a>.</li>
              <li>Cari aplikasi OAuth kamu lalu klik <b>Hapus Akses / Delete Connection</b>.</li>
              <li>Buka kembali <a href="/api/admin/drive/setup" style="color: #38bdf8;">/api/admin/drive/setup</a> dan klik Izinkan.</li>
            </ol>
          </body>
        </html>
      `)
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Setup Berhasil</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 680px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="color: #10b981; margin-top: 0;">✅ Google Drive Refresh Token Berhasil Dibuat!</h2>
          <p>Silakan salin konfigurasi berikut dan simpan ke file <code>.env</code> backend kamu:</p>
          
          <div style="position: relative;">
            <textarea id="envToken" style="width: 100%; height: 95px; font-size: 14px; font-family: monospace; padding: 12px; background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 8px; box-sizing: border-box; resize: vertical;" readonly>GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}</textarea>
            <button onclick="navigator.clipboard.writeText(document.getElementById('envToken').value); alert('Berhasil disalin ke clipboard!');" style="margin-top: 8px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Salin ke Clipboard</button>
          </div>

          <div style="margin-top: 24px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
            <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">
              🎉 <b>Akun siap digunakan!</b> Backend sekarang mengunggah file pendaftaran langsung menggunakan kuota 15 GB akun Google yang baru saja Anda izinkan.
            </p>
          </div>
        </body>
      </html>
    `)
  } catch (error: any) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Setup Error</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 650px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="color: #ef4444; margin-top: 0;">❌ Terjadi Kesalahan</h2>
          <p>Detail Error: <code>${escapeHtml(error.message)}</code></p>
          <p><a href="/api/admin/drive/setup" style="color: #38bdf8;">Coba Lagi</a></p>
        </body>
      </html>
    `)
  }
}
