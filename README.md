# 🚌 Système de Check-In par QR Code

Un système de check-in par QR code prêt pour la production et fonctionnel hors-ligne, conçu pour le personnel d'agences de voyages.

## 🚀 Fonctionnalités
- **🔐 Authentification Admin** : Connexion par session avec bcrypt.
- **🗺️ Gestion** : Interface complète (CRUD) pour les Voyages et les Voyageurs.
- **📷 Scanner** : Scan de QR codes avec file d'attente hors-ligne & synchronisation automatique.
- **📊 Tableau de bord** : Suivi des présences en temps réel (via polling).
- **🐘 Base de Données** : PostgreSQL.

---

## 💻 Installation Locale

### 1. Prérequis
- Node.js 18+
- PostgreSQL (Local ou Docker)

### 2. Installation
```bash
cp .env.example .env
npm install
npm run seed     # Initialise les données de démonstration
npm run dev      # Démarre Vite + le serveur local Express
```

**Identifiants par défaut** : `ADMIN` / `ADMIN123`

---

## 🛠 Tech Stack
- **Frontend** : React (Vite), HTML5-QRCode
- **Backend / Routing** : Node.js, Express
- **Base de Données** : PostgreSQL (pool de connexion via `pg`)
- **Style** : Vanilla CSS 
