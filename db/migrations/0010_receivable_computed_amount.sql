-- =====================================================================
--  0010 — Montant calculé vs montant définitif d'une créance
--
--  Le montant d'une créance issue d'un appel est calculé par répartition
--  (tantièmes puis quote-part d'indivision). On conserve désormais cette
--  valeur calculée à part (`computed_amount`) et on laisse `amount` — le
--  montant DÉFINITIF, celui qui fait foi — librement modifiable par le
--  bureau. Utile surtout pour poser une situation de départ (soldes
--  d'ouverture) lors d'une reprise de comptabilité.
--
--  `computed_amount` NULL = créance jamais issue d'un calcul de répartition
--  (saisie directe). Sinon elle mémorise ce qu'aurait donné le calcul, pour
--  comparaison à l'écran.
-- =====================================================================

ALTER TABLE receivable ADD COLUMN IF NOT EXISTS computed_amount numeric(14,2);

-- Reprise de l'existant : la valeur calculée initiale = le montant courant.
UPDATE receivable SET computed_amount = amount WHERE computed_amount IS NULL;
