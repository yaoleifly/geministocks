// News gathering pipeline dedicated to the two indicators (MarketThermometer / TacoMonitor).
// Layered inputs, best-effort each:
//   1. Targeted web search (Exa / AnySearch, when the user enabled real-time search) —
//      active retrieval of signal-dense queries instead of whatever RSS happens to push.
//   2. RSS: the user's display sources PLUS an English-finance pack (scan-only, not shown
//      in the news list) to fix the topic mismatch of Chinese tech/A-share heavy feeds.

import { searchExa, isExaSearchEnabled, type ExaResult } from './exaSearchService';
import { fetchAllSources, ENGLISH_FINANCE_SOURCES, type NewsArticle, type NewsSource } from './newsService';

/** Minimal shape the AI scanners need. */
export interface IndicatorArticle {
  title: string;
  description: string;
  sourceName: string;
  url?: string;
  publishedAt?: string;
}

export { ENGLISH_FINANCE_SOURCES };

/** Targeted queries for the exit-pressure thermometer (institutional top signals). */
export const THERMOMETER_QUERIES: string[] = [
  'analysts raise price targets stocks record highs this week',
  'strong buy consensus wall street unanimous bullish',
  'stock falls despite earnings beat good news selloff',
  'institutional investors funds reducing positions insider selling',
];

/** Targeted queries for the TACO cycle monitor (tariff-game phases + meme density). */
export const TACO_QUERIES: string[] = [
  'Trump new tariff threat trade escalation this week',
  'market selloff tariff panic stocks drop',
  'Trump tariff pause exemption trade deal walk back',
  'markets shrug off ignore tariff threat TACO trade',
];

/** Normalize a title for dedupe comparison. */
const normalizeTitle = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * Merge search hits (higher signal density, kept first) with RSS articles,
 * dropping duplicate titles. Pure function - unit tested.
 */
export const mergeIndicatorArticles = (
  searchArticles: IndicatorArticle[],
  rssArticles: IndicatorArticle[],
  totalCap: number
): IndicatorArticle[] => {
  const seen = new Set<string>();
  const merged: IndicatorArticle[] = [];
  for (const article of [...searchArticles, ...rssArticles]) {
    const key = normalizeTitle(article.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(article);
    if (merged.length >= totalCap) break;
  }
  return merged;
};

const mapSearchResult = (r: ExaResult): IndicatorArticle => ({
  title: r.title,
  description: (r.text || '').slice(0, 2400),
  sourceName: 'Web Search',
  url: r.url,
  publishedAt: r.publishedDate,
});

const mapRssArticle = (a: NewsArticle): IndicatorArticle => ({
  title: a.title,
  description: a.description,
  sourceName: a.sourceName,
  url: a.link,
  publishedAt: a.pubDate,
});

/**
 * Gather the scan window for an indicator.
 * Search and RSS both run best-effort; whichever succeeds contributes.
 * Returns the merged articles plus whether targeted search actually contributed.
 */
export async function gatherIndicatorArticles(
  displaySources: NewsSource[],
  targetedQueries: string[]
): Promise<{ articles: IndicatorArticle[]; usedSearch: boolean }> {
  const searchEnabled = isExaSearchEnabled();

  const searchPromise: Promise<IndicatorArticle[]> = searchEnabled
    ? Promise.allSettled(targetedQueries.map(q => searchExa(q, 4))).then(results =>
        results
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchExa>>> => r.status === 'fulfilled')
          .filter(r => r.value.ok)
          .flatMap(r => r.value.results.map(mapSearchResult))
      )
    : Promise.resolve([]);

  // Dedupe by source id: display list may already include some EN-finance feeds
  const sourceMap = new Map<string, NewsSource>();
  for (const s of [...displaySources, ...ENGLISH_FINANCE_SOURCES]) {
    if (!sourceMap.has(s.id)) sourceMap.set(s.id, s);
  }
  const rssPromise: Promise<IndicatorArticle[]> = fetchAllSources(
    [...sourceMap.values()],
    4,
    24
  )
    .then(articles => articles.map(mapRssArticle))
    .catch(() => []);

  const [searchArticles, rssArticles] = await Promise.all([searchPromise, rssPromise]);
  const articles = mergeIndicatorArticles(searchArticles, rssArticles, 32);
  if (articles.length === 0) throw new Error('No articles gathered from search or RSS');
  return { articles, usedSearch: searchArticles.length > 0 };
}
