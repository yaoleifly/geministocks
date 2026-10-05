export type ResearchMode = 'news' | 'company' | 'topic';
export function researchPrompt(text: string, mode: ResearchMode, zh: boolean): string {
  if (mode === 'news') return text;
  const instruction = mode === 'company'
    ? (zh ? '研究以下公司的竞争优势、增长动力、财务状况与风险，区分证据和推断：' : 'Research this company: competitive advantage, growth, finances and risks. Distinguish evidence from inference:')
    : (zh ? '研究以下主题的产业链、影响路径和待验证问题，区分证据和推断：' : 'Research this topic: supply chains, impact paths and open questions. Distinguish evidence from inference:');
  return `${instruction}\n\n${text}`;
}
export async function readResearchMaterial(file: File): Promise<string> {
  if (!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('format');
  if (file.size > 512 * 1024) throw new Error('size');
  const text = await file.text();
  if (!text.trim() || text.includes('\0')) throw new Error('content');
  return text;
}
