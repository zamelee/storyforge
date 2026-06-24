/**
 * R-22: 预设智能绑定 + 重置 + lastSelectedPresetId
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAIConfigStore } from '../../src/stores/ai-config'
import type { AIConfigPreset, AIConfig } from '../../src/lib/types'

function getS() { return useAIConfigStore.getState() }

function makePreset(over: Partial<AIConfigPreset> = {}): AIConfigPreset {
  return {
    id: 'p1',
    name: '预设 1',
    config: {
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      temperature: 0.7,
      maxTokens: 0,
    } as AIConfig,
    ...over,
  }
}

function seed(presets: AIConfigPreset[] = [makePreset()]) {
  useAIConfigStore.setState({
    config: presets[0] ? { ...presets[0].config } : {
      provider: 'deepseek', apiKey: '', model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1', temperature: 0.7, maxTokens: 0,
    } as AIConfig,
    presets,
    activePresetId: null,
    lastSelectedPresetId: null,
  })
}

describe('R-22: 预设智能绑定', () => {
  beforeEach(() => seed())

  it('1. setConfig 改成跟某预设完全一致 → 自动关联', () => {
    const p = makePreset({ id: 'pA', config: { ...makePreset().config, model: 'deepseek-coder' } as AIConfig })
    seed([p])
    expect(getS().activePresetId).toBeNull()
    getS().setConfig({ model: 'deepseek-coder' })
    expect(getS().activePresetId).toBe('pA')
  })

  it('2. setConfig 改成跟所有预设都不一样 → 脱钩', () => {
    seed([makePreset({ id: 'pA' })])
    getS().setConfig({ model: 'some-other-model' })
    expect(getS().activePresetId).toBeNull()
  })

  it('3. setConfig 改了又改回去 → 仍关联', () => {
    const p = makePreset({ id: 'pA', config: { ...makePreset().config, temperature: 0.9 } as AIConfig })
    seed([p])
    getS().applyPreset('pA')
    expect(getS().activePresetId).toBe('pA')
    getS().setConfig({ temperature: 0.5 })
    expect(getS().activePresetId).toBeNull()
    getS().setConfig({ temperature: 0.9 })
    expect(getS().activePresetId).toBe('pA')
  })

  it('4. applyPreset 记 lastSelectedPresetId', () => {
    seed([makePreset({ id: 'pA' }), makePreset({ id: 'pB', name: 'B' })])
    getS().applyPreset('pA')
    expect(getS().lastSelectedPresetId).toBe('pA')
    getS().applyPreset('pB')
    expect(getS().lastSelectedPresetId).toBe('pB')
  })

  it('5. switchProvider 智能脱钩:切到不匹配的 provider → 脱钩', () => {
    const openaiPreset = makePreset({
      id: 'pOpenAI',
      config: { ...makePreset().config, provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' } as AIConfig,
    })
    seed([makePreset(), openaiPreset])
    getS().applyPreset('pOpenAI')
    expect(getS().activePresetId).toBe('pOpenAI')
    expect(getS().lastSelectedPresetId).toBe('pOpenAI')
    getS().switchProvider('custom')
    expect(getS().activePresetId).toBeNull()
  })

  it('6. resetToLastSelectedPreset 重置回最近预设', () => {
    const pA = makePreset({ id: 'pA', config: { ...makePreset().config, temperature: 0.5 } as AIConfig })
    seed([pA])
    getS().applyPreset('pA')
    expect(getS().activePresetId).toBe('pA')
    expect(getS().config.temperature).toBe(0.5)
    getS().setConfig({ temperature: 0.9 })
    expect(getS().activePresetId).toBeNull()
    getS().resetToLastSelectedPreset()
    expect(getS().config.temperature).toBe(0.5)
    expect(getS().activePresetId).toBe('pA')
  })

  it('7. resetToLastSelectedPreset 没有 lastSelectedPresetId 时 noop', () => {
    seed([makePreset()])
    getS().resetToLastSelectedPreset()
    expect(getS().activePresetId).toBeNull()
  })

  it('8. deletePreset 删的是 lastSelectedPresetId 时清掉', () => {
    seed([makePreset({ id: 'pA' })])
    getS().applyPreset('pA')
    expect(getS().lastSelectedPresetId).toBe('pA')
    getS().deletePreset('pA')
    expect(getS().lastSelectedPresetId).toBeNull()
  })

  it('9. deletePreset 删的不是 lastSelectedPresetId 时不动', () => {
    seed([makePreset({ id: 'pA' }), makePreset({ id: 'pB', name: 'B' })])
    getS().applyPreset('pA')
    expect(getS().lastSelectedPresetId).toBe('pA')
    getS().deletePreset('pB')
    expect(getS().lastSelectedPresetId).toBe('pA')
  })

  it('10. renamePreset 不动 activePresetId', () => {
    seed([makePreset({ id: 'pA' })])
    getS().applyPreset('pA')
    expect(getS().activePresetId).toBe('pA')
    getS().renamePreset('pA', '新名字')
    expect(getS().activePresetId).toBe('pA')
    expect(getS().presets[0].name).toBe('新名字')
  })

  it('11. saveAsPreset 新预设自动成为 active + lastSelected', () => {
    seed([])
    getS().saveAsPreset('我的预设')
    const id = getS().presets[0].id
    expect(getS().activePresetId).toBe(id)
    expect(getS().lastSelectedPresetId).toBe(id)
  })

  it('12. updatePresetFromCurrent 后会自动关联回去', () => {
    seed([makePreset({ id: 'pA' })])
    getS().applyPreset('pA')
    getS().setConfig({ temperature: 0.3 })
    expect(getS().activePresetId).toBeNull()
    getS().updatePresetFromCurrent('pA')
    expect(getS().activePresetId).toBe('pA')
    expect(getS().lastSelectedPresetId).toBe('pA')
    expect(getS().presets[0].config.temperature).toBe(0.3)
  })
})
