import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../hooks/useI18n';
import { analyzeTacoSignals } from '../services/geminiService';
import { isApiConfigured } from '../services/apiConfigService';
import { type NewsSource } from '../services/newsService';
import { gatherIndicatorArticles, TACO_QUERIES } from '../services/indicatorNewsService';
import { deriveTacoPhase, computeEdgeDecay, decayBand, type TacoScanResult, type TacoPhase } from '../utils/tacoUtils';
import { loadHistory, recordHistoryPoint, isScanStale, toEpochMs, loadAutoRefresh, saveAutoRefresh, type HistoryPoint } from '../utils/indicatorHistory';
import Sparkline from './Sparkline';
import { SparklesIcon } from './icons/Icons';

const STORAGE_KEY = 'taco-monitor';
const HISTORY_KEY = 'taco-monitor-history';
/** Auto-rescan when the stored scan is older than this. */
const AUTO_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

const loadStored = (): TacoScanResult | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return raw && Array.isArray(raw.signals) ? raw : null;
  } catch {
    return null;
  }
};

const saveStored = (scan: TacoScanResult) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scan));
  } catch { /* best-effort */ }
};

// Cycle phases shown in the stepper, in game order
const CYCLE_PHASES: TacoPhase[] = ['threat', 'panic', 'walkback'];

const PHASE_STYLES: Record<TacoPhase, { text: string; bg: string; border: string }> = {
  quiet: { text: 'text-gray-500', bg: 'bg-gray-400', border: 'border-gray-300' },
  threat: { text: 'text-amber-700', bg: 'bg-amber-500', border: 'border-amber-400' },
  panic: { text: 'text-red-700', bg: 'bg-red-500', border: 'border-red-400' },
  walkback: { text: 'text-emerald-700', bg: 'bg-emerald-500', border: 'border-emerald-400' },
  complacency: { text: 'text-purple-700', bg: 'bg-purple-500', border: 'border-purple-400' },
};

const DECAY_STYLES: Record<string, string> = {
  fresh: 'text-emerald-700',
  known: 'text-amber-700',
  crowded: 'text-red-700',
};

const SIGNAL_KEYS = ['threatEscalation', 'marketPanic', 'walkback', 'complacency', 'tacoMentions'] as const;

const TacoMonitor: React.FC<{ sources: NewsSource[] }> = ({ sources }) => {
  const { t, locale } = useI18n();
  const [scan, setScan] = useState<TacoScanResult | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const autoScanTried = useRef(false);

  useEffect(() => {
    setScan(loadStored());
    setHistory(loadHistory(HISTORY_KEY));
    setAutoRefresh(loadAutoRefresh());
  }, []);

  const handleAutoRefreshToggle = () => {
    const next = !autoRefresh;
    setAutoRefresh(next);
    saveAutoRefresh(next);
  };

  const runScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      // Targeted search (if enabled) + display RSS + English-finance RSS pack
      const { articles } = await gatherIndicatorArticles(sources, TACO_QUERIES);
      const result = await analyzeTacoSignals(articles, locale);
      setScan(result);
      saveStored(result);
      // Record the edge-decay value (TACO crowding proxy) as the trend series
      const decayPoint = computeEdgeDecay(result.signals);
      if (decayPoint != null) {
        const at = toEpochMs(result.scannedAt) ?? Date.now();
        setHistory(recordHistoryPoint(HISTORY_KEY, { at, value: decayPoint }));
      }
    } catch (err) {
      console.error('TACO scan failed:', err instanceof Error ? err.message : err);
      setScanError(t('taco.scanError'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleScan = async () => {
    if (!isApiConfigured()) {
      setScanError(t('taco.noApi'));
      return;
    }
    await runScan();
  };

  // Auto-refresh: on mount, if enabled and the stored scan is stale, rescan
  // silently with the user's own model. Runs at most once per page load.
  useEffect(() => {
    if (autoScanTried.current) return;
    const stored = loadStored();
    if (!loadAutoRefresh() || !isApiConfigured()) return;
    if (!isScanStale(stored?.scannedAt, AUTO_REFRESH_TTL_MS)) return;
    autoScanTried.current = true;
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseResult = scan ? deriveTacoPhase(scan.signals) : null;
  const phase = phaseResult?.phase ?? null;
  const decay = scan ? computeEdgeDecay(scan.signals) : null;
  const dBand = decay != null ? decayBand(decay) : null;
  const phaseStyle = phase ? PHASE_STYLES[phase] : null;

  return (
    <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-lg font-bold text-gray-900">{t('taco.title')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoRefreshToggle}
            role="switch"
            aria-checked={autoRefresh}
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-black transition-colors"
            title={t('indicator.autoRefreshHint')}
          >
            <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${autoRefresh ? 'bg-black' : 'bg-gray-300'}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${autoRefresh ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </span>
            {t('indicator.autoRefresh')}
          </button>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <SparklesIcon className={`w-3.5 h-3.5 ${isScanning ? 'animate-pulse' : ''}`} />
            {isScanning ? t('taco.scanning') : scan ? t('taco.rescan') : t('taco.scanNow')}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('taco.subtitle')}</p>

      {scanError && <p className="text-xs text-red-600 mb-3">{scanError}</p>}

      {/* Phase stepper */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t('taco.phaseLabel')}</span>
          {phase && phaseResult ? (
            <span className="flex items-baseline gap-2">
              <span className={`text-base font-bold ${phaseStyle?.text}`}>{t(`taco.phase.${phase}`)}</span>
              <span className="text-[10px] text-gray-400">{t('taco.confidence', { value: String(phaseResult.confidence) })}</span>
            </span>
          ) : (
            <span className="text-sm text-gray-400">{t('taco.noData')}</span>
          )}
        </div>
        <ol className="flex items-center gap-1.5" aria-label={t('taco.phaseLabel')}>
          {CYCLE_PHASES.map((p, i) => {
            const active = phase === p;
            const style = PHASE_STYLES[p];
            return (
              <React.Fragment key={p}>
                {i > 0 && <span className="text-gray-300 text-xs shrink-0">→</span>}
                <li
                  className={`flex-1 text-center px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    active ? `${style.border} ${style.text} bg-stone-50 shadow-sm font-bold` : 'border-stone-200 text-gray-400'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {t(`taco.phase.${p}`)}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
        {(phase === 'complacency' || phase === 'quiet') && (
          <p className={`mt-2 text-xs font-medium ${phaseStyle?.text}`}>
            {phase === 'complacency' ? t('taco.complacencyNote') : t('taco.quietNote')}
          </p>
        )}
      </div>

      {/* Edge decay meter */}
      <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-stone-600">{t('taco.decayLabel')}</span>
          {decay != null && dBand ? (
            <span className="flex items-baseline gap-2">
              <span className={`text-sm font-bold ${DECAY_STYLES[dBand]}`}>{decay}</span>
              <span className={`text-[10px] font-semibold ${DECAY_STYLES[dBand]}`}>{t(`taco.decay.${dBand}`)}</span>
            </span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-red-300 relative">
          {decay != null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow bg-gray-800"
              style={{ left: `calc(${decay}% - 6px)` }}
            />
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{t('taco.decayHint')}</p>
        {history.length >= 2 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-200/70">
            <span className="text-[10px] text-gray-400">
              {t('indicator.trendLabel', { count: String(history.length) })}
            </span>
            <span className={dBand ? DECAY_STYLES[dBand] : 'text-gray-400'}>
              <Sparkline points={history} ariaLabel={t('indicator.trendAria')} />
            </span>
          </div>
        )}
      </div>

      {/* Scan meta + signals detail */}
      {scan && (
        <p className="text-[10px] text-gray-400 mb-2">
          {t('taco.lastScan', {
            count: String(scan.articleCount),
            time: new Date(scan.scannedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          })}
        </p>
      )}
      {scan && scan.signals.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs font-medium text-gray-500 hover:text-black transition-colors mb-2"
            aria-expanded={expanded}
          >
            {expanded ? t('taco.hideSignals') : t('taco.showSignals')}
          </button>
          {expanded && (
            <ul className="space-y-2.5">
              {SIGNAL_KEYS.map(key => {
                const signal = scan.signals.find(s => s.key === key);
                if (!signal) return null;
                return (
                  <li key={key} className="text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-700">{t(`taco.signal.${key}`)}</span>
                      <span className="font-bold text-gray-900">{signal.strength}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full ${signal.strength >= 60 ? 'bg-red-500' : signal.strength >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${signal.strength}%` }}
                      />
                    </div>
                    <p className="text-gray-500 leading-relaxed">{signal.evidence}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-4 pt-3 border-t border-stone-100 leading-relaxed">{t('taco.disclaimer')}</p>
    </div>
  );
};

export default TacoMonitor;
