import React, { useRef, useState } from 'react';
import { ResearchIcon } from './icons/ResearchIcons';
import { readResearchMaterial, researchPrompt, type ResearchMode } from '../utils/researchInput';
import { useI18n } from '../hooks/useI18n';

interface AnalysisInputProps {
  userInput: string;
  setUserInput: (input: string) => void;
  onAnalyze: (topic?: string) => void;
  isLoading: boolean;
  apiConfigured?: boolean;
  draftSaved?: boolean;
  onConfigure?: () => void;
}

const AnalysisInput: React.FC<AnalysisInputProps> = ({ userInput, setUserInput, onAnalyze, isLoading, apiConfigured = true, draftSaved = false, onConfigure }) => {
  const { t, locale } = useI18n();
  const zh = locale === 'zh';
  const [mode, setMode] = useState<ResearchMode>('news');
  const [materialError, setMaterialError] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => onAnalyze(researchPrompt(userInput, mode, zh));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const examples = zh
    ? ['AI 数据中心扩张，会带动哪些产业链？', '研究英伟达的竞争优势、增长动力与风险', '铜价上涨如何影响矿企与制造业？']
    : ['How does AI data center growth affect the supply chain?', 'Research NVIDIA: advantages, growth drivers and risks', 'How do rising copper prices affect miners and manufacturers?'];
  return (
    <section className="research-composer" aria-labelledby="analysis-input-title">
      <div className="flex items-start gap-3 mb-4">
        <ResearchIcon name="brand" className="w-8 h-8 mt-1 shrink-0" />
        <div>
          <h2 id="analysis-input-title" className="text-xl font-semibold text-black">{zh ? '新建研究' : 'New research'}</h2>
          <p id="input-description" className="sr-only">{zh ? '粘贴新闻正文，或输入公司、研究主题。' : 'Paste a news excerpt, or enter a company or research topic.'}</p>
        </div>
      </div>
      <div className="research-modes" role="group" aria-label={zh ? '研究类型' : 'Research type'}>
        {(['news', 'company', 'topic'] as const).map((value, i) => <button key={value} aria-pressed={mode === value} disabled={isLoading} onClick={() => { setMode(value); inputRef.current?.focus(); }}>{(zh ? ['新闻正文', '公司研究', '主题研究'] : ['News', 'Company', 'Topic'])[i]}</button>)}
      </div>
      <label htmlFor="news-input" className="sr-only">{zh ? '输入新闻、公司或研究主题' : 'Enter news, a company or a research topic'}</label>
      <textarea
        ref={inputRef} id="news-input" rows={3}
        className="w-full min-h-24 max-h-96 resize-y bg-white border border-stone-300 rounded-xl px-4 py-3 text-base leading-relaxed text-black focus:outline-none focus:ring-4 focus:ring-stone-200 focus:border-stone-800 placeholder:text-stone-400 disabled:bg-stone-50"
        placeholder={mode === 'company' ? (zh ? '输入公司名称或股票代码，例如：英伟达 NVDA' : 'Enter a company or ticker, e.g. NVIDIA NVDA') : mode === 'topic' ? (zh ? '输入研究主题，例如：AI 数据中心的电力需求' : 'Enter a topic, e.g. power demand from AI data centers') : (zh ? '粘贴新闻正文，或输入你想研究的问题…' : 'Paste a news excerpt or your research question…')} value={userInput}
        onChange={e => setUserInput(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing && !isLoading && !readingFile && userInput.trim()) { e.preventDefault(); submit(); }
        }}
        disabled={isLoading || readingFile} aria-describedby="input-description input-hint"
      />
      <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-label={zh ? '导入文本材料' : 'Import text material'} accept=".txt,.md,.csv" disabled={isLoading || readingFile} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        setMaterialError(''); setReadingFile(true);
        try { const text = await readResearchMaterial(file); setUserInput(userInput.trim() ? `${userInput}\n\n${text}` : text); inputRef.current?.focus(); }
        catch { setMaterialError(zh ? '请选择非空的 TXT、Markdown 或 CSV 文本文件（最多 512 KB）。' : 'Choose a nonempty TXT, Markdown or CSV text file (up to 512 KB).'); }
        finally { setReadingFile(false); requestAnimationFrame(() => inputRef.current?.focus()); }
      }} />
      {materialError && <p role="alert" className="text-sm text-red-700 mt-2">{materialError}</p>}
      <button className="inline-flex min-h-11 items-center gap-2 text-sm text-stone-600" disabled={isLoading || readingFile} onClick={() => fileRef.current?.click()}><ResearchIcon name="attachment" className="w-5 h-5"/>{readingFile ? (zh ? '读取中…' : 'Reading…') : (zh ? '添加文本材料' : 'Add text material')}</button>
      <span className="ml-3 text-xs text-stone-500">TXT / MD / CSV · {zh ? '仅在本机读取' : 'Read locally'}</span>
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p id="input-hint" className="text-xs text-stone-500">
          {userInput ? (draftSaved ? (zh ? '草稿已保存在此浏览器' : 'Draft saved in this browser') : (zh ? '草稿尚未保存' : 'Draft not yet saved')) : (zh ? '可先写下想法，再配置模型' : 'Write your idea, then configure a model')}
          <span className="hidden sm:inline"> · Ctrl / ⌘ + Enter</span>
        </p>
        <button onClick={() => { if (!apiConfigured && !userInput.trim()) onConfigure?.(); else submit(); }} disabled={isLoading || readingFile || (apiConfigured && !userInput.trim())} className="min-h-12 inline-flex justify-center items-center gap-2 px-6 py-3 research-submit text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {isLoading ? t('analysisInput.buttonLoading') : !apiConfigured ? (zh ? '配置并开始' : 'Set up and start') : t('analysisInput.button')}
          {!isLoading && <span aria-hidden="true">→</span>}
        </button>
      </div>
      <div className="research-starts" aria-label={zh ? '试试这些方向' : 'Try a starting point'}>
        {examples.map((example, i) => <button key={example} disabled={isLoading || readingFile} onClick={() => { setMode('news'); setUserInput(example); inputRef.current?.focus(); }}><ResearchIcon name={i === 1 ? 'chip' : 'layers'} className="w-5 h-5 shrink-0" />{(zh ? ['数据中心扩建', '英伟达竞争优势', '铜价与产业链'] : ['Data centers', 'NVIDIA', 'Copper supply chain'])[i]}</button>)}
      </div>
    </section>
  );
};
export default AnalysisInput;
