import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { isPublicTarget } from './index'

const assets = { fetch: vi.fn(async () => new Response('shell')) }
const request = (path: string, init: RequestInit = {}) => new Request(`https://mastersgo.cc${path}`, init)
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Cloudflare routing and proxy', () => {
  it('redirects www to the canonical HTTPS host with path and query preserved', async () => {
    const response = await worker.fetch(new Request('https://www.mastersgo.cc/topic?q=test'), { ASSETS: assets })
    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('https://mastersgo.cc/topic?q=test')
    expect(assets.fetch).not.toHaveBeenCalled()
  })
  it('rejects IP literals, private names, credentials and non-HTTPS URLs', () => {
    for (const target of ['http://api.example.com', 'https://127.0.0.1', 'https://10.0.0.1', 'https://[::1]', 'https://2130706433', 'https://localhost', 'https://foo.local', 'https://a:b@api.openai.com', 'https://api.openai.com:444']) {
      expect(isPublicTarget(new URL(target)), target).toBe(false)
    }
    expect(isPublicTarget(new URL('https://api.openai.com/v1'))).toBe(true)
  })
  it('rejects cross-site proxy calls before fetching', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect((await worker.fetch(request('/exa-api/search', { headers: { Origin: 'https://other.cc' } }), { ASSETS: assets })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('streams SSE without buffering and strips browser secrets and IP headers', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; c.enqueue(new TextEncoder().encode('data: first\n\n')) } })
    const fetchMock = vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'bad=1' } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await worker.fetch(request('/api/cors-proxy?target=https%3A%2F%2Fapi.openai.com%2Fv1%2Fchat%2Fcompletions', {
      method: 'POST', body: '{}', headers: { Origin: 'https://mastersgo.cc', Authorization: 'Bearer user-key', Cookie: 'session=private', 'CF-Connecting-IP': '203.0.113.7', 'Content-Type': 'application/json' },
    }), { ASSETS: assets })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer user-key')
    expect(headers.get('Cookie')).toBeNull()
    expect(headers.get('CF-Connecting-IP')).toBeNull()
    expect(init.redirect).toBe('manual')
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n')
    controller.close()
    expect((await reader.read()).done).toBe(true)
  })
  it.each([['/exa-api/search?q=x', 'https://api.exa.ai/search?q=x'], ['/anysearch-api/v1/search', 'https://api.anysearch.com/v1/search'], ['/ollama-api/v1/models', 'https://ollama.com/v1/models'], ['/exa-api//other.cc/x', 'https://api.exa.ai//other.cc/x']])('routes %s to the fixed provider', async (path, target) => {
    const fetchMock = vi.fn(async (_input: URL | string, _init?: RequestInit) => new Response('{}')); vi.stubGlobal('fetch', fetchMock)
    await worker.fetch(request(path, { headers: { Referer: 'https://mastersgo.cc/' } }), { ASSETS: assets })
    expect(String(fetchMock.mock.calls[0][0])).toBe(target)
  })
  it('blocks upstream redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } })))
    expect((await worker.fetch(request('/exa-api/search', { headers: { Origin: 'https://mastersgo.cc' } }), { ASSETS: assets })).status).toBe(502)
  })
  it('does not return the SPA for unknown API endpoints', async () => {
    expect((await worker.fetch(request('/api/missing'), { ASSETS: assets })).status).toBe(404)
    expect(assets.fetch).not.toHaveBeenCalled()
  })
  it('delegates frontend routes to assets', async () => {
    expect(await (await worker.fetch(request('/auth/google/callback'), { ASSETS: assets })).text()).toBe('shell')
  })
  it('gracefully disables optional services without secrets', async () => {
    expect(await (await worker.fetch(request('/api/stats'), { ASSETS: assets })).json()).toMatchObject({ pageViews: 0, analysisCount: 0 })
    expect((await worker.fetch(request('/api/ai-analyze', { method: 'POST' }), { ASSETS: assets })).status).toBe(503)
  })
  it('keeps existing statistics keys and increments in Upstash', async () => {
    const fetchMock = vi.fn(async (input: string) => Response.json({ result: input.includes('globalPageViews') ? 42 : 7 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await worker.fetch(request('/api/stats', { method: 'POST', headers: { Origin: 'https://mastersgo.cc' }, body: JSON.stringify({ type: 'pageView' }) }), { ASSETS: assets, KV_REST_API_URL: 'https://stats.upstash.io', KV_REST_API_TOKEN: 'test-secret' })
    expect(await response.json()).toEqual({ pageViews: 42, analysisCount: 7 })
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('https://stats.upstash.io/incr/globalPageViews')
  })
})

describe('Jev BYOK endpoint', () => {
  const headers = { Origin: 'https://mastersgo.cc', Authorization: 'Bearer user-test-key', 'Content-Type': 'application/json', Cookie: 'private-cookie' };
  const body = JSON.stringify({ model: 'jev-latest', state: { text: 'News' }, questions: { event: { type: 'choice', criteria: { a: 'A' }, instructions: 'Classify' } } });
  it('requires same origin, POST and a user key without invoking a shared credential', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await worker.fetch(request('/api/jev/evaluate'), { ASSETS: assets })).status).toBe(405);
    expect((await worker.fetch(request('/api/jev/evaluate', { method: 'POST', headers: { ...headers, Origin: 'https://evil.org' }, body }), { ASSETS: assets })).status).toBe(403);
    expect((await worker.fetch(request('/api/jev/evaluate', { method: 'POST', headers: { Origin: headers.Origin }, body }), { ASSETS: assets })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('pins provider URL and strips cookies', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"model":"jev-test"}')); vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(request('/api/jev/evaluate?target=https://evil.org', { method: 'POST', headers, body }), { ASSETS: assets });
    expect(response.status).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.typesafe.ai/v1/systemone');
    expect(fetcher.mock.calls[0][1].headers.get('Cookie')).toBeNull();
    expect(fetcher.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer user-test-key');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects oversized bodies and invalid JSON before reaching the provider', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const [payload, status] of [['x'.repeat(200001), 413], ['{', 400], ['{"model":"other"}', 400]] as const) {
      expect((await worker.fetch(request('/api/jev/evaluate', { method: 'POST', headers, body: payload }), { ASSETS: assets })).status).toBe(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
