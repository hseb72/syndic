-- =====================================================================
--  0009 — Assemblée générale : convocation, ordre du jour, annexes
--
--  Une AG n'est PAS liée à un seul exercice : chaque résolution peut viser
--  son propre exercice (approbation des comptes N, budget N+1, …).
--  Phase 1 : convocation seule (pas de saisie des votes / PV).
-- =====================================================================

CREATE TABLE IF NOT EXISTS general_assembly (
    id               uuid PRIMARY KEY,
    coproperty_id    uuid NOT NULL REFERENCES coproperty(id),
    kind             text NOT NULL DEFAULT 'ORDINAIRE',   -- ORDINAIRE | EXTRAORDINAIRE
    meeting_date     date NOT NULL,
    meeting_time     text,                                -- ex. '18:30'
    location         text,
    convocation_date date,                                -- date d'envoi de la convocation
    status           text NOT NULL DEFAULT 'BROUILLON',   -- BROUILLON | CONVOQUEE | TENUE
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CHECK (kind IN ('ORDINAIRE','EXTRAORDINAIRE')),
    CHECK (status IN ('BROUILLON','CONVOQUEE','TENUE'))
);

-- Ordre du jour : résolutions ordonnées, chacune avec sa majorité et,
-- éventuellement, l'exercice qu'elle concerne.
CREATE TABLE IF NOT EXISTS assembly_resolution (
    id           uuid PRIMARY KEY,
    assembly_id  uuid NOT NULL REFERENCES general_assembly(id) ON DELETE CASCADE,
    position     integer NOT NULL DEFAULT 0,
    title        text NOT NULL,
    body         text,                                    -- projet de résolution
    majority     text NOT NULL DEFAULT 'ART_24',          -- ART_24 | ART_25 | ART_26 | UNANIMITE | INFORMATION
    exercise_id  uuid REFERENCES accounting_exercise(id),
    created_at   timestamptz NOT NULL DEFAULT now(),

    CHECK (majority IN ('ART_24','ART_25','ART_26','UNANIMITE','INFORMATION'))
);

-- Annexes : rapports de comptes générés par l'app, ou pièces externes (renvoi).
CREATE TABLE IF NOT EXISTS assembly_annex (
    id           uuid PRIMARY KEY,
    assembly_id  uuid NOT NULL REFERENCES general_assembly(id) ON DELETE CASCADE,
    position     integer NOT NULL DEFAULT 0,
    report_type  text NOT NULL,                           -- BUDGET | COMPARATIF | REGULARISATION | IMPAYES | TRESORERIE | LIBRE
    exercise_id  uuid REFERENCES accounting_exercise(id),
    label        text,
    note         text,                                    -- pour LIBRE (pièce jointe séparément)
    created_at   timestamptz NOT NULL DEFAULT now(),

    CHECK (report_type IN ('BUDGET','COMPARATIF','REGULARISATION','IMPAYES','TRESORERIE','LIBRE'))
);

CREATE INDEX IF NOT EXISTS idx_assembly_cop ON general_assembly(coproperty_id);
CREATE INDEX IF NOT EXISTS idx_resolution_assembly ON assembly_resolution(assembly_id, position);
CREATE INDEX IF NOT EXISTS idx_annex_assembly ON assembly_annex(assembly_id, position);
