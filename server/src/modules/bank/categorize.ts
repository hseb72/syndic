/**
 * Catégorisation heuristique d'une ligne bancaire à partir de son libellé.
 * Volontairement simple et lisible : une liste de mots-clés par catégorie,
 * évaluée dans l'ordre. Toujours modifiable ensuite par le syndic.
 *
 * Les codes sont neutres (traduits côté front via `bankcat.<code>`).
 */
export const BANK_CATEGORIES = [
  'EAU',
  'ELECTRICITE',
  'ASSURANCE',
  'ENTRETIEN',
  'ASCENSEUR',
  'ESPACES_VERTS',
  'TRAVAUX',
  'HONORAIRES',
  'BANQUE',
  'IMPOTS',
  'APPEL_FONDS',
  'AUTRE',
] as const;

export type BankCategory = (typeof BANK_CATEGORIES)[number];

const RULES: { category: BankCategory; keywords: string[] }[] = [
  { category: 'EAU', keywords: ['eau', 'veolia', 'saur', 'suez', 'assainiss'] },
  { category: 'ELECTRICITE', keywords: ['edf', 'engie', 'electric', 'électric', 'enedis', 'total energ', 'gaz'] },
  { category: 'ASSURANCE', keywords: ['assur', 'maif', 'macif', 'axa', 'allianz', 'groupama', 'mma', 'gan'] },
  { category: 'ASCENSEUR', keywords: ['ascenseur', 'otis', 'kone', 'schindler', 'thyssen'] },
  { category: 'ESPACES_VERTS', keywords: ['espaces verts', 'jardin', 'paysag', 'elagage', 'élagage', 'tonte'] },
  { category: 'ENTRETIEN', keywords: ['entretien', 'menage', 'ménage', 'nettoy', 'proprete', 'propreté', 'syndic net'] },
  { category: 'TRAVAUX', keywords: ['travaux', 'plomb', 'electricien', 'électricien', 'peinture', 'macon', 'maçon', 'toiture', 'ravalement'] },
  { category: 'HONORAIRES', keywords: ['honoraire', 'syndic', 'gestion', 'comptable', 'avocat', 'huissier'] },
  { category: 'BANQUE', keywords: ['frais', 'commission', 'cotisation', 'agios', 'interet', 'intérêt', 'tenue de compte', 'carte'] },
  { category: 'IMPOTS', keywords: ['impot', 'impôt', 'taxe', 'tresor public', 'trésor public', 'dgfip', 'fonciere', 'foncière'] },
  { category: 'APPEL_FONDS', keywords: ['appel', 'provision', 'charges', 'copropriete', 'copropriété', 'regularis', 'régularis', 'virement de'] },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Teste un mot-clé sur des frontières de mot (lettres/chiffres Unicode), pour
 * éviter les faux positifs par sous-chaîne — ex. « otis » dans « cotisation ».
 */
function matchesKeyword(label: string, keyword: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(keyword)}([^\\p{L}\\p{N}]|$)`, 'iu');
  return re.test(label);
}

/**
 * Retourne une catégorie pour un libellé. Un crédit sans mot-clé identifié est
 * présumé « appel de fonds » (un encaissement d'un copropriétaire) ; un débit
 * sans mot-clé retombe sur « autre ».
 */
export function categorize(label: string | null | undefined, amount: number): BankCategory {
  const l = label ?? '';
  if (l.trim()) {
    for (const rule of RULES) {
      if (rule.keywords.some((k) => matchesKeyword(l, k))) return rule.category;
    }
  }
  return amount > 0 ? 'APPEL_FONDS' : 'AUTRE';
}
