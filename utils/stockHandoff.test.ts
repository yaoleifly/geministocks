import { expect, it } from 'vitest';
import { parseStockContext, stockReturnUrl, stockDraft } from './stockHandoff';
const context = {ticker:'NVDA',company:'英伟达',theme:'AI 算力',question:'订单 & 风险',preview:true};
it('validates stock context and does not accept an arbitrary return origin', () => {
 expect(parseStockContext(JSON.stringify(context))).toEqual(context);
 expect(parseStockContext('{')).toBeNull();
 for (const ticker of [undefined, null, 123, {}, []]) expect(parseStockContext(JSON.stringify({...context,ticker}))).toBeNull();
 expect(parseStockContext(JSON.stringify({...context,ticker:'<script>'}))).toBeNull();
 expect(parseStockContext(JSON.stringify({...context,question:'x'.repeat(2001)}))).toBeNull();
 expect(stockReturnUrl({...context,preview:false},123)).toContain('https://stocks.mastersgo.cc/#research=');
 expect(stockDraft(context)).toContain('订单 & 风险');
});
