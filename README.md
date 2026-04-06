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
# Clone and install
npm install
cd client && npm install && cd ..

# Seed demo data
npm run seed

# Build frontend and start server
cd client && npx vite build && cd ..
npm run server

# Open http://localhost:3000
```

---

## Architecture

```
┌──────────────────────────────────────────────┐
│        Cloud Backend (Express + SQLite)       │
│        Render / Railway / Fly.io / VPS        │
│        REST API + WebSocket, Port 3000        │
└──────────────┬──────────────┬────────────────┘
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

**Online-first**: All devices connect to a central backend. Check-ins go directly to the server.

**Offline fallback**: If internet drops, scans queue locally with a cached traveler list for validation. Auto-syncs when back online.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Live stats, progress bar, missing/checked-in lists, activity log |
| **Scanner** | Camera QR scanning + manual entry, online-first with offline queue |
| **Travelers** | Create, edit, check-in, undo, delete traveler units |
| **QR Codes** | Print-ready gallery, one-click print all |
| **Trips** | Multi-trip support with selector in header |
| **PWA** | Installable on phone/tablet, works offline |
| **Real-time** | WebSocket live updates across all devices |
| **Offline Queue** | Scans stored locally, auto-sync on reconnect |

---

## Data Model

```
Trip
├── id, name, date, status (active/completed/archived)
│
└── TravelerUnit (many per trip)
    ├── id, referenceCode, displayName
    ├── type (person/couple/family/group)
    ├── peopleCount, status, checkedInAt
    ├── notes, createdAt, updatedAt
    │
    └── ScanEvent (audit log)
        ├── id, action (check_in/undo)
        ├── timestamp, deviceId, syncStatus
```

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
  - Client marks as "already checked in elsewhere"
- UI clears queue after successful sync

### Conflict resolution
| Scenario | Behavior |
|----------|----------|
| Duplicate scan, same device | Rejected locally (debounce + cache check) |
| Duplicate scan, another device | Server returns 409 ALREADY_CHECKED_IN |
| Offline scan, synced later but already checked in | Server returns `skipped`, queue clears |
| Unknown QR code offline | Queued with warning, server rejects on sync |

---

## PWA / Installation

### Android / Chrome
1. Open the app URL in Chrome
2. Tap "Add to Home Screen" banner (or Menu → Install App)
3. App appears on home screen with the purple icon

### iPhone / Safari
1. Open the app URL in Safari
2. Tap Share → "Add to Home Screen"
3. App opens in standalone mode

### Desktop (Chrome/Edge)
1. Click the install icon in the address bar
2. App opens in its own window

### Known iOS Limitations
- Camera access works in standalone PWA mode on iOS 14.4+
- WebSocket connections may disconnect when the app is backgrounded — auto-reconnect handles this
- No push notifications on iOS PWA

---

## Deployment

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `DB_PATH` | `./data/checkin.db` | SQLite database path |
| `VITE_API_URL` | *(empty)* | Frontend: API URL (empty = same-origin) |

### Option 1: Render (Recommended for simplicity)

1. Push code to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Build command: `npm install && cd client && npm install && npx vite build`
4. Start command: `node server/index.js`
5. Add env var: `NODE_ENV=production`
6. Render provides persistent disk for SQLite — attach at `/opt/render/project/data`
7. Set `DB_PATH=/opt/render/project/data/checkin.db`

### Option 2: Railway

1. Push to GitHub → connect to [railway.app](https://railway.app)
2. Build: `npm install && cd client && npm install && npx vite build`
3. Start: `node server/index.js`
4. Railway auto-detects PORT
5. Use volume mount for SQLite persistence

### Option 3: Fly.io

```bash
fly launch
fly volumes create data --size 1
# Set DB_PATH=/data/checkin.db in fly.toml
fly deploy
```

### Option 4: VPS (Ubuntu)

```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# Clone and setup
git clone <your-repo> /srv/qrcheckin
cd /srv/qrcheckin
npm install && cd client && npm install && npx vite build && cd ..
npm run seed

# Run with PM2
npm install -g pm2
pm2 start server/index.js --name qrcheckin
pm2 save && pm2 startup

# Reverse proxy with Caddy (auto-HTTPS)
# Caddyfile: yourdomain.com { reverse_proxy localhost:3000 }
```

### Migrating to PostgreSQL (future)

The database layer (`server/db.js`) uses simple helper functions (`run`, `get`, `all`). To migrate:
1. Replace `sql.js` with `pg` (node-postgres)
2. Update the helpers to use `pool.query()` instead of `stmt.prepare()`
3. Convert `?` param placeholders to `$1, $2, ...`
4. Remove `saveDb()` calls (PostgreSQL persists automatically)

---

## Testing Checklist

### A. Normal online check-in
- [ ] Open Scanner, enter TRV-001, click Check In
- [ ] ✅ Shows "Checked In! — Marco Rossi"
- [ ] ✅ Dashboard updates immediately

### B. Duplicate scan
- [ ] Scan TRV-001 again
- [ ] ⚠️ Shows "Already Checked In"

### C. Unknown QR code
- [ ] Enter INVALID-CODE
- [ ] ❌ Shows "Unknown QR Code"

### D. Offline scan + auto-sync
- [ ] Stop the server (or disconnect network)
- [ ] Enter TRV-002 in Scanner
- [ ] ✅ Shows "Queued (Offline)" with pending badge
- [ ] Restart server / reconnect
- [ ] ✅ Queue auto-syncs, badge disappears, dashboard updates

### E. Conflict after reconnect
- [ ] Stop server
- [ ] Queue TRV-003 offline on Device A
- [ ] Meanwhile, check in TRV-003 on Device B (via API)
- [ ] Reconnect Device A
- [ ] ✅ Sync completes, server reports "skipped" (already checked in)

### F. PWA install
- [ ] Open in Chrome, verify install prompt appears
- [ ] Install, verify app opens standalone
- [ ] Close and reopen from home screen

---

## Development

```bash
# Start both servers with hot-reload
npm run dev

# Or separately:
node server/index.js          # Backend on :3000
cd client && npx vite --host  # Frontend on :5173 (proxied)

# Re-seed demo data
npm run seed
```

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
