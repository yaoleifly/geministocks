/**
 * 实时搜索服务（多服务商：Exa / AnySearch）
 * 用户在设置中选择服务商并填写 API Key（AnySearch 支持匿名免费额度，可不填 Key），
 * 开启实时搜索后，在生成分析报告前会先拉取该主题的最新网络结果，
 * 并将结果注入到 prompt 中作为「已核实的实时数据」。
 *
 * 配置保存在浏览器 localStorage 中，不会上传到服务器。
 *
 * 注意：api.exa.ai 和 api.anysearch.com 均可能不返回 CORS 头，浏览器无法直接
 * 读取跨域响应。因此通过同源代理转发：
 * 开发/预览环境见 vite.config.ts 的 "/exa-api"、"/anysearch-api" 代理，
 * 生产环境见 vercel.json 的 rewrites，转发到对应的上游 API。
 */

import type { Locale } from '../hooks/useI18n';

const EXA_CONFIG_KEY = 'exa-search-config';
const EXA_SEARCH_URL = '/exa-api/search';
const ANYSEARCH_SEARCH_URL = '/anysearch-api/v1/search';

export type SearchProvider = 'exa' | 'anysearch';

export interface ExaSearchConfig {
  provider: SearchProvider;
  /** Exa 的 API Key */
  apiKey: string;
  /** AnySearch 的 API Key（可为空：匿名免费额度） */
  anysearchApiKey: string;
  enabled: boolean;
}

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
}

/**
 * 读取实时搜索配置（向后兼容旧版仅含 apiKey/enabled 的 Exa 配置）
 */
export function getExaConfig(): ExaSearchConfig {
  try {
    const raw = localStorage.getItem(EXA_CONFIG_KEY);
    if (!raw) return { provider: 'exa', apiKey: '', anysearchApiKey: '', enabled: false };
    const parsed = JSON.parse(raw) as Partial<ExaSearchConfig>;
    return {
      provider: parsed.provider === 'anysearch' ? 'anysearch' : 'exa',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      anysearchApiKey: typeof parsed.anysearchApiKey === 'string' ? parsed.anysearchApiKey : '',
      enabled: !!parsed.enabled,
    };
  } catch {
    return { provider: 'exa', apiKey: '', anysearchApiKey: '', enabled: false };
  }
}

/**
 * 保存实时搜索配置
 */
export function saveExaConfig(config: ExaSearchConfig): void {
  const provider: SearchProvider = config.provider === 'anysearch' ? 'anysearch' : 'exa';
  const normalized: ExaSearchConfig = {
    provider,
    apiKey: config.apiKey.trim(),
    anysearchApiKey: config.anysearchApiKey.trim(),
    // Exa 必须有 key 才能开启；AnySearch 支持匿名额度，无 key 也可开启
    enabled: config.enabled && (provider === 'anysearch' || !!config.apiKey.trim()),
  };
  localStorage.setItem(EXA_CONFIG_KEY, JSON.stringify(normalized));
}

/**
 * 实时搜索是否已启用
 * （Exa：已开启且填写了 key；AnySearch：已开启即可，key 可选）
 */
export function isExaSearchEnabled(): boolean {
  const c = getExaConfig();
  if (!c.enabled) return false;
  return c.provider === 'anysearch' || !!c.apiKey;
}

/** 将 AnySearch 的单条结果映射为统一的 ExaResult 结构 */
function mapAnySearchResult(r: any): ExaResult {
  const snippet = typeof r?.snippet === 'string' ? r.snippet : '';
  const content = typeof r?.content === 'string' ? r.content : '';
  // 优先用较完整的 content，过长时截断，避免 prompt 膨胀
  const text = (content || snippet).replace(/\s+/g, ' ').trim().slice(0, 1200);
  return {
    title: typeof r?.title === 'string' && r.title ? r.title : r?.url || 'Untitled',
    url: typeof r?.url === 'string' ? r.url : '',
    text: text || undefined,
  };
}

/** 调用 AnySearch /v1/search */
async function searchAnySearch(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; results: ExaResult[]; message: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(ANYSEARCH_SEARCH_URL, {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      headers,
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(numResults, 1), 20),
        format: 'json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, results: [], message: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();
    // AnySearch 业务错误也可能返回 200 之外的 code 字段
    if (typeof data?.code === 'number' && data.code !== 0) {
      return { ok: false, results: [], message: String(data?.message || `AnySearch error code ${data.code}`) };
    }
    const rawResults: any[] = Array.isArray(data?.data?.results) ? data.data.results : [];
    return { ok: true, results: rawResults.map(mapAnySearchResult), message: '' };
  } catch (err) {
    signal?.throwIfAborted();
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, results: [], message: msg };
  }
}

/** 调用 Exa REST /search */
async function searchExaProvider(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; results: ExaResult[]; message: string }> {
  if (!apiKey) {
    return { ok: false, results: [], message: 'Exa API key not configured' };
  }

  try {
    const response = await fetch(EXA_SEARCH_URL, {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        numResults,
        type: 'auto',
        contents: {
          text: { maxCharacters: 1200 },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, results: [], message: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();
    const rawResults: any[] = Array.isArray(data?.results) ? data.results : [];
    const results: ExaResult[] = rawResults.map((r) => ({
      title: typeof r?.title === 'string' && r.title ? r.title : r?.url || 'Untitled',
      url: typeof r?.url === 'string' ? r.url : '',
      publishedDate: typeof r?.publishedDate === 'string' ? r.publishedDate : undefined,
      author: typeof r?.author === 'string' ? r.author : undefined,
      text: typeof r?.text === 'string' ? r.text : undefined,
    }));

    return { ok: true, results, message: '' };
  } catch (err) {
    signal?.throwIfAborted();
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, results: [], message: msg };
  }
}

/**
 * 按当前配置的服务商执行实时搜索
 * @param query 搜索词（通常是用户输入的主题）
 * @param numResults 返回结果数量
 */
export async function searchExa(
  query: string,
  numResults = 6,
  signal?: AbortSignal
): Promise<{ ok: boolean; results: ExaResult[]; message: string }> {
  const config = getExaConfig();
  if (config.provider === 'anysearch') {
    return searchAnySearch(query, numResults, config.anysearchApiKey, signal);
  }
  return searchExaProvider(query, numResults, config.apiKey, signal);
}

/**
 * 测试指定服务商的连接是否可用
 * @param provider 服务商
 * @param apiKey 对应服务商的 API Key（AnySearch 可为空，走匿名额度）
 */
export async function testExaConnection(
  apiKey: string,
  provider: SearchProvider = 'exa'
): Promise<{ ok: boolean; message: string }> {
  const trimmed = apiKey.trim();
  if (provider === 'anysearch') {
    const r = await searchAnySearch('market news today', 1, trimmed);
    return { ok: r.ok, message: r.message };
  }
  if (!trimmed) return { ok: false, message: 'empty key' };
  const r = await searchExaProvider('market news today', 1, trimmed);
  return { ok: r.ok, message: r.message };
}

/**
 * 将实时搜索结果格式化为可注入 prompt 的文本块
 */
export function formatExaResultsForPrompt(results: ExaResult[], locale: Locale): string {
  if (results.length === 0) return '';

  const header =
    locale === 'zh'
      ? '以下是通过实时网络搜索获取的最新资料（请将其作为已核实的实时数据，优先采纳其中的最新事实、数据与日期；如与你的固有知识冲突，以下述资料为准）：'
      : 'The following are the latest materials retrieved via real-time web search (treat them as verified real-time data and prioritize the latest facts, figures, and dates within; if they conflict with your prior knowledge, defer to the materials below):';

  const blocks = results
    .map((r, i) => {
      const lines: string[] = [`[${i + 1}] ${r.title}`];
      if (r.url) lines.push(`URL: ${r.url}`);
      if (r.publishedDate) lines.push((locale === 'zh' ? '发布日期: ' : 'Published: ') + r.publishedDate);
      if (r.text) lines.push((locale === 'zh' ? '摘要: ' : 'Excerpt: ') + r.text.replace(/\s+/g, ' ').trim());
      return lines.join('\n');
    })
    .join('\n\n');

  return `${header}\n\n${blocks}`;
}
