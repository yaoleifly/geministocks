// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { analyzeMarketSentiment, analyzeTacoSignals } from './geminiService';
import { saveApiConfig } from './apiConfigService';
import { saveJevConfig } from './jevService';
import { scanWithJev } from './jevIndicatorService';
vi.mock('./jevIndicatorService', () => ({ scanWithJev: vi.fn() }));
vi.mock('../utils/telemetry', () => ({ captureError: vi.fn(), addBreadcrumb: vi.fn() }));
const articles = [{ title: 'News', description: 'Text', sourceName: 'Test' }];
beforeEach(() => { localStorage.clear(); saveApiConfig({ baseUrl: 'https://api.example.com/v1', apiKey: 'test', model: 'test' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('leaves disabled Jev on the existing model path', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"signals":[]}' } }] }))));
  await analyzeTacoSignals(articles, 'en');
  expect(scanWithJev).not.toHaveBeenCalled();
});
it('does not silently charge the main model when Jev fails', async () => {
  saveJevConfig({ enabled: true, apiKey: 'test', fallback: false });
  vi.mocked(scanWithJev).mockRejectedValue(new Error('network'));
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(analyzeTacoSignals(articles, 'en')).rejects.toThrow('network');
  expect(fetcher).not.toHaveBeenCalled();
});
it('labels explicitly enabled fallback results', async () => {
  saveJevConfig({ enabled: true, apiKey: 'test', fallback: true });
  vi.mocked(scanWithJev).mockRejectedValue(new Error('network'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"newsScore":40,"signals":[]}' } }] }))));
  expect(await analyzeMarketSentiment(articles, 'en')).toMatchObject({ engine: 'llm-fallback', newsScore: 40 });
});
