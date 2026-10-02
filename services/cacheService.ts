import type { AnalysisReport } from '../types'

/**
 * 分析缓存服务
 * 使用内存缓存 + 时间戳来减少 AI API 调用
 * 
 * 分层 TTL 策略:
 * - 股价数据: 5 分钟 (市场敏感)
 * - 新闻数据: 1 小时 (时效性要求)
 * - 分析报告: 4 小时 (综合性报告)
 * - 历史/概念: 24 小时 (不常变化)
 */

// 缓存 TTL 常量 (毫秒)
export const CACHE_TTL = {
  PRICE_SENSITIVE: 5 * 60 * 1000,      // 5 minutes - for real-time price queries
  NEWS_SENSITIVE: 60 * 60 * 1000,       // 1 hour - for news-related queries
  ANALYSIS_REPORT: 4 * 60 * 60 * 1000,  // 4 hours - for comprehensive analysis
  HISTORICAL: 24 * 60 * 60 * 1000,      // 24 hours - for historical/conceptual queries
} as const;

/**
 * 根据查询内容智能判断 TTL
 */
export function determineCacheTTL(query: string): number {
  const lowerQuery = query.toLowerCase();
  
  // 股价敏感查询 - 5分钟缓存
  const priceSensitivePatterns = [
    /当前|current|实时|real.?time|now|今天|today/i,
    /股价|price|行情|quote|涨跌/i,
  ];
  if (priceSensitivePatterns.some(p => p.test(lowerQuery))) {
    return CACHE_TTL.PRICE_SENSITIVE;
  }
  
  // 新闻敏感查询 - 1小时缓存
  const newsSensitivePatterns = [
    /新闻|news|公告|announcement|最新|latest/i,
    /财报|earnings|季报|quarterly/i,
  ];
  if (newsSensitivePatterns.some(p => p.test(lowerQuery))) {
    return CACHE_TTL.NEWS_SENSITIVE;
  }
  
  // 历史/概念查询 - 24小时缓存
  const historicalPatterns = [
    /历史|history|historical/i,
    /理论|theory|concept|概念/i,
    /\b(19|18)\d{2}\b/, // Years like 1990, 1850
  ];
  if (historicalPatterns.some(p => p.test(lowerQuery))) {
    return CACHE_TTL.HISTORICAL;
  }
  
  // 默认使用分析报告 TTL - 4小时
  return CACHE_TTL.ANALYSIS_REPORT;
}

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // milliseconds
  dataFreshness?: string // 数据新鲜度标记
}

class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private readonly defaultTTL = CACHE_TTL.ANALYSIS_REPORT // 4 hours default

  /**
   * 生成缓存键 - 基于查询内容进行哈希
   */
  private generateKey(query: string): string {
    return query.trim()
  }

  /**
   * 从缓存获取数据
   */
  get(query: string): T | null {
    const key = this.generateKey(query)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // 检查是否过期
    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    console.log(`[v0] Cache hit for query: ${query.substring(0, 50)}...`)
    return entry.data
  }

  /**
   * 存储数据到缓存
   */
  set(query: string, data: T, ttl: number = this.defaultTTL): void {
    const key = this.generateKey(query)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
    console.log(`[v0] Cached analysis for query: ${query.substring(0, 50)}...`)
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear()
    console.log('[v0] Cache cleared')
  }

  /**
   * 清理过期缓存条目
   */
  cleanup(): void {
    const now = Date.now()
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      console.log(`[v0] Cleaned up ${removed} expired cache entries`)
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // 可以扩展为追踪 hit/miss 比率
    }
  }
}

// 创建专用缓存管理器
export const topicAnalysisCache = new CacheManager<AnalysisReport>()

/**
 * 定期清理过期缓存（每小时一次）
 */
export function initCacheCleanup(): void {
  setInterval(() => {
    topicAnalysisCache.cleanup()
  }, 60 * 60 * 1000)

  console.log('[v0] Cache cleanup scheduled')
}

/**
 * 清空所有缓存
 */
export function clearAllCaches(): void {
  topicAnalysisCache.clear()
}

export { CacheManager }
