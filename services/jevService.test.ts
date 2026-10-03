// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateJev, evaluateNews, getJevConfig, isJevEnabled, parseJevResult, saveJevConfig, safeSourceUrl, type JevQuestion } from './jevService';
import { aggregateSignals, indicatorQuestions, scanWithJev } from './jevIndicatorService';
const questions: Record<string, JevQuestion> = { event: { type: 'choice', instructions: 'Classify', criteria: { policy: 'Policy', unknown: 'Unknown' } } };
const valid = { model: 'jev-test', answers: { event: { type: 'choice', choice: 'policy', confidence: .9 } } };
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('Jev provider boundary', () => {
  it('defaults off and needs an explicit key', () => {
    expect(isJevEnabled()).toBe(false);
    saveJevConfig({ enabled: true, apiKey: '  ', fallback: false });
    expect(isJevEnabled()).toBe(false);
    localStorage.setItem('jev-config-v1', '{broken');
    expect(getJevConfig().enabled).toBe(false);
  });
  it('rejects unknown choices, missing confidence, missing answers and out-of-range scores', () => {
    expect(parseJevResult(valid, questions).model).toBe('jev-test');
    for (const answer of [{ type: 'choice', choice: 'injected', confidence: .9 }, { type: 'choice', choice: 'policy' }, { type: 'choice', choice: 'policy', confidence: 2 }]) {
      expect(() => parseJevResult({ model: 'jev-test', answers: { event: answer } }, questions)).toThrow();
    }
    expect(() => parseJevResult({ model: 'jev-test', answers: {} }, questions)).toThrow();
    expect(() => parseJevResult({ model: 'jev-test', answers: { s: { type: 'score', score: 3, confidence: .9 } } }, { s: { type: 'score', instructions: 'Rate', criteria: ['Low', 'High'] } })).toThrow();
  });
  it('calls only the dedicated route, caches identical requests and honors cancellation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)));
    vi.stubGlobal('fetch', fetcher);
    const config = { enabled: true, apiKey: 'test-cache', fallback: false };
    await evaluateJev('one', questions, undefined, config);
    await evaluateJev('one', questions, undefined, config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/jev/evaluate');
    const controller = new AbortController(); controller.abort();
    await expect(evaluateJev('one', questions, controller.signal, config)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not expose upstream error bodies and rejects unsafe source URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret provider detail', { status: 401 })));
    await expect(evaluateJev('error', questions, undefined, { enabled: true, apiKey: 'test-error', fallback: false })).rejects.toMatchObject({ code: 'network', message: 'network' });
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeSourceUrl('https://news.org/a')).toBe('https://news.org/a');
  });
  it('leaves low-confidence news unrated rather than assigning low impact', async () => {
    saveJevConfig({ enabled: true, apiKey: 'news-test', fallback: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'jev-test', answers: {
      event0: { type: 'choice', choice: 'earnings', confidence: .1 },
      importance0: { type: 'score', score: 3, confidence: .9 },
      related0: { type: 'choice', choice: 'yes', confidence: .1 },
    } }))));
    const [result] = await evaluateNews([{ title: 'Earnings', description: 'More', sourceName: 'Test' }], 'Focus');
    expect(result).toMatchObject({ event: 'unknown', importance: null, related: 'unknown' });
  });
});
describe('evidence aggregation', () => {
  const articles = Array.from({ length: 4 }, (_, i) => ({ title: `News ${i}`, description: 'Evidence', sourceName: 'Source', url: `https://news.org/${i}` }));
  const answers = (choices: string[]) => Object.fromEntries(Object.keys(indicatorQuestions('taco', 4)).map(id => [id, { type: 'choice', choice: id.startsWith('coverage_') ? 'present' : choices[Number(id.split('_')[1])], confidence: .9 }]));
  it('excludes unknowns from prevalence and retains only supporting source references', () => {
    const signals = aggregateSignals('taco', articles, { model: 'jev-test', answers: answers(['present', 'absent', 'absent', 'unknown']) }, true);
    expect(signals[0]).toMatchObject({ strength: 33, evaluatedCount: 3, uncertainCount: 1 });
    expect(signals[0].sources).toEqual([{ title: 'News 0', url: 'https://news.org/0', publishedAt: undefined }]);
  });
  it('refuses partial or uncertain indicators rather than inventing zeroes', () => {
    expect(() => aggregateSignals('taco', articles, { model: 'jev-test', answers: answers(['present', 'unknown', 'unknown', 'unknown']) }, false)).toThrow('evidence');
    expect(() => aggregateSignals('taco', articles, { model: 'jev-test', answers: {} }, false)).toThrow('evidence');
  });
  it('rejects an irrelevant window even when every signal confidently returns absent', () => {
    const data = answers(['absent', 'absent', 'absent', 'absent']);
    for (const [id, value] of Object.entries(data)) if (id.startsWith('coverage_')) value.choice = 'absent';
    expect(() => aggregateSignals('taco', articles, { model: 'jev-test', answers: data }, false)).toThrow('evidence');
  });
  it('rejects undated/stale windows before incurring API costs', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(scanWithJev('taco', articles, true)).rejects.toMatchObject({ code: 'evidence' });
    await expect(scanWithJev('taco', articles.map(a => ({ ...a, publishedAt: '2020-01-01' })), true)).rejects.toMatchObject({ code: 'evidence' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
