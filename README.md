# 🚌 QR Check-In — Travel Agency Check-In System

An **online-first, offline-capable, installable PWA** for travel agency staff to check in travelers using QR codes.

## How It Works

1. **Before the trip**: Staff creates a trip and traveler units, then prints QR codes
2. **During the trip**: One staff scans QR codes, another monitors the dashboard live
3. **Offline?**: Scans queue locally and sync automatically when connection returns
4. **Travelers**: Just show their printed/saved QR code — they don't use the app

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Seed demo data
npm run seed

# Build frontend + start server
npm run start

# Open http://localhost:3000
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│        Cloud Backend (Express + SQLite)           │
│        Render / Railway / Fly.io / VPS            │
│        REST API + WebSocket                       │
│        HTTP (:3000) + HTTPS (:3443 optional)      │
└──────────────┬──────────────┬────────────────────┘
               │              │
         HTTPS + WSS    HTTPS + WSS
               │              │
    ┌──────────▼──┐    ┌──────▼──────────┐
    │ 📱 Scanner  │    │ 📱 Dashboard    │
    │ PWA (phone) │    │ PWA (tablet)    │
    │ Camera scan │    │ Live stats      │
    │ Offline Q   │    │ Activity feed   │
    └─────────────┘    └─────────────────┘
```

---

## Trip Selection Workflow

The app is **trip-scoped** — all data is organized by trips.

### How it works
1. A **trip selector dropdown** is always visible in the header across all pages
2. It shows `trip name (date)` for each trip
3. The selected trip is persisted in `localStorage` — survives page reload
4. All pages (Dashboard, Scanner, Travelers, QR Codes) filter data by the selected trip
5. If no trip is selected, pages show a clear **"Select a trip"** empty state

### Creating a trip
Use the API to create trips:
```bash
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -d '{"id":"trip-rome-001","name":"Rome Weekend","date":"2026-05-15","status":"active"}'
```

### Field workflow
1. Staff opens the app → selects today's trip from the dropdown
2. Scanner page shows: **trip name**, **date**, **connection status**, **sync status**
3. Dashboard shows live stats scoped to the same trip
4. Both devices see the same trip data via the shared backend

---

## 📱 iPhone Safari Camera Support (HTTPS)

### The Problem
Camera access (`getUserMedia`) requires a **secure context**:
- ✅ `https://` — always works
- ✅ `http://localhost` — works (browser exception)
- ❌ `http://192.168.x.x` — **blocked on iPhone Safari**

When accessing the app via a LAN IP over plain HTTP, iPhone Safari will block camera access entirely. The app detects this and shows:

> 🔒 **HTTPS Required for Camera**
> Camera access requires HTTPS or localhost. Open the app over HTTPS to use the camera on this device.
> 💡 Use manual code entry below as a fallback.

### Solution: Local HTTPS for LAN Testing

#### Step 1: Generate a self-signed certificate
```bash
npm run generate-cert
```
This creates `server/certs/key.pem` and `server/certs/cert.pem`.

#### Step 2: Start the server with HTTPS enabled
```bash
npm run server:https
# or for development with Vite HMR:
npm run dev:https
```

The server will start both:
- **HTTP** on port `3000` (desktop/localhost)
- **HTTPS** on port `3443` (mobile LAN access)

The startup banner shows the addresses:
```
╔══════════════════════════════════════════════════╗
║     🚌 QR Check-In Server                      ║
╠══════════════════════════════════════════════════╣
║  HTTP:     http://localhost:3000                 ║
║  LAN:      http://192.168.1.5:3000               ║
║                                                  ║
║  HTTPS:    https://localhost:3443                 ║
║  LAN(📱):  https://192.168.1.5:3443              ║
║                                                  ║
║  📱 Use the HTTPS LAN address for iPhone/iPad    ║
║     camera scanning over Wi-Fi.                  ║
╚══════════════════════════════════════════════════╝
```

#### Step 3: Trust the certificate on iPhone

1. Open **Safari** on your iPhone and go to `https://<your-ip>:3443`
2. Safari will show "This connection is not private"
3. Tap **"Show Details"** → **"visit this website"** → **"Visit Website"**
4. Go to **Settings → General → About → Certificate Trust Settings**
5. Enable full trust for **"QR Check-In Local"**
6. Reload the app — camera access will now work ✅

> **Note**: You only need to trust the certificate once per device. It's valid for 365 days.

#### Fallback: Manual Entry
If HTTPS setup isn't possible, the Manual Entry input field is always available on the Scanner page. Staff can type reference codes (e.g., `TRV-001`) to check in travelers without a camera.

---

## Scanner Resilience

The scanner detects camera availability and shows specific error messages:

| Situation | What the user sees |
|-----------|-------------------|
| HTTPS or localhost | ✅ "Start Camera" button available |
| HTTP on LAN IP | 🔒 "HTTPS Required for Camera" + explanation |
| No camera on device | 📷 "No Camera Found" |
| Permission denied | 🚫 "Camera Permission Denied" + instructions |
| Unsupported browser | 📵 "Camera Not Supported" |
| Any error | ⌨️ Manual Entry is always accessible |

---

## Features

| Feature | Description |
|---------|-------------|
| **Trip Selector** | Persistent dropdown in header, available on all pages |
| **Dashboard** | Live stats, progress bar, missing/checked-in lists, activity log |
| **Scanner** | Camera QR + manual entry, HTTPS detection, trip context display |
| **Travelers** | Create, edit, check-in, undo traveler units |
| **QR Codes** | Print-ready gallery, one-click print all |
| **PWA** | Installable on phone/tablet, works offline |
| **Real-time** | WebSocket live updates across all devices |
| **Offline Queue** | Scans stored locally, auto-sync on reconnect |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/trips` | List trips |
| POST | `/api/trips` | Create trip |
| PUT | `/api/trips/:id` | Update trip |
| GET | `/api/travelers?tripId=X` | List travelers |
| POST | `/api/travelers` | Create traveler |
| PUT | `/api/travelers/:id` | Update traveler |
| DELETE | `/api/travelers/:id` | Delete traveler |
| GET | `/api/travelers/stats/summary?tripId=X` | Dashboard stats |
| POST | `/api/checkin` | QR check-in |
| POST | `/api/checkin/undo` | Undo check-in |
| POST | `/api/checkin/manual` | Manual check-in |
| POST | `/api/checkin/sync` | Sync offline queue |
| GET | `/api/checkin/events` | Recent events |
| GET | `/api/qrcodes?tripId=X` | All QR codes |
| GET | `/api/qrcodes/:code` | Single QR (PNG/SVG) |

---

## Offline & Conflict Policy

### When online (default)
- Scanner sends check-in directly to the backend
- Dashboard updates live via WebSocket
- Source of truth: **server database**

### When offline
- Scanner detects network failure (not WebSocket status)
- Validates QR against **locally cached traveler list**
- Prevents duplicate scans against cache + pending queue
- Stores events in **localStorage** with unique eventIds
- UI shows "Queued (Offline)" with pending count

### On reconnect
- Pending events auto-sync to `/api/checkin/sync`
- Server deduplicates by eventId
- If traveler was already checked in by another device:
  - Server returns `status: 'skipped'` (not an error)
- UI clears queue after successful sync

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HTTPS_PORT` | `3443` | HTTPS server port |
| `ENABLE_HTTPS` | `false` | Enable HTTPS (also: `--https` flag) |
| `NODE_ENV` | `development` | Environment |
| `DB_PATH` | `./data/checkin.db` | SQLite database path |
| `VITE_API_URL` | *(empty)* | Frontend: API URL (empty = same-origin) |

---

## Deployment

### Production HTTPS
In production, use a reverse proxy (Caddy, nginx, Cloudflare) for HTTPS. The self-signed cert is only for local LAN testing.

### Render (Recommended)
1. Push code to GitHub
2. Create a **Web Service** on [render.com](https://render.com)
3. Build: `npm install && cd client && npm install && npx vite build`
4. Start: `node server/index.js`
5. Render provides HTTPS automatically ✅
6. Attach persistent disk for SQLite at `/opt/render/project/data`
7. Set `DB_PATH=/opt/render/project/data/checkin.db`

### Railway
1. Connect GitHub repo to [railway.app](https://railway.app)
2. Railway provides HTTPS and auto-detects PORT ✅
3. Use volume mount for SQLite persistence

### VPS (Ubuntu + Caddy)
```bash
# Install Node.js 20+, clone repo, install deps
npm install && cd client && npm install && npx vite build && cd ..
npm run seed

# Run with PM2
pm2 start server/index.js --name qrcheckin
pm2 save && pm2 startup

# Caddy auto-HTTPS (Caddyfile):
# yourdomain.com {
#   reverse_proxy localhost:3000
# }
```

---

## Development

```bash
# HTTP only (desktop)
npm run dev

# HTTP + HTTPS (mobile camera testing on LAN)
npm run generate-cert    # one-time
npm run dev:https

# Re-seed demo data
npm run seed
```

### NPM Scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start backend + Vite dev server |
| `npm run dev:https` | Same, with HTTPS enabled on :3443 |
| `npm run server` | Backend only (HTTP) |
| `npm run server:https` | Backend with HTTPS |
| `npm run seed` | Reset demo data |
| `npm run build` | Build frontend for production |
| `npm run start` | Build + start server |
| `npm run generate-cert` | Generate SSL cert for local HTTPS |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, SQLite (sql.js) |
| Frontend | React (Vite), html5-qrcode |
| Real-time | WebSocket (ws) |
| Offline | localStorage queue + traveler cache |
| PWA | Service Worker, Web App Manifest |
| QR Gen | qrcode npm package |
| HTTPS | Self-signed cert (dev), reverse proxy (prod) |
