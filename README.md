# Syndic — gestion de copropriété (syndic bénévole)

Application de gestion d'une petite copropriété (~15 lots) par un syndic
bénévole. Le logiciel porte la complexité juridique et comptable ; le syndic
manipule des opérations métier compréhensibles.

## Principe fondateur

**L'exercice comptable est une lentille de lecture, pas un conteneur.** Le grand
livre bancaire est continu et n'est jamais archivé ; clôturer un exercice ne fait
que figer sa répartition et poser le report à nouveau. Un paiement encaissé en
2024 peut solder un appel 2023 sans rien casser. Voir [`db/NOTES.md`](db/NOTES.md).

## Stack

| Couche | Technologie |
|--------|-------------|
| Base   | PostgreSQL 16 — migrations SQL versionnées (`db/migrations/`) |
| API    | Node.js + TypeScript, Fastify, Kysely |
| Front  | Angular 19 + Transloco (i18n runtime, 5 langues) |
| Déploiement | Local (docker-compose pour la base) → cluster Kubernetes |

## Structure

```
db/          Schéma et migrations SQL (source de vérité), notes de conception
server/      API Fastify + TypeScript (modular monolith orienté commandes)
web/         Front Angular (design + i18n repris de l'artefact d'origine)
docker-compose.yml   PostgreSQL pour le dev local
```

## Prérequis

- Node.js 22+
- Docker (pour la base) ou un PostgreSQL 16 local

## Lancer en local

### 1. Base de données

```bash
docker compose up -d db
```

(ou un PostgreSQL local avec un rôle `syndic` / base `syndic`)

### 2. API

```bash
cd server
cp .env.example .env         # ajuster DATABASE_URL si besoin
npm install
npm run migrate              # applique db/migrations/*.sql
npm run dev                  # http://localhost:3000  (GET /health)
```

### 3. Front

```bash
cd web
npm install
npm start                    # http://localhost:4200
```

Le front proxie `/api` et `/health` vers l'API (voir `web/proxy.conf.json`), pas
de souci de CORS en dev.

### 4. Premier compte

Au premier lancement, l'application n'a aucun utilisateur. Sur l'écran de
connexion, cliquez sur **« Première utilisation ? Créer le compte bureau »** :
ce tout premier compte est créé avec le rôle **BUREAU** (accès complet). Les
comptes suivants (copropriétaires, lecture seule) se créent ensuite via un
compte bureau. Définissez `JWT_SECRET` en production.

## Fonctionnalités

- **Copropriété** : lots, copropriétaires, tantièmes (N clés : générale + eau), ownership temporel
- **Trésorerie** : budget voté, appels de provisions, créances, paiements (lettrage auto), **clôture d'exercice réversible + report à nouveau**
- **Dépenses** : fournisseurs, factures (ventilation eau abonnement/consommation), relevés d'eau, charges réparties par lot
- **Banque** : import de relevé, grand livre continu, worklist « à rapprocher », **lettrage assisté par le libellé**
- **Régularisation** : formule annuelle (dépenses N-1 + impayés − provisions N-1 + provisions N + fonds N), détail par lot, génération de l'appel
- **Comptabilité** : journal en partie double (écritures dérivées des faits), balance équilibrée
- **Tableau de bord** : solde de trésorerie, impayés, à rapprocher, budget consommé
- **Transverse** : multilingue (fr/en/de/es/it), thème clair/sombre, authentification (rôles bureau/copropriétaire)

## Migrations

Les migrations sont des fichiers SQL numérotés dans `db/migrations/`
(`NNNN_libelle.sql`). `0001_init.sql` **est** le schéma de référence. Le runner
(`npm run migrate` côté server) applique dans l'ordre celles qui manquent, chacune
dans une transaction, et trace l'état dans `schema_migrations`.

## Feuille de route (MVP)

- [x] **Étape 1 — Socle** : base, API, front, i18n, thème
- [x] **Étape 2 — Copropriété** : lots, copropriétaires, tantièmes, clés de répartition, ownership
- [x] **Étape 3 — Appels de fonds** : budget voté, provisions + régularisation, créances
- [x] **Étape 4 — Paiements** : encaissements, affectation, soldes
- [x] **Étape 5 — Dépenses** : fournisseurs, factures (ventilation eau), paiements
- [x] **Étape 6 — Comptabilité** : journal en partie double, balance
- [x] **Étape 7 — Vue syndic** : tableau de bord (impayés, banque, dépenses…)
- [x] **Rapprochement bancaire** ; **clôture / report à nouveau** ; **authentification (rôles)**

## Reste à faire (déploiement)

- Dockerfiles applicatifs + manifests Kubernetes
- Sauvegardes PostgreSQL automatiques
- Cookie httpOnly pour le jeton (durcissement au lieu du localStorage)
