-- =====================================================================
--  Migration 0002 — Authentification
--  Comptes réels + rôles (bureau / copropriétaire).
-- =====================================================================

CREATE TABLE app_user (
    id              uuid PRIMARY KEY,
    email           text NOT NULL,
    password_hash   text NOT NULL,
    display_name    text,
    role            text NOT NULL DEFAULT 'COPROPRIETAIRE',
    coproperty_id   uuid REFERENCES coproperty(id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (role IN ('BUREAU', 'COPROPRIETAIRE'))
);

-- E-mail unique, insensible à la casse.
CREATE UNIQUE INDEX app_user_email_unique ON app_user (lower(email));
