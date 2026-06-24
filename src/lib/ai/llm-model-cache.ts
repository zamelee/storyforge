/**
 * R-23: LLM 模型列表缓存 + 域名提取 + /models 拉取
 *
 * - 缓存到 IndexedDB llmModelCache 表(provider + baseUrl → models[])
 * - 只有用户主动点 🔄 时才刷新;否则从缓存读
 * - baseUrl 域名提取:http(s)://host(/:非-v开头的路径)?
 */

import { db } from '../db/schema'
import type { LLMModelCacheEntry, AIProvider } from '../types'

/** 从 baseUrl 提取建议名。
 *  - https://api.deepseek.com/v1 → "deepseek.com"
 *  - https://new.x5m5x.com/v1  → "new.x5m5x.com"
 *  - https://api.openai.com/v1/ → "api.openai.com"
 *  - https://my-proxy.com/openai/v1 → "my-proxy.com/openai"(非 v 开头的第一段路径保留)
 */
export function suggestPresetNameFromBaseUrl(baseUrl: string): string {
  if (!baseUrl) return ''
  let host = ''
  let firstPath = ''
  try {
    const u = new URL(baseUrl)
    host = u.host
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) firstPath = parts[0]
  } catch {
    const m = baseUrl.match(/^https?:\/\/([^\/]+)(.*)?$/i)
    if (!m) return baseUrl.slice(0, 40)
    host = m[1]
    firstPath = (m[2] || '').split('/').filter(Boolean)[0] || ''
  }
  // 第一段路径如果以 v 开头(v1/v3/api/v2),跳过
  if (firstPath && /^v\d/.test(firstPath)) firstPath = ''
  return firstPath ? `${host}/${firstPath}` : host
}

function cacheId(provider: AIProvider, baseUrl: string): string {
  return `${provider}::${baseUrl}`
}

/** 读缓存 */
export async function getCachedModels(provider: AIProvider, baseUrl: string): Promise<string[] | null> {
  if (!provider || !baseUrl) return null
  try {
    const entry = await db.llmModelCache.get(cacheId(provider, baseUrl))
    return entry?.models ?? null
  } catch {
    return null
  }
}

async function setCachedModels(provider: AIProvider, baseUrl: string, models: string[]): Promise<void> {
  try {
    await db.llmModelCache.put({
      id: cacheId(provider, baseUrl),
      provider,
      baseUrl,
      models,
      fetchedAt: Date.now(),
    })
  } catch (e) {
    console.warn('[llmModelCache] 写缓存失败:', (e as Error).message)
  }
}

/** 调 {baseUrl}/models 拉取模型列表(OpenAI 兼容协议) */
async function fetchModelsFromAPI(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const res = await fetch(url, {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  // OpenAI: { data: [{ id: "..." }, ...] }
  if (Array.isArray(json?.data)) {
    return (json.data as Array<{ id?: string; name?: string }>)
      .map((m) => m.id || m.name).filter(Boolean) as string[]
  }
  // 兼容 { models: [...] }
  if (Array.isArray(json?.models)) {
    return (json.models as Array<{ id?: string; name?: string } | string>)
      .map((m) => typeof m === 'string' ? m : (m.id || m.name))
      .filter(Boolean) as string[]
  }
  // 直接是数组
  if (Array.isArray(json)) {
    return (json as Array<{ id?: string; name?: string } | string>)
      .map((m) => typeof m === 'string' ? m : (m.id || m.name))
      .filter(Boolean) as string[]
  }
  throw new Error('无法识别 /models 响应格式(期望 { data: [...] } 或数组)')
}

/** 拉取模型列表(读缓存优先;forceRefresh=true 时强制刷新) */
export async function loadModels(
  provider: AIProvider,
  baseUrl: string,
  apiKey: string,
  forceRefresh = false,
): Promise<{ models: string[]; fromCache: boolean }> {
  if (!forceRefresh) {
    const cached = await getCachedModels(provider, baseUrl)
    if (cached && cached.length > 0) {
      return { models: cached, fromCache: true }
    }
  }
  const models = await fetchModelsFromAPI(baseUrl, apiKey)
  await setCachedModels(provider, baseUrl, models)
  return { models, fromCache: false }
}

/** 清除某个 (provider, baseUrl) 的缓存 */
export async function clearCachedModels(provider: AIProvider, baseUrl: string): Promise<void> {
  try {
    await db.llmModelCache.delete(cacheId(provider, baseUrl))
  } catch { /* noop */ }
}

/** 全部清掉 */
export async function clearAllCachedModels(): Promise<void> {
  try {
    await db.llmModelCache.clear()
  } catch { /* noop */ }
}

// LLMModelCacheEntry 是类型,运行时不需要导出,但供其他模块 import
export type { LLMModelCacheEntry }
