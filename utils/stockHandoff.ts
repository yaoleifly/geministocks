export interface StockContext { ticker: string; company: string; theme: string; question: string; preview: boolean }
export const STOCKS_ORIGIN = 'https://stocks.mastersgo.cc';
export const STOCKS_PREVIEW = 'https://stocks-design-preview.mastergo.workers.dev';
export function parseStockContext(raw: string | null): StockContext | null {
  try {
    if (!raw || raw.length > 5000) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.ticker !== 'string' || !/^[A-Za-z0-9.^=-]{1,24}$/.test(value.ticker) || typeof value.company !== 'string' || typeof value.theme !== 'string' || typeof value.question !== 'string' || typeof value.preview !== 'boolean') return null;
    if (value.company.length > 160 || value.theme.length > 160 || value.question.length > 2000) return null;
    return { ticker: value.ticker, company: value.company, theme: value.theme, question: value.question, preview: value.preview };
  } catch { return null; }
}
export function stockDraft(context: StockContext): string {
  return `研究 ${context.company}（${context.ticker}）\n产业主题：${context.theme}\n待验证问题：${context.question}\n请区分已核实证据、研究推断与待验证问题，注明来源。`;
}
export function stockReturnUrl(context: StockContext, reportId?: number): string {
  const origin = context.preview ? STOCKS_PREVIEW : STOCKS_ORIGIN;
  const payload = { ticker: context.ticker, ...(reportId ? { reportId, preview: context.preview } : {}) };
  return `${origin}/#research=${encodeURIComponent(JSON.stringify(payload))}`;
}
