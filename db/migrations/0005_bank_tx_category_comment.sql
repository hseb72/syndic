-- =====================================================================
--  0005 — Catégorie et commentaire sur les lignes bancaires
--
--  Chaque ligne de relevé peut porter :
--   - une catégorie (évaluée automatiquement à l'import, modifiable) ;
--   - un commentaire libre saisi par le syndic.
-- =====================================================================

ALTER TABLE bank_transaction ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE bank_transaction ADD COLUMN IF NOT EXISTS comment  text;
