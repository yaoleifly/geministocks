import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import react from '@vitejs/plugin-react';

/**
 * Dev/preview counterpart of the serverless function api/cors-proxy.ts.
 *
 * Many OpenAI-compatible providers (and third-party relays) don't return CORS
 * headers, so the browser can't call them directly. The frontend routes those
 * requests through /api/cors-proxy?target=<absolute https url>. node-http-proxy
 * (used by Vite's `server.proxy`) can't pick the target dynamically per request,
 * so we implement the forwarding as a small Node middleware instead.
 */
function corsProxyDevPlugin(): Plugin {
  return {
    name: 'dev-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api/cors-proxy', async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, payload: string) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(payload);
        };
        try {
          const fullUrl = (req as any).originalUrl || req.url || '';
          const target = new URL(fullUrl, 'http://x').searchParams.get('target');
          if (!target) return send(400, JSON.stringify({ error: 'Missing target' }));

          const t = new URL(target);
          if (t.protocol !== 'https:') return send(400, JSON.stringify({ error: 'Only https allowed' }));

          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            const key = k.toLowerCase();
            if (['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer'].includes(key)) continue;
            if (typeof v === 'string') headers[k] = v;
            else if (Array.isArray(v)) headers[k] = v.join(', ');
          }

          let body: Buffer | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve) => {
              req.on('data', (c) => chunks.push(c as Buffer));
              req.on('end', () => resolve());
              req.on('error', () => resolve());
            });
            if (chunks.length) body = Buffer.concat(chunks);
          }

          const upstream = await fetch(t.toString(), { method: req.method, headers, body });
          res.statusCode = upstream.status;
          const ct = upstream.headers.get('content-type');
          if (ct) res.setHeader('content-type', ct);
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          send(502, JSON.stringify({ error: err instanceof Error ? err.message : 'Proxy fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api/jev/evaluate': {
            target: 'https://api.typesafe.ai', changeOrigin: true, secure: true,
            rewrite: () => '/v1/systemone',
          },
          // Same-origin proxy for Ollama Cloud (ollama.com does not send CORS
          // headers, so the browser cannot call it directly). The frontend uses
          // a relative base URL "/ollama-api/v1" which is forwarded here.
          '/ollama-api': {
            target: 'https://ollama.com',
            changeOrigin: true,
            secure: true,
            rewrite: (p) => p.replace(/^\/ollama-api/, ''),
          },
          // Same-origin proxy for Exa (api.exa.ai does not return
          // Access-Control-Allow-Origin, so the browser cannot read responses
          // directly). The frontend calls "/exa-api/search" which is forwarded here.
          '/exa-api': {
            target: 'https://api.exa.ai',
            changeOrigin: true,
            secure: true,
            rewrite: (p) => p.replace(/^\/exa-api/, ''),
          },
          // Same-origin proxy for AnySearch (api.anysearch.com). The frontend
          // calls "/anysearch-api/v1/search" which is forwarded here.
          '/anysearch-api': {
            target: 'https://api.anysearch.com',
            changeOrigin: true,
            secure: true,
            rewrite: (p) => p.replace(/^\/anysearch-api/, ''),
          },
        },
      },
      plugins: [corsProxyDevPlugin(), react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
