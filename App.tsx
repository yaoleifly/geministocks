
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
// Use streaming service with fallback to legacy
import { 
  getAnalysisWithStreaming, 
  getPolymarketAnalysis
} from './services/streamingService';
import type { AnalysisReport, TopicHistoryEntry } from './types';
import AnalysisInput from './components/AnalysisInput';
import Loader from './components/Loader';
import StreamingLoader from './components/StreamingLoader';
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
  const [userInput, setUserInput] = useState<string>('');
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryEntry[]>([]);
  const [topicProgress, setTopicProgress] = useState<number>(0);
  
  // Streaming Progress State
  const [streamingTopicProgress, setStreamingTopicProgress] = useState<number>(0);
  const [partialTopicData, setPartialTopicData] = useState<Partial<AnalysisReport> | null>(null);

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

    // Load history and settings from localStorage
    try {
      const storedTopicHistory = localStorage.getItem(TOPIC_HISTORY_STORAGE_KEY);
      if (storedTopicHistory) setTopicHistory(JSON.parse(storedTopicHistory));

      const storedUserCount = localStorage.getItem(USER_ANALYSIS_COUNT_KEY);
      if (storedUserCount) {
        setUserAnalysisCount(JSON.parse(storedUserCount));
      }

    } catch (err) {
      console.error("Failed to load from localStorage", err);
    }
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
    localStorage.setItem(TOPIC_HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
  };

  const incrementUserAnalysisCount = () => {
    setUserAnalysisCount(prevCount => {
        const newCount = prevCount + 1;
        localStorage.setItem(USER_ANALYSIS_COUNT_KEY, JSON.stringify(newCount));
        return newCount;
    });
  };

  const handleClearAllResults = () => {
      setAnalysisReport(null);
      setError(null);
  }

  const handleAnalyze = useCallback(async (topic: string) => {
    if (!topic.trim()) { setError(t('errors.emptyTopic')); return; }
    if (!ensureApiConfigured()) return;

    setIsLoading(true);
    handleClearAllResults();
    setTopicProgress(0);
    setStreamingTopicProgress(0);
    setPartialTopicData(null);

    try {
        const isPolymarketUrl = /^https?:\/\/polymarket\.com\//.test(topic.trim());
        
        let report: AnalysisReport;
        if (isPolymarketUrl) {
            report = await getPolymarketAnalysis(topic, locale);
        } else {
            // Use streaming analysis with progress callback
            report = await getAnalysisWithStreaming(
                topic, 
                setTopicProgress, 
                locale,
                (progress, data) => {
                    setStreamingTopicProgress(progress);
                    setPartialTopicData(data);
                }
            );
        }
        
        setAnalysisReport(report);
        incrementUserAnalysisCount();

        const newEntry: TopicHistoryEntry = { id: Date.now(), topic, report };
        const newHistory = [newEntry, ...topicHistory].slice(0, 20);
        updateTopicHistory(newHistory);
    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? t('errors.analysisFailed', { message: err.message }) : t('errors.unknownError');
        setError(errorMessage);
    } finally {
        setIsLoading(false);
        setTopicProgress(0);
        setStreamingTopicProgress(0);
        setPartialTopicData(null);
    }
  }, [topicHistory, locale, t]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTopicHistory = (id: number) => {
    const newHistory = topicHistory.filter((entry) => entry.id !== id);
    updateTopicHistory(newHistory);
  };

  // Re-run the analysis for a past topic with fresh data (adds a new history entry)
  const handleReanalyzeTopicHistory = (id: number) => {
    const entry = topicHistory.find((e) => e.id === id);
    if (!entry) return;
    setUserInput(entry.topic);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    handleAnalyze(entry.topic);
  };

  const handleClearTopicHistory = () => {
    updateTopicHistory([]);
  };

  const showLatestNews = locale === 'zh';
  
  const isLoadingAny = isLoading;

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
            isOpen={isApiSettingsOpen}
            onClose={() => setIsApiSettingsOpen(false)}
            onSaved={() => {
              setApiConfigured(true);
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
      <div className="min-h-screen relative z-10">
        <AppHeader
          apiConfigured={apiConfigured}
          onOpenUserGuide={() => setIsUserGuideModalOpen(true)}
          onOpenApiSettings={() => setIsApiSettingsOpen(true)}
        />

        <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          <main>
            {!apiConfigured && (
              <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 animate-fade-in" role="region" aria-label={locale === 'zh' ? '配置引导' : 'Setup guide'}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.077-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="text-base font-semibold text-amber-900 text-balance">
                      {locale === 'zh' ? '请先配置分析模型' : 'Configure a model to start'}
                    </h2>
                    <p className="mt-1 text-sm text-amber-800 leading-relaxed text-pretty">
                      {locale === 'zh'
                        ? '支持云端 API 或本机 CLI，配置仅保存在浏览器本地。'
                        : 'Cloud API or local CLI. Config stays in your browser.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsApiSettingsOpen(true)}
                    className="shrink-0 inline-flex items-center justify-center gap-x-1.5 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-amber-50"
                  >
                    {locale === 'zh' ? '立即配置' : 'Configure now'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-8">
                {/* --- INPUT --- */}
                <div className="space-y-8 animate-fade-in">
                    <AnalysisInput
                      userInput={userInput}
                      setUserInput={setUserInput}
                      onAnalyze={() => handleAnalyze(userInput)}
                      isLoading={isLoading}
                    />
                </div>

                {/* --- RESULTS / DASHBOARD --- */}
                {isLoadingAny ? (
                  <>
                    {/* Show streaming loader with progress when streaming data is available */}
                    {streamingTopicProgress > 0 ? (
                      <StreamingLoader
                        progress={streamingTopicProgress}
                        isStreaming={isLoading}
                        type="topic"
                      />
                    ) : (
                      <Loader 
                        taskType="topic"
                        currentStep={topicProgress}
                      />
                    )}
                  </>
                ) : error ? (
                    <div role="alert" className="bg-red-50 border-2 border-red-200 text-red-800 px-6 py-4 text-center rounded-lg">
                        <p className="font-semibold">{t('errors.title')}</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                ) : analysisReport ? (
                    <Suspense fallback={<Loader taskType="topic" currentStep={3} />}>
                      <AnalysisResult 
                          report={analysisReport} 
                          userInput={userInput} 
                          onNewAnalysis={handleNewAnalysis}
                      />
                    </Suspense>
                ) : (
                  // DASHBOARD VIEW: indicators first (zero-config value), then news, then history
                  <div className="space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                      <MarketThermometer sources={NEWS_SOURCES} />
                      <TacoMonitor sources={NEWS_SOURCES} />
                    </div>
                    <div className="grid grid-cols-1 gap-8 items-start">
                      {showLatestNews && <LatestNews 
                        onAnalyze={handleNewsSelect} 
                        sources={NEWS_SOURCES}
                      />}
                    </div>
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
                  </div>
                )}
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
