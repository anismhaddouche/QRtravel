# 🚌 QR Check-In System (Vercel + Supabase)

A production-ready, offline-first QR check-in system designed for travel agency staff.

## 🚀 Features
- **🔐 Admin Auth**: Session-based login with bcrypt.
- **🗺️ Management**: Full CRUD for Trips and Travelers.
- **📷 Scanner**: QR scanning with offline queue & auto-sync.
- **📊 Dashboard**: Real-time attendance tracking via polling.
- **🐘 Database**: PostgreSQL.

---

## 💻 Local Setup

### 1. Requirements
- Node.js 18+
- PostgreSQL (Local, Docker, or Supabase connection string)

### 2. Installation
```bash
cp .env.example .env
npm install
npm run seed     # Initialize demo data
npm run dev      # Start Vite + Local Express Server
```

**Login**: `ADMIN` / `ADMIN123`

---

## ☁️ Deployment (Vercel + Supabase)

This project is configured for **free deployment** via Vercel for hosting and Supabase for the database.

### 1. Database (Supabase)
1. Create a free account and project on [Supabase](https://supabase.com).
2. Go to **Project Settings** > **Database** and copy your **Connection String (URI format)**.
3. Replace the placeholder items `[YOUR-PASSWORD]` in the URI.

### 2. Hosting (Vercel)
1. Push this folder to a GitHub repository.
2. Link the repository to [Vercel](https://vercel.com).
3. In Vercel, add the following **Environment Variables**:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = `(Your Supabase Connection String)`
   - `ADMIN_USERNAME` = `ADMIN`
   - `ADMIN_PASSWORD` = `ADMIN123`
   - `SESSION_SECRET` = `(Generate a long random string)`
4. Deploy the project. The `vercel.json` handles routing the API.

### 3. Initialize Data
Because Vercel functions are serverless, there's no persistent terminal.
To seed your Supabase database, run the seed script locally *while pointing your local `.env` to the Supabase database*:
```bash
# In your local .env, temporarily set DATABASE_URL to your Supabase URL
npm run seed
```

---

## 🛠 Tech Stack
- **Frontend**: React (Vite), HTML5-QRCode
- **Backend / Routing**: Vercel Serverless Functions (Express-adapter via `@vercel/node`)
- **Database**: PostgreSQL (pg pool via Supabase)
- **Styling**: Vanilla CSS (Premium Dark Theme)
