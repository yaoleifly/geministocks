import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Default analysis-model proxy with server-side key injection.
 *
 * Lets visitors analyze out of the box without configuring their own model:
 * the frontend POSTs an OpenAI-compatible chat/completions body here, and this
 * function forwards it to monk.party with the site's MONK_API_KEY attached.
 * The key lives only in the server environment and never reaches the browser.
 *
 * Users who set their own model in settings bypass this entirely (their config
 * points directly at their provider / the generic cors-proxy).
 *
 * The dev/preview environment uses the equivalent middleware in vite.config.ts.
 *
 * Security: same-origin only (blocks third parties from using our key as a free
 * relay) plus a best-effort per-IP rate limit.
 */

const UPSTREAM_URL = 'https://monk.party/v1/chat/completions'

/**
 * Same-origin check: only pages served by this deployment may use the proxy.
 * Mirrors api/cors-proxy.ts.
 */
function isSameOrigin(req: VercelRequest): boolean {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim()
  if (!host) return false
  const check = (value: string | undefined): boolean | null => {
    if (!value) return null
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }
  const originOk = check(req.headers.origin as string | undefined)
  if (originOk !== null) return originOk
  const refererOk = check(req.headers.referer as string | undefined)
  if (refererOk !== null) return refererOk
  // No Origin/Referer at all (e.g. curl): reject.
  return false
}

// Best-effort per-IP rate limit (state lives per warm instance).
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30 // max default-model requests per IP per minute
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  bucket.count++
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (now >= v.resetAt) rateBuckets.delete(k)
    }
  }
  return bucket.count > RATE_LIMIT_MAX
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Forbidden: cross-site use of this endpoint is not allowed' })
    return
  }

  const apiKey = process.env.MONK_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Default model is not configured on the server' })
    return
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests, please slow down' })
    return
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body,
    })

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.status(upstream.status)
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('content-type', contentType)
    res.send(buf)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Proxy fetch failed' })
  }
}
