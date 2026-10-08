// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalysis, runSkillPrompt } from './geminiService';
import { saveApiConfig } from './apiConfigService';
vi.mock('../utils/telemetry', () => ({ captureError: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock('./exaSearchService', () => ({ isExaSearchEnabled: () => false, getExaConfig: () => ({ provider: 'exa' }), searchExa: vi.fn(), formatExaResultsForPrompt: vi.fn() }));
beforeEach(() => { localStorage.clear(); saveApiConfig({ baseUrl: 'http://localhost:9000/v1', model: 'test', apiKey: '' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('model request cancellation', () => {
  it('aborts all three requests and does not retry a user cancellation', async () => {
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const promise = getAnalysis('test topic', vi.fn(), 'zh', controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(call => call[1].signal?.aborted)).toBe(true);
  });
  it('counts completions in actual response order', async () => {
    const resolves: ((value: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => resolves.push(resolve))));
    const progress = vi.fn();
    const promise = getAnalysis('test topic', progress, 'zh');
    const response = () => Response.json({ choices: [{ message: { content: '{}' } }] });
    resolves[2](response());
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(1));
    resolves[0](response());
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(2));
    resolves[1](response());
    await promise;
    expect(progress.mock.calls.map(call => call[0])).toEqual([0, 1, 2, 3]);
  });
});


describe('Monk structured response compatibility', () => {
  beforeEach(() => saveApiConfig({ baseUrl: 'https://monk.party/v1', model: 'monk', apiKey: 'test-key' }));
  it('parses reasoning-wrapped final JSON without extra model calls', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '<think>[plan] {"draft":true}</think>```json\n{"summary":"ok"}\n```' } }] }));
    vi.stubGlobal('fetch', request);
    expect(await runSkillPrompt('topic', 'Return JSON')).toEqual({ summary: 'ok' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retries format once with the original answer, then returns valid JSON', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'A prose report.' } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"summary":"ok"}' } }] }));
    vi.stubGlobal('fetch', request);
    expect(await runSkillPrompt('topic', 'Return JSON')).toEqual({ summary: 'ok' });
    expect(request).toHaveBeenCalledTimes(2);
    const body = JSON.parse(request.mock.calls[1][1].body);
    expect(body.messages[2]).toEqual({ role: 'assistant', content: 'A prose report.' });
  });
  it('stops after one unsuccessful format retry', async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ choices: [{ message: { content: 'Still prose.' } }] })));
    vi.stubGlobal('fetch', request);
    await expect(runSkillPrompt('topic', 'Return JSON')).rejects.toThrow('自动格式重试仍失败');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects token-truncated reports without repairing missing conclusions', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"summary":"cut' } }] }));
    vi.stubGlobal('fetch', request);
    await expect(runSkillPrompt('topic', 'Return JSON')).rejects.toThrow('长度限制');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
