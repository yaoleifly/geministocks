interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  KV_REST_API_URL?: string
  KV_REST_API_TOKEN?: string
  OPENROUTER_API_KEY?: string
  // The optional paid fallback must be explicitly enabled by the operator.
  ENABLE_AI_FALLBACK?: string
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const prefixes: Record<string, string> = {
  '/exa-api': 'https://api.exa.ai',
  '/anysearch-api': 'https://api.anysearch.com',
  '/ollama-api': 'https://ollama.com',
}
export function isPublicTarget(url: URL): boolean {
  const h = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  // Disallow IP literals entirely (including IPv6) and local/reserved names.
  return h.includes('.') && !/^[\d.]+$/.test(h) && !h.includes(':') &&
    !['localhost', 'local', 'internal', 'test', 'invalid', 'example'].some(s => h === s || h.endsWith(`.${s}`))
}
function sameOrigin(request: Request): boolean {
  const source = request.headers.get('Origin') || request.headers.get('Referer')
  try { return !!source && new URL(source).origin === new URL(request.url).origin } catch { return false }
}
// Best effort per isolate, as on Vercel; use Cloudflare WAF for global limits.
const buckets = new Map<string, { count: number; until: number }>()
function limited(request: Request): boolean {
  const now = Date.now(), ip = request.headers.get('CF-Connecting-IP') || 'local'
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key)
  const value = buckets.get(ip) || { count: 0, until: now + 60_000 }
  if (!buckets.has(ip) && buckets.size >= 5000) return true
  buckets.set(ip, value)
  return ++value.count > 60
}
async function proxy(request: Request, target: URL): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'Forbidden: cross-site use of this proxy is not allowed' }, 403)
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(request.method)) return json({ error: 'Method not allowed' }, 405)
  if (limited(request)) return json({ error: 'Too many requests, please slow down' }, 429)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  const headers = new Headers()
  // Only forward provider headers, never cookies or Cloudflare/user IP headers.
  for (const name of ['authorization', 'content-type', 'accept', 'x-api-key', 'api-key', 'anthropic-version', 'anthropic-beta', 'openai-organization', 'openai-project']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(target, {
    method: request.method, headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  })
  // Do not follow redirects with provider credentials or expose another target.
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel()
    return json({ error: 'Upstream redirects are not supported; use the final API URL' }, 502)
  }
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' })
  for (const name of ['content-type', 'retry-after']) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
async function stats(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405)
  if (request.method === 'POST' && !sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return json({ pageViews: 0, analysisCount: 0, error: 'Stats service is not available.' })
  async function kv(command: string, key: string) {
    const response = await fetch(`${env.KV_REST_API_URL!.replace(/\/$/, '')}/${command}/${key}`, {
      headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}` },
    })
    if (!response.ok) throw new Error('Stats upstream failed')
    return await response.json() as { result: string | number | null }
  }
  if (request.method === 'POST') {
    let body: { type?: string }
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (body.type && !['pageView', 'analysis'].includes(body.type)) return json({ error: 'Invalid increment type specified.' }, 400)
    if (body.type) await kv('incr', body.type === 'pageView' ? 'globalPageViews' : 'globalAnalysisCount')
  }
  const [views, analyses] = await Promise.all([kv('get', 'globalPageViews'), kv('get', 'globalAnalysisCount')])
  return json({ pageViews: Number(views.result || 0), analysisCount: Number(analyses.result || 0) })
}
async function analyze(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
  if (env.ENABLE_AI_FALLBACK !== 'true' || !env.OPENROUTER_API_KEY) return json({ success: false, error: 'Server-side AI fallback is disabled' }, 503)
  if (!sameOrigin(request)) return json({ success: false, error: 'Forbidden' }, 403)
  if (limited(request)) return json({ success: false, error: 'Too many requests' }, 429)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ success: false, error: 'Invalid JSON' }, 400) }
  const { prompt, systemInstruction, userId, modelName = 'openai/gpt-5-mini' } = body
  if (![prompt, systemInstruction, userId, modelName].every(v => typeof v === 'string' && v.length > 0)) return json({ success: false, error: 'Missing or invalid required fields' }, 400)
  const start = Date.now()
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: modelName, messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: 8000 }),
  })
  if (!upstream.ok) return json({ success: false, error: `AI Service error: ${upstream.status}` }, upstream.status)
  const data = await upstream.json() as { choices?: { message?: { content?: string } }[] }
  const result = data.choices?.[0]?.message?.content
  return result ? json({ success: true, data: result, executionTime: Date.now() - start }) : json({ success: false, error: 'Invalid response from AI service' }, 502)
}
async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/cors-proxy') {
        let target: URL
        try { target = new URL(url.searchParams.get('target') || '') } catch { return json({ error: 'Invalid or missing target URL' }, 400) }
        if (!isPublicTarget(target)) return json({ error: 'Target host not allowed; public HTTPS host required' }, 403)
        return await proxy(request, target)
      }
      for (const [prefix, upstream] of Object.entries(prefixes)) {
        if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
          // Construct from a fixed origin to prevent //host path overrides.
          const target = new URL(upstream)
          target.pathname = url.pathname.slice(prefix.length) || '/'
          target.search = url.search
          return await proxy(request, target)
        }
      }
      if (url.pathname === '/api/stats') return await stats(request, env)
      if (url.pathname === '/api/ai-analyze') return await analyze(request, env)
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
      return await env.ASSETS.fetch(request)
    } catch {
      return json({ error: 'Upstream service unavailable' }, 502)
    }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env)
    const headers = new Headers(response.headers)
    headers.set("X-Content-Type-Options", "nosniff")
    headers.set("X-Frame-Options", "DENY")
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    return new Response(response.body, { status: response.status, headers })
  },
}
