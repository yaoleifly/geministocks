
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
// Use streaming service with fallback to legacy
import {
  getAnalysisWithStreaming,
  getPolymarketAnalysis
} from './services/streamingService';
import type { AnalysisReport, TopicHistoryEntry } from './types';
import AnalysisInput from './components/AnalysisInput';
import ExampleResearch from './components/ExampleResearch';
import WorkspaceNav from './components/WorkspaceNav';
import { ResearchIcon } from './components/icons/ResearchIcons';
import AnalysisProgress from './components/AnalysisProgress';
import { readStored, writeStored } from './utils/browserStorage';
import AnalysisHistory from './components/AnalysisHistory';
import { CacheStats } from './components/CacheStats';
import AppHeader from './components/AppHeader';
import LatestNews from './components/LatestNews';
import { NEWS_SOURCES } from './services/newsService';
import MarketThermometer from './components/MarketThermometer';
import TacoMonitor from './components/TacoMonitor';
import Toast from './components/Toast';
import { useI18n } from './hooks/useI18n';
import { isApiConfigured } from './services/apiConfigService';
import { GitHubIcon } from './components/icons/Icons';

// Code-split heavy, interaction-gated components so they don't bloat the
// initial bundle: modals only load when opened, the report only after an
// analysis completes, and the About page only when routed to.
const AnalysisResult = lazy(() => import('./components/AnalysisResult'));
const ApiSettingsModal = lazy(() => import('./components/ApiSettingsModal'));
const UserGuideModal = lazy(() => import('./components/UserGuideModal'));
const ImageModal = lazy(() => import('./components/ImageModal'));
const AboutPage = lazy(() => import('./components/AboutPage'));

// --- Constants ---
const TOPIC_HISTORY_STORAGE_KEY = 'gemini-analysis-history';
const USER_ANALYSIS_COUNT_KEY = 'gemini-user-analysis-count';
const USER_ID_KEY = 'gemini-user-id';
const DRAFT_KEY = 'gemini-analysis-draft';


// --- User Helper Functions ---
const getUserId = (): string => {
  try {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch (e) {
    console.error("localStorage not available, using temporary ID.", e);
    return uuidv4();
  }
};

const MainPage: React.FC = () => {
  const { t, locale } = useI18n();

  // State for Topic Analysis
  const [userInput, setUserInput] = useState<string>(() => readStored(DRAFT_KEY, '', (value): value is string => typeof value === 'string'));
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryEntry[]>([]);
  const [topicProgress, setTopicProgress] = useState<number>(0);

  const activeRequest = useRef<AbortController | null>(null);
  const [reportTopic, setReportTopic] = useState('');
  const [showExample, setShowExample] = useState(false);
  const pendingAnalysis = useRef<{ topic: string; fresh: boolean } | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [deletedHistory, setDeletedHistory] = useState<TopicHistoryEntry[] | null>(null);
  const [failedTopic, setFailedTopic] = useState('');
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftSaved(false);
    const timer = setTimeout(() => setDraftSaved(writeStored(DRAFT_KEY, userInput)), 300);
    return () => { clearTimeout(timer); writeStored(DRAFT_KEY, userInput); };
  }, [userInput]);
  useEffect(() => () => { activeRequest.current?.abort(); }, []);
  useEffect(() => {
    if (isLoading || error || analysisReport) statusRef.current?.focus({ preventScroll: true });
  }, [isLoading, error, analysisReport]);

  // Common State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [userAnalysisCount, setUserAnalysisCount] = useState<number>(0);
  const [isUserGuideModalOpen, setIsUserGuideModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // User API Settings State
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [apiConfigured, setApiConfigured] = useState<boolean>(false);



  // Effect to hide toast after a delay
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000); // 5 seconds
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    // Initialize user ID (for anonymous users)
    getUserId();

    // Check whether the user has configured their API settings
    setApiConfigured(isApiConfigured());

    setTopicHistory(readStored<TopicHistoryEntry[]>(TOPIC_HISTORY_STORAGE_KEY, [],
      (value): value is TopicHistoryEntry[] => Array.isArray(value) && value.every(entry =>
        entry && typeof entry.id === 'number' && typeof entry.topic === 'string' && entry.report && typeof entry.report === 'object')));
    setUserAnalysisCount(readStored(USER_ANALYSIS_COUNT_KEY, 0,
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0));

  }, []);



  // SEO: Set meta tags and html lang
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en-US';
    const title = t('meta.title');
    const description = t('meta.description');
    const ogTitle = t('meta.ogTitle');
    const ogDescription = t('meta.ogDescription');

    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', ogTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', ogDescription);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', ogTitle);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', ogDescription);
  }, [locale, t]);

  // Require user API configuration before any analysis; open settings modal if missing
  const ensureApiConfigured = (): boolean => {
    if (isApiConfigured()) return true;
    setIsApiSettingsOpen(true);
    setToast({ message: locale === 'zh' ? '请先配置模型 API 地址和密钥' : 'Please configure your model API settings first', type: 'info' });
    return false;
  };


  const updateTopicHistory = (newHistory: TopicHistoryEntry[]) => {
    setTopicHistory(newHistory);
    if (!writeStored(TOPIC_HISTORY_STORAGE_KEY, newHistory)) {
      setToast({ message: locale === 'zh' ? '浏览器存储已满或不可用。报告仍可查看，请及时导出。' : 'Browser storage is full or unavailable. Your report is still available; export it to keep a copy.', type: 'info' });
    }
  };

  const incrementUserAnalysisCount = () => {
    setUserAnalysisCount(prevCount => {
        const newCount = prevCount + 1;
        writeStored(USER_ANALYSIS_COUNT_KEY, newCount);
        return newCount;
    });
  };

  const handleClearAllResults = () => {
      setShowExample(false);
      setAnalysisReport(null);
      setError(null);
  }

  const handleAnalyze = useCallback(async (topic: string, fresh = false) => {
    if (activeRequest.current) return;
    topic = topic.trim();
    if (!topic.trim()) { setError(t('errors.emptyTopic')); return; }
    if (!ensureApiConfigured()) { pendingAnalysis.current = { topic, fresh }; return; }
    setShowExample(false);

    const controller = new AbortController();
    activeRequest.current = controller;
    setIsLoading(true);
    setError(null);
    setFailedTopic(topic);
    setTopicProgress(0);

    try {
        const isPolymarketUrl = /^https?:\/\/polymarket\.com\//.test(topic.trim());

        let report: AnalysisReport;
        if (isPolymarketUrl) {
            report = await getPolymarketAnalysis(topic, locale, controller.signal);
        } else {
            report = await getAnalysisWithStreaming(topic, step => {
              if (activeRequest.current === controller) setTopicProgress(step);
            }, locale, undefined, { signal: controller.signal, fresh });
        }

        if (activeRequest.current !== controller) return;
        setAnalysisReport(report);
        setReportTopic(topic);
        incrementUserAnalysisCount();

        const newEntry: TopicHistoryEntry = { id: Date.now(), topic, report };
        const newHistory = [newEntry, ...topicHistory].slice(0, 20);
        updateTopicHistory(newHistory);
    } catch (err) {
        if (activeRequest.current !== controller || controller.signal.aborted) return;
        controller.abort();
        console.error(err);
        const errorMessage = err instanceof Error ? t('errors.analysisFailed', { message: err.message }) : t('errors.unknownError');
        setError(errorMessage);
    } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setIsLoading(false);
          setTopicProgress(0);
        }
    }
  }, [topicHistory, locale, t]);

  const handleCancel = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setIsLoading(false);
    setTopicProgress(0);
    setToast({ message: locale === 'zh' ? '已停止等待，输入内容已保留。服务商可能仍处理已接收的请求。' : 'Stopped waiting. Your input is preserved. The provider may still process accepted requests.', type: 'info' });
  };

  const handleNewsSelect = (newsTopic: string) => {
    setUserInput(newsTopic);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    handleAnalyze(newsTopic);
  };

  const handleNewAnalysis = () => {
    handleClearAllResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // --- History Handlers ---

  const handleSelectTopicHistory = (id: number) => {
    const entry = topicHistory.find((e) => e.id === id);
    if (!entry) return;
    setUserInput(entry.topic);
    handleClearAllResults();
    setAnalysisReport(entry.report);
    setReportTopic(entry.topic);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTopicHistory = (id: number) => {
    setDeletedHistory(topicHistory);
    const newHistory = topicHistory.filter((entry) => entry.id !== id);
    updateTopicHistory(newHistory);
  };

  // Re-run the analysis for a past topic with fresh data (adds a new history entry)
  const handleReanalyzeTopicHistory = (id: number) => {
    const entry = topicHistory.find((e) => e.id === id);
    if (!entry) return;
    setUserInput(entry.topic);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    handleAnalyze(entry.topic, true);
  };

  const handleClearTopicHistory = () => {
    setDeletedHistory(topicHistory);
    updateTopicHistory([]);
  };

  const handleUndoHistory = () => {
    if (!deletedHistory) return;
    const restored = new Map([...deletedHistory, ...topicHistory].map(entry => [entry.id, entry]));
    updateTopicHistory(Array.from(restored.values()).sort((a, b) => b.id - a.id).slice(0, 20));
    setDeletedHistory(null);
  };


  const isLoadingAny = isLoading;

  const openNews = () => {
    if (isLoadingAny) return;
    handleClearAllResults();
    requestAnimationFrame(() => document.getElementById('workspace-news')?.scrollIntoView({ block: 'start' }));
  };
  const openHistory = () => {
    const history = document.getElementById('research-history');
    history?.scrollIntoView({ block: 'start' });
    history?.focus();
    history?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
  };


  return (
    <>
      <CacheStats />
      {isUserGuideModalOpen && (
        <Suspense fallback={null}>
          <UserGuideModal isOpen={isUserGuideModalOpen} onClose={() => setIsUserGuideModalOpen(false)} />
        </Suspense>
      )}
      {isApiSettingsOpen && (
        <Suspense fallback={null}>
          <ApiSettingsModal
            startAfterSave={Boolean(pendingAnalysis.current)}
            isOpen={isApiSettingsOpen}
            onClose={() => { pendingAnalysis.current = null; setIsApiSettingsOpen(false); setApiConfigured(isApiConfigured()); }}
            onSaved={() => {
              setApiConfigured(isApiConfigured());
              const pending = pendingAnalysis.current;
              pendingAnalysis.current = null;
              if (pending) {
                setIsApiSettingsOpen(false);
                void handleAnalyze(pending.topic, pending.fresh);
                return;
              }
              setToast({
                message: locale === 'zh' ? '模型已配置成功，现在可以开始分析了' : 'Model configured successfully. You can start analyzing now.',
                type: 'success',
              });
            }}
          />
        </Suspense>
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}
      {isImageModalOpen && (
          <Suspense fallback={null}>
            <ImageModal
                imageUrl="https://youke1.picui.cn/s1/2025/10/02/68de9d3a88ef4.jpg"
                onClose={() => setIsImageModalOpen(false)}
                title={t('imageModal.title')}
            />
          </Suspense>
      )}
      <div className="min-h-screen relative z-10 research-app">
        <WorkspaceNav busy={isLoadingAny} onSettings={() => setIsApiSettingsOpen(true)} onNews={openNews} onHistory={openHistory} />
        <AppHeader
          busy={isLoadingAny}
          onNews={openNews}
          onHistory={openHistory}
          apiConfigured={apiConfigured}
          onOpenUserGuide={() => setIsUserGuideModalOpen(true)}
          onOpenApiSettings={() => setIsApiSettingsOpen(true)}
        />

        <div className="workspace-main">
          <main id="main-content">
            <a href="#news-input" onClick={event => { event.preventDefault(); document.getElementById('news-input')?.focus(); }} className="sr-only focus:not-sr-only focus:block focus:mb-4">{locale === 'zh' ? '跳到分析输入' : 'Skip to analysis input'}</a>
            <section className="workspace-intro mb-6 py-3 sm:py-5" aria-label={locale === 'zh' ? '开始研究' : 'Start researching'}>
              <p className="text-xs font-semibold tracking-widest text-amber-800">{locale === 'zh' ? '从信息，到有依据的判断' : 'FROM INFORMATION TO INFORMED JUDGMENT'}</p>
              <h2 className="mt-3 max-w-3xl text-3xl sm:text-4xl font-semibold leading-tight text-stone-950 text-balance">{locale === 'zh' ? '从一条线索，开始深入研究。' : 'Turn a news story into your next research question.'}</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">{locale === 'zh' ? '梳理影响路径，核对证据，找到下一步。' : 'Explore related companies, impact paths and open questions. Start with an example, then research what matters to you.'}</p>
              <button disabled={isLoading} onClick={() => { setError(null); setShowExample(true); requestAnimationFrame(() => document.getElementById('example-research')?.scrollIntoView({ block: 'start' })); }} className="mt-3 min-h-11 text-sm font-semibold text-amber-800 underline underline-offset-4 disabled:opacity-50">{locale === 'zh' ? '查看示例报告 · 无需配置' : 'View example report · No setup needed'}</button>
            </section>
            {showExample && <div id="example-research" className="mb-6 scroll-mt-6"><ExampleResearch onClose={() => setShowExample(false)} onUseTopic={() => { setShowExample(false); setUserInput(locale === 'zh' ? 'AI 数据中心扩建，会影响哪些产业链？有哪些证据需要验证？' : 'How does AI data center expansion affect suppliers, and what evidence should I verify?'); document.getElementById('news-input')?.focus(); }} /></div>}

            <div className={`workspace-grid ${!isLoadingAny && !error && !analysisReport ? 'workspace-grid-idle' : ''}`}>
                {/* --- INPUT --- */}
                <div id="workspace-news" className="workspace-news space-y-6 scroll-mt-24">
                    <AnalysisInput
                      userInput={userInput}
                      setUserInput={setUserInput}
                      onAnalyze={(topic) => handleAnalyze(topic ?? userInput)}
                      isLoading={isLoading}
                      apiConfigured={apiConfigured}
                      draftSaved={draftSaved}
                      onConfigure={() => setIsApiSettingsOpen(true)}
                    />
                </div>
                {!isLoadingAny && !analysisReport && !showExample && <button className="research-example-teaser" onClick={() => { setShowExample(true); requestAnimationFrame(() => document.getElementById('example-research')?.scrollIntoView({ block: 'start' })); }}>
                  <ResearchIcon name="evidence" className="w-8 h-8"/><span><small>{locale === 'zh' ? '示例研究 · 非实时' : 'Example · Not live'}</small><strong>{locale === 'zh' ? 'AI 数据中心扩建，该关注什么？' : 'What matters in an AI data center expansion?'}</strong><span>{locale === 'zh' ? '事件 → 影响路径 → 待验证' : 'Event → Impact → Verification'}</span></span><ResearchIcon name="arrow" className="w-5 h-5 ml-auto"/>
                </button>}

                {!isLoading && <div id="research-history" tabIndex={-1} className="workspace-history scroll-mt-24 outline-none">
                  {!topicHistory.length && <p className="history-empty"><ResearchIcon name="history" className="w-5 h-5" />{locale === 'zh' ? '研究记录会保存在此浏览器，方便随时回看。' : 'Research history is saved in this browser for later review.'}</p>}
                  {deletedHistory && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
                    <span>{locale === 'zh' ? '历史记录已删除' : 'History removed'}</span>
                    <button className="min-h-11 px-3 font-semibold underline" onClick={handleUndoHistory}>{locale === 'zh' ? '撤销删除' : 'Undo deletion'}</button>
                  </div>}
                     <AnalysisHistory
                        history={topicHistory.map(h => ({
                          id: h.id,
                          text: h.topic,
                          score: h.report?.investmentScore?.score,
                          gapScore: h.report?.informationGapScore?.score,
                        }))}
                        onSelect={handleSelectTopicHistory}
                        onDelete={handleDeleteTopicHistory}
                        onClear={handleClearTopicHistory}
                        onReanalyze={handleReanalyzeTopicHistory}
                      />
                </div>}

                {/* --- RESULTS / DASHBOARD --- */}
                <div ref={statusRef} tabIndex={-1} role="region" aria-label={locale === 'zh' ? '分析结果与状态' : 'Analysis results and status'} className="workspace-results outline-none scroll-mt-24">
                {isLoadingAny ? (
                  <AnalysisProgress completed={topicProgress} onCancel={handleCancel} prediction={/^https?:\/\/polymarket\.com\//.test(failedTopic)} />
                ) : error ? (
                    <div role="alert" className="bg-red-50 border-2 border-red-200 text-red-800 px-6 py-4 text-center rounded-lg">
                        <p className="font-semibold">{t('errors.title')}</p>
                        <p className="text-sm mt-1 break-words">{error}</p>
                        <p className="mt-2 text-sm">{locale === 'zh' ? '你的输入已保留，可以重试或调整模型设置。' : 'Your input is preserved. Retry or adjust your model settings.'}</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                          <button onClick={() => handleAnalyze(failedTopic, true)} className="min-h-11 rounded-xl bg-red-800 px-4 text-sm font-medium text-white">{locale === 'zh' ? '重试分析' : 'Retry analysis'}</button>
                          <button onClick={() => setIsApiSettingsOpen(true)} className="min-h-11 rounded-xl border border-red-300 px-4 text-sm">{locale === 'zh' ? '检查模型设置' : 'Model settings'}</button>
                          {analysisReport && <button onClick={() => setError(null)} className="min-h-11 px-4 text-sm underline">{locale === 'zh' ? '返回上一份报告' : 'Return to previous report'}</button>}
                        </div>
                    </div>
                ) : analysisReport ? (
                    <Suspense fallback={<p role="status" className="p-6 text-center text-sm text-stone-500">{locale === 'zh' ? '正在打开报告…' : 'Opening your report…'}</p>}>
                      <AnalysisResult
                          report={analysisReport}
                          userInput={reportTopic}
                          onNewAnalysis={handleNewAnalysis}
                      />
                    </Suspense>
                ) : (
                  // Offer readable news before the deeper market indicators.
                  <div id="workspace-news" className="workspace-news space-y-6 scroll-mt-24">
                    <div className="grid grid-cols-1 gap-8 items-start">
                      <LatestNews
                        onAnalyze={handleNewsSelect}
                        sources={NEWS_SOURCES}
                      />
                    </div>
                    <details className="rounded-2xl border border-stone-200 bg-stone-50 p-5"><summary className="cursor-pointer font-semibold text-stone-700">{locale === 'zh' ? '市场环境 · 情绪与政策监测' : 'Market context · Sentiment and policy'}</summary><p className="my-3 text-sm text-stone-600">{locale === 'zh' ? '按需扫描，辅助理解市场背景。' : 'Scan on demand for market context.'}</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                      <MarketThermometer sources={NEWS_SOURCES} />
                      <TacoMonitor sources={NEWS_SOURCES} />
                    </div></details>


                  </div>
                )}
                </div>

            </div>
          </main>

          <footer className="text-center mt-16 py-8 border-t border-gray-200">
             <div className="flex flex-wrap justify-center items-center gap-3 mb-6">
                <span className="text-sm text-gray-500">{t('footer.deployOwn')}</span>
                <a
                  href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyaoleifly%2Fgeministocks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
                  title={t('footer.deployVercelHint')}
                >
                  <svg viewBox="0 0 76 65" className="w-3 h-3" fill="currentColor" aria-hidden="true">
                    <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                  </svg>
                  {t('footer.deployVercel')}
                </a>
                <a
                  href="https://deploy.workers.cloudflare.com/?url=https://github.com/yaoleifly/geministocks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black transition-colors"
                  title={t('footer.deployCloudflareHint')}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                    <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.5-1.0664-.5205l-8.6807-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.0205-.1553.0283-.084.1123-.1484.2031-.1552l8.7578-.1123c1.0391-.0489 2.1631-.8916 2.5576-1.9219l.5-1.3086c.0215-.0557.0264-.1113.0147-.167-.5645-2.5533-2.8408-4.458-5.5615-4.458-2.5088 0-4.6377 1.6182-5.4102 3.8672-.4981-.373-1.1338-.5733-1.8203-.5069-1.2158.1211-2.1924 1.0977-2.3135 2.3135-.0312.3145-.0078.6191.0645.9053C1.583 13.1758 0 14.7871 0 16.7607c0 .1787.0137.3535.0391.5254.0117.0859.0849.1494.1718.1494h16.0225c.0947 0 .1826-.0664.2109-.1582l.0645-.4326z" />
                  </svg>
                  {t('footer.deployCloudflare')}
                </a>
             </div>
             <div className="flex flex-col sm:flex-row justify-center items-center gap-x-6 gap-y-4">
                <a
                  href="https://github.com/yaoleifly/geministocks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors"
                >
                  <GitHubIcon className="w-4 h-4" aria-hidden="true" />
                  <span className="font-medium">{t('footer.openSource')}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border border-gray-300 text-gray-500">MIT</span>
                </a>
             </div>
          </footer>
        </div>
      </div>
    </>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route
          path="/about"
          element={
            <Suspense fallback={null}>
              <AboutPage />
            </Suspense>
          }
        />
      </Routes>
    </HashRouter>
  );
};

export default App;
