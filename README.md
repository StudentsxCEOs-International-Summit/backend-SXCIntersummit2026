# SXC Intersummit 2026 - Backend API

Backend RESTful API service untuk SXC Intersummit 2026 yang dibangun menggunakan Express.js, TypeScript, Prisma ORM, dan PostgreSQL (Supabase). Dilengkapi dengan autentikasi JWT & Google OAuth, integrasi Google Drive API untuk file storage, email notification scheduler, rate limiter, serta dokumentasi Swagger UI.

---

## Tech Stack

- **Runtime & Language**: Node.js & TypeScript
- **Framework**: Express.js 5
- **ORM & Database**: Prisma 7 & PostgreSQL (Supabase)
- **Authentication**: JWT (JSON Web Tokens), bcrypt, Google OAuth 2.0
- **Cloud Storage**: Google Drive API (OAuth 2.0 Refresh Token)
- **Email Service**: Nodemailer (SMTP) & node-cron (Scheduler)
- **Validation & Security**: Zod, Helmet, CORS, Express Rate Limit
- **API Documentation**: Swagger UI Express & OpenAPI Specification

---

## Requirements

- **Node.js**: versi 20 atau lebih baru
- **npm** (atau package manager yang kompatibel)
- **PostgreSQL Database** (direkomendasikan Supabase PostgreSQL)
- **Google Cloud Console Credentials** (untuk OAuth & Google Drive Storage)
- **SMTP Account** (misalnya Gmail App Password untuk pengiriman email)

---

## Setup & Instalasi

1. **Clone repository dan install dependencies**:
   ```bash
   npm install
   ```

2. **Setup Environment Variables**:
   Salin `.env.example` menjadi `.env`, lalu lengkapi nilainya:
   ```bash
   copy .env.example .env
   ```

3. **Generate Prisma Client & Jalankan Migrasi**:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. **(Opsional) Seed Data Awal**:
   ```bash
   npm run seed
   ```

5. **Jalankan Development Server**:
   ```bash
   npm run dev
   ```
   Server akan berjalan secara lokal di `http://localhost:3000`.

---

## Commands

| Command | Deskripsi |
| --- | --- |
| `npm run dev` | Menjalankan development server dengan auto-reload (Nodemon + tsx) |
| `npm run build` | Men-generate Prisma client dan meng-compile TypeScript ke `dist/` |
| `npm start` | Menjalankan production server dari file hasil build (`dist/src/server.js`) |
| `npm run prisma:generate` | Men-generate Prisma Client terbaru |
| `npm run prisma:migrate` | Menjalankan migrasi database di environment dev |
| `npm run prisma:studio` | Membuka UI web Prisma Studio untuk memvisualisasikan database |
| `npm run seed` | Menjalankan database seeder (`prisma/seed.ts`) |

---

## Environment Variables

Salin `.env.example` ke `.env` untuk konfigurasi lokal. File `.env` tidak boleh di-commit ke Git.

```env
# Server Configuration
NODE_ENV="development" # development | test | production
APP_ENV="local"        # local | staging | production
APP_URL=http://localhost:3000
PORT=3000

# Database Configuration (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# JWT Configuration
JWT_SECRET=your_jwt_secret_at_least_32_characters_long
JWT_EXPIRE=1h

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Email / SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com
EMAIL_LOGO_URL="https://lh3.googleusercontent.com/d/..."
EMAIL_HEADER_BANNER_URL="https://lh3.googleusercontent.com/d/..."

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Google Drive Storage Integration
GOOGLE_DRIVE_CLIENT_ID=your_gdrive_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_gdrive_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/admin/drive/callback
GOOGLE_DRIVE_REFRESH_TOKEN=your_gdrive_refresh_token
GOOGLE_DRIVE_FOLDER_UPLOADS_ROOT_ID=your_gdrive_uploads_root_folder_id
GOOGLE_DRIVE_FOLDER_IBCC_ID=your_gdrive_ibcc_folder_id
GOOGLE_DRIVE_FOLDER_REGISTRATION_ID=your_gdrive_registration_folder_id
GOOGLE_DRIVE_FOLDER_PRELIMINARY_ID=your_gdrive_preliminary_folder_id
GOOGLE_DRIVE_FOLDER_PAYMENT_ID=your_gdrive_payment_folder_id
GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID=your_gdrive_semifinal_slides_folder_id
```

---

## API Documentation & Endpoints

Swagger UI tersedia di:
- **UI Documentation**: `http://localhost:3000/api-docs`
- **JSON Specification**: `http://localhost:3000/api-docs.json`

Base route API berada di prefix `/api`:

| Base Path | Modul / Fitur | Deskripsi |
| --- | --- | --- |
| `/api/auth` | Authentication | Registrasi, Login, Google OAuth, Refresh Token, Password Reset |
| `/api/ibcc` | IBCC Competition | Pendaftaran tim, submit karya (preliminary/semifinal), manajemen anggota |
| `/api/access-code` | Access Code | Validasi dan aktivasi kode akses/referral tim |
| `/api/finance` | Finance & Verification | Verifikasi pembayaran pendaftaran kompetisi |
| `/api/admin/drive` | Admin Google Drive | Manajemen integrasi token Google Drive OAuth |
| `/api/config` | Global Configurations | Konfigurasi sistem dan parameter dinamis |

---

## Folder Structure

```text
backend-SXCIntersummit2026/
├── prisma/
│   ├── migrations/       # Riwayat migrasi Prisma
│   ├── seeds/            # Data seed untuk tim, master codes, dll.
│   ├── schema.prisma     # Definisi schema Prisma database
│   └── seed.ts           # Runner script seeder database
├── public/               # Asset statis publik (gambar, template email banner)
├── scripts/              # Utilitas dan script testing manual
├── src/
│   ├── configs/          # Konfigurasi environment, database, cookie, dan app
│   ├── docs/             # Setup dan definisi Swagger OpenAPI
│   ├── features/         # Arsitektur berbasis fitur (routes, controllers, services)
│   │   ├── accesscode/   # Logika bisnis access code / kode tim
│   │   ├── admin/        # Fitur khusus admin (e.g. Drive Auth)
│   │   ├── auth/         # Autentikasi dan autorisasi pengguna
│   │   ├── config/       # Konfigurasi aplikasi & feature toggles
│   │   ├── finance/      # Verifikasi bukti transfer dan pembayaran
│   │   └── ibcc/         # Modul kompetisi IBCC (registrasi, tim, submission)
│   ├── jobs/             # Scheduled background jobs (node-cron)
│   ├── middlewares/      # Express middlewares (auth, validation, error handler, rate limit)
│   ├── routes/           # Central route aggregator (/api)
│   ├── services/         # Integrasi eksternal (Google Auth, Google Drive, Mailer)
│   ├── utils/            # Helper fungsi (JWT, bcrypt, response format)
│   └── server.ts         # Inisialisasi Express app dan server entry point
├── tests/                # Test suite dan endpoint test scripts
├── .env.example          # Template environment variable
├── nodemon.json          # Konfigurasi nodemon untuk development
├── package.json          # Dependencies dan command scripts
└── tsconfig.json         # Konfigurasi compiler TypeScript
```

---

## Background Jobs & Schedulers

Aplikasi menjalankan beberapa background job menggunakan `node-cron` yang otomatis diaktifkan saat server berjalan (kecuali pada test environment):
- **Token Cleanup Job**: Membersihkan token verifikasi dan token kedaluwarsa secara berkala.
- **Email Scheduler Job**: Menangani pengiriman email terjadwal (reminder deadline, notifikasi pendaftaran tim, dll).
