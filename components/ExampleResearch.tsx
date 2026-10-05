import React from 'react';
import { useI18n } from '../hooks/useI18n';

export default function ExampleResearch({ onClose, onUseTopic }: { onClose: () => void; onUseTopic: () => void }) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const sections = zh ? [
    ['情景输入', '假设一家云服务商宣布扩建 AI 数据中心。公告尚未披露设备采购、供应商和交付时间。'],
    ['核心判断', '值得研究算力、网络、电力与散热环节，但扩建计划不能直接等同于相关公司的新增收入。先确认项目进度和采购安排。'],
    ['影响路径 · 推断', '扩建计划 → 服务器与网络设备需求 → 供电与散热配套。每一步都取决于预算获批、建设进度和实际订单。'],
    ['证据与反证', '当前只有假设情景，没有已核实的公告或财务数据。正式研究应核对公司公告、资本开支指引和供应商订单；项目延期、预算下调或自研替代都可能削弱判断。'],
    ['下一步验证', '找到公告原文与发布日期；确认采购时间表；核对候选公司的业务占比与订单披露。证据不足时保留观察，不给出确定受益名单。'],
  ] : [
    ['Scenario', 'Suppose a cloud provider announces an AI data center expansion without naming suppliers, procurement budgets or delivery dates.'],
    ['Key takeaway', 'Compute, networking, power and cooling warrant research. An expansion plan alone does not establish incremental supplier revenue. Verify project progress and procurement first.'],
    ['Impact path · Inference', 'Expansion plan → servers and networking → power and cooling. Each link depends on approved budgets, construction and actual orders.'],
    ['Evidence and counterevidence', 'This is a hypothetical scenario with no verified announcement or financial data. Check filings, capital expenditure guidance and supplier orders. Delays, budget cuts or in-house alternatives could weaken the thesis.'],
    ['What to verify next', 'Find the original dated announcement, confirm procurement timing, and check business exposure and disclosed orders. Keep unverified beneficiaries on a watchlist.'],
  ];
  return <article className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-8" aria-label={zh ? '示例研究报告' : 'Example research report'}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-5">
      <div><p className="text-xs font-semibold text-amber-800">{zh ? '教学情景 · 编写于 2026-10-05 · 非实时分析' : 'Teaching scenario · Written 2026-10-05 · Not live analysis'}</p><h2 className="mt-2 text-2xl font-semibold">{zh ? 'AI 数据中心扩建，该关注什么？' : 'What matters in an AI data center expansion?'}</h2></div>
      <button onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm underline">{zh ? '关闭示例' : 'Close example'}</button>
    </div>
    <p className="mt-4 text-sm text-stone-600">{zh ? '这份人工编写的示例展示阅读方式，不调用模型、不产生费用，也不会进入你的分析历史。' : 'This manually written example shows how to read a report. It makes no model calls, incurs no fees and is not saved to your history.'}</p>
    <div className="divide-y divide-stone-100">{sections.map(([title, body]) => <section key={title} className="py-5"><h3 className="font-semibold text-stone-900">{title}</h3><p className="mt-2 max-w-3xl text-base leading-7 text-stone-700">{body}</p></section>)}</div>
    <button onClick={onUseTopic} className="min-h-12 rounded-xl bg-amber-700 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-800">{zh ? '用这个方向开始研究' : 'Research this topic'}</button>
  </article>;
}
