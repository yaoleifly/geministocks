// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisReport } from '../types';
const mocks = vi.hoisted(() => ({ analyze: vi.fn(), model: { baseUrl: 'https://model.example/v1', model: 'model-a' } }));
vi.mock('./geminiService', () => ({ getAnalysis: mocks.analyze, getPolymarketAnalysis: vi.fn() }));
vi.mock('./apiConfigService', () => ({ getApiConfig: () => mocks.model }));
vi.mock('./exaSearchService', () => ({ getExaConfig: () => ({ enabled: false, provider: 'exa' }) }));
import { getAnalysisWithStreaming } from './streamingService';
import { topicAnalysisCache } from './cacheService';

describe('analysis cache and progress', () => {
  const report = { modelUsed: 'test' } as AnalysisReport;
  beforeEach(() => { topicAnalysisCache.clear(); mocks.analyze.mockReset(); mocks.model.model = 'model-a'; mocks.analyze.mockImplementation(async (_topic, progress) => { progress(1); progress(2); progress(3); return report; }); });
  it('reports real completed requests and uses cache for repeated analysis', async () => {
    const progress = vi.fn();
    await getAnalysisWithStreaming('topic', vi.fn(), 'zh', progress);
    expect(progress.mock.calls.map(call => call[0])).toEqual([33, 67, 100, 100]);
    await getAnalysisWithStreaming('topic', vi.fn(), 'zh');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });
  it('bypasses cache for fresh analysis and separates language and model', async () => {
    await getAnalysisWithStreaming('topic', vi.fn(), 'zh');
    await getAnalysisWithStreaming('topic', vi.fn(), 'zh', undefined, { fresh: true });
    await getAnalysisWithStreaming('topic', vi.fn(), 'en');
    mocks.model.model = 'model-b';
    await getAnalysisWithStreaming('topic', vi.fn(), 'en');
    expect(mocks.analyze).toHaveBeenCalledTimes(4);
  });
  it('never publishes or caches a cancelled result', async () => {
    const controller = new AbortController();
    mocks.analyze.mockImplementationOnce(async () => { controller.abort(); return report; });
    await expect(getAnalysisWithStreaming('topic', vi.fn(), 'zh', undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await getAnalysisWithStreaming('topic', vi.fn(), 'zh');
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });
});
