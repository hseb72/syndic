-- =====================================================================
--  Migration 0003 — Rattachement d'un compte à un copropriétaire
--  Un compte COPROPRIETAIRE peut être lié à une personne (person), pour
--  n'afficher que ce qui le concerne (« Mes charges »).
-- =====================================================================

ALTER TABLE app_user
    ADD COLUMN person_id uuid REFERENCES person(id);
