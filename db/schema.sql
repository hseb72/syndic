-- =====================================================================
--  Syndic — Schéma MVP (version corrigée)
--  PostgreSQL. Montants NUMERIC(14,2), identifiants UUID,
--  dates métier DATE, dates techniques TIMESTAMPTZ.
--
--  Cette version corrige le schéma d'origine sur 5 points, à la lumière
--  des décisions prises et de l'analyse de l'ancien artefact :
--   1. Clés de répartition : N clés (tantièmes + consommation) au lieu
--      d'une colonne lot.tantiemes unique.
--   2. Exercice : OPEN -> CLOSING -> CLOSED réversible, + report à nouveau.
--      La clôture ne touche JAMAIS les lignes bancaires (bug de l'artefact).
--   3. Rapprochement : table de jointure symétrique (copro + fournisseur),
--      partiels et N:N possibles, transverse aux exercices.
--   4. Provisions + régularisation : budget voté + fund_call.call_type.
--   5. Eau : relevés de consommation (2e clé, par compteur).
-- =====================================================================


-- =====================================================================
--  1. RÉFÉRENTIEL COPROPRIÉTÉ
-- =====================================================================

CREATE TABLE coproperty (
    id              uuid PRIMARY KEY,
    name            text NOT NULL,
    address         text,
    postal_code     text,
    city            text,
    country         text NOT NULL DEFAULT 'FR',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE building (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    name            text NOT NULL,
    address         text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- NOTE : lot.tantiemes a disparu. Les tantièmes (et toute autre clé)
-- vivent désormais dans distribution_key / lot_distribution_share.
CREATE TABLE lot (
    id              uuid PRIMARY KEY,
    building_id     uuid NOT NULL REFERENCES building(id),
    lot_number      text NOT NULL,
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (building_id, lot_number)
);

CREATE TABLE person (
    id              uuid PRIMARY KEY,
    first_name      text,
    last_name       text,
    company_name    text,
    email           text,
    phone           text,
    address         text,
    postal_code     text,
    city            text,
    country         text NOT NULL DEFAULT 'FR',
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (
        (first_name IS NOT NULL AND last_name IS NOT NULL)
        OR company_name IS NOT NULL
    )
);

-- Propriété temporelle (indivision + historique de vente).
CREATE TABLE ownership (
    id              uuid PRIMARY KEY,
    lot_id          uuid NOT NULL REFERENCES lot(id),
    person_id       uuid NOT NULL REFERENCES person(id),
    ownership_share numeric(8,5) NOT NULL DEFAULT 1,
    valid_from      date NOT NULL,
    valid_to        date,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (ownership_share > 0 AND ownership_share <= 1),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);


-- =====================================================================
--  2. CLÉS DE RÉPARTITION  (correction #1)
--
--  method = TANTIEMES    -> répartition au prorata de `share`
--                           (ex. clé GENERAL, base 1000)
--  method = CONSUMPTION  -> répartition au prorata des relevés compteur
--                           (ex. clé EAU) — voir meter_reading
--  method = EQUAL        -> parts égales entre lots concernés
--
--  Pour la copro réelle : 1 clé GENERAL (tantièmes, base 1000)
--                         + 1 clé EAU (consommation).
-- =====================================================================

CREATE TABLE distribution_key (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    code            text NOT NULL,                 -- 'GENERAL', 'EAU', ...
    name            text NOT NULL,
    method          text NOT NULL DEFAULT 'TANTIEMES',
    base            numeric(14,4),                 -- somme des parts pour TANTIEMES (ex. 1000)
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (coproperty_id, code),
    CHECK (method IN ('TANTIEMES','CONSUMPTION','EQUAL'))
);

-- Part d'un lot dans une clé TANTIEMES (ignorée pour CONSUMPTION/EQUAL).
CREATE TABLE lot_distribution_share (
    id                  uuid PRIMARY KEY,
    distribution_key_id uuid NOT NULL REFERENCES distribution_key(id),
    lot_id              uuid NOT NULL REFERENCES lot(id),
    share               numeric(14,4) NOT NULL,    -- tantièmes du lot pour cette clé
    created_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (distribution_key_id, lot_id),
    CHECK (share >= 0)
);

-- Relevés de compteur pour une clé CONSUMPTION (eau).
CREATE TABLE meter_reading (
    id                  uuid PRIMARY KEY,
    distribution_key_id uuid NOT NULL REFERENCES distribution_key(id),
    lot_id              uuid NOT NULL REFERENCES lot(id),
    period_label        text NOT NULL,             -- ex. '2024'
    consumption         numeric(14,4) NOT NULL,    -- m3 (ou delta d'index)
    created_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (distribution_key_id, lot_id, period_label),
    CHECK (consumption >= 0)
);


-- =====================================================================
--  3. EXERCICES COMPTABLES  (correction #2)
--
--  L'exercice est une LENTILLE de lecture, pas un conteneur.
--   - status OPEN -> CLOSING -> CLOSED, RÉVERSIBLE tant que approved_at
--     est NULL (l'AG n'a pas approuvé les comptes).
--   - Clôturer NE TOUCHE PAS les lignes bancaires (bank_transaction n'a
--     aucun exercise_id) : la clôture ne fait que figer la répartition
--     de l'exercice et poser le report à nouveau (exercise_carry_forward).
-- =====================================================================

CREATE TABLE accounting_exercise (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    label           text,                          -- ex. 'Exercice 2024'
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    status          text NOT NULL DEFAULT 'OPEN',
    closed_at       timestamptz,                   -- passage en CLOSED
    approved_at     date,                          -- approbation AG : clôture définitive
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (end_date > start_date),
    CHECK (status IN ('OPEN','CLOSING','CLOSED'))
);

-- Report à nouveau : ce qui TRAVERSE la frontière entre deux exercices.
-- lot_id NULL = ligne globale (fonds travaux, dette fournisseur, ...).
CREATE TABLE exercise_carry_forward (
    id                  uuid PRIMARY KEY,
    from_exercise_id    uuid NOT NULL REFERENCES accounting_exercise(id),
    to_exercise_id      uuid NOT NULL REFERENCES accounting_exercise(id),
    lot_id              uuid REFERENCES lot(id),
    kind                text NOT NULL,             -- OWNER_BALANCE | WORK_FUND | SUPPLIER_PAYABLE | OTHER
    amount              numeric(14,2) NOT NULL,    -- signe libre (créditeur/débiteur)
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (from_exercise_id <> to_exercise_id),
    CHECK (kind IN ('OWNER_BALANCE','WORK_FUND','SUPPLIER_PAYABLE','OTHER'))
);


-- =====================================================================
--  4. BUDGET & APPELS DE FONDS  (correction #4 : provisions + régularisation)
-- =====================================================================

-- Budget prévisionnel voté en AG pour un exercice.
CREATE TABLE budget (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    exercise_id     uuid NOT NULL REFERENCES accounting_exercise(id),
    status          text NOT NULL DEFAULT 'DRAFT', -- DRAFT | VOTED
    voted_at        date,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (exercise_id),
    CHECK (status IN ('DRAFT','VOTED'))
);

CREATE TABLE budget_line (
    id                  uuid PRIMARY KEY,
    budget_id           uuid NOT NULL REFERENCES budget(id),
    category            text NOT NULL,             -- 'Eau', 'Assurances', ...
    distribution_key_id uuid NOT NULL REFERENCES distribution_key(id),
    planned_amount      numeric(14,2) NOT NULL,

    CHECK (planned_amount >= 0)
);

-- Appel de fonds global.
--   call_type = PROVISION     -> appel de provisions sur budget voté
--             = REGULARISATION -> régularisation de fin d'exercice
--                                 (écart provisions appelées / charges réelles)
--             = EXCEPTIONNEL   -> travaux, avance, appel ponctuel
CREATE TABLE fund_call (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    exercise_id     uuid NOT NULL REFERENCES accounting_exercise(id),
    call_type       text NOT NULL DEFAULT 'PROVISION',
    label           text NOT NULL,
    issue_date      date NOT NULL,
    due_date        date NOT NULL,
    total_amount    numeric(14,2) NOT NULL,        -- peut être négatif pour une régul créditrice
    status          text NOT NULL DEFAULT 'DRAFT', -- DRAFT | ISSUED | CANCELLED
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (due_date >= issue_date),
    CHECK (call_type IN ('PROVISION','REGULARISATION','EXCEPTIONNEL')),
    CHECK (status IN ('DRAFT','ISSUED','CANCELLED'))
);

-- Répartition de l'appel par lot. distribution_key_id = traçabilité de la
-- clé qui a produit ce montant (une régul annuelle peut mixer plusieurs clés
-- via plusieurs lignes par lot).
CREATE TABLE fund_call_item (
    id                  uuid PRIMARY KEY,
    fund_call_id        uuid NOT NULL REFERENCES fund_call(id),
    lot_id              uuid NOT NULL REFERENCES lot(id),
    distribution_key_id uuid REFERENCES distribution_key(id),
    amount              numeric(14,2) NOT NULL,    -- signe libre (régul créditrice possible)
    created_at          timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
--  5. CRÉANCES
--  exercise_id = exercice que la créance FINANCE (déduit du fait métier),
--  jamais la date d'un encaissement.
-- =====================================================================

CREATE TABLE receivable (
    id                  uuid PRIMARY KEY,
    coproperty_id       uuid NOT NULL REFERENCES coproperty(id),
    lot_id              uuid NOT NULL REFERENCES lot(id),
    person_id           uuid NOT NULL REFERENCES person(id),
    exercise_id         uuid NOT NULL REFERENCES accounting_exercise(id),

    source_type         text NOT NULL,             -- ex. 'FUND_CALL_ITEM'
    source_id           uuid NOT NULL,             -- polymorphe, contrôlé côté domaine

    amount              numeric(14,2) NOT NULL,
    due_date            date NOT NULL,

    status              text NOT NULL DEFAULT 'OPEN',

    cancelled_at        timestamptz,
    cancelled_by        uuid,
    cancellation_reason text,

    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0),
    CHECK (status IN ('OPEN','PAID','CANCELLED')),
    CHECK (status <> 'CANCELLED' OR cancellation_reason IS NOT NULL)
);


-- =====================================================================
--  6. PAIEMENTS COPROPRIÉTAIRES
--  PAS d'exercise_id, PAS de bank_transaction_id : le lien bancaire passe
--  par bank_reconciliation (correction #3). Un paiement 2024 peut solder
--  une créance 2023 sans rien casser.
-- =====================================================================

CREATE TABLE owner_payment (
    id                  uuid PRIMARY KEY,
    coproperty_id       uuid NOT NULL REFERENCES coproperty(id),
    person_id           uuid REFERENCES person(id),    -- NULL = payeur non encore identifié

    payment_date        date NOT NULL,
    amount              numeric(14,2) NOT NULL,
    reference           text,

    status              text NOT NULL DEFAULT 'RECEIVED',

    reversed_at         timestamptz,
    reversed_by         uuid,
    reversal_reason     text,

    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0),
    CHECK (status IN ('RECEIVED','IDENTIFIED','PARTIALLY_ALLOCATED','FULLY_ALLOCATED','REVERSED'))
);

CREATE TABLE payment_allocation (
    id                  uuid PRIMARY KEY,
    owner_payment_id    uuid NOT NULL REFERENCES owner_payment(id),
    receivable_id       uuid NOT NULL REFERENCES receivable(id),
    amount              numeric(14,2) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0)
);


-- =====================================================================
--  7. FOURNISSEURS / FACTURES / PAIEMENTS
-- =====================================================================

CREATE TABLE supplier (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    name            text NOT NULL,
    email           text,
    phone           text,
    address         text,
    postal_code     text,
    city            text,
    registration_no text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- exercise_id = exercice de la CHARGE (date de prestation), pas du paiement.
CREATE TABLE supplier_invoice (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    supplier_id     uuid NOT NULL REFERENCES supplier(id),
    exercise_id     uuid NOT NULL REFERENCES accounting_exercise(id),
    distribution_key_id uuid REFERENCES distribution_key(id),  -- clé de répartition de la charge

    invoice_number  text,
    invoice_date    date NOT NULL,
    due_date        date,
    amount          numeric(14,2) NOT NULL,
    category        text,
    status          text NOT NULL DEFAULT 'RECORDED',

    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0),
    CHECK (status IN ('RECORDED','PAID','CANCELLED'))
);

CREATE TABLE supplier_payment (
    id                  uuid PRIMARY KEY,
    supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoice(id),
    payment_date        date NOT NULL,
    amount              numeric(14,2) NOT NULL,
    reference           text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0)
);


-- =====================================================================
--  8. BANQUE  — grand livre continu, JAMAIS archivé, sans exercise_id.
-- =====================================================================

CREATE TABLE bank_account (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    name            text NOT NULL,
    iban            text,
    initial_balance numeric(14,2) NOT NULL DEFAULT 0,
    initial_date    date,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_transaction (
    id              uuid PRIMARY KEY,
    bank_account_id uuid NOT NULL REFERENCES bank_account(id),

    transaction_date date NOT NULL,
    value_date       date,
    amount           numeric(14,2) NOT NULL,       -- +entrée / -sortie
    label            text,
    external_id      text,

    created_at       timestamptz NOT NULL DEFAULT now(),

    UNIQUE (bank_account_id, external_id)
);

-- Rapprochement bancaire : table de jointure symétrique (correction #3).
--   - copropriétaire ET fournisseur (target_type)
--   - partiels et N:N (plusieurs lignes possibles par côté)
--   - transverse aux exercices (aucune contrainte d'exercice ici)
--  Worklist « à rapprocher » = bank_transaction dont la somme rapprochée
--  ne couvre pas encore |amount|.
CREATE TABLE bank_reconciliation (
    id                  uuid PRIMARY KEY,
    bank_transaction_id uuid NOT NULL REFERENCES bank_transaction(id),
    target_type         text NOT NULL,             -- OWNER_PAYMENT | SUPPLIER_PAYMENT
    target_id           uuid NOT NULL,
    amount              numeric(14,2) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (target_type IN ('OWNER_PAYMENT','SUPPLIER_PAYMENT')),
    CHECK (amount <> 0)
);


-- =====================================================================
--  9. COMPTABILITÉ MINIMALE
--  journal_entry.exercise_id = exercice du FAIT rattaché (source), pas la
--  date bancaire. (Corrige la règle piège « une écriture appartient à
--  l'exercice de sa date ».)
-- =====================================================================

CREATE TABLE accounting_account (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    number          text NOT NULL,
    name            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (coproperty_id, number)
);

CREATE TABLE journal (
    id              uuid PRIMARY KEY,
    coproperty_id   uuid NOT NULL REFERENCES coproperty(id),
    code            text NOT NULL,
    name            text NOT NULL,

    UNIQUE (coproperty_id, code)
);

CREATE TABLE journal_entry (
    id              uuid PRIMARY KEY,
    journal_id      uuid NOT NULL REFERENCES journal(id),
    exercise_id     uuid NOT NULL REFERENCES accounting_exercise(id),

    entry_date      date NOT NULL,
    description     text NOT NULL,
    source_type     text,
    source_id       uuid,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_entry_line (
    id                    uuid PRIMARY KEY,
    journal_entry_id      uuid NOT NULL REFERENCES journal_entry(id),
    accounting_account_id uuid NOT NULL REFERENCES accounting_account(id),
    debit                 numeric(14,2) NOT NULL DEFAULT 0,
    credit                numeric(14,2) NOT NULL DEFAULT 0,
    description           text,

    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);


-- =====================================================================
--  INVARIANTS APPLICATIFS (non exprimables simplement en CHECK)
-- =====================================================================
--  Répartition d'un appel     : SUM(fund_call_item.amount) = fund_call.total_amount
--                               (à l'émission, call_type PROVISION/EXCEPTIONNEL)
--  Allocation d'un paiement   : paiement non REVERSED ;
--                               SUM(allocations) <= paiement.amount ;
--                               créance non CANCELLED ;
--                               allocation <= reste dû de la créance.
--  Reste dû d'une créance     : amount - SUM(payment_allocation.amount effectives)
--  Rapprochement bancaire     : SUM(bank_reconciliation.amount) par transaction
--                               <= |bank_transaction.amount|
--  Écriture comptable         : SUM(debit) = SUM(credit)
--  Exercice d'une écriture    : = exercice du fait rattaché (source), JAMAIS
--                               déduit de la date d'un encaissement bancaire.
--  Clôture d'exercice         : NE MODIFIE NI NE DÉPLACE aucune bank_transaction.
--                               Produit exercise_carry_forward + fige la
--                               répartition. Réversible tant que approved_at IS NULL.
-- =====================================================================
