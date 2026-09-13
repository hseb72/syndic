-- =====================================================================
--  0008 — Avis de paiement (document de recouvrement)
--
--  Un avis de paiement REGROUPE plusieurs créances — de natures et
--  d'exercices éventuellement différents — afin que le copropriétaire
--  règle un seul montant. La présentation et le paiement sont groupés ;
--  la comptabilité (chaque créance garde sa nature, son exercice, son
--  traitement) ne l'est jamais.
--
--    payment_notice        : l'avis (destinataire, échéance, total)
--    payment_notice_line    : le lien avis <-> créance (une créance figure
--                             sur au plus un avis)
-- =====================================================================

CREATE TABLE IF NOT EXISTS payment_notice (
    id            uuid PRIMARY KEY,
    coproperty_id uuid NOT NULL REFERENCES coproperty(id),
    person_id     uuid NOT NULL REFERENCES person(id),
    label         text NOT NULL,
    issue_date    date NOT NULL,
    due_date      date NOT NULL,
    total_amount  numeric(14,2) NOT NULL DEFAULT 0,
    status        text NOT NULL DEFAULT 'ISSUED',
    created_at    timestamptz NOT NULL DEFAULT now(),

    CHECK (due_date >= issue_date),
    CHECK (status IN ('ISSUED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS payment_notice_line (
    id                uuid PRIMARY KEY,
    payment_notice_id uuid NOT NULL REFERENCES payment_notice(id) ON DELETE CASCADE,
    receivable_id     uuid NOT NULL REFERENCES receivable(id),
    amount            numeric(14,2) NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CHECK (amount > 0),
    UNIQUE (receivable_id)   -- une créance ne figure que sur un seul avis
);

CREATE INDEX IF NOT EXISTS idx_payment_notice_person ON payment_notice(coproperty_id, person_id);
CREATE INDEX IF NOT EXISTS idx_payment_notice_line_notice ON payment_notice_line(payment_notice_id);
