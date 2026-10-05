import JevSettings from './JevSettings';
import React, { useState, useEffect, useRef } from 'react';
import { useDialog } from '../hooks/useDialog';
import { XIcon } from './icons/Icons';
import { useI18n } from '../hooks/useI18n';
import {
  getApiConfig,
  saveApiConfig,
  clearApiConfig,
  testApiConnection,
  fetchAvailableModels,
  scanLocalServices,
  LocalScanResult,
  LocalServiceStatus,
  UserApiConfig,
} from '../services/apiConfigService';
import { getExaConfig, saveExaConfig, testExaConnection, type SearchProvider } from '../services/exaSearchService';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  startAfterSave?: boolean;
}

interface CloudPreset {
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
  // Optional hint shown when the preset is selected (e.g. where to get an API key)
  keyUrl?: string;
  hintZh?: string;
  hintEn?: string;
  // Optional badge shown on the preset button (e.g. "HOT")
  badge?: string;
}

const PRESETS: CloudPreset[] = [
  {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelPlaceholder: 'deepseek/deepseek-chat-v3.1:free',
    keyUrl: 'https://openrouter.ai/workspaces/default/keys',
    hintZh: '在 openrouter.ai 创建 API Key 并填入下方，然后点击「获取模型列表」选择模型即可。',
    hintEn: 'Create an API key at openrouter.ai and paste it below, then click "Fetch Models" to pick a model.',
  },
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelPlaceholder: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    hintZh: '在 platform.deepseek.com 创建 API Key 并填入下方，然后点击「获取模型列表」选择模型即可。',
    hintEn: 'Create an API key at platform.deepseek.com and paste it below, then click "Fetch Models" to pick a model.',
  },
  {
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelPlaceholder: 'MiniMax-Text-01',
    keyUrl: 'https://platform.minimaxi.com/subscribe/token-plan?code=5L9P964O7B',
    hintZh: '在 platform.minimaxi.com 创建 API Key 并填入下方，然后点击「获取模型列表」选择模型即可。',
    hintEn: 'Create an API key at platform.minimaxi.com and paste it below, then click "Fetch Models" to pick a model.',
    badge: 'HOT',
  },
  {
    // Ollama Cloud does not send CORS headers, so the browser cannot call
    // ollama.com directly. We route through a same-origin proxy (configured in
    // vite.config.ts for dev/preview and vercel.json for production) that
    // forwards /ollama-api/* to https://ollama.com/*.
    label: 'Ollama',
    baseUrl: '/ollama-api/v1',
    modelPlaceholder: 'gpt-oss:120b',
    keyUrl: 'https://ollama.com/settings/keys',
    hintZh: '在 ollama.com/settings/keys 创建 API Key 并填入下方，然后点击「获取模型列表」选择云端模型即可。',
    hintEn: 'Create an API key at ollama.com/settings/keys and paste it below, then click "Fetch Models" to pick a cloud model.',
  },
];

interface LocalPreset {
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
  hintZh: string;
  hintEn: string;
}

const LOCAL_PRESETS: LocalPreset[] = [
  {
    label: '9Router',
    baseUrl: 'http://localhost:20128/v1',
    modelPlaceholder: 'kr/claude-sonnet-4.5',
    hintZh: '聚合 60+ 服务商的本机智能网关：npm i -g 9router 后运行 9router，在 localhost:20128/dashboard 连接服务商并复制 API Key 填入下方，然后点击「获取模型列表」选择模型。',
    hintEn: 'Local smart gateway aggregating 60+ providers: npm i -g 9router, then run 9router. Connect providers at localhost:20128/dashboard, copy the API key below, then click "Fetch Models" to pick a model.',
  },
  {
    label: 'Claude Code',
    baseUrl: 'http://localhost:3456/v1',
    modelPlaceholder: 'claude-sonnet-4-5',
    hintZh: '通过 claude-code-router 暴露本机 Claude Code 订阅：npm i -g @musistudio/claude-code-router 后运行 ccr start',
    hintEn: 'Expose your local Claude Code subscription via claude-code-router: npm i -g @musistudio/claude-code-router, then run ccr start',
  },
  {
    label: 'Codex',
    baseUrl: 'http://localhost:1455/v1',
    modelPlaceholder: 'gpt-5-codex',
    hintZh: '通过 codex-proxy 等工具将本机 Codex CLI 暴露为 OpenAI 兼容接口，端口以实际工具为准',
    hintEn: 'Expose your local Codex CLI as an OpenAI-compatible endpoint via tools like codex-proxy; port depends on your tool',
  },
];

const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({ isOpen, onClose, onSaved, startAfterSave = false }) => {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const dialogRef = useDialog(isOpen, onClose);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [isCustomProvider, setIsCustomProvider] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // Model list fetching state
  const [modelList, setModelList] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Local CLI auto-scan state
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Map<string, LocalScanResult>>(new Map());
  const [hasScanned, setHasScanned] = useState(false);

  // Config import/export + CORS helper state
  const [importError, setImportError] = useState<string | null>(null);
  const [originCopied, setOriginCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time search state (Exa / AnySearch)
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('exa');
  const [exaApiKey, setExaApiKey] = useState('');
  const [anysearchApiKey, setAnysearchApiKey] = useState('');
  const [exaEnabled, setExaEnabled] = useState(false);
  const [showExaKey, setShowExaKey] = useState(false);
  const [exaTesting, setExaTesting] = useState(false);
  const [exaTestResult, setExaTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Whether the toggle can be switched on for the current provider
  const searchToggleReady = searchProvider === 'anysearch' || !!exaApiKey.trim();

  const runLocalScan = async (autoSelect: boolean) => {
    setScanning(true);
    const results = await scanLocalServices(LOCAL_PRESETS.map((p) => p.baseUrl));
    const map = new Map(results.map((r) => [r.baseUrl, r]));
    setScanResults(map);
    setHasScanned(true);
    setScanning(false);

    if (autoSelect) {
      // Prefer the first fully accessible service; fall back to one that's running but CORS-blocked
      const online = LOCAL_PRESETS.find((p) => map.get(p.baseUrl)?.status === 'online');
      const reachable = online || LOCAL_PRESETS.find((p) => map.get(p.baseUrl)?.status === 'cors-blocked');
      if (online) {
        setBaseUrl(online.baseUrl);
        setIsCustomProvider(false);
        const found = map.get(online.baseUrl)!;
        if (found.models.length > 0) {
          setModelList(found.models);
          setShowModelPicker(true);
          // Auto-fill the first model if the field is empty
          setModel((prev) => prev || found.models[0]);
        }
      } else if (reachable) {
        setBaseUrl(reachable.baseUrl);
        setIsCustomProvider(false);
      }
    }
  };

  // Auto-scan local services when switching to (or opening in) local mode
  useEffect(() => {
    if (isOpen && advancedOpen && mode === 'local' && !hasScanned && !scanning) {
      // Auto-select the detected service unless we're restoring a saved local config
      const saved = getApiConfig();
      const savedIsLocal = !!saved && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(saved.baseUrl);
      runLocalScan(!savedIsLocal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, advancedOpen, mode, hasScanned]);

  useEffect(() => {
    if (isOpen) {
      setAdvancedOpen(false);
      const config = getApiConfig();
      if (config) {
        setBaseUrl(config.baseUrl);
        setApiKey(config.apiKey);
        setModel(config.model);
        // Detect mode: localhost URLs belong to local CLI mode
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(config.baseUrl);
        setMode(isLocal ? 'local' : 'cloud');
        // Detect custom provider: saved URL doesn't match any preset
        setIsCustomProvider(
          isLocal
            ? !LOCAL_PRESETS.some((p) => p.baseUrl === config.baseUrl)
            : !PRESETS.some((p) => p.baseUrl === config.baseUrl)
        );
      } else {
        setMode('cloud');
        setIsCustomProvider(false);
      }
      setTestResult(null);
      setSaved(false);
      setModelList([]);
      setModelListError(null);
      setModelFilter('');
      setShowModelPicker(false);
      setScanResults(new Map());
      setHasScanned(false);
      setImportError(null);
      setOriginCopied(false);
    const exa = getExaConfig();
    setSearchProvider(exa.provider);
    setExaApiKey(exa.apiKey);
    setAnysearchApiKey(exa.anysearchApiKey);
    setExaEnabled(exa.enabled);
    setShowExaKey(false);
    setExaTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // API Key is optional in local CLI mode (Ollama, Claude Code proxy, etc. usually need no key)
  const isValid = baseUrl.trim() && model.trim() && (mode === 'local' || apiKey.trim());

  const canFetchModels = baseUrl.trim() && (mode === 'local' || apiKey.trim());

  const handleFetchModels = async () => {
    if (!canFetchModels || fetchingModels) return;
    setFetchingModels(true);
    setModelListError(null);
    const result = await fetchAvailableModels(baseUrl, apiKey);
    if (result.ok) {
      setModelList(result.models);
      setShowModelPicker(true);
      setModelFilter('');
    } else {
      setModelList([]);
      setShowModelPicker(false);
      setModelListError(result.message);
    }
    setFetchingModels(false);
  };

  const filteredModels = modelFilter.trim()
    ? modelList.filter((m) => m.toLowerCase().includes(modelFilter.trim().toLowerCase()))
    : modelList;

  const handleSelectModel = (m: string) => {
    setModel(m);
    setShowModelPicker(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!isValid) return;
    setTesting(true);
    setTestResult(null);
    const result = await testApiConnection({ baseUrl, apiKey, model } as UserApiConfig);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = () => {
    if (!isValid) return;
    try {
    saveApiConfig({ baseUrl, apiKey, model } as UserApiConfig);
    // Persist real-time search config alongside the model config
    saveExaConfig({ provider: searchProvider, apiKey: exaApiKey, anysearchApiKey, enabled: exaEnabled });
    } catch {
      setSaveError(zh ? '浏览器无法保存配置，请检查存储权限或清理空间后重试。' : 'Your browser could not save the configuration. Check storage permissions or free up space and retry.');
      return;
    }
    setSaveError(null);
    setSaved(true);
    onSaved?.();
    setTimeout(() => onClose(), 600);
  };

  const handleTestExa = async () => {
    if (exaTesting) return;
    // Exa requires a key; AnySearch can be tested anonymously
    if (searchProvider === 'exa' && !exaApiKey.trim()) return;
    setExaTesting(true);
    setExaTestResult(null);
    const key = searchProvider === 'anysearch' ? anysearchApiKey : exaApiKey;
    const result = await testExaConnection(key, searchProvider);
    setExaTestResult(result);
    setExaTesting(false);
  };

  const handleClear = () => {
    try { clearApiConfig(); }
    catch { setSaveError(zh ? '浏览器无法清除配置，请检查存储权限。' : 'Your browser could not clear the configuration. Check storage permissions.'); return; }
    setSaveError(null);
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setTestResult(null);
  };

  // Export current config as a downloadable JSON file
  const handleExport = () => {
    if (!isValid) return;
    const data = JSON.stringify({ baseUrl, apiKey, model }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model-api-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import config from a JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (typeof parsed.baseUrl !== 'string' || typeof parsed.model !== 'string') {
          throw new Error('invalid');
        }
        const importedBase: string = parsed.baseUrl;
        const importedIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(importedBase);
        setMode(importedIsLocal ? 'local' : 'cloud');
        setAdvancedOpen(importedIsLocal);
        setBaseUrl(importedBase);
        setApiKey(typeof parsed.apiKey === 'string' ? parsed.apiKey : '');
        setModel(parsed.model);
        const presets = importedIsLocal ? LOCAL_PRESETS : PRESETS;
        setIsCustomProvider(!presets.some((p) => p.baseUrl === importedBase));
        setTestResult(null);
        setImportError(null);
      } catch {
        setImportError(zh ? '配置文件格式无效' : 'Invalid configuration file');
      }
    };
    reader.readAsText(file);
  };

  // Copy the current page origin (for adding to a local CLI's CORS allowlist)
  const handleCopyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setOriginCopied(true);
      setTimeout(() => setOriginCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; silently ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '模型 API 设置' : 'Model API Settings'}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {zh ? '模型 API 设置' : 'Model API Settings'}
          </h2>
          <button
            onClick={onClose}
            className="p-3 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={zh ? '关闭' : 'Close'}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
          <p className="text-sm text-gray-500 leading-relaxed">
            {zh
              ? '完成基础配置即可分析；联网搜索和快速信号可稍后设置。配置保存在此浏览器。分析请求会发送给所选服务商，必要时经本站代理转发。'
              : 'Complete the basic setup to start. Search and quick signals are optional. Your config is saved in this browser. Analysis requests go to your chosen provider, through this site’s proxy when needed.'}
          </p>

          <h3 className="text-sm font-semibold text-gray-900">{zh ? '基础配置 · 服务商、密钥与模型' : 'Basic setup · Provider, key and model'}</h3>


          <div className="space-y-5" hidden={mode === 'local' && !advancedOpen}>
          {/* Local mode: scan status bar */}
          {mode === 'local' && (
            <div className="flex items-center justify-between -mb-2">
              <span className="text-xs text-gray-500" role="status">
                {scanning
                  ? (zh ? '正在扫描本机 CLI 服务…' : 'Scanning local CLI services…')
                  : hasScanned
                    ? (() => {
                        const onlineCount = LOCAL_PRESETS.filter((p) => scanResults.get(p.baseUrl)?.status === 'online').length;
                        const corsCount = LOCAL_PRESETS.filter((p) => scanResults.get(p.baseUrl)?.status === 'cors-blocked').length;
                        if (onlineCount > 0) return zh ? `检测到 ${onlineCount} 个可用服务` : `${onlineCount} service(s) available`;
                        if (corsCount > 0) return zh ? '检测到运行中的服务，但跨域被拦截' : 'Service running but CORS-blocked';
                        return zh ? '未检测到运行中的本机服务' : 'No running local services detected';
                      })()
                    : ''}
              </span>
              <button
                type="button"
                onClick={() => runLocalScan(false)}
                disabled={scanning}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-500 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scanning ? (zh ? '扫描中…' : 'Scanning…') : (zh ? '重新扫描' : 'Rescan')}
              </button>
            </div>
          )}

          {/* Presets */}
          <div className="flex flex-wrap gap-2" role="group" aria-label={zh ? '选择提供方' : 'Select provider'}>
            {(mode === 'local' ? LOCAL_PRESETS : PRESETS).map((p) => {
              const scan = mode === 'local' ? scanResults.get(p.baseUrl) : undefined;
              const status: LocalServiceStatus | undefined = scan?.status;
              const dotColor =
                status === 'online' ? 'bg-green-500'
                : status === 'cors-blocked' ? 'bg-amber-500'
                : status === 'offline' ? 'bg-gray-300'
                : '';
              const statusLabel =
                status === 'online' ? (zh ? '运行中' : 'online')
                : status === 'cors-blocked' ? (zh ? '跨域受限' : 'CORS blocked')
                : status === 'offline' ? (zh ? '未运行' : 'offline')
                : '';
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setIsCustomProvider(false);
                    setBaseUrl(p.baseUrl);
                    setTestResult(null);
                    setModelListError(null);
                    // If scan already fetched this service's models, populate immediately
                    if (scan?.status === 'online' && scan.models.length > 0) {
                      setModelList(scan.models);
                      setShowModelPicker(true);
                      setModelFilter('');
                    } else {
                      setModelList([]);
                      setShowModelPicker(false);
                    }
                  }}
                  title={statusLabel || undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    !isCustomProvider && baseUrl === p.baseUrl
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {mode === 'local' && (
                    scanning && !status ? (
                      <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" aria-hidden="true" />
                    ) : dotColor ? (
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
                    ) : null
                  )}
                  {p.label}
                  {'badge' in p && p.badge && (
                    <span className={`ml-0.5 px-1.5 py-px text-[10px] font-bold leading-none rounded-full ${
                      !isCustomProvider && baseUrl === p.baseUrl
                        ? 'bg-white text-gray-900'
                        : 'bg-red-500 text-white'
                    }`}>
                      {p.badge}
                    </span>
                  )}
                  {mode === 'local' && statusLabel && (
                    <span className="sr-only">({statusLabel})</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => {
                setIsCustomProvider(true);
                setBaseUrl('');
                setTestResult(null);
                setModelList([]);
                setShowModelPicker(false);
                setModelListError(null);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                isCustomProvider
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {zh ? '自定义' : 'Custom'}
            </button>
          </div>

          {/* Local preset setup hint (status-aware) */}
          {mode === 'local' && !isCustomProvider && (() => {
            const activePreset = LOCAL_PRESETS.find((p) => p.baseUrl === baseUrl);
            if (!activePreset) return null;
            const status = scanResults.get(activePreset.baseUrl)?.status;
            if (status === 'online') {
              return (
                <div className="px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 leading-relaxed -mt-2">
                  {zh
                    ? `${activePreset.label} 正在运行且可访问，模型列表已自动获��。`
                    : `${activePreset.label} is running and accessible. Models were fetched automatically.`}
                </div>
              );
            }
            if (status === 'cors-blocked') {
              return (
                <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed -mt-2 space-y-2">
                  <p>
                    {zh
                      ? `${activePreset.label} 正在运行，但浏览器跨域访问被拦截。请将本页面来源加入该服务的 CORS 白名单，或在启动时允许跨域。${activePreset.hintZh}`
                      : `${activePreset.label} is running but browser CORS access is blocked. Add this page's origin to the service's CORS allowlist, or allow cross-origin on startup. ${activePreset.hintEn}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 rounded bg-amber-100 text-amber-900 font-mono text-[11px] break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyOrigin}
                      className="shrink-0 px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-700 font-medium hover:bg-amber-100 transition-colors"
                    >
                      {originCopied ? (zh ? '已复制' : 'Copied') : (zh ? '复制来源' : 'Copy origin')}
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed -mt-2">
                {status === 'offline' && (
                  <span className="font-medium">{zh ? '未检测到该服务。' : 'Service not detected. '}</span>
                )}
                {zh ? activePreset.hintZh : activePreset.hintEn}
              </div>
            );
          })()}

          {/* Local custom provider hint */}
          {mode === 'local' && isCustomProvider && (
            <p className="text-xs text-gray-400 -mt-2">
              {zh
                ? '填写本机任意 OpenAI 兼容服务的地址，如 http://localhost:8000/v1。注意本地服务需允许浏览器跨域访问（CORS）。'
                : 'Enter any OpenAI-compatible endpoint on your machine, e.g. http://localhost:8000/v1. The local server must allow browser CORS access.'}
            </p>
          )}

          {/* Cloud preset hint (e.g. where to get an API key) */}
          {mode === 'cloud' && !isCustomProvider && (() => {
            const activePreset = PRESETS.find((p) => p.baseUrl === baseUrl);
            if (!activePreset?.hintZh) return null;
            return (
              <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed -mt-2 space-y-1.5">
                <p>{zh ? activePreset.hintZh : activePreset.hintEn}</p>
                {activePreset.keyUrl && (
                  <a
                    href={activePreset.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center font-medium text-blue-700 underline hover:text-blue-900"
                  >
                    {zh ? '前往创建 API Key →' : 'Create an API key →'}
                  </a>
                )}
              </div>
            );
          })()}

          {/* Cloud custom provider hint */}
          {mode === 'cloud' && isCustomProvider && (
            <p className="text-xs text-gray-400 -mt-2">
              {zh
                ? '填写自建或第三方中转服务的 OpenAI 兼容地址，通常以 /v1 结尾（如 https://your-proxy.com/v1）。'
                : 'Enter the OpenAI-compatible endpoint of your self-hosted or proxy service, usually ending in /v1 (e.g. https://your-proxy.com/v1).'}
            </p>
          )}

          {/* Presets supply the address; editing remains available for custom endpoints. */}
          <details key={`${mode}-${isCustomProvider}`} open={isCustomProvider || mode === 'local'} className="rounded-lg border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm text-stone-600">{isCustomProvider || mode === 'local' ? (zh ? '自定义连接地址' : 'Custom endpoint') : (zh ? '连接地址 · 已随服务商填入' : 'Endpoint · Filled by provider')}</summary>
          <div className="mt-3 space-y-1.5">
            <label htmlFor="api-base-url" className="block text-sm font-medium text-gray-700">
              {zh ? '调用地址 (Base URL)' : 'Base URL'}
            </label>
            <input
              id="api-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => {
                const value = e.target.value;
                setBaseUrl(value);
                setTestResult(null);
                // Keep preset highlight in sync when typing manually
                const presets = mode === 'local' ? LOCAL_PRESETS : PRESETS;
                setIsCustomProvider(!presets.some((p) => p.baseUrl === value));
              }}
              placeholder={
                mode === 'local'
                  ? 'http://localhost:3456/v1'
                  : isCustomProvider ? 'https://your-proxy.com/v1' : 'https://openrouter.ai/api/v1'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          </details>

          {/* API Key (optional in local mode) */}
          <div className="space-y-1.5">
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700">
              API Key {mode === 'local' && <span className="text-xs text-gray-400 font-normal">({zh ? '本机服务通常无需密钥' : 'usually not needed for local CLI'})</span>}
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder={mode === 'local' ? (zh ? '（可选）' : '(optional)') : 'sk-...'}
                className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                {showKey ? (zh ? '隐藏' : 'Hide') : (zh ? '显示' : 'Show')}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="api-model" className="block text-sm font-medium text-gray-700">
                {zh ? '模型名称' : 'Model Name'}
              </label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={!canFetchModels || fetchingModels}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-500 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetchingModels
                  ? (zh ? '获取中…' : 'Fetching…')
                  : (zh ? '获取模型列表' : 'Fetch Models')}
              </button>
            </div>
            <input
              id="api-model"
              type="text"
              value={model}
              onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
              placeholder={
                (mode === 'local' ? LOCAL_PRESETS : PRESETS).find((p) => p.baseUrl === baseUrl)?.modelPlaceholder
                  || (mode === 'local' ? 'claude-sonnet-4-5' : 'deepseek/deepseek-chat-v3.1:free')
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />

            {/* Model list fetch error */}
            {modelListError && (
              <p role="alert" className="text-xs text-red-600">
                {zh ? `获取模型列表失败：${modelListError}` : `Failed to fetch models: ${modelListError}`}
              </p>
            )}

            {/* Model picker */}
            {showModelPicker && modelList.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <input
                    type="text"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder={zh ? '搜索模型…' : 'Filter models…'}
                    className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                    aria-label={zh ? '搜索模型' : 'Filter models'}
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {zh ? `共 ${filteredModels.length} 个` : `${filteredModels.length} models`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowModelPicker(false)}
                    className="text-xs text-gray-400 hover:text-gray-700"
                    aria-label={zh ? '收起列表' : 'Collapse list'}
                  >
                    {zh ? '收起' : 'Hide'}
                  </button>
                </div>
                <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100" role="listbox" aria-label={zh ? '可用模型' : 'Available models'}>
                  {filteredModels.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-gray-400">
                      {zh ? '没有匹配的模型' : 'No matching models'}
                    </li>
                  ) : (
                    filteredModels.map((m) => (
                      <li key={m}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={m === model}
                          onClick={() => handleSelectModel(m)}
                          className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                            m === model
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {m}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {/* Re-open picker shortcut when collapsed but list already fetched */}
            {!showModelPicker && modelList.length > 0 && (
              <button
                type="button"
                onClick={() => setShowModelPicker(true)}
                className="text-xs text-gray-500 hover:text-gray-800 animated-underline"
              >
                {zh ? `从已获取的 ${modelList.length} 个模型中选择` : `Choose from ${modelList.length} fetched models`}
              </button>
            )}

            <p className="text-xs text-gray-400">
              {zh
                ? '建议选择支持 JSON 输出的模型，以获得最佳分析效果。'
                : 'Models with JSON output support are recommended for best results.'}
            </p>
          </div>

          </div>

          <details className="rounded-xl border border-stone-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">{zh ? '快速信号 · Jev（可选）' : 'Quick signals · Jev (optional)'}</summary>
            <div className="mt-4"><JevSettings /></div>
          </details>

          <details className="rounded-xl border border-stone-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">{zh ? '联网增强 · 搜索最新资料（可选）' : 'Web search · Latest sources (optional)'}</summary>
          {/* Real-time search (Exa / AnySearch) */}
          <div className="space-y-2.5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor="exa-enabled" className="block text-sm font-medium text-gray-700">
                  {zh ? '实时搜索' : 'Real-time Search'}
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  {zh
                    ? '开启后，生成报告前会搜索该主题的最新网络资料并注入分析，适用于任何模型。'
                    : 'When on, the latest web results for your topic are fetched and injected before analysis. Works with any model.'}
                </p>
              </div>
              <button
                type="button"
                id="exa-enabled"
                role="switch"
                aria-checked={exaEnabled}
                onClick={() => setExaEnabled((v) => !v)}
                disabled={!searchToggleReady}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  exaEnabled && searchToggleReady ? 'bg-gray-900' : 'bg-gray-300'
                }`}
                aria-label={zh ? '开启实时搜索' : 'Enable real-time search'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    exaEnabled && searchToggleReady ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Provider selector */}
            <div className="flex gap-2" role="radiogroup" aria-label={zh ? '搜索服务商' : 'Search provider'}>
              {([
                { id: 'exa' as SearchProvider, label: 'Exa' },
                { id: 'anysearch' as SearchProvider, label: 'AnySearch' },
              ]).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={searchProvider === p.id}
                  onClick={() => {
                    setSearchProvider(p.id);
                    setExaTestResult(null);
                    // Keep the toggle consistent: Exa needs a key to stay on
                    if (p.id === 'exa' && !exaApiKey.trim()) setExaEnabled(false);
                  }}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                    searchProvider === p.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {searchProvider === 'exa' ? (
              <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed">
                <p>
                  {zh
                    ? '在 exa.ai 创建 API Key 并填入下方，开启开关后即可在分析时自动联网获取最新信息。'
                    : 'Create an API key at exa.ai and paste it below, then toggle on to enrich analysis with live web data.'}
                </p>
                <a
                  href="https://dashboard.exa.ai/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center font-medium text-blue-700 underline hover:text-blue-900 mt-1"
                >
                  {zh ? '前往创建 Exa API Key →' : 'Create an Exa API key →'}
                </a>
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed">
                <p>
                  {zh
                    ? 'AnySearch 聚合多个数据源并智能路由。支持匿名免费额度（无需 Key 即可开启）；填写 API Key 可获得更高配额与并发。'
                    : 'AnySearch aggregates multiple sources with smart routing. A free anonymous tier works without a key; add an API key for higher quota and concurrency.'}
                </p>
                <a
                  href="https://anysearch.com/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center font-medium text-blue-700 underline hover:text-blue-900 mt-1"
                >
                  {zh ? '查看 AnySearch 文档 →' : 'View AnySearch docs →'}
                </a>
              </div>
            )}

            <div className="relative">
              {searchProvider === 'exa' ? (
                <input
                  id="exa-api-key"
                  type={showExaKey ? 'text' : 'password'}
                  value={exaApiKey}
                  onChange={(e) => {
                    setExaApiKey(e.target.value);
                    setExaTestResult(null);
                    if (!e.target.value.trim()) setExaEnabled(false);
                  }}
                  placeholder="Exa API Key"
                  className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              ) : (
                <input
                  id="anysearch-api-key"
                  type={showExaKey ? 'text' : 'password'}
                  value={anysearchApiKey}
                  onChange={(e) => {
                    setAnysearchApiKey(e.target.value);
                    setExaTestResult(null);
                  }}
                  placeholder={zh ? 'AnySearch API Key（可选，留空使用免费额度）' : 'AnySearch API Key (optional, blank = free tier)'}
                  className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              )}
              <button
                type="button"
                onClick={() => setShowExaKey(!showExaKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                {showExaKey ? (zh ? '隐藏' : 'Hide') : (zh ? '显示' : 'Show')}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestExa}
                disabled={exaTesting || (searchProvider === 'exa' && !exaApiKey.trim())}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-500 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exaTesting
                  ? (zh ? '测试中…' : 'Testing…')
                  : (zh ? '测试连接' : 'Test Connection')}
              </button>
              {exaTestResult && (
                <span className={`text-xs ${exaTestResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {exaTestResult.ok
                    ? (zh ? '连接成功' : 'Connected')
                    : (zh ? `失败：${exaTestResult.message}` : `Failed: ${exaTestResult.message}`)}
                </span>
              )}
            </div>
          </div>

          </details>
          <details open={advancedOpen} onToggle={e => setAdvancedOpen(e.currentTarget.open)} className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-600">{zh ? '高级设置' : 'Advanced settings'}{mode === 'local' && <span className="ml-2 text-xs text-gray-500">{zh ? '当前使用本机配置' : 'Local configuration active'}</span>}</summary>
            <p className="my-3 text-xs text-gray-500">{zh ? '本机 CLI 适用于在当前电脑运行的 Ollama 或模型代理。折叠此处不会改变已保存的配置。' : 'Local CLI connects to Ollama or a model proxy on this computer. Collapsing this section keeps your saved configuration.'}</p>
          {/* Mode switch: Cloud API vs Local CLI */}
          <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50" role="tablist" aria-label={zh ? '连接模式' : 'Connection mode'}>
            {([
              { value: 'cloud' as const, labelZh: '云端 API', labelEn: 'Cloud API' },
              { value: 'local' as const, labelZh: '本机 CLI', labelEn: 'Local CLI' },
            ]).map((m) => (
              <button
                key={m.value}
                role="tab"
                aria-selected={mode === m.value}
                onClick={() => {
                  if (mode === m.value) return;
                  setMode(m.value);
                  setIsCustomProvider(false);
                  setBaseUrl(m.value === 'local' ? LOCAL_PRESETS[0].baseUrl : '');
                  setTestResult(null);
                  setModelList([]);
                  setShowModelPicker(false);
                  setModelListError(null);
                }}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === m.value
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {zh ? m.labelZh : m.labelEn}
              </button>
            ))}
          </div>

          </details>
          {/* Test result */}
          {testResult && (
            <div
              role="status"
              className={`px-4 py-3 rounded-lg text-sm ${
                testResult.ok
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {testResult.ok
                ? (zh ? '连接成功，模型可用！' : 'Connection successful. Model is available!')
                : (zh ? `连接失败：${testResult.message}` : `Connection failed: ${testResult.message}`)}
            </div>
          )}

          {saved && (
            <div role="status" className="px-4 py-3 rounded-lg text-sm bg-green-50 text-green-800 border border-green-200">
              {zh ? '配置已保存' : 'Settings saved'}
            </div>
          )}

          {importError && (
            <div role="alert" className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
              {importError}
            </div>
          )}

          {/* Import / Export config */}
          <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              {zh ? '导入配置' : 'Import config'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!isValid}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {zh ? '导出配置' : 'Export config'}
            </button>
            <span className="text-xs text-gray-300">
              {zh ? '便于在多设备间迁移' : 'Move settings across devices'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={handleClear}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              {zh ? '清除配置' : 'Clear'}
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={!isValid || testing}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (zh ? '测试中…' : 'Testing…') : (zh ? '测试连接' : 'Test Connection')}
              </button>
              <button
                onClick={handleSave}
                disabled={!isValid}
                className="px-5 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startAfterSave ? (zh ? '保存并开始分析' : 'Save and analyze') : (zh ? '保存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiSettingsModal;
