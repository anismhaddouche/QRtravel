# 🚌 QR Check-In System

A production-ready, offline-first QR check-in system designed for travel agency staff.

## 🚀 Features
- **🔐 Admin Auth**: Session-based login with bcrypt.
- **🗺️ Management**: Full CRUD for Trips and Travelers.
- **📷 Scanner**: QR scanning with offline queue & auto-sync.
- **📊 Dashboard**: Real-time attendance tracking via WebSockets.
- **🐘 Database**: PostgreSQL (Optimized for Render Free Tier).

---

## 💻 Local Setup

### 1. Requirements
- Node.js 18+
- PostgreSQL (Local or Docker)

### 2. Database (Docker example)
```bash
docker run --name qrcheckin-pg -e POSTGRES_DB=qrcheckin -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

### 3. Installation
```bash
cp .env.example .env
npm install
npm run seed     # Initialize demo data
npm run dev      # Start backend + frontend
```

**Login**: `ADMIN` / `ADMIN123`

---

## ☁️ Deployment (Render)

This project is configured for **one-click deployment** on Render.

1. Push this folder to a GitHub repository.
2. Link the repository to [Render](https://render.com).
3. Render will automatically detect `render.yaml` and provision:
   - **Web Service** (Node.js)
   - **PostgreSQL Database** (Free Tier)
4. Once deployed, run `node server/seed.js` via the Render Shell tab to initialize your data.

---

## 🛠 Tech Stack
- **Frontend**: React (Vite), HTML5-QRCode
- **Backend**: Node.js, Express, WS (WebSockets)
- **Database**: PostgreSQL (pg)
- **Styling**: Vanilla CSS (Premium Dark Theme)
