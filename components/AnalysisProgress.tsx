import React, { useEffect, useState } from 'react';
import { useI18n } from '../hooks/useI18n';

export default function AnalysisProgress({ completed, onCancel, prediction = false }: {
  completed: number; onCancel: () => void; prediction?: boolean;
}) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const total = prediction ? 1 : 3;
  const count = Math.max(0, Math.min(total, completed));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-label={zh ? '分析状态' : 'Analysis status'}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg" role="status">{zh ? '正在生成研究报告' : 'Preparing your research report'}</h2>
          <p className="mt-2 text-sm text-stone-600" aria-live="polite">{zh ? `已完成 ${count} / ${total} 项模型请求` : `${count} of ${total} model requests completed`}</p>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-stone-500">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
      </div>
      <div className="mt-5 flex gap-2" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <div key={i} className={`h-2 flex-1 rounded-full ${i < count ? 'bg-stone-900' : 'bg-stone-200 animate-pulse'}`} />)}
      </div>
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-stone-500">{elapsed >= 60
          ? (zh ? '模型响应较慢，仍在等待。你可以停止后更换模型。' : 'The model is taking longer. You can stop and choose another model.')
          : (zh ? '耗时取决于模型和联网搜索，输入内容已保留。' : 'Timing depends on your model and web search. Your input is preserved.')}</p>
        <button onClick={onCancel} className="min-h-11 shrink-0 rounded-xl border border-stone-300 px-4 text-sm font-medium hover:bg-stone-100">{zh ? '停止分析' : 'Stop analysis'}</button>
      </div>
    </section>
  );
}
