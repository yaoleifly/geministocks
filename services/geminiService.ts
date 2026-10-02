
import type { AnalysisReport } from '../types';
import type { Locale } from '../hooks/useI18n';
import { jsonrepair } from 'jsonrepair';
import { captureError, addBreadcrumb } from '../utils/telemetry';
import {
    buildArticlePrompt,
    buildSentimentInstruction,
    buildTacoInstruction,
    parseSentimentResponse,
    parseTacoResponse,
} from '../utils/indicatorScanShared';

import { getApiConfig, getChatCompletionsUrl, buildAuthHeaders } from './apiConfigService';
import { isExaSearchEnabled, searchExa, formatExaResultsForPrompt, getExaConfig } from './exaSearchService';
import { extractJson } from '../utils/jsonUtils';

// Error thrown when the user has not configured their API settings yet
export const API_NOT_CONFIGURED_ERROR = 'API_NOT_CONFIGURED';

const requireApiConfig = () => {
    const config = getApiConfig();
    if (!config) {
        throw new Error(API_NOT_CONFIGURED_ERROR);
    }
    return config;
};

const getModelName = (): string => {
    return requireApiConfig().model;
};

const getModelDisplayName = (): string => {
    const config = getApiConfig();
    return config ? config.model : 'Not Configured';
};

// extractJson lives in utils/jsonUtils.ts so it can be unit-tested in isolation.

/**
 * A generic helper function to call the user-configured OpenAI-compatible API.
 * The user provides their own base URL, API key and model via the settings modal.
 * @param prompt The user's prompt/request.
 * @param systemInstruction The system-level instruction for the AI model.
 * @param modelName The name of the model to use.
 * @param enableWebSearch Whether to enable real-time web search (OpenRouter only).
 * @returns The JSON-parsed response from the model.
 */
// Transient upstream errors that are safe to retry (gateway timeouts, overload, rate limits).
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 120_000; // abort a single attempt after 2 minutes

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const cancel = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
});

/**
 * fetch with a per-attempt timeout and automatic retries on transient failures
 * (gateway timeouts like 504, overload, rate limits, and network/abort errors).
 * Non-retryable responses (e.g. 400/401) are returned as-is so the caller can
 * inspect the body. Uses exponential backoff with jitter.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
        init.signal?.throwIfAborted();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
            clearTimeout(timer);
            // Retry transient upstream errors if we still have attempts left.
            if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < MAX_FETCH_ATTEMPTS) {
                addBreadcrumb('ai', `Transient error ${response.status}, retrying`, { attempt });
                await sleep(800 * 2 ** (attempt - 1) + Math.random() * 400, init.signal ?? undefined);
                continue;
            }
            return response;
        } catch (err) {
            clearTimeout(timer);
            init.signal?.throwIfAborted();
            lastError = err;
            // Network errors and timeouts (AbortError) are retryable.
            if (attempt < MAX_FETCH_ATTEMPTS) {
                addBreadcrumb('ai', 'Network/timeout error, retrying', { attempt });
                await sleep(800 * 2 ** (attempt - 1) + Math.random() * 400, init.signal ?? undefined);
                continue;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Network request failed after retries.');
}

/**
 * Build a concise, user-friendly error message from an HTTP error response.
 * Strips noisy HTML (e.g. nginx 504 pages) and gives a clear hint for transient
 * gateway errors so the report failure message stays readable.
 */
function formatHttpError(status: number, body: string): string {
    if (RETRYABLE_STATUS.has(status)) {
        return `服务暂时不可用（HTTP ${status}，上游网关超时或繁忙）。已自动重试多次仍失败，请稍后重试，或在设置中更换其他模型/服务商。`;
    }
    // Strip HTML tags/comments and collapse whitespace; cap length.
    const text = body
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const detail = text.slice(0, 300);
    return `API request failed with status ${status}${detail ? `: ${detail}` : ''}`;
}

async function callOpenRouterAI(prompt: string, systemInstruction: string, modelName: string, enableWebSearch: boolean = false, signal?: AbortSignal): Promise<any> {
    const config = requireApiConfig();
    const apiUrl = getChatCompletionsUrl(config);
    const isOpenRouter = config.baseUrl.includes('openrouter.ai');

    // Add breadcrumb for debugging
    addBreadcrumb('ai', 'Calling user-configured API', { model: modelName, baseUrl: config.baseUrl, promptLength: prompt.length, webSearch: enableWebSearch });

    try {
        const buildRequestBody = (useJsonMode: boolean): any => {
            const body: any = {
                model: modelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ],
            };
            if (useJsonMode) {
                body.response_format = { type: 'json_object' };
            }
            // Web search plugin is an OpenRouter-specific feature
            if (enableWebSearch && isOpenRouter) {
                body.plugins = [{ id: 'web', max_results: 5 }];
            }
            return body;
        };

        // API Key is optional for local CLI servers (Ollama, Claude Code proxy, etc.)
        const headers: Record<string, string> = {
            ...buildAuthHeaders(config.apiKey),
            'Content-Type': 'application/json',
        };
        if (isOpenRouter) {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Super Digger';
        }

        // First attempt with JSON mode; if the provider rejects it, retry without it.
        let response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify(buildRequestBody(true))
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const jsonModeUnsupported = response.status === 400 &&
                /json[\s_-]?mode|response_format/i.test(errorBody);

            if (jsonModeUnsupported) {
                addBreadcrumb('ai', 'JSON mode unsupported by provider, retrying without it');
                response = await fetchWithRetry(apiUrl, {
                    method: 'POST',
                    signal,
                    headers,
                    body: JSON.stringify(buildRequestBody(false))
                });
                if (!response.ok) {
                    const retryErrorBody = await response.text();
                    throw new Error(formatHttpError(response.status, retryErrorBody));
                }
            } else {
                throw new Error(formatHttpError(response.status, errorBody));
            }
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('Received an empty response from the AI model.');
        }

        // 1. Extract the JSON part (remove markdown wrappers like ```json ... ```)
        const rawJsonString = extractJson(content);

        // 2. Use jsonrepair to fix truncated or malformed JSON
        // This handles unclosed braces, missing quotes, missing commas, etc.
        try {
            const repairedJsonString = jsonrepair(rawJsonString);
            return JSON.parse(repairedJsonString);
        } catch (e) {
            console.error("JSON Repair failed. Raw content:", content);
            // Re-throw a more informative error
            throw new Error(`Failed to parse AI response. The model output was likely too corrupted to repair.`);
        }

    } catch (error) {
        signal?.throwIfAborted();
        console.error('Error calling AI Service:', error);
        
        // Capture error with context for local diagnostics
        if (error instanceof Error) {
            captureError(error, {
                model: modelName,
                promptLength: prompt.length,
                systemInstructionLength: systemInstruction.length,
            });
        }
        
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during the API call.';
        if (errorMessage.includes(API_NOT_CONFIGURED_ERROR)) {
            throw new Error(API_NOT_CONFIGURED_ERROR);
        }
        throw new Error(`AI analysis failed. Reason: ${errorMessage}`);
    }
}

const getAnalysisSystemInstructions = (locale: Locale, modelDisplayName: string) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const commonInstructions = `You are a top-tier financial analyst with real-time market access. Today's date is ${today}. 

CRITICAL DATA REQUIREMENTS:
1. You MUST search for and incorporate the LATEST market data, news, and prices from today or the most recent trading day.
2. When mentioning stock prices, always include the date (e.g., "As of ${today}, AAPL trades at $XXX").
3. For news and catalysts, prioritize events from the last 7 days. Always include specific dates.
4. If real-time data is unavailable, clearly state "Data as of [date]" to indicate data freshness.
5. Never use outdated information without disclosure.

You MUST respond strictly in JSON format. Do not add any extra text.`;
    const languageInstruction = locale === 'zh' ? 'All content must be in Simplified Chinese.' : 'All content must be in English.';

    // Simplified Part 1: Remove macroPolicy, companyFundamentals. Keep industryChain and simplified sentiment.
    const part1Schema = `{
      "summary": "string (1-3 sentence summary)",
      "investmentScore": { "score": "number (1-100)", "reason": "string (brief justification for the score)" },
      "informationGapScore": { "score": "number (1-100, how large the information/expectation gap is: high means the market has NOT yet fully priced in this information and there is an exploitable edge; low means it is already widely known and priced in)", "reason": "string (brief justification: what the market consensus is vs. what this information implies)" },
      "analysis": {
        "industryChain": { "upstream": [{"name": "string", "description": "string"}], "midstream": [{"name": "string", "description": "string"}], "downstream": [{"name": "string", "description": "string"}] },
        "marketSentiment": { "sentiment": "'Positive' | 'Neutral' | 'Negative'", "description": "string (Brief 1-sentence assessment of the current market mood)" }
      }
    }`;

    const part2Schema = `{
      "marketSizeAndOutlook": {
        "narrative": "string (Provide a forward-looking analysis of the market size and application prospects.)",
        "tamSamSom": { "TAM": "string", "SAM": "string", "SOM": "string", "sourceOrMethodology": "string" }
      },
      "competitiveLandscape": {
        "keyPlayers": [{ "name": "string", "marketShare": "string", "techAdvantage": "string", "revenueGrowth": "string", "grossMargin": "string", "stockPerformance": "string" }],
        "summary": "string (A brief summary of which company has the most comprehensive advantage)"
      },
      "catalystTracker": {
        "recentNews": [{ "date": "string (YYYY-MM-DD)", "description": "string", "impact": "'Positive' | 'Negative' | 'Neutral'" }],
        "upcomingCatalysts": [{ "date": "string (YYYY-MM-DD or Q3 2024)", "event": "string" }]
      },
      "policyAnalysis": { "keyBodies": ["string"], "currentPolicies": "string", "assessment": "'Headwind' | 'Tailwind' | 'Neutral'", "potentialChanges": "string" },
      "techTrajectory": { "coreTech": "string", "maturity": "'Emerging' | 'Maturing' | 'Mainstream'", "innovationTrends": ["string"], "moatAnalysis": "string" }
    }`;

    // Simplified Part 3: Remove Risk Matrix, Allocation Outlook, Association Analysis
    const part3Schema = `{
      "scenarioAnalysis": [
        { "scenario": "'Bull Case'", "description": "string", "probability": "number", "keyDrivers": ["string"] },
        { "scenario": "'Base Case'", "description": "string", "probability": "number", "keyDrivers": ["string"] },
        { "scenario": "'Bear Case'", "description": "string", "probability": "number", "keyDrivers": ["string"] }
      ],
      "investmentStrategy": {
        "logic": "string", "suggestion": "string",
        "timeHorizons": { "shortTerm": "string", "mediumTerm": "string", "longTerm": "string" }
      },
      "tieredSuggestions": {
        "coreHoldings": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string", "relevance": "'High'" }],
        "strategicSatellites": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string", "relevance": "'Medium'" }],
        "watchlist": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string", "relevance": "'Low'" }]
      }
    }`;

    return {
        part1System: `${commonInstructions} You will generate the first part of the analysis: Core Analysis. ${languageInstruction} The JSON schema is: ${part1Schema}`,
        part2System: `${commonInstructions} You will generate the second part of the analysis: Deep Dives into market, competition, catalysts, policy, and tech. ${languageInstruction} The JSON schema is: ${part2Schema}`,
        part3System: `${commonInstructions} You will generate the final part of the analysis: Strategy & Suggestions. ${languageInstruction} You MUST populate the "modelUsed" field with this exact value: "${modelDisplayName}". The JSON schema is: ${part3Schema}`
    };
};

/**
 * Detects if a query requires real-time web search based on content analysis.
 * Market-sensitive queries (stocks, crypto, current events) need real-time data.
 * Historical or conceptual queries can use cached/model knowledge.
 */
const detectNeedsWebSearch = (topic: string): boolean => {
    const lowerTopic = topic.toLowerCase();
    
    // Patterns that indicate need for real-time data
    const realTimePatterns = [
        // Stock tickers and market terms
        /\b[A-Z]{1,5}\b/,  // Stock tickers like AAPL, NVDA
        /股票|stock|shares|equity/i,
        /市场|market|trading|交易/i,
        /价格|price|估值|valuation/i,
        /财报|earnings|quarterly|季报|年报/i,
        /ipo|上市|listing/i,
        // Crypto
        /比特币|bitcoin|btc|eth|crypto|加密货币/i,
        // Current events
        /最新|latest|recent|今天|today|本周|this week/i,
        /新闻|news|announcement|公告/i,
        // Companies and industries
        /公司|company|企业|corporation/i,
        /行业|industry|sector|板块/i,
    ];
    
    // Patterns that indicate historical/conceptual (no real-time needed)
    const historicalPatterns = [
        /历史|history|historical/i,
        /理论|theory|concept|概念/i,
        /经典|classic|传统/i,
        /\b(19|18)\d{2}\b/,  // Years like 1990, 1850
    ];
    
    // Check if any historical pattern matches
    const isHistorical = historicalPatterns.some(pattern => pattern.test(lowerTopic));
    if (isHistorical) return false;
    
    // Check if any real-time pattern matches
    const needsRealTime = realTimePatterns.some(pattern => pattern.test(topic));
    
    // Default to enabling web search for most financial queries
    return needsRealTime || lowerTopic.length > 10;
};

export const getAnalysis = async (topic: string, onProgress: (stepIndex: number) => void, locale: Locale, signal?: AbortSignal): Promise<AnalysisReport> => {
    signal?.throwIfAborted();
    const modelName = getModelName();
    const modelDisplayName = getModelDisplayName();
    const { part1System, part2System, part3System } = getAnalysisSystemInstructions(locale, modelDisplayName);

    // Smart web search: only enable for market-sensitive queries (OpenRouter native plugin)
    const enableWebSearch = detectNeedsWebSearch(topic);

    // Real-time search (Exa / AnySearch, works for any model): if the user has
    // enabled real-time search, fetch the latest web results for this topic
    // BEFORE analysis and inject them into the prompt as verified real-time data.
    let realTimeContext = '';
    let exaUsed = false;
    let realTimeSources: AnalysisReport['realTimeSources'] = [];
    const searchProviderUsed = getExaConfig().provider;
    if (isExaSearchEnabled()) {
        try {
            const { ok, results } = await searchExa(topic, 6, signal);
            if (ok && results.length > 0) {
                realTimeContext = formatExaResultsForPrompt(results, locale);
                exaUsed = true;
                // Keep the fetched sources so the report can display citations
                realTimeSources = results
                    .filter((r) => r.url)
                    .map((r) => ({ title: r.title, url: r.url, publishedDate: r.publishedDate }));
            }
        } catch (err) {
            signal?.throwIfAborted();
            // Real-time search is best-effort; never block analysis if it fails
            captureError(err instanceof Error ? err : new Error(String(err)), { stage: 'exa-search' });
        }
    }

    const prompt = realTimeContext
        ? `${realTimeContext}\n\n---\n\nPlease analyze the following text: --- ${topic} ---`
        : `Please analyze the following text: --- ${topic} ---`;

    signal?.throwIfAborted();
    onProgress(0); // Three model requests run in parallel.
    let completed = 0;
    const runPart = async (instructions: string) => {
        const result = await callOpenRouterAI(prompt, instructions, modelName, enableWebSearch, signal);
        signal?.throwIfAborted();
        onProgress(++completed);
        return result;
    };
    
    // OPTIMIZATION: Run all 3 AI calls in parallel instead of sequentially
    // This reduces total time from (T1 + T2 + T3) to max(T1, T2, T3)
    const [part1Result, part2Result, part3Result] = await Promise.all([
        runPart(part1System),
        runPart(part2System),
        runPart(part3System),
    ]);
    

    // Combine results from all parts with data freshness metadata
    const now = new Date();
    const finalReport: AnalysisReport = {
        ...part1Result,
        ...part2Result,
        ...part3Result,
        modelUsed: modelDisplayName,
        ...(realTimeSources.length > 0 ? { realTimeSources, searchProviderUsed } : {}),
        dataFreshness: {
            generatedAt: now.toISOString(),
            dataAsOf: now.toISOString().split('T')[0],
            isRealTimeEnabled: enableWebSearch || exaUsed,
        },
    };
    
    return finalReport;
};

const getPolymarketAnalysisSystemInstruction = (locale: Locale): string => {
    const commonSchema = `
        {
          "polymarketData": {
            "question": "string (The specific question being predicted on the Polymarket page)",
            "yesOdds": "number (The current probability for 'Yes', between 0 and 1)",
            "noOdds": "number (The current probability for 'No', between 0 and 1)",
            "totalVolume": "string (The total trading volume, e.g., '$1.5M')"
          },
          "summary": "string (A 1-3 sentence summary of the market's prediction and its investment implications)",
          "investmentScore": {
            "score": "number (1-100, representing the clarity and actionability of the investment opportunity)",
            "reason": "string (Brief reason for the score)"
          },
          "analysis": {
            "industryChain": "string (Which industry sectors are most affected if 'Yes' wins vs. if 'No' wins)",
            "marketSentiment": {
              "sentiment": "'Positive' | 'Neutral' | 'Negative'",
              "description": "string (Describe the current market sentiment surrounding this prediction)"
            }
          },
          "marketSizeAndOutlook": "string (Analyze the potential market impact of both a 'Yes' and 'No' outcome)",
          "investmentStrategy": {
            "logic": "string (Explain the core logic for investing based on this prediction market. This MUST cover strategies for both 'Yes' and 'No' outcomes)",
            "suggestion": "string (Provide actionable suggestions for how to position a portfolio for either outcome)",
            "risks": "string (What are the risks associated with trading this prediction?)"
          },
          "tieredSuggestions": {
            "coreHoldings": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string (A high-conviction asset to hold if you believe 'Yes' will happen)", "relevance": "'High'" }],
            "strategicSatellites": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string (A high-conviction asset to hold if you believe 'No' will happen)", "relevance": "'Medium'" }],
            "watchlist": [{ "name": "string", "ticker": "string", "market": "'A-Share' | 'Hong Kong' | 'US' | 'Crypto' | 'Futures' | 'Other'", "reason": "string (An asset to watch that is sensitive to the outcome)", "relevance": "'Low'" }]
          }
        }
    `;

    if (locale === 'zh') {
        return `
        You are a top-tier quantitative and qualitative analyst specializing in prediction markets. Your task is to analyze the provided Polymarket URL.
        First, you MUST extract the core data from the market: the question, the 'Yes'/'No' odds, and the total volume.
        Second, you MUST perform a comprehensive scenario analysis. Detail the market impact, investment logic, and provide specific, tiered investment suggestions for BOTH the 'Yes' outcome AND the 'No' outcome.
        You MUST respond strictly in the following JSON format. Do not add any extra explanations. All content must be in Simplified Chinese.
        The JSON schema is as follows:
        ${commonSchema}
    `;
    }
    return `
        You are a top-tier quantitative and qualitative analyst specializing in prediction markets. Your task is to analyze the provided Polymarket URL.
        First, you MUST extract the core data from the market: the question, the 'Yes'/'No' odds, and the total volume.
        Second, you MUST perform a comprehensive scenario analysis. Detail the market impact, investment logic, and provide specific, tiered investment suggestions for BOTH the 'Yes' outcome AND the 'No' outcome.
        You MUST respond strictly in the following JSON format. Do not add any extra explanations. All content must be in English.
        The JSON schema is as follows:
        ${commonSchema}
    `;
};


export const getPolymarketAnalysis = async (url: string, locale: Locale, signal?: AbortSignal): Promise<AnalysisReport> => {
    signal?.throwIfAborted();
    const modelName = getModelName();
    const systemInstruction = getPolymarketAnalysisSystemInstruction(locale);
    
    const prompt = `
        Please analyze the following Polymarket URL and provide a structured investment strategy report based on its prediction market data and potential outcomes.
        URL to analyze:
        ---
        ${url}
        ---
    `;

    // Enable web search to get latest prediction market data
    return callOpenRouterAI(prompt, systemInstruction, modelName, true, signal);
};

/**
 * Generic entry point for professional skill analyses (finance-skills integration).
 * Always enables web search to ensure real-time financial data.
 */
export const runSkillPrompt = async (prompt: string, systemInstruction: string): Promise<any> => {
    return callOpenRouterAI(prompt, systemInstruction, getModelName(), true);
};

/**
 * Extract investment concept tags for a batch of news articles in a single AI call.
 * Returns one tag array per input article (empty array when nothing was extracted).
 * Used by the LatestNews feed to turn headlines into clickable dig-analysis entries.
 */
export const extractNewsConcepts = async (
    articles: { title: string; description: string }[],
    locale: Locale
): Promise<string[][]> => {
    if (articles.length === 0) return [];
    const lang = locale === 'zh' ? 'Simplified Chinese' : 'English';
    const systemInstruction = `You are a financial news analyst. For EACH numbered news item, extract 1-3 short investment concept tags (industry themes, supply chains, or sectors likely to move on this news, e.g. "折叠屏", "苹果产业链", "AI芯片"). Tags must be in ${lang}, each 2-10 characters, specific and tradeable (avoid generic words like "科技" or "经济"). You MUST respond strictly in JSON, no extra text. Schema: {"items": [{"index": "number (the news item number)", "tags": ["string"]}]}`;
    const prompt = articles
        .map((a, i) => `${i}. ${a.title} — ${a.description.slice(0, 150)}`)
        .join('\n');

    const data = await callOpenRouterAI(prompt, systemInstruction, getModelName(), false);
    const result: string[][] = articles.map(() => []);
    for (const item of data?.items || []) {
        const idx = Number(item?.index);
        if (Number.isInteger(idx) && idx >= 0 && idx < articles.length && Array.isArray(item?.tags)) {
            result[idx] = item.tags.slice(0, 3).map((tag: unknown) => String(tag).trim()).filter(Boolean);
        }
    }
    return result;
};

/**
 * Market thermometer: scan a window of news articles for institutional-behavior
 * top signals (the "fast variable" of the valuation x sentiment framework):
 * target-price raise density, consensus bullishness, good-news fatigue,
 * institutional retreat after earnings, and blame-external-factors narratives.
 * Returns a 0-100 crowding score plus per-signal strength and evidence.
 */
export const analyzeMarketSentiment = async (
    articles: { title: string; description: string; sourceName: string }[],
    locale: Locale
): Promise<import('../utils/sentimentUtils').SentimentScanResult> => {
    if (articles.length === 0) {
        return { newsScore: 0, signals: [], scannedAt: new Date().toISOString(), articleCount: 0 };
    }
    const data = await callOpenRouterAI(
        buildArticlePrompt(articles),
        buildSentimentInstruction(locale),
        getModelName(),
        false
    );
    return parseSentimentResponse(data, articles.length);
};

/**
 * TACO monitor: scan news for the Trump-tariff-threat game cycle
 * (threat -> panic -> walk-back) plus two decay signals: market complacency
 * toward threats, and media density of the TACO meme itself (common knowledge
 * = alpha decay). Pure phase/decay math lives in utils/tacoUtils.ts.
 */
export const analyzeTacoSignals = async (
    articles: { title: string; description: string; sourceName: string }[],
    locale: Locale
): Promise<import('../utils/tacoUtils').TacoScanResult> => {
    if (articles.length === 0) {
        return { signals: [], scannedAt: new Date().toISOString(), articleCount: 0 };
    }
    const data = await callOpenRouterAI(
        buildArticlePrompt(articles),
        buildTacoInstruction(locale),
        getModelName(),
        false
    );
    return parseTacoResponse(data, articles.length);
};
