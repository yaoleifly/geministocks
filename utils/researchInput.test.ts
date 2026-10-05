import { describe, expect, it } from 'vitest';
import { readResearchMaterial, researchPrompt } from './researchInput';

describe('research input', () => {
  it('preserves original news and adds research instructions only for selected modes', () => {
    expect(researchPrompt('original', 'news', true)).toBe('original');
    expect(researchPrompt('NVDA', 'company', true)).toContain('财务状况与风险');
    expect(researchPrompt('Copper', 'topic', false)).toContain('Copper');
  });
  it('reads supported text without silently truncating the material', async () => {
    expect(await readResearchMaterial(new File(['Evidence\n原文'], 'notes.md'))).toBe('Evidence\n原文');
  });
  it('rejects unsupported, oversize, empty and binary materials', async () => {
    for (const file of [new File(['x'], 'a.pdf'), new File(['x'.repeat(524289)], 'a.txt'), new File(['  '], 'a.csv'), new File(['a\0b'], 'a.txt')]) {
      await expect(readResearchMaterial(file)).rejects.toThrow();
    }
  });
});
