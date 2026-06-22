/**
 * R-15: outline.volume / outline.chapter prompts must inject OUTLINE_CHARACTER_BINDING.
 *
 * Regression target:
 *   The character-binding iron rule is referenced via {{OUTLINE_CHARACTER_BINDING}} in
 *   the user prompt template. The constant lives in src/lib/ai/outline-fragments.ts
 *   and must be auto-injected into renderPrompt's ctx by prompt-engine — otherwise
 *   the placeholder becomes empty string and AI ignores the rule, generating
 *   random new character names instead of using the project's character library.
 */
import { describe, it, expect } from 'vitest'
import { buildVolumeOutlinePrompt } from '../../src/lib/ai/adapters/outline-adapter'
import { buildChapterOutlinePrompt } from '../../src/lib/ai/adapters/outline-adapter'

describe('R-15: outline prompts inject OUTLINE_CHARACTER_BINDING', () => {
  it('outline.volume user prompt contains the character binding iron rule', () => {
    const messages = buildVolumeOutlinePrompt(
      '测试项目',
      '言情',
      '【世界观】测试',
      '【故事核心】测试',
      1000000,
      undefined,
      undefined,
      '【角色】苏妄凝：女主。裴砚深：男主。',
    )
    const fullPrompt = messages.map(m => m.content).join('\n\n')
    expect(fullPrompt).toContain('【铁律·角色绑定】')
    expect(fullPrompt).toContain('严禁凭空捏造全新人名')
    expect(fullPrompt).toContain('苏妄凝')
  })

  it('outline.chapter user prompt contains the character binding iron rule', () => {
    const messages = buildChapterOutlinePrompt(
      '第1卷：初见',
      '苏妄凝与裴砚深第一次相遇。',
      '【世界观】测试',
      '（这是第一卷）',
      undefined,
      undefined,
      '【角色】苏妄凝：女主。裴砚深：男主。',
    )
    const fullPrompt = messages.map(m => m.content).join('\n\n')
    expect(fullPrompt).toContain('【铁律·角色绑定】')
    expect(fullPrompt).toContain('严禁凭空捏造全新人名')
    expect(fullPrompt).toContain('苏妄凝')
  })
})
