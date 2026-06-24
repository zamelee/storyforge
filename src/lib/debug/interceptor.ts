import { llmMonitorApi, useLLMMonitorStore } from './store'
import { makeCallId, detectModuleHint, extractPrompts } from './utils'
import type { LLMCall } from './types'

/** 是否是 LLM 调用的 URL(只拦 chat/completions,避开 Gist/其他) */
function isLLMUrl(url: string): boolean {
  return /\/v1\/chat\/completions|\/chat\/completions/i.test(url)
}

/**
 * 安装 fetch 拦截器。
 * - 拦截所有 chat/completions 调用
 * - 记录请求 / 流式响应
 * - 同一次逻辑调用的多次重试合并为 1 条 call
 * - 如果 store.enabled = false,完全直通(零开销)
 */
export function installFetchInterceptor(): () => void {
  if (typeof window === 'undefined') return () => {}
  const originalFetch = window.fetch.bind(window)

  const w = window as unknown as { __llmMonitorFetchInstalled?: boolean }
  if (w.__llmMonitorFetchInstalled) return () => {}
  w.__llmMonitorFetchInstalled = true

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url

    if (!isLLMUrl(url)) {
      return originalFetch(input, init)
    }
    if (!llmMonitorApi.isEnabled()) {
      return originalFetch(input, init)
    }

    const callId = makeCallId()
    const startTime = Date.now()
    const bodyStr = (init?.body as string) || ''
    const messages = safeParseMessages(bodyStr)
    const { systemPrompt, userPrompt } = extractPrompts(messages)
    const model = safeGetModel(bodyStr)
    const moduleHint = detectModuleHint(url, bodyStr)

    const initialCall: LLMCall = {
      id: callId,
      timestamp: startTime,
      url,
      model,
      moduleHint,
      status: 'pending',
      retries: 0,
      retryHistory: [],
      request: { systemPrompt, userPrompt, fullBody: bodyStr, bytes: bodyStr.length },
      response: { content: '', fullBody: '', chunks: [], durationMs: null },
      error: null,
    }
    llmMonitorApi.addOrUpdate(initialCall)

    // === 重试循环(模拟 client.ts 的 429/503 重试) ===
    const MAX_RETRIES = 2
    let attempt = 0
    let response: Response | null = null
    let lastError: Error | null = null

    while (attempt <= MAX_RETRIES) {
      try {
        response = await originalFetch(input, init)
        if (response.ok) break
        if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
          const errText = await safeReadText(response)
          appendRetry(callId, attempt, response.status, errText)
          const wait = (attempt + 1) * 2000
          await new Promise((r) => setTimeout(r, wait))
          attempt++
          continue
        }
        break
      } catch (e) {
        lastError = e as Error
        if (attempt < MAX_RETRIES) {
          appendRetry(callId, attempt, undefined, lastError.message)
          const wait = attempt * 2000
          await new Promise((r) => setTimeout(r, wait))
          attempt++
          continue
        }
        break
      }
    }

    if (!response) {
      const msg = lastError?.message || '网络错误,未拿到响应'
      llmMonitorApi.setStatus(callId, 'error', msg)
      throw lastError || new Error(msg)
    }

    if (!response.ok) {
      const errText = await safeReadText(response)
      llmMonitorApi.setStatus(callId, 'error', 'HTTP ' + response.status + ': ' + errText.slice(0, 200))
      return response
    }

    // === 处理响应: 流式 vs 非流式 ===
    const contentType = response.headers.get('content-type') || ''
    const isStream = contentType.includes('text/event-stream') || contentType.includes('stream')

    if (isStream) {
      const cloned = response.clone()
      void consumeStream(cloned, callId, startTime)
      return response
    }

    // 非流式
    try {
      const text = await response.text()
      const cur = useLLMMonitorStore.getState().calls.find((c) => c.id === callId)
      if (cur) {
        llmMonitorApi.addOrUpdate({
          ...cur,
          status: 'done',
          retries: attempt,
          response: {
            content: text,
            fullBody: text,
            chunks: [text],
            durationMs: Date.now() - startTime,
          },
        })
      }
    } catch (e) {
      llmMonitorApi.setStatus(callId, 'error', '读取响应失败: ' + (e as Error).message)
    }
    return response
  }

  return () => {
    window.fetch = originalFetch
    w.__llmMonitorFetchInstalled = false
  }
}

// === helpers(无 import store,避免循环) ===

function safeParseMessages(bodyStr: string): unknown {
  try { return JSON.parse(bodyStr)?.messages ?? [] } catch { return [] }
}

function safeGetModel(bodyStr: string): string {
  try { return JSON.parse(bodyStr)?.model || '(unknown)' } catch { return '(unparseable)' }
}

async function safeReadText(response: Response): Promise<string> {
  try { return await response.text() } catch { return '' }
}

/** 追加一条重试记录(动态 import store) */
function appendRetry(
  callId: string,
  attempt: number,
  statusCode: number | undefined,
  errorMessage: string | undefined
): void {
  // 直接 import store(模块已加载,动态 import 不会重复执行)
  void import('./store').then(({ useLLMMonitorStore }) => {
    const cur = useLLMMonitorStore.getState().calls.find((c) => c.id === callId)
    if (!cur) return
    llmMonitorApi.addOrUpdate({
      ...cur,
      retries: attempt + 1,
      retryHistory: [...cur.retryHistory, { attempt, statusCode, errorMessage }],
    })
  })
}

/** 异步消费 SSE 流 */
async function consumeStream(response: Response, callId: string, startTime: number): Promise<void> {
  if (!response.body) {
    llmMonitorApi.setStatus(callId, 'error', 'response.body is null')
    return
  }
  llmMonitorApi.setStatus(callId, 'streaming')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const chunks: string[] = []
  let content = ''

  // 动态 import 拿 store
  const { useLLMMonitorStore: store } = await import('./store')

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const piece = json.choices?.[0]?.delta?.content
            if (piece) {
              chunks.push(piece)
              content += piece
              const cur = store.getState().calls.find((c) => c.id === callId)
              if (cur) {
                llmMonitorApi.addOrUpdate({
                  ...cur,
                  status: 'streaming',
                  response: { ...cur.response, content, chunks: [...chunks] },
                })
              }
            }
          } catch { /* ignore single-line parse error */ }
        }
      }
    }
    const cur = store.getState().calls.find((c) => c.id === callId)
    if (cur) {
      llmMonitorApi.addOrUpdate({
        ...cur,
        status: 'done',
        response: {
          ...cur.response,
          content,
          fullBody: '[streamed ' + chunks.length + ' chunks, ' + content.length + ' chars]',
          chunks: [...chunks],
          durationMs: Date.now() - startTime,
        },
      })
    }
  } catch (e) {
    llmMonitorApi.setStatus(callId, 'error', (e as Error).message)
  }
}
