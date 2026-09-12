-- =====================================================================
--  0004 — Quote-part d'indivision nulle autorisée (délégation d'accès)
--
--  Une personne peut être rattachée à un lot pour disposer d'un accès
--  (login) sans être copropriétaire : c'est le cas d'une délégation
--  (ex. un enfant qui gère le bien de ses parents). Elle a alors une
--  quote-part de 0 % et ne participe pas aux charges.
--
--  On assouplit donc la contrainte : ownership_share >= 0 (au lieu de > 0).
-- =====================================================================

ALTER TABLE ownership DROP CONSTRAINT IF EXISTS ownership_ownership_share_check;
ALTER TABLE ownership DROP CONSTRAINT IF EXISTS ownership_share_check;

ALTER TABLE ownership
  ADD CONSTRAINT ownership_share_check
  CHECK (ownership_share >= 0 AND ownership_share <= 1);
