# Qrtravel

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

## Variables d'environnement requises (Vercel — production)

| Variable | Rôle | Exemple |
|---|---|---|
| `NODE_ENV` | Doit être `production` | `production` |
| `DATABASE_URL` | URL Supabase (sans `?sslmode=require`) | `postgresql://postgres.<REF>:<PWD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres` |
| `ADMIN_USERNAME` | **Doit être différent de `ADMIN`** | `voyage-admin` |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe (préféré) | `$2a$10$...` |
| `ADMIN_PASSWORD` | Mot de passe en clair (si pas de hash) — **doit être différent de `ADMIN123`** | mot de passe fort |
| `SESSION_SECRET` | Chaîne aléatoire 32+ caractères | générer avec `openssl rand -hex 32` |
| `ALLOWED_ORIGIN` | Origines CORS autorisées avec credentials | `https://qrtravel.vercel.app` |
| `ENABLE_DEBUG_ENDPOINTS` | `true` pour exposer `/api/debug/*` (toujours admin-only) | `false` (défaut) |
| `UPSTASH_REDIS_REST_URL` *(optionnel)* | Upstash REST URL pour rate-limit partagé | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` *(optionnel)* | Token Upstash | `AX...` |

> En production, si `ADMIN_USERNAME=ADMIN`, `ADMIN_PASSWORD=ADMIN123` ou `SESSION_SECRET` est manquant/par défaut, l'application **log un avertissement de sécurité au démarrage** sans crasher.

### Rotation des credentials

**1. Générer un hash bcrypt du nouveau mot de passe :**
```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "mon-nouveau-mot-de-passe"
```

**2. Générer un `SESSION_SECRET` aléatoire :**
```bash
openssl rand -hex 32
# ou : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3. Dans Vercel → Project → Settings → Environment Variables** (environnement *Production*) :
- `ADMIN_USERNAME` (≠ `ADMIN`)
- `ADMIN_PASSWORD_HASH` (le hash obtenu ci-dessus) **et supprimer `ADMIN_PASSWORD`**
- `SESSION_SECRET` (la valeur aléatoire ci-dessus)

**4. Redéployer.** Toutes les sessions existantes sont invalidées par le changement de hash.

## Comptes du personnel (staff users)

L'application supporte plusieurs comptes personnels stockés en base (`users`), avec mots de passe **bcrypt**. Les identifiants `ADMIN_USERNAME` / `ADMIN_PASSWORD` (ou `ADMIN_PASSWORD_HASH`) restent disponibles **uniquement en secours / dev local**.

### Schéma `users`

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT (uuid) | clé primaire |
| `email` | TEXT UNIQUE | identifiant de connexion |
| `passwordHash` | TEXT | bcrypt (cost 10) |
| `role` | TEXT | `admin` ou `staff` |
| `createdAt` / `updatedAt` | TEXT (ISO) | |

### Création depuis la CLI

```bash
# Créer (ou mettre à jour) un compte
npm run create-user -- <email> <password> [admin|staff]

# Exemple
npm run create-user -- Bouatittravel@gmail.com Qrbouatittravel2026 admin
```

Le script est **idempotent** : si l'email existe déjà, le mot de passe et le rôle sont mis à jour et les sessions actives de cet utilisateur sont révoquées.

`npm run seed` crée automatiquement le compte initial **Bouatittravel@gmail.com** (admin) s'il n'existe pas (les comptes existants ne sont jamais écrasés par `seed`).

### Gestion depuis l'application

Connecté en tant qu'**admin**, ouvrez **Personnel** dans la barre latérale (route `/users`) pour :

- créer un nouveau compte (`admin` ou `staff`)
- réinitialiser le mot de passe d'un compte (révoque ses sessions actives)
- supprimer un compte (interdit pour le dernier admin et pour le compte connecté)

### Ordre de résolution lors du login

1. **DB** : `SELECT * FROM users WHERE LOWER(email) = LOWER($1)` puis `bcrypt.compare`.
2. **Fallback env** : si aucun user en base, on compare à `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (ou `ADMIN_PASSWORD`).

Le fallback env est conçu pour le **bootstrap initial** et la **récupération d'urgence**. En production, créez des comptes en base et retirez ou rotez `ADMIN_PASSWORD`.

## CSRF — modèle de sécurité

Le frontend et l'API sont **déployés sur le même domaine Vercel** (same-origin). Les cookies de session sont :
- `HttpOnly` (inaccessibles à JS)
- `Secure` en production
- `SameSite=Lax` (bloque les requêtes cross-site qui modifient l'état)

Combinés à l'allowlist CORS (`ALLOWED_ORIGIN`), ces trois mesures couvrent le CSRF pour notre topologie. **Aucun jeton CSRF additionnel n'est nécessaire tant que le frontend reste same-origin.**

**Si vous séparez frontend et API sur des domaines différents** :
1. Ajouter le domaine du frontend dans `ALLOWED_ORIGIN`.
2. Passer le cookie en `SameSite=None; Secure` (côté serveur, `cookieOptions()` dans `server/routes/auth.js`).
3. **Implémenter un double-submit CSRF token** (cookie `XSRF-TOKEN` + header `X-XSRF-TOKEN` exigé sur POST/PUT/DELETE) avant la mise en production.

## Tests

```bash
npm test
```

Couvre : validation d'inputs (regex `referenceCode` / `tripId`), contrat trip-scoped check-in (`WRONG_TRIP`, `ALREADY_CHECKED_IN`, `VALIDATION`), rate-limiter (allow/block/per-IP), avertissement de credentials. Utilise le test runner intégré de Node 20 (aucune dépendance supplémentaire).

## Licence

Distribué sous la licence MIT.
