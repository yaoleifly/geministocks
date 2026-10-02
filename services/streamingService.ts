import type { AnalysisReport } from '../types'
import type { Locale } from '../hooks/useI18n'
import { getAnalysis as getAnalysisLegacy } from './geminiService'
import { topicAnalysisCache, determineCacheTTL, initCacheCleanup } from './cacheService'
import { getApiConfig } from './apiConfigService'
import { getExaConfig } from './exaSearchService'

if (typeof window !== 'undefined') initCacheCleanup()

/** Preserve the existing API, reporting completed requests rather than simulated streaming. */
export async function getAnalysisWithStreaming(
  topic: string,
  onProgress: (stepIndex: number) => void,
  locale: Locale,
  onStreamProgress?: (progress: number, data: Partial<AnalysisReport>) => void,
  options: { signal?: AbortSignal; fresh?: boolean } = {}
): Promise<AnalysisReport> {
  options.signal?.throwIfAborted()
  const model = getApiConfig()
  const search = getExaConfig()
  // Keep languages, models and search modes separate; never put API keys in cache keys.
  const key = JSON.stringify([topic.trim(), locale, model?.baseUrl, model?.model, search.enabled, search.provider])
  const cached = options.fresh ? null : topicAnalysisCache.get(key)
  if (cached) {
    onStreamProgress?.(100, cached)
    return cached
  }
  const result = await getAnalysisLegacy(topic, step => {
    onProgress(step)
    onStreamProgress?.(Math.round(step / 3 * 100), {})
  }, locale, options.signal)
  options.signal?.throwIfAborted()
  topicAnalysisCache.set(key, result, determineCacheTTL(topic))
  onStreamProgress?.(100, result)
  return result
}

export { getAnalysis, getPolymarketAnalysis } from './geminiService'
