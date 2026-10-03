import JevNewsSignals from './JevNewsSignals';
import { sanitizeNewsHtml } from '../utils/newsHtml';
import { useDialog } from '../hooks/useDialog';
import React, { useState, useEffect } from 'react';
import { NewspaperIcon, SparklesIcon, XIcon, ExternalLinkIcon } from './icons/Icons';
import { useI18n } from '../hooks/useI18n';
import { extractNewsConcepts } from '../services/geminiService';
import { isApiConfigured } from '../services/apiConfigService';
import {
  fetchNewsSource,
  NEWS_SOURCES,
  loadCustomSources,
  saveCustomSources,
  getDisplaySources,
  loadSourcePrefs,
  saveSourcePrefs,
  applySourcePrefs,
  moveId,
  type NewsArticle,
  type NewsSource,
  type SourcePrefs,
} from '../services/newsService';

// Type-only re-exports keep Fast Refresh working (constants must be imported
// from services/newsService directly — a value re-export here breaks HMR).
export type { NewsArticle, NewsSource };

const SOURCE_COLORS: { [key: string]: string } = {
  '极客洞察': 'bg-gray-100 text-gray-800',
  '雪球': 'bg-gray-100 text-gray-800',
  '虎嗅': 'bg-gray-100 text-gray-800',
  '彭博': 'bg-gray-100 text-gray-800',
  'Buzzing': 'bg-gray-100 text-gray-800',
  'Ahead of AI': 'bg-gray-100 text-gray-800',
};

// --- Helpers ---
const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

const truncateText = (text: string, length: number) => {
  return text.length > length ? text.substring(0, length) + '...' : text;
};

// --- Concept tag cache (avoid repeated AI calls for the same articles) ---
const CONCEPT_CACHE_KEY = 'news-concept-tags';
const CONCEPT_CACHE_MAX = 120;
const AUTO_EXTRACT_KEY = 'news-auto-extract';

const loadConceptCache = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(CONCEPT_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveConceptCache = (cache: Record<string, string[]>) => {
  try {
    const keys = Object.keys(cache);
    // Prune oldest entries (insertion order) when the cache grows too large
    if (keys.length > CONCEPT_CACHE_MAX) {
      for (const key of keys.slice(0, keys.length - CONCEPT_CACHE_MAX)) {
        delete cache[key];
      }
    }
    localStorage.setItem(CONCEPT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable — cache is best-effort */
  }
};

// --- News Detail Modal ---
const NewsDetailModal: React.FC<{
  article: NewsArticle | null;
  onClose: () => void;
  onAnalyze: (topic: string) => void;
}> = ({ article, onClose, onAnalyze }) => {
  const { t } = useI18n();
  const dialogRef = useDialog(!!article, onClose);
  if (!article) return null;

  const createMarkup = (htmlString: string) => {
    return { __html: sanitizeNewsHtml(htmlString) };
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="news-modal-title"
    >
      <div
        className="bg-white p-4 sm:p-6 mx-4 max-w-2xl w-full h-[80dvh] flex flex-col text-left relative animate-reveal-scale rounded-2xl shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start pb-4 border-b border-gray-200">
          <h2 id="news-modal-title" className="text-xl font-bold text-gray-800 pr-8">
            {article.title}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="mt-4 flex-grow min-h-0 overflow-y-auto pr-4 text-gray-700 leading-relaxed prose prose-sm max-w-none" style={{ scrollbarWidth: 'thin' }}>
          <div dangerouslySetInnerHTML={createMarkup(article.description)} />
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200 flex flex-wrap justify-between items-center gap-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-gray-100 text-gray-800">
            {article.sourceName}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-white border border-gray-300 text-black text-sm font-medium rounded-xl shadow-sm hover:bg-gray-100 transition-all"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              查看原文
            </a>
            <button
              onClick={() => {
                onClose();
                onAnalyze(`${article.title}\n\n${stripHtml(article.description)}`);
              }}
              className="inline-flex items-center gap-2 min-h-11 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl shadow-sm hover:bg-gray-800 transition-all"
            >
              <SparklesIcon className="w-4 h-4" />
              {t('latestNews.analyzeButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Skeleton ---
const NewsSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="animate-pulse flex space-x-4">
        <div className="flex-1 space-y-3 py-1">
          <div className="h-4 bg-slate-200/80 rounded w-3/4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-200/80 rounded"></div>
            <div className="h-3 bg-slate-200/80 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// --- LatestNews ---
interface LatestNewsProps {
  onAnalyze: (topic: string) => void;
  sources: NewsSource[];
}

const LatestNews: React.FC<LatestNewsProps> = ({ onAnalyze, sources }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeSourceId, setActiveSourceId] = useState<string>('xueqiu'); // Default to 雪球
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [customSources, setCustomSources] = useState<NewsSource[]>(() => loadCustomSources());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [sourcePrefs, setSourcePrefs] = useState<SourcePrefs>(() => loadSourcePrefs());
  const [showManagePanel, setShowManagePanel] = useState(false);
  // Dragged tab id: ref is the source of truth (state updates don't commit
  // between dragstart and drop); state only drives the dim style.
  const draggingIdRef = React.useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startDrag = (id: string | null) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  };
  const [conceptTags, setConceptTags] = useState<Record<string, string[]>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_EXTRACT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { t, locale } = useI18n();

  const toggleAutoExtract = () => {
    setAutoExtract(prev => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_EXTRACT_KEY, next ? '1' : '0');
      } catch { /* best-effort */ }
      return next;
    });
  };

  // Extract tags for articles not present in `known`, merging results into state + cache
  const runExtraction = async (known: Record<string, string[]>) => {
    if (isExtracting) return;
    const pending = articles.filter(a => !known[a.link]?.length);
    if (pending.length === 0) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const tagsList = await extractNewsConcepts(
        pending.map(a => ({ title: a.title, description: stripHtml(a.description) })),
        locale
      );
      const cache = loadConceptCache();
      const next = { ...known };
      pending.forEach((article, i) => {
        if (tagsList[i]?.length) {
          next[article.link] = tagsList[i];
          cache[article.link] = tagsList[i];
        }
      });
      setConceptTags(next);
      saveConceptCache(cache);
    } catch (err) {
      console.error('Concept extraction failed:', err);
      setExtractError(t('latestNews.extractError'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractConcepts = () => runExtraction(conceptTags);

  // Restore cached tags for currently shown articles; auto-extract missing ones when enabled
  useEffect(() => {
    if (articles.length === 0) return;
    const cache = loadConceptCache();
    const restored: Record<string, string[]> = {};
    for (const article of articles) {
      if (cache[article.link]?.length) restored[article.link] = cache[article.link];
    }
    setConceptTags(restored);
    setExtractError(null);
    // Only auto-run when the user enabled it AND a model is configured (avoids error toasts on fresh installs)
    if (autoExtract && isApiConfigured() && articles.some(a => !restored[a.link]?.length)) {
      runExtraction(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, autoExtract]);

  // All user-manageable sources (before user hide/order prefs)
  const manageableSources = React.useMemo(
    () => getDisplaySources(customSources),
    [customSources]
  );

  // Tabs: manageable sources with user prefs applied (hide + drag order)
  const displaySources = React.useMemo(
    () => applySourcePrefs(manageableSources, sourcePrefs),
    [manageableSources, sourcePrefs]
  );

  const updatePrefs = (next: SourcePrefs) => {
    setSourcePrefs(next);
    saveSourcePrefs(next);
  };

  const toggleSourceHidden = (id: string) => {
    const hidden = sourcePrefs.hidden.includes(id)
      ? sourcePrefs.hidden.filter(h => h !== id)
      : [...sourcePrefs.hidden, id];
    updatePrefs({ ...sourcePrefs, hidden });
  };

  const handleTabDrop = (targetId: string) => {
    const fromId = draggingIdRef.current;
    if (!fromId || fromId === targetId) return;
    // Persist the full new tab order (current visible order with the move applied)
    const order = moveId(displaySources.map(s => s.id), fromId, targetId);
    updatePrefs({ ...sourcePrefs, order });
    startDrag(null);
  };

  // Active tab hidden or removed: fall back to the first visible tab
  useEffect(() => {
    if (displaySources.length > 0 && !displaySources.some(s => s.id === activeSourceId)) {
      setActiveSourceId(displaySources[0].id);
    }
  }, [displaySources, activeSourceId]);

  useEffect(() => {
    let cancelled = false;
    const fetchNews = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const source = displaySources.find(s => s.id === activeSourceId);
        if (!source) {
          setError(t('latestNews.errorNotFound'));
          return;
        }
        const list = await fetchNewsSource(source);
        if (!cancelled) setArticles(list.slice(0, 4));
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to fetch news (${activeSourceId}):`, errorMessage);
        const sourceName = displaySources.find(s => s.id === activeSourceId)?.name ?? activeSourceId;
        setError(t('latestNews.errorLoad', { sourceName }));
        setArticles([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchNews();
    return () => { cancelled = true; };
  }, [activeSourceId, displaySources, t, reloadKey]);

  const handleAddSource = () => {
    setAddError(null);
    const name = newSourceName.trim();
    const url = newSourceUrl.trim();
    if (!name || !url) {
      setAddError(t('latestNews.customSourceRequired'));
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
    } catch {
      setAddError(t('latestNews.customSourceInvalidUrl'));
      return;
    }
    const all = [...NEWS_SOURCES, ...customSources];
    if (all.some(s => s.url === url)) {
      setAddError(t('latestNews.customSourceDuplicate'));
      return;
    }
    const next = [...customSources, { id: `custom-${Date.now()}`, name, url, custom: true as const }];
    setCustomSources(next);
    saveCustomSources(next);
    setNewSourceName('');
    setNewSourceUrl('');
    setShowAddForm(false);
    setActiveSourceId(next[next.length - 1].id);
  };

  const handleRemoveSource = (id: string) => {
    const next = customSources.filter(s => s.id !== id);
    setCustomSources(next);
    saveCustomSources(next);
    if (activeSourceId === id) setActiveSourceId('xueqiu');
  };

  return (
    <>
      <NewsDetailModal article={selectedArticle} onClose={() => setSelectedArticle(null)} onAnalyze={onAnalyze} />
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-6 shadow-sm h-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-black rounded-xl shadow-lg">
            <NewspaperIcon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-black">{t('latestNews.title')}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4 mb-4">
          {displaySources.map(source => (
            <span
              key={source.id}
              className={`relative inline-flex items-center group/tab transition-opacity ${
                draggingId === source.id ? 'opacity-40' : ''
              }`}
              draggable
              onDragStart={e => {
                startDrag(source.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={e => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={e => {
                e.preventDefault();
                handleTabDrop(source.id);
              }}
              onDragEnd={() => startDrag(null)}
            >
              <button
                onClick={() => setActiveSourceId(source.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${
                  activeSourceId === source.id
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${source.custom ? 'pr-7' : ''}`}
                title={t('latestNews.dragToReorder')}
              >
                {source.name}
              </button>
              {source.custom && (
                <button
                  onClick={() => handleRemoveSource(source.id)}
                  className={`absolute right-1.5 p-0.5 rounded-full transition-colors ${
                    activeSourceId === source.id ? 'text-gray-300 hover:text-white' : 'text-gray-400 hover:text-black'
                  }`}
                  aria-label={t('latestNews.removeCustomSource', { name: source.name })}
                  title={t('latestNews.removeCustomSource', { name: source.name })}
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          <button
            onClick={() => { setShowAddForm(v => !v); setAddError(null); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-full border border-dashed transition-colors ${
              showAddForm
                ? 'border-black text-black bg-gray-50'
                : 'border-gray-300 text-gray-500 hover:border-black hover:text-black'
            }`}
            title={t('latestNews.addCustomSourceHint')}
          >
            {'+ RSS'}
          </button>
          <button
            onClick={() => setShowManagePanel(v => !v)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full border border-dashed transition-colors ${
              showManagePanel
                ? 'border-black text-black bg-gray-50'
                : 'border-gray-300 text-gray-500 hover:border-black hover:text-black'
            }`}
            title={t('latestNews.manageSourcesHint')}
          >
            {t('latestNews.manageSources')}
          </button>
          {!isLoading && !error && articles.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleExtractConcepts}
                disabled={isExtracting || articles.every(a => conceptTags[a.link]?.length)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('latestNews.extractConceptsHint')}
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                {isExtracting ? t('latestNews.extracting') : t('latestNews.extractConcepts')}
              </button>
              <button
                onClick={toggleAutoExtract}
                role="switch"
                aria-checked={autoExtract}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-black transition-colors"
                title={t('latestNews.autoExtractHint')}
              >
                <span
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${autoExtract ? 'bg-black' : 'bg-gray-300'}`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${autoExtract ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                  />
                </span>
                {t('latestNews.autoExtract')}
              </button>
            </div>
          )}
        </div>
        <JevNewsSignals articles={articles} onAnalyze={onAnalyze} />

        {extractError && (
          <p className="text-xs text-red-600 -mt-2 mb-3">{extractError}</p>
        )}

        {showAddForm && (
          <div className="mb-4 p-3 rounded-xl bg-stone-50 border border-stone-200">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newSourceName}
                onChange={e => setNewSourceName(e.target.value)}
                placeholder={t('latestNews.customSourceNamePlaceholder')}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black sm:w-36"
                aria-label={t('latestNews.customSourceNamePlaceholder')}
              />
              <input
                type="url"
                value={newSourceUrl}
                onChange={e => setNewSourceUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !(e.nativeEvent as any).isComposing && (e as any).keyCode !== 229) handleAddSource();
                }}
                placeholder={t('latestNews.customSourceUrlPlaceholder')}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                aria-label={t('latestNews.customSourceUrlPlaceholder')}
              />
              <button
                onClick={handleAddSource}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
              >
                {t('latestNews.addCustomSource')}
              </button>
            </div>
            {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
          </div>
        )}

        {showManagePanel && (
          <div className="mb-4 p-3 rounded-xl bg-stone-50 border border-stone-200">
            <p className="text-xs text-stone-500 mb-2">{t('latestNews.manageSourcesDesc')}</p>
            <ul className="space-y-1">
              {manageableSources.map(source => {
                const isHidden = sourcePrefs.hidden.includes(source.id);
                return (
                  <li key={source.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-colors">
                    <span className={`text-sm ${isHidden ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {source.name}
                      {source.custom && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-600 no-underline inline-block align-middle">
                          {t('latestNews.customBadge')}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => toggleSourceHidden(source.id)}
                      role="switch"
                      aria-checked={!isHidden}
                      aria-label={t(isHidden ? 'latestNews.showSource' : 'latestNews.hideSource', { name: source.name })}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-black transition-colors"
                    >
                      <span
                        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${!isHidden ? 'bg-black' : 'bg-gray-300'}`}
                        aria-hidden="true"
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${!isHidden ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                        />
                      </span>
                      {t(isHidden ? 'latestNews.hiddenLabel' : 'latestNews.visibleLabel')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isLoading ? (
          <NewsSkeleton />
        ) : error ? (
          <div className="text-center py-4">
            <p role="status" className="text-black bg-gray-100 p-3 rounded-lg border border-gray-200">{error}</p>
            <button onClick={() => setReloadKey(key => key + 1)} className="mt-3 min-h-11 px-4 rounded-xl border border-stone-300 text-sm hover:bg-stone-50">{locale === 'zh' ? '重新加载新闻' : 'Reload news'}</button>
          </div>
        ) : (
          <ul className="space-y-4">
            {articles.length > 0 ? articles.map((article, index) => (
              <li key={`${article.link}-${index}`} className="group relative border-b border-gray-200 pb-4 last:border-b-0 hover:bg-gray-50/80 transition-colors duration-300 rounded-xl p-3 -mx-3">
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 p-4 bg-gray-900/95 backdrop-blur-sm text-white text-xs rounded-2xl shadow-floating opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-30 pointer-events-none">
                  <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                    <span className="font-bold text-gray-100">{article.sourceName}</span>
                    <span className="font-mono text-gray-400 text-[10px]">{new Date(article.pubDate).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-300 leading-relaxed line-clamp-6">
                    {stripHtml(article.description)}
                  </p>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[6px] border-transparent border-t-gray-900/95"></div>
                </div>

                <div className="flex items-center gap-x-2 mb-1 flex-wrap">
                  <button
                    onClick={() => setSelectedArticle(article)}
                    className="font-semibold text-black hover:text-gray-700 transition-colors text-left focus:outline-none focus-visible:underline"
                  >
                    {article.title}
                  </button>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${SOURCE_COLORS[article.sourceName] || 'bg-gray-100 text-gray-800'}`}>
                    {article.sourceName}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  {truncateText(stripHtml(article.description), 140)}
                </p>

                {conceptTags[article.link]?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {conceptTags[article.link].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => onAnalyze(locale === 'zh' ? `${tag}（相关新闻：${article.title}）` : `${tag} (related news: ${article.title})`)}
                        className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-stone-100 text-stone-700 border border-stone-200 hover:bg-black hover:text-white hover:border-black transition-colors"
                        title={t('latestNews.tagHint', { tag })}
                      >
                        # {tag}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => onAnalyze(`${article.title}\n\n${stripHtml(article.description)}`)}
                  className="mt-3 min-h-11 relative inline-flex items-center gap-2 px-4 py-1.5 text-white text-xs font-medium rounded-full group overflow-hidden btn-premium opacity-80 group-hover:opacity-100 group-hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                  <SparklesIcon className="w-4 h-4" />
                  <span className="relative z-10">{t('latestNews.analyzeButton')}</span>
                </button>
              </li>
            )) : (
              <p className="text-center text-gray-500 py-4">{t('latestNews.noNews')}</p>
            )}
          </ul>
        )}
      </div>
    </>
  );
};

export default LatestNews;
