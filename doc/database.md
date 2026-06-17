# Dictionnaire de données - Authentification (Better Auth)

Ce document décrit les tables utilisées pour l'authentification et la gestion des sessions.

---

## Table : `account`
Stocke les détails et identifiants des méthodes d'authentification des utilisateurs (locales ou tierces).

| Champ | Explication Technique | Explication Métier |
| :--- | :--- | :--- |
| **`id`** | Clé primaire (UUID). | Identifiant technique de la méthode d'authentification. |
| **`accountId`** | Identifiant unique chez le fournisseur (ex: ID Google ou email). | Identifiant de connexion propre au service utilisé. |
| **`providerId`** | Nom du fournisseur (ex: `'credential'`, `'google'`). | Méthode choisie pour se connecter (email/mot de passe ou réseau social). |
| **`userId`** | Clé étrangère vers `user.id`. | Utilisateur physique propriétaire de cette méthode de connexion. |
| **`password`** | Hash du mot de passe (si `credential`). | Mot de passe chiffré et sécurisé de l'utilisateur. |
| **`accessToken`** | Jeton d'accès OAuth temporaire (nullable). | Clé d'autorisation pour interagir avec des services tiers (ex: Google). |
| **`refreshToken`** | Jeton de rafraîchissement OAuth (nullable). | Clé permettant de renouveler la connexion tiers sans déconnecter l'utilisateur. |
| **`idToken`** | JWT d'identité OAuth (nullable). | Preuve d'identité certifiée renvoyée par le service tiers. |
| **`accessTokenExpiresAt`** | Horodatage (nullable). | Date de fin de validité de l'autorisation temporaire tiers. |
| **`refreshTokenExpiresAt`** | Horodatage (nullable). | Date limite pour le renouvellement automatique de l'accès tiers. |
| **`scope`** | Liste de permissions demandées (nullable). | Droits d'accès accordés par l'utilisateur chez le fournisseur tiers. |
| **`createdAt`** | Horodatage de création. | Date de liaison du compte/moyen de connexion. |
| **`updatedAt`** | Horodatage de modification. | Date de dernière mise à jour des accès. |

---

## Table : `session`
Gère les sessions actives des utilisateurs connectés.

| Champ | Explication Technique | Explication Métier |
| :--- | :--- | :--- |
| **`id`** | Clé primaire (UUID). | Identifiant technique de la session. |
| **`token`** | Clé de session unique envoyée au navigateur. | Jeton de sécurité maintenant l'utilisateur connecté d'une page à l'autre. |
| **`userId`** | Clé étrangère vers `user.id`. | Utilisateur actuellement connecté. |
| **`expiresAt`** | Horodatage de fin de validité. | Date/Heure de déconnexion automatique de l'utilisateur par inactivité. |
| **`ipAddress`** | Adresse IP du client (nullable). | Localisation réseau de la connexion (sécurité et détection de fraude). |
| **`userAgent`** | Métadonnées du navigateur/système (nullable). | Type d'appareil ou navigateur utilisé par le client (PC, Mobile, etc.). |
| **`createdAt`** | Horodatage de création. | Date et heure de connexion de l'utilisateur. |
| **`updatedAt`** | Horodatage de modification. | Date de dernière activité de la session. |

---

## Table : `verification`
Utilisée pour les flux de validation à usage unique (validation d'email, réinitialisation de mot de passe).

| Champ | Explication Technique | Explication Métier |
| :--- | :--- | :--- |
| **`id`** | Clé primaire (UUID). | Identifiant technique du jeton de vérification. |
| **`identifier`** | Cible de la vérification (ex: email). | Utilisateur ou destination devant recevoir l'action. |
| **`value`** | Code ou jeton à usage unique. | Lien/Code temporaire envoyé (ex: pour valider un email ou changer un mot de passe). |
| **`expiresAt`** | Horodatage d'expiration. | Date limite d'utilisation du lien ou du code envoyé. |
| **`createdAt`** | Horodatage de création. | Date d'envoi de la demande de vérification. |
| **`updatedAt`** | Horodatage de modification. | Date de modification ou de validation du jeton. |

---

## Table : `agencies`
Représente les agences de voyage partenaires enregistrées sur la plateforme.

| Champ | Explication Technique | Explication Métier |
| :--- | :--- | :--- |
| **`id`** | Clé primaire (TEXT/UUID). | Identifiant unique de l'agence de voyage. |
| **`name`** | Chaîne de caractères (non nulle). | Nom ou raison sociale de l'agence. |
| **`email`** | Chaîne de caractères (nullable). | Adresse email de contact de l'agence. |
| **`phone`** | Chaîne de caractères (nullable). | Numéro de téléphone de contact de l'agence. |
| **`status`** | Chaîne de caractères (valeurs : `'active'` ou `'inactive'`, défaut `'active'`). | État de l'agence. Actuellement utilisé comme indicateur géré par l'API ; le blocage effectif des accès se fait pour l'instant via l'expiration de l'essai (`trialExpiresAt`) ou le bannissement de l'utilisateur (`banned`). |
| **`createdAt`** | Chaîne de caractères / Horodatage. | Date de création de la fiche agence. |
| **`updatedAt`** | Chaîne de caractères / Horodatage. | Date de la dernière modification des informations de l'agence. |

---

## Table : `user`
Représente les profils des utilisateurs de la plateforme (administrateurs globaux, administrateurs d'agences et personnels).

| Champ | Explication Technique | Explication Métier |
| :--- | :--- | :--- |
| **`id`** | Clé primaire (UUID). | Identifiant unique de l'utilisateur. |
| **`name`** | Chaîne de caractères (nullable). | Nom/Prénom de l'utilisateur affiché dans l'interface. |
| **`email`** | Chaîne de caractères (unique, non nulle). | Adresse email (identifiant principal pour se connecter). |
| **`emailVerified`** | Booléen. | Indique si l'utilisateur a validé son email. |
| **`image`** | Chaîne de caractères / URL (nullable). | Lien vers la photo de profil / l'avatar de l'utilisateur. |
| **`role`** | Chaîne de caractères (valeurs : `'super_admin'`, `'agency_admin'`, `'admin'`). | Rôle déterminant le niveau d'autorisations et d'accès aux données. Le rôle `'admin'` représente le personnel de l'agence (l'ancien rôle `'staff'` a été supprimé). |
| **`banned`** | Booléen. | Indique si l'accès de l'utilisateur a été manuellement bloqué/suspendu. |
| **`trialExpiresAt`** | Horodatage (nullable). | Date de fin de la période d'essai (ou d'abonnement) au niveau de l'utilisateur ou de son agence. |
| **`agencyId`** | Clé étrangère vers `agencies.id` (nullable). | Agence de voyage à laquelle le personnel est rattaché (vaut `NULL` pour les administrateurs généraux de la plateforme). |
| **`phone`** | Chaîne de caractères (nullable). | Numéro de téléphone de contact de l'utilisateur. |
| **`createdAt`** | Horodatage. | Date d'inscription / création du profil de l'utilisateur. |
| **`updatedAt`** | Horodatage. | Date de dernière modification du profil. |


