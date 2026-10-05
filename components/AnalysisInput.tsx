import React, { useRef } from 'react';
import { SparklesIcon } from './icons/Icons';
import { useI18n } from '../hooks/useI18n';

interface AnalysisInputProps {
  userInput: string;
  setUserInput: (input: string) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  apiConfigured?: boolean;
  draftSaved?: boolean;
  onConfigure?: () => void;
}

const AnalysisInput: React.FC<AnalysisInputProps> = ({ userInput, setUserInput, onAnalyze, isLoading, apiConfigured = true, draftSaved = false, onConfigure }) => {
  const { t, locale } = useI18n();
  const zh = locale === 'zh';
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const examples = zh
    ? ['AI 数据中心扩张，会带动哪些产业链？', '研究英伟达的竞争优势、增长动力与风险', '铜价上涨如何影响矿企与制造业？']
    : ['How does AI data center growth affect the supply chain?', 'Research NVIDIA: advantages, growth drivers and risks', 'How do rising copper prices affect miners and manufacturers?'];
  return (
    <section className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-6 shadow-sm" aria-labelledby="analysis-input-title">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2.5 bg-black rounded-xl flex items-center justify-center" aria-hidden="true"><SparklesIcon className="w-5 h-5 text-white" /></div>
        <div>
          <h2 id="analysis-input-title" className="text-xl font-semibold text-black">{t('analysisInput.title')}</h2>
          <p id="input-description" className="mt-1 text-sm text-gray-600 leading-relaxed">{zh ? '粘贴新闻正文，或输入公司、研究主题。' : 'Paste a news excerpt, or enter a company or research topic.'}</p>
        </div>
      </div>
      {!userInput.trim() && <div className="flex flex-wrap gap-2 mb-4" aria-label={zh ? '试试这些方向' : 'Try a starting point'}>
        {examples.map(example => <button key={example} disabled={isLoading} onClick={() => { setUserInput(example); inputRef.current?.focus(); }} className="min-h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs sm:text-sm text-stone-600 hover:border-stone-400 hover:text-black disabled:opacity-50">{example}</button>)}
      </div>}
      <label htmlFor="news-input" className="sr-only">{zh ? '输入新闻、公司或研究主题' : 'Enter news, a company or a research topic'}</label>
      <textarea
        ref={inputRef} id="news-input" rows={3}
        className="w-full min-h-24 max-h-96 resize-y bg-white border border-stone-300 rounded-xl px-4 py-3 text-base leading-relaxed text-black focus:outline-none focus:ring-4 focus:ring-stone-200 focus:border-stone-800 placeholder:text-stone-400 disabled:bg-stone-50"
        placeholder={t('analysisInput.placeholder')} value={userInput}
        onChange={e => setUserInput(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing && !isLoading && userInput.trim()) { e.preventDefault(); onAnalyze(); }
        }}
        disabled={isLoading} aria-describedby="input-description input-hint"
      />
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p id="input-hint" className="text-xs text-stone-500">
          {userInput ? (draftSaved ? (zh ? '草稿已保存在此浏览器' : 'Draft saved in this browser') : (zh ? '草稿尚未保存' : 'Draft not yet saved')) : (zh ? '可先写下想法，再配置模型' : 'Write your idea, then configure a model')}
          <span className="hidden sm:inline"> · Ctrl / ⌘ + Enter</span>
        </p>
        <button onClick={() => { if (!apiConfigured && !userInput.trim()) onConfigure?.(); else onAnalyze(); }} disabled={isLoading || (apiConfigured && !userInput.trim())} className="min-h-12 inline-flex justify-center items-center gap-2 px-6 py-3 bg-stone-950 hover:bg-stone-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {isLoading ? t('analysisInput.buttonLoading') : !apiConfigured ? (zh ? '配置并开始' : 'Set up and start') : t('analysisInput.button')}
          {!isLoading && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </section>
  );
};
export default AnalysisInput;
