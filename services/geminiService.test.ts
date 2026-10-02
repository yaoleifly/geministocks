// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalysis } from './geminiService';
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
