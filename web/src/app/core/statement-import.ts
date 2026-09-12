/**
 * Extraction et analyse d'un relevé de compte PDF, côté navigateur : le PDF
 * n'est jamais envoyé au serveur (donnée sensible) — seules les lignes que
 * l'utilisateur valide le seront. L'analyse est heuristique et volontairement
 * tolérante : l'écran de revue permet de corriger avant l'import.
 *
 * Deux formats sont gérés :
 *  - relevés à colonnes Débit / Crédit (ex. La Banque Postale) : le sens est
 *    déterminé par la POSITION horizontale du montant sous l'une des colonnes,
 *    et la date est souvent au format JJ/MM (l'année est déduite de l'entête) ;
 *  - format générique « une ligne = date, montant signé, libellé » (repli).
 */

export interface ParsedTx {
  transactionDate: string; // ISO yyyy-mm-dd
  amount: number; // signé : négatif = dépense
  label: string;
}

interface PdfItem {
  s: string;
  x: number;
  w: number;
}
interface PdfLine {
  items: PdfItem[];
  text: string;
}
interface PdfPage {
  lines: PdfLine[];
}

const SEP = '    '; // espaces (normale, insécable, fines)
const AMOUNT_RE = new RegExp(`-?\\d[\\d${SEP}.]*,\\d{2}`);

/** Extrait les pages d'un PDF sous forme de lignes reconstruites par position. */
export async function extractPdfPages(file: File): Promise<PdfPage[]> {
  const pdfjs: any = await import('pdfjs-dist');
  // Worker servi en asset statique (même origine) ; URL absolue calculée sur la
  // base de l'app (sinon résolue par rapport à la route courante -> 404).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PdfPage[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = new Map<number, PdfItem[]>();
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string' || it.str.trim() === '') continue;
      const y = Math.round(it.transform[5]);
      let bucket: PdfItem[] | undefined;
      for (const key of rows.keys()) {
        if (Math.abs(key - y) <= 2) {
          bucket = rows.get(key);
          break;
        }
      }
      if (!bucket) {
        bucket = [];
        rows.set(y, bucket);
      }
      bucket.push({ s: it.str, x: it.transform[4], w: it.width ?? 0 });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // haut -> bas
    const lines: PdfLine[] = [];
    for (const y of ys) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      const text = items.map((f) => f.s).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ items, text });
    }
    pages.push({ lines });
  }
  return pages;
}

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

/** Déduit l'année du relevé : une date complète JJ/MM/AAAA, sinon un mois nommé + année. */
function detectYear(pages: PdfPage[]): number {
  const all = pages.flatMap((p) => p.lines.map((l) => l.text)).join('\n');
  const full = all.match(/\b\d{2}\/\d{2}\/(\d{4})\b/);
  if (full) return Number(full[1]);
  const named = all.toLowerCase().match(/(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})/);
  if (named) return Number(named[2]);
  return new Date().getFullYear();
}

function amountValue(s: string): number | null {
  const m = s.match(AMOUNT_RE);
  if (!m) return null;
  const digits = m[0].replace(new RegExp(`[${SEP}.]`, 'g'), '').replace(',', '.');
  const n = Number(digits);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function isNoise(text: string): boolean {
  return /\bsolde\b|total des op|report/i.test(text);
}

const DATE_START_RE = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/;

function toIso(dd: string, mm: string, yy: string | undefined, fallbackYear: number): string {
  const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : fallbackYear;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Analyse un relevé (colonnes Débit/Crédit si présentes, sinon repli générique). */
export function parseStatement(pages: PdfPage[]): ParsedTx[] {
  const year = detectYear(pages);
  const out: ParsedTx[] = [];
  let threshold: number | null = null; // frontière x entre colonnes débit / crédit

  for (const page of pages) {
    for (const line of page.lines) {
      // Entête de tableau : mémorise la frontière entre les deux colonnes.
      const debit = line.items.find((it) => /d[ée]bit/i.test(it.s));
      const credit = line.items.find((it) => /cr[ée]dit/i.test(it.s));
      if (debit && credit) {
        threshold = (debit.x + credit.x) / 2;
        continue;
      }

      const first = line.items[0];
      if (!first) continue;
      const dm = DATE_START_RE.exec(first.s.trim());
      if (!dm) continue;
      if (isNoise(line.text)) continue;

      // Montant = item le plus à droite ressemblant à un montant.
      let amountItem: PdfItem | null = null;
      for (const it of line.items) {
        if (AMOUNT_RE.test(it.s) && (!amountItem || it.x > amountItem.x)) amountItem = it;
      }
      if (!amountItem) continue;
      const value = amountValue(amountItem.s);
      if (value === null || value === 0) continue;

      // Sens : par la colonne (position) si connue, sinon signe explicite.
      let sign = -1;
      if (threshold !== null) sign = amountItem.x < threshold ? -1 : 1;
      else if (!amountItem.s.trim().startsWith('-')) sign = 1;

      // Libellé = tout sauf la date, le montant et les blancs ; sans « - » final.
      const label = line.items
        .filter((it) => it !== first && it !== amountItem && it.s.trim() !== '')
        .map((it) => it.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/[\s-]+$/, '')
        .trim();

      out.push({ transactionDate: toIso(dm[1]!, dm[2]!, dm[3], year), amount: sign * value, label });
    }
  }
  return out;
}
