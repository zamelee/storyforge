/**
 * R-20: 故事线生成 user prompt 必须包含已建角色库与角色绑定铁律
 *
 * Regression target:
 *   修复前:buildStoryArcPrompt 不接 characterContext,system prompt 也不含铁律,AI 看不到角色库,瞎编新角色。
 *
 *   修复:加 characterContext 参数(第 8 位),user prompt 加「已创建的角色」段,system 末尾注入 OUTLINE_CHARACTER_BINDING。
 *
 *   测试策略:调 buildStoryArcPrompt 传入假角色库,断言 system 和 user 都含铁律 + 角色名。
 */
import { describe, it, expect } from 'vitest'
import { buildStoryArcPrompt } from '../../src/lib/ai/adapters/story-arc-adapter'

describe('R-20: story-arc prompt binds to project character library', () => {
  it('system prompt includes OUTLINE_CHARACTER_BINDING iron rule', () => {
    const messages = buildStoryArcPrompt(
      '测试项目', '言情', '世界观内容', '故事核心内容', '大纲摘要',
      'main', undefined, '苏妄凝(main): 女主角。裴砚深(main): 男主角。'
    )
    const system = messages.find(function(m){return m.role==='system'}).content
    expect(system).toContain('【铁律·角色绑定】')
    expect(system).toContain('严禁凭空捏造全新人名')
  })

  it('user prompt includes 已创建的角色 section with passed-in characters', () => {
    const charCtx = '苏妄凝(main): 女主角。' + String.fromCharCode(10) + '裴砚深(main): 男主角。' + String.fromCharCode(10) + '裴老太太(secondary): 裴家当家人。'
    const messages = buildStoryArcPrompt(
      '测试项目', '言情', '世界观内容', '故事核心内容', '大纲摘要',
      'main', undefined, charCtx
    )
    const user = messages.find(function(m){return m.role==='user'}).content
    expect(user).toContain('已创建的角色')
    expect(user).toContain('苏妄凝')
    expect(user).toContain('裴砚深')
    expect(user).toContain('裴老太太')
  })

  it('omitting characterContext works (backward compat) but does not inject iron rule marker in user', () => {
    const messages = buildStoryArcPrompt(
      '测试项目', '言情', '世界观内容', '故事核心内容', '大纲摘要',
      'main'
    )
    const user = messages.find(function(m){return m.role==='user'}).content
    expect(user).not.toContain('已创建的角色')
    // system still includes iron rule regardless
    const system = messages.find(function(m){return m.role==='system'}).content
    expect(system).toContain('【铁律·角色绑定】')
  })
})
