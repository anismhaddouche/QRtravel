# Travel QR Check-in

Application web de check-in par QR code pour la gestion des embarquements d'agences de voyage.

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

## Aperçu du projet

Ce projet fournit une interface permettant au personnel d'une agence de voyages de gérer les listes de passagers et de valider les présences le jour du départ. Le système utilise le scan de QR codes pour automatiser l'enregistrement et assurer un suivi des embarquements en temps réel.

## Fonctionnalités clés

- Création et gestion des voyages.
- Enregistrement des voyageurs et génération de QR codes uniques.
- Scan des QR codes sur le terrain pour l'embarquement.
- Suivi des présences en temps réel.
- Support hors-ligne (PWA) pour garantir la continuité de service.

## Stack technique

- **Frontend** : React (Vite), HTML5-QRCode, PWA
- **Backend** : Node.js, Express
- **Base de données** : PostgreSQL
- **Déploiement** : Vercel

## Déploiement Vercel + Supabase

**`DATABASE_URL` recommandé (Vercel) :**

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

- Le **SSL est configuré dans le code** (`ssl: { rejectUnauthorized: false }`).
- **Ne pas** ajouter `?sslmode=require` à l'URL : cela entre en conflit avec la config SSL en code et provoque l'erreur `self-signed certificate in certificate chain`.
- Port **5432 (Session Pooler) recommandé** ; port **6543 (Transaction Pooler) en fallback** si le Session Pooler est saturé.
- `vercel.json` contient `"regions": ["fra1"]` pour rapprocher les Functions de Supabase Frankfurt.

**Vérification après déploiement :**

- `GET /api/debug/db-env` → renvoie `nodeEnv`, `hasDatabaseUrl`, `dbUser`, `dbHost`, `dbPort`, `dbName`, `passwordLength`, `sslRejectUnauthorized` (jamais le mot de passe ni l'URL complète).
- `GET /api/debug/db-test` → exécute `SELECT NOW()` et renvoie `{ ok: true, now, host, port, user }` en cas de succès, sinon `{ ok: false, error, code }`.

## Licence

Distribué sous la licence MIT.
