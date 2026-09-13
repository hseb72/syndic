-- =====================================================================
--  0007 — Distinction charges courantes / fonds travaux sur les dépenses
--
--  Une facture relève soit des charges COURANTES (soumises à la
--  régularisation annuelle), soit du fonds TRAVAUX (géré séparément et
--  EXCLU de la régularisation des charges courantes).
-- =====================================================================

ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS fund text NOT NULL DEFAULT 'COURANT';

ALTER TABLE supplier_invoice DROP CONSTRAINT IF EXISTS supplier_invoice_fund_check;
ALTER TABLE supplier_invoice
  ADD CONSTRAINT supplier_invoice_fund_check
  CHECK (fund IN ('COURANT','TRAVAUX'));
