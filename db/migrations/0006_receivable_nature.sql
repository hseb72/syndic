-- =====================================================================
--  0006 — Nature explicite de la créance
--
--  Une créance porte désormais sa nature en clair, au lieu de la déduire
--  par jointure vers l'appel de fonds d'origine :
--    PROVISION      : provision sur budget prévisionnel
--    REGULARISATION : régularisation de charges après approbation
--    HORS_BUDGET    : dépense hors budget devenue exigible (appel exceptionnel)
--    AUTRE          : toute autre somme due au syndicat
--
--  La présentation et le paiement pourront regrouper des créances de
--  natures différentes ; la nature, elle, ne se mélange jamais.
-- =====================================================================

ALTER TABLE receivable ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'AUTRE';

-- Reprise de l'existant depuis le type de l'appel de fonds source.
UPDATE receivable r
SET nature = CASE fc.call_type
    WHEN 'PROVISION'      THEN 'PROVISION'
    WHEN 'REGULARISATION' THEN 'REGULARISATION'
    WHEN 'EXCEPTIONNEL'   THEN 'HORS_BUDGET'
    ELSE 'AUTRE'
  END
FROM fund_call_item fci
JOIN fund_call fc ON fc.id = fci.fund_call_id
WHERE r.source_type = 'FUND_CALL_ITEM' AND fci.id = r.source_id;

ALTER TABLE receivable DROP CONSTRAINT IF EXISTS receivable_nature_check;
ALTER TABLE receivable
  ADD CONSTRAINT receivable_nature_check
  CHECK (nature IN ('PROVISION','REGULARISATION','HORS_BUDGET','AUTRE'));
