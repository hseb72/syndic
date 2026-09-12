/**
 * Extraction et analyse d'un relevé de compte PDF, côté navigateur : le PDF
 * n'est jamais envoyé au serveur (donnée sensible) — seules les lignes que
 * l'utilisateur valide le seront. L'analyse est heuristique et volontairement
 * tolérante : l'écran de revue permet de corriger avant l'import.
 */

export interface ParsedTx {
  transactionDate: string; // ISO yyyy-mm-dd
  amount: number; // signé : négatif = dépense
  label: string;
}

/** Extrait les lignes de texte d'un PDF (reconstruites par position). */
export async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjs: any = await import('pdfjs-dist');
  // Worker servi en asset statique (public/) : même origine, pas de CDN.
  // URL absolue calculée sur la base de l'app (sinon résolue par rapport à la
  // route courante, ex. /banque/pdf.worker.min.mjs -> 404).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    // Regroupe les fragments par ligne (coordonnée y ~ transform[5]).
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string' || it.str === '') continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      let bucket: { x: number; s: string }[] | undefined;
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
      bucket.push({ x, s: it.str });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // haut -> bas
    for (const y of ys) {
      const frags = rows.get(y)!.sort((a, b) => a.x - b.x);
      const line = frags.map((f) => f.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}

const DATE_RE = /\b(\d{2})[\/.](\d{2})[\/.](\d{2,4})\b/;
const AMOUNT_RE = /-?\d{1,3}(?:[  .]\d{3})*,\d{2}/g;

function toIsoDate(d: string, m: string, y: string): string {
  const year = y.length === 2 ? Number(y) + 2000 : Number(y);
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseAmount(raw: string): number {
  const neg = raw.trim().startsWith('-');
  const digits = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number(digits);
  return neg ? -n : n;
}

/**
 * Analyse best-effort des lignes d'un relevé : repère une date puis un montant.
 * Le format des relevés variant d'une banque à l'autre, l'écran de revue reste
 * indispensable. `amount` = premier montant après la date (souvent le mouvement).
 */
export function parseStatementLines(lines: string[]): ParsedTx[] {
  const out: ParsedTx[] = [];
  for (const line of lines) {
    const dm = DATE_RE.exec(line);
    if (!dm) continue;
    const rest = line.slice(dm.index + dm[0].length);
    const amounts = rest.match(AMOUNT_RE);
    if (!amounts || amounts.length === 0) continue;
    const amount = parseAmount(amounts[0]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // Libellé = ce qui reste une fois la date et les montants retirés.
    let label = rest;
    for (const a of amounts) label = label.replace(a, ' ');
    label = label.replace(/\s+/g, ' ').trim();
    out.push({ transactionDate: toIsoDate(dm[1], dm[2], dm[3]), amount, label });
  }
  return out;
}
