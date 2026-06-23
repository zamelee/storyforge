/**
 * R-21: LLM 监控探针
 * 覆盖:enabled 开关 / addOrUpdate 合并 / 模式切换 / idle 清空 / utils 纯函数
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLLMMonitorStore, llmMonitorApi } from '../../src/lib/debug/store'
import { detectModuleHint, extractPrompts, makeCallId } from '../../src/lib/debug/utils'
import type { LLMCall } from '../../src/lib/debug/types'

function makeCall(over: Partial<LLMCall> = {}): LLMCall {
  return {
    id: makeCallId(),
    timestamp: Date.now(),
    url: 'https://api.test.com/v1/chat/completions',
    model: 'test-model',
    moduleHint: 'outline',
    status: 'done',
    retries: 0,
    retryHistory: [],
    request: { systemPrompt: 'sys', userPrompt: 'usr', fullBody: '{}', bytes: 2 },
    response: { content: 'rsp', fullBody: '{}', chunks: ['rsp'], durationMs: 100 },
    error: null,
    ...over,
  }
}

describe('R-21: LLM 监控探针', () => {
  beforeEach(() => {
    useLLMMonitorStore.setState({
      enabled: false, confirmed: true, isOpen: false,
      requestMode: 'track', responseMode: 'track', maxRecords: 50,
      lastActivityAt: 0, calls: [],
    })
  })

  it('1. enabled=false 时 addOrUpdate 不写 store', () => {
    useLLMMonitorStore.setState({ enabled: false })
    llmMonitorApi.addOrUpdate(makeCall({ id: 'test1' }))
    expect(useLLMMonitorStore.getState().calls.length).toBe(0)
  })

  it('2. enabled=true 时 addOrUpdate 写 store', () => {
    useLLMMonitorStore.setState({ enabled: true })
    const c = makeCall({ id: 'test1', model: 'm1' })
    llmMonitorApi.addOrUpdate(c)
    const s = useLLMMonitorStore.getState()
    expect(s.calls.length).toBe(1)
    expect(s.calls[0].id).toBe('test1')
    expect(s.calls[0].model).toBe('m1')
    expect(s.lastActivityAt).toBeGreaterThan(0)
  })

  it('3. 同 id 二次 addOrUpdate 合并(重试/流式更新)', () => {
    useLLMMonitorStore.setState({ enabled: true })
    llmMonitorApi.addOrUpdate(makeCall({ id: 'r1', status: 'pending', retries: 0 }))
    llmMonitorApi.addOrUpdate(makeCall({ id: 'r1', status: 'done', retries: 2 }))
    const s = useLLMMonitorStore.getState()
    expect(s.calls.length).toBe(1)
    expect(s.calls[0].status).toBe('done')
    expect(s.calls[0].retries).toBe(2)
  })

  it('4. 跟踪模式:新 call 来时清空旧', () => {
    useLLMMonitorStore.setState({ enabled: true, requestMode: 'track', responseMode: 'track' })
    llmMonitorApi.addOrUpdate(makeCall({ id: 'a' }))
    llmMonitorApi.addOrUpdate(makeCall({ id: 'b' }))
    const s = useLLMMonitorStore.getState()
    expect(s.calls.length).toBe(1)
    expect(s.calls[0].id).toBe('b')
  })

  it('5. 累积模式:超过 maxRecords 时丢最早的', () => {
    useLLMMonitorStore.setState({ enabled: true, requestMode: 'accumulate', responseMode: 'accumulate', maxRecords: 3 })
    for (let i = 0; i < 5; i++) llmMonitorApi.addOrUpdate(makeCall({ id: 'c' + i }))
    const s = useLLMMonitorStore.getState()
    expect(s.calls.length).toBe(3)
    expect(s.calls[0].id).toBe('c2')
    expect(s.calls[2].id).toBe('c4')
  })

  it('6. 5 分钟 idle 后自动清空', () => {
    const now = Date.now()
    useLLMMonitorStore.setState({
      calls: [makeCall({ id: 'a' })],
      lastActivityAt: now - (6 * 60 * 1000),
    })
    useLLMMonitorStore.getState().checkIdleClear()
    expect(useLLMMonitorStore.getState().calls.length).toBe(0)
  })

  it('7. 不到 5 分钟不清空', () => {
    const now = Date.now()
    useLLMMonitorStore.setState({
      calls: [makeCall({ id: 'a' })],
      lastActivityAt: now - (3 * 60 * 1000),
    })
    useLLMMonitorStore.getState().checkIdleClear()
    expect(useLLMMonitorStore.getState().calls.length).toBe(1)
  })

  it('8. clearAll 立即清空', () => {
    useLLMMonitorStore.setState({ enabled: true, calls: [makeCall()], lastActivityAt: Date.now() })
    useLLMMonitorStore.getState().clearAll()
    const s = useLLMMonitorStore.getState()
    expect(s.calls.length).toBe(0)
    expect(s.lastActivityAt).toBe(0)
  })

  it('9. setStatus 改状态并保留 error', () => {
    useLLMMonitorStore.setState({ enabled: true, calls: [makeCall({ id: 'x', status: 'pending' })] })
    llmMonitorApi.setStatus('x', 'error', '网络挂了')
    const c = useLLMMonitorStore.getState().calls[0]
    expect(c.status).toBe('error')
    expect(c.error).toBe('网络挂了')
  })

  it('10. detectModuleHint 识别关键词', () => {
    expect(detectModuleHint('', '卷纲: 主角')).toBe('outline')
    expect(detectModuleHint('', '故事线: 阶段一')).toBe('story-arc')
    expect(detectModuleHint('', '角色档案: 主角')).toBe('character')
    expect(detectModuleHint('', '随便一点别的')).toBe('unknown')
  })

  it('11. extractPrompts 抽 system + 最后 user', () => {
    const messages = [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: '再见' },
    ]
    const r = extractPrompts(messages)
    expect(r.systemPrompt).toBe('你是助手')
    expect(r.userPrompt).toBe('再见')
  })

  it('12. extractPrompts 异常输入不崩', () => {
    expect(extractPrompts(null).userPrompt).toBe('')
    expect(extractPrompts(undefined).userPrompt).toBe('')
    expect(extractPrompts('not array').userPrompt).toBe('')
    expect(extractPrompts([]).userPrompt).toBe('')
  })
})
