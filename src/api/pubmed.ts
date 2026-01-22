export type PubMedArticle = {
  id: string;
  title: string;
  source?: string;
  pubdate?: string;
};

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/**
 * NCBI E-utilities. In production, you should include your contact email and a distinct tool name.
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 */
export async function searchPubMed(params: {
  query: string;
  retmax?: number;
  signal?: AbortSignal;
}): Promise<PubMedArticle[]> {
  const q = params.query.trim();
  if (!q) return [];

  const retmax = Math.min(Math.max(params.retmax ?? 10, 1), 20);

  const esearch = new URL(`${BASE}/esearch.fcgi`);
  esearch.searchParams.set("db", "pubmed");
  esearch.searchParams.set("term", q);
  esearch.searchParams.set("retmode", "json");
  esearch.searchParams.set("retmax", String(retmax));
  // Optional metadata. Replace if needed.
  esearch.searchParams.set("tool", "medical_calc_app");
  esearch.searchParams.set("email", "your_email@example.com");

  const r1 = await fetch(esearch.toString(), { signal: params.signal });
  if (!r1.ok) throw new Error(`ESEARCH HTTP ${r1.status}`);
  const j1 = (await r1.json()) as any;

  const ids: string[] = j1?.esearchresult?.idlist ?? [];
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const esummary = new URL(`${BASE}/esummary.fcgi`);
  esummary.searchParams.set("db", "pubmed");
  esummary.searchParams.set("id", ids.join(","));
  esummary.searchParams.set("retmode", "json");
  esummary.searchParams.set("tool", "medical_calc_app");
  esummary.searchParams.set("email", "your_email@example.com");

  const r2 = await fetch(esummary.toString(), { signal: params.signal });
  if (!r2.ok) throw new Error(`ESUMMARY HTTP ${r2.status}`);
  const j2 = (await r2.json()) as any;

  const result = j2?.result ?? {};
  const articles: PubMedArticle[] = [];

  for (const id of ids) {
    const it = result?.[id];
    if (!it) continue;
    articles.push({
      id,
      title: String(it.title ?? "").trim(),
      source: it.source ? String(it.source) : undefined,
      pubdate: it.pubdate ? String(it.pubdate) : undefined,
    });
  }

  return articles.filter((a) => a.title.length > 0);
}

export function pubmedUrl(id: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/`;
}
