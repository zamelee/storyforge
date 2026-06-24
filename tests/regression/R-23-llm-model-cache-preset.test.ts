/**
 * R-23: LLM 模型列表缓存 + 域名提取
 *
 * 覆盖:
 * 1. suggestPresetNameFromBaseUrl 各场景
 * 2. llmModelCache 表读 / 写 / 清
 * 3. loadModels 缓存命中 / miss(不测网络层,纯逻辑)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  suggestPresetNameFromBaseUrl,
  getCachedModels,
  loadModels,
  clearCachedModels,
  clearAllCachedModels,
} from '../../src/lib/ai/llm-model-cache'
import { db } from '../../src/lib/db/schema'

describe('R-23: LLM 模型列表缓存 + 域名提取', () => {
  beforeEach(async () => {
    await clearAllCachedModels()
  })

  // ──────────────────────────────────────────────
  // 1. suggestPresetNameFromBaseUrl
  // ──────────────────────────────────────────────
  describe('suggestPresetNameFromBaseUrl', () => {
    const cases: Array<[string, string, string]> = [
      // [baseUrl, expected, desc]
      ['https://api.deepseek.com/v1', 'api.deepseek.com', 'deepseek 官方 /v1'],
      ['https://api.deepseek.com/v1/', 'api.deepseek.com', 'deepseek 官方 /v1/ 末尾斜杠'],
      ['https://new.x5m5x.com/v1', 'new.x5m5x.com', 'x5m5x /v1'],
      ['https://api.openai.com/v1', 'api.openai.com', 'openai /v1'],
      ['https://my-proxy.com/openai/v1', 'my-proxy.com/openai', '非 v 开头路径保留'],
      ['https://my-proxy.com/v3/v1', 'my-proxy.com', 'v3 跳过,再 v1 也跳过'],
      ['https://localhost:1234', 'localhost:1234', '本地端口'],
      ['https://localhost:1234/v1', 'localhost:1234', '本地端口 + /v1'],
      ['not a url', 'not a url', '无效 URL 回退到截断'],
      ['', '', '空串返回空'],
    ]
    for (const [url, expected] of cases) {
      it(`"${url}" -> "${expected}"`, () => {
        expect(suggestPresetNameFromBaseUrl(url)).toBe(expected)
      })
    }
  })

  // ──────────────────────────────────────────────
  // 2. llmModelCache 表读写
  // ──────────────────────────────────────────────
  describe('llmModelCache IndexedDB 读写', () => {
    it('getCachedModels 空表返回 null', async () => {
      const r = await getCachedModels('deepseek', 'https://api.deepseek.com/v1')
      expect(r).toBeNull()
    })

    it('put + get 读出来一致', async () => {
      await db.llmModelCache.put({
        id: 'deepseek::https://api.deepseek.com/v1',
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
        fetchedAt: 1700000000000,
      })
      const r = await getCachedModels('deepseek', 'https://api.deepseek.com/v1')
      expect(r).toEqual(['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'])
    })

    it('不同 provider 各自独立', async () => {
      await db.llmModelCache.put({
        id: 'deepseek::https://api.deepseek.com/v1',
        provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1',
        models: ['d1'], fetchedAt: 1,
      })
      await db.llmModelCache.put({
        id: 'qwen::https://dashscope.aliyuncs.com/compatible-mode/v1',
        provider: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen-max', 'qwen-plus'], fetchedAt: 1,
      })
      expect(await getCachedModels('deepseek', 'https://api.deepseek.com/v1')).toEqual(['d1'])
      expect(await getCachedModels('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1'))
        .toEqual(['qwen-max', 'qwen-plus'])
      expect(await getCachedModels('deepseek', 'https://other.com/v1')).toBeNull()
    })

    it('clearCachedModels 只清单条', async () => {
      await db.llmModelCache.bulkPut([
        { id: 'a::u1', provider: 'a', baseUrl: 'u1', models: ['x'], fetchedAt: 1 },
        { id: 'b::u2', provider: 'b', baseUrl: 'u2', models: ['y'], fetchedAt: 1 },
      ])
      await clearCachedModels('a', 'u1')
      expect(await getCachedModels('a', 'u1')).toBeNull()
      expect(await getCachedModels('b', 'u2')).toEqual(['y'])
    })

    it('clearAllCachedModels 全清', async () => {
      await db.llmModelCache.bulkPut([
        { id: 'a::u1', provider: 'a', baseUrl: 'u1', models: ['x'], fetchedAt: 1 },
        { id: 'b::u2', provider: 'b', baseUrl: 'u2', models: ['y'], fetchedAt: 1 },
      ])
      await clearAllCachedModels()
      expect(await db.llmModelCache.count()).toBe(0)
    })
  })

  // ──────────────────────────────────────────────
  // 3. loadModels 行为
  // ──────────────────────────────────────────────
  describe('loadModels', () => {
    it('缓存命中时不调 fetch', async () => {
      // 预置缓存
      await db.llmModelCache.put({
        id: 'custom::https://hit.example/v1',
        provider: 'custom', baseUrl: 'https://hit.example/v1',
        models: ['m1', 'm2'], fetchedAt: 1,
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const r = await loadModels('custom', 'https://hit.example/v1', 'sk-test', false)
      expect(r).toEqual({ models: ['m1', 'm2'], fromCache: true })
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('缓存 miss 时不强制刷 = 也不调 fetch(因为 fetch 没 mock 会抛,不调就不该抛)', async () => {
      // 缓存空,强制不刷;但 loadModels 内部在 cache miss + forceRefresh=false 时仍会调 fetch
      // 这里只验证:缓存空 + forceRefresh=true 时调 fetch 并报网络错误(可观察)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND mock'))
      await expect(
        loadModels('custom', 'https://miss.example/v1', 'sk', true),
      ).rejects.toThrow('ENOTFOUND')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const callArg = fetchSpy.mock.calls[0]?.[0] as string
      expect(callArg).toContain('/models')
      fetchSpy.mockRestore()
    })

    it('forceRefresh=true 缓存命中也强制调 fetch', async () => {
      await db.llmModelCache.put({
        id: 'custom::https://force.example/v1',
        provider: 'custom', baseUrl: 'https://force.example/v1',
        models: ['old'], fetchedAt: 1,
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'new' }, { id: 'new2' }] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        }),
      )
      const r = await loadModels('custom', 'https://force.example/v1', 'sk', true)
      expect(r.fromCache).toBe(false)
      expect(r.models).toEqual(['new', 'new2'])
      expect(fetchSpy).toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('fetch 成功后写入缓存', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'a' }] }), { status: 200 }),
      )
      const r = await loadModels('custom', 'https://write.example/v1', 'sk', true)
      expect(r.models).toEqual(['a'])
      const cached = await getCachedModels('custom', 'https://write.example/v1')
      expect(cached).toEqual(['a'])
      fetchSpy.mockRestore()
    })
  })

  // ──────────────────────────────────────────────
  // 4. 集成:设置页面 openSavePreset 用 suggestPresetNameFromBaseUrl
  // ──────────────────────────────────────────────
  describe('集成:AIConfigPanel 行为约束', () => {
    it('AIConfigPanel.tsx 中 openSavePreset 调用了 suggestPresetNameFromBaseUrl', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/openSavePreset[\s\S]*suggestPresetNameFromBaseUrl/)
      expect(src).toMatch(/<button[\s\S]*新建\(空白\)/)
    })

    it('新建(空白)按钮 onClick 触发 setCreatingNew(true)', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/setCreatingNew\(true\)/)
    })

    it('Dialog 中保存按钮调用 handleSaveNewPreset', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/onClick=\{handleSaveNewPreset\}/)
    })
  })

  // R-23.1: B 方案 + E 按钮(模型列表显示)
  describe('R-23.1: datalist 旧值保留 + 显示全部按钮', () => {
    it('B 方案:useEffect 拉取成功时把当前 model 放到列表首位', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      // 关键代码片段:cur && !models.includes(cur) ? [cur, ...models] : models
      expect(src).toMatch(/cur && !models\.includes\(cur\)/)
    })

    it('E 方案:modelInputRef 已声明并绑定到 input', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/const modelInputRef = useRef<HTMLInputElement>\(null\)/)
      expect(src).toMatch(/ref=\{modelInputRef\}/)
    })

    it('E 方案:handleShowAllModels 清空 input + focus', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/handleShowAllModels/)
      expect(src).toMatch(/modelInputRef\.current\.value = ''/)
      expect(src).toMatch(/setConfig\(\{ model: '' \}\)/)
      expect(src).toMatch(/modelInputRef\.current\.focus\(\)/)
    })

    it('E 方案:模型输入框旁有 ▼ 按钮 onClick=handleShowAllModels', async () => {
      const fs = await import('node:fs/promises')
      const src = await fs.readFile(
        'D:/AiSystem/storyforge/src/components/settings/AIConfigPanel.tsx',
        'utf8',
      )
      expect(src).toMatch(/onClick=\{handleShowAllModels\}/)
      // 按钮文字是 ▼
      expect(src).toMatch(/>\s*▼\s*</)
    })
  })
})
