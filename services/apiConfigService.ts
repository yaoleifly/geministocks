/**
 * 用户自定义 API 配置服务
 * 用户自行填写 OpenAI 兼容的模型调用地址、API Key 和模型名称
 * 配置保存在浏览器 localStorage 中，不会上传到服务器
 */

const API_CONFIG_KEY = 'user-api-config';

export interface UserApiConfig {
  baseUrl: string;   // e.g. https://openrouter.ai/api/v1 or http://localhost:11434/v1
  apiKey: string;    // user's own API key; may be empty for local CLI servers (Ollama, Claude Code proxy, etc.)
  model: string;     // e.g. gpt-4o, deepseek/deepseek-chat-v3.1:free
}

/**
 * Site default model: a same-origin proxy (/api/model-proxy) that injects the
 * server-side MONK_API_KEY and forwards to monk.party. Lets visitors analyze
 * out of the box with zero configuration. apiKey stays empty on the client —
 * the key never leaves the server. Users can override this in settings.
 */
export const DEFAULT_API_CONFIG: UserApiConfig = {
  baseUrl: '/api/model-proxy',
  apiKey: '',
  model: 'monk',
};

/**
 * 构建请求头：本机 CLI 服务（Ollama、Claude Code 代理等）通常无需 API Key
 */
export function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = apiKey?.trim();
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

/**
 * 读取用户 API 配置
 * 注意：apiKey 可为空（本机 CLI 模式无需密钥）
 */
export function getApiConfig(): UserApiConfig | null {
  try {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as UserApiConfig;
    if (!config.baseUrl || !config.model) return null;
    if (typeof config.apiKey !== 'string') config.apiKey = '';
    return config;
  } catch {
    return null;
  }
}

/**
 * 保存用户 API 配置
 */
export function saveApiConfig(config: UserApiConfig): void {
  // Normalize: strip trailing slash and trailing /chat/completions if user pasted full endpoint
  let baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
  const normalized: UserApiConfig = {
    baseUrl,
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  };
  localStorage.setItem(API_CONFIG_KEY, JSON.stringify(normalized));
}

/**
 * 清除用户 API 配置
 */
export function clearApiConfig(): void {
  try {
    localStorage.removeItem(API_CONFIG_KEY);
  } catch {
    // ignore
  }
}

/**
 * 用户是否配置了自己的模型（区别于站方默认模型）
 */
export function isApiConfigured(): boolean {
  return getApiConfig() !== null;
}

/**
 * 实际用于分析的配置：优先使用用户自己的配置，否则回退到站方默认模型。
 * 永不返回 null —— 未配置时也能直接分析。
 */
export function getEffectiveConfig(): UserApiConfig {
  return getApiConfig() ?? DEFAULT_API_CONFIG;
}

/**
 * 当前是否在使用站方默认模型（用户未配置自己的模型）
 */
export function isUsingDefaultModel(): boolean {
  return getApiConfig() === null;
}

/**
 * 是否为本机地址（本机 CLI 服务需浏览器直连，不走代理）
 */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    /^127\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/**
 * 把请求地址转换为实际 fetch 用的地址。
 *
 * 许多 OpenAI 兼容服务（含第三方中转）不返回 CORS 头，浏览器无法直接读取跨域响应
 * （报 "Failed to fetch"）。这里把"绝对的、非本机的 https 地址"改写为走同源代理
 * /api/cors-proxy?target=<原地址>（开发/预览见 vite.config.ts，生产见 api/cors-proxy.ts）。
 *
 * - 相对地址（如预设 /ollama-api/v1、/exa-api 已是同源代理）原样返回
 * - 本机 CLI（localhost 等）需浏览器直连，原样返回
 */
export function toRequestUrl(rawUrl: string): string {
  if (!/^https?:\/\//i.test(rawUrl)) return rawUrl; // 相对地址：原样
  try {
    const u = new URL(rawUrl);
    if (isLocalHost(u.hostname)) return rawUrl; // 本机直连
    // 非本机绝对地址：走同源代理绕过 CORS
    return `/api/cors-proxy?target=${encodeURIComponent(rawUrl)}`;
  } catch {
    return rawUrl;
  }
}

/**
 * 获取 chat/completions 完整端点（必要时经同源代理）
 */
export function getChatCompletionsUrl(config: UserApiConfig): string {
  return toRequestUrl(`${config.baseUrl}/chat/completions`);
}

/**
 * 从用户配置的服务获取可用模型列表（OpenAI 兼容 GET /models 接口）
 * 只需 baseUrl 和 apiKey，无需 model
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; models: string[]; message: string }> {
  try {
    const normalizedBase = baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    const response = await fetch(toRequestUrl(`${normalizedBase}/models`), {
      method: 'GET',
      headers: buildAuthHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, models: [], message: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();
    // OpenAI-compatible: { data: [{ id: "gpt-4o", ... }, ...] }
    const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const models = list
      .map((m) => (typeof m === 'string' ? m : m?.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      return { ok: false, models: [], message: 'Empty model list' };
    }
    return { ok: true, models, message: '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, models: [], message: msg };
  }
}

/**
 * 本地 CLI 服务状态
 * - online: 服务运行中且可正常访问（已获取模型列表）
 * - cors-blocked: 服务运行中但浏览器跨域被拦截（需用户开启 CORS）
 * - offline: 端口未开放，服务未运行
 */
export type LocalServiceStatus = 'online' | 'cors-blocked' | 'offline';

export interface LocalScanResult {
  baseUrl: string;
  status: LocalServiceStatus;
  models: string[];
}

/**
 * 探测单个本地服务状态（带超时）
 */
async function probeLocalService(baseUrl: string, timeoutMs = 2500): Promise<LocalScanResult> {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');

  // Step 1: try a normal CORS request to /models
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${normalizedBase}/models`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Any HTTP response means the service is up and CORS-accessible
    let models: string[] = [];
    if (response.ok) {
      try {
        const data = await response.json();
        const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        models = list
          .map((m) => (typeof m === 'string' ? m : m?.id))
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .sort((a, b) => a.localeCompare(b));
      } catch {
        // Response not JSON; still online
      }
    }
    return { baseUrl, status: 'online', models };
  } catch {
    // CORS error and connection-refused both throw TypeError; disambiguate below
  }

  // Step 2: no-cors probe — resolves with an opaque response if the port is open,
  // rejects if nothing is listening
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(`${normalizedBase}/models`, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { baseUrl, status: 'cors-blocked', models: [] };
  } catch {
    return { baseUrl, status: 'offline', models: [] };
  }
}

/**
 * 并行扫描多个本地 CLI 服务的运行状态
 */
export async function scanLocalServices(baseUrls: string[]): Promise<LocalScanResult[]> {
  return Promise.all(baseUrls.map((url) => probeLocalService(url)));
}

/**
 * 测试 API 连接是否可用
 * 返回 { ok, message }
 */
export async function testApiConnection(config: UserApiConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(getChatCompletionsUrl({ ...config, baseUrl: config.baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '') }), {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(config.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: 'user', content: 'Reply with: ok' }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      return { ok: true, message: '' };
    }

    const errorText = await response.text();
    return { ok: false, message: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "Failed to fetch" usually means CORS or network issue
    return { ok: false, message: msg };
  }
}
