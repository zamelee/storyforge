/**
 * R-22: 角色库完整绑定 — 章节正文生成路径
 */
import { describe, it, expect } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { assembleContext } from '../../src/lib/registry/assemble-context'
import { buildChapterContentPrompt } from '../../src/lib/ai/adapters/chapter-adapter'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

describe('R-22: 角色库完整绑定', () => {
  it('1. assembleContext 在 budget 极小时仍保留所有角色名', async () => {
    await db.characters.clear()
    await db.characters.add({ projectId: 22, name: '苏妄凝', roleWeight: 'main', homeWorldGroupId: null, isCrossWorld: false } as any)
    await db.characters.add({ projectId: 22, name: '裴砚深', roleWeight: 'main', homeWorldGroupId: null, isCrossWorld: false } as any)
    await db.characters.add({ projectId: 22, name: '方屹', roleWeight: 'secondary', homeWorldGroupId: null, isCrossWorld: false } as any)
    await db.characters.add({ projectId: 22, name: '林知意', roleWeight: 'secondary', homeWorldGroupId: null, isCrossWorld: false } as any)
    await db.characters.add({ projectId: 22, name: '裴砚庭', roleWeight: 'secondary', homeWorldGroupId: null, isCrossWorld: false } as any)

    const r = await assembleContext({
      projectId: 22,
      worldGroupId: null,
      outlineNodeId: null,
      provider: 'unknown-unknown',
      model: 'unknown-model',
      inputBudgetTokens: 30,
      sourceKeys: ['characters'],
    })
    const cs = r.segments.find(s => s.label === '角色档案')
    expect(cs).toBeDefined()
    for (const name of ['苏妄凝', '裴砚深', '方屹', '林知意', '裴砚庭']) {
      expect(cs!.content).toContain(name)
    }
  })

  it('2. budget 充足时 characters 段不被截短', async () => {
    const r = await assembleContext({
      projectId: 22,
      worldGroupId: null,
      outlineNodeId: null,
      provider: 'unknown-unknown',
      model: 'unknown-model',
      inputBudgetTokens: 48000,
      sourceKeys: ['characters'],
    })
    const cs = r.segments.find(s => s.label === '角色档案')
    expect(cs).toBeDefined()
    expect(cs!.content).toContain('苏妄凝')
    expect(cs!.content).toContain('裴砚深')
    expect(cs!.content).not.toContain('已按预算截断')
  })

  it('3. buildChapterContentPrompt 接 characterContext 后 user prompt 含所有角色', () => {
    const characters = `【核心角色(完整信息)】
苏妄凝(主要 · 中立善良);简介:古灵精怪实习生。
裴砚深(主要 · 中立善良);简介:清隽禁欲的高岭霸总。
方屹(次要 · 中立善良);简介:特助。
林知意(次要 · 中立善良);简介:苏妄凝闺蜜。`
    const messages = buildChapterContentPrompt(
      '第1章:电梯惊鸿',
      '苏妄凝走进裴氏集团大厦,在电梯里第一次撞见裴砚深。',
      '裴氏集团是 S 市顶级世家企业。',
      characters,
      '(这是第一章)',
    )
    const userMsg = messages.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('苏妄凝')
    expect(userMsg.content).toContain('裴砚深')
    expect(userMsg.content).toContain('方屹')
    expect(userMsg.content).toContain('林知意')
  })

  it('4. DetailedOutlinePanel 不再硬编码 main-only 角色过滤', () => {
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../src/components/outline/DetailedOutlinePanel.tsx'),
      'utf8',
    )
    const bad = src.match(/filter\s*\(\s*c\s*=>\s*c\.roleWeight\s*===\s*['"]main['"]\s*\)/g) || []
    expect(bad.length).toBe(0)
  })
})
