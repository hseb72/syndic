# Corrections du schéma MVP — notes

Ce document accompagne `db/schema.sql`. Il explique **pourquoi** le schéma
diffère de la version d'origine, et ce qu'on garde de l'ancien artefact.

## Le principe fondateur : l'exercice est une lentille, pas un conteneur

Le blocage de la version précédente : clôturer un exercice **archivait toutes
les lignes bancaires** (y compris celles des années suivantes, pré-importées)
et vidait le compte courant. Preuve trouvée dans les données réelles de
l'artefact : l'archive de l'exercice 2023 contenait des `bank_transaction`
datées **de 2023 à 2026**, et le ledger vivant était vide.

Règles retenues (encodées dans le schéma) :

1. `bank_transaction` n'a **aucun** `exercise_id`. Grand livre continu, jamais
   archivé. Pré-importer les relevés N+1 est autorisé à tout moment.
2. Le rapprochement (`bank_reconciliation`) est **transverse aux exercices** :
   un paiement 2024 peut solder un appel 2023.
3. Clôturer un exercice ne fait que (a) figer la répartition et (b) poser le
   **report à nouveau** (`exercise_carry_forward`). Ça ne touche aucune ligne
   bancaire.
4. `accounting_exercise.status` : `OPEN → CLOSING → CLOSED`, **réversible** tant
   que `approved_at IS NULL` (AG non tenue).
5. L'exercice d'une écriture / créance / facture = celui du **fait métier**
   (appel financé, date de la charge), **jamais** la date d'un encaissement.

## Les 5 corrections

| # | Point | Avant | Après |
|---|-------|-------|-------|
| 1 | Clés de répartition | `lot.tantiemes` unique | `distribution_key` (TANTIEMES/CONSUMPTION/EQUAL) + `lot_distribution_share` + `meter_reading` |
| 2 | Exercice | `OPEN/CLOSED`, archivage | `OPEN/CLOSING/CLOSED` réversible + `exercise_carry_forward`, banque jamais touchée |
| 3 | Rapprochement | FK `owner_payment.bank_transaction_id` (copro seul) | table `bank_reconciliation` symétrique (copro + fournisseur), partiels, N:N |
| 4 | Appels | `fund_call` générique | `budget`/`budget_line` votés + `fund_call.call_type` (PROVISION/REGULARISATION/EXCEPTIONNEL) |
| 5 | Eau | absent | clé CONSUMPTION + `meter_reading` (répartition au compteur) |

## Décisions actées

- **Architecture** : vraie appli web (backend + PostgreSQL).
- **Comptabilité** : hybride (simplifié à l'usage, capable de sortir des
  **annexes copro simplifiées** pour l'AG).
- **Clés** : la copro réelle utilise **1 grille tantièmes base 1000**
  (14 lots × 65 + 1 lot × 90) **+ 1 clé eau à la consommation**. Le modèle
  générique couvre les deux sans surcoût.
- **Appels** : provisions sur budget voté + régularisation annuelle.

## À reprendre de l'ancien artefact (hors schéma)

- **Design** : tokens CSS (Fraunces + Public Sans, palette papier/bleu ardoise
  `#1c4f82`/or, **dark mode complet**, styles d'impression). À porter tel quel
  côté front.
- **i18n** : 5 langues (fr/en/de/es/it).
- **Deux espaces** : *bureau* / *copropriétaires* (→ rôles `User`/`Role`).
- **Rapprochement assisté** : l'artefact rapprochait appel ↔ lot ↔ transaction ;
  à revoir plus tard pour un rapprochement semi-automatique (suggestions par
  montant/nom).

## Reste à décider

- Stack technique exacte (langage/framework backend, ORM, front).
- Plan comptable copro à précharger (comptes 45x copropriétaires, 6x/7x).
- Génération des annexes simplifiées.
- Détail de la régularisation eau (eau réelle vs provision, par compteur).
