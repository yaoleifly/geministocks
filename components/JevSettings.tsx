import React, { useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { getJevConfig, saveJevConfig, evaluateJev, jevErrorMessage } from '../services/jevService';

export default function JevSettings() {
  const { locale } = useI18n(); const zh = locale === 'zh';
  const [config, setConfig] = useState(getJevConfig);
  const [message, setMessage] = useState(''); const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true); setMessage('');
    try {
      await evaluateJev('The company raised its annual revenue guidance.', { event: { type: 'choice', instructions: 'Which event is explicitly stated?', criteria: { guidance: 'Guidance raised', other: 'Other' } } }, undefined, { ...config, apiKey: config.apiKey.trim() });
      setMessage(zh ? '连接成功，请保存设置。' : 'Connected. Save your settings.');
    } catch (e) { setMessage(jevErrorMessage(e, zh)); } finally { setTesting(false); }
  }
  return <section className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3" aria-label={zh ? 'Jev 快速信号设置' : 'Jev fast signal settings'}>
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-sm">{zh ? 'Jev 快速信号' : 'Jev fast signals'} <span className="text-xs text-stone-500">Beta</span></h3>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />{zh ? '启用' : 'Enable'}</label></div>
    <p className="text-xs text-stone-600">{zh ? '用于新闻信号卡、温度计和 TACO。密钥保存在此浏览器，请求经本站代理发送给 TypeSafe；费用由你的 TypeSafe 账户承担。' : 'For news cards, the thermometer and TACO. Your key is stored in this browser; requests go through this site to TypeSafe and use your TypeSafe quota.'}</p>
    <label className="block text-xs font-medium">TypeSafe API Key<input type="password" autoComplete="off" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" /></label>
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={config.fallback} onChange={e => setConfig({ ...config, fallback: e.target.checked })} />{zh ? '指标接口失败时，允许使用已配置的主模型（会产生该模型费用）' : 'If the indicator API fails, allow fallback to my configured main model (uses its quota)'}</label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={testing || !config.apiKey.trim()} onClick={test} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{testing ? (zh ? '测试中…' : 'Testing…') : (zh ? '测试连接' : 'Test connection')}</button>
      <button type="button" disabled={testing} onClick={() => { try { if (config.enabled && !config.apiKey.trim()) { setMessage(zh ? '请输入密钥或关闭 Jev。' : 'Enter a key or disable Jev.'); return; } saveJevConfig(config); setMessage(zh ? 'Jev 设置已保存。' : 'Jev settings saved.'); } catch { setMessage(zh ? '浏览器无法保存设置。' : 'Browser storage is unavailable.'); } }} className="rounded-lg bg-black px-3 py-2 text-xs text-white">{zh ? '保存 Jev 设置' : 'Save Jev settings'}</button>
      <button type="button" onClick={() => { try { const empty = { enabled: false, apiKey: '', fallback: false }; saveJevConfig(empty); setConfig(empty); setMessage(zh ? '已关闭并清除密钥。' : 'Disabled and key cleared.'); } catch { setMessage(zh ? '清除失败。' : 'Could not clear settings.'); } }} className="px-2 py-2 text-xs text-stone-500">{zh ? '清除' : 'Clear'}</button>
    </div>
    {message && <p role="status" className="text-xs text-stone-700">{message}</p>}
  </section>;
}
