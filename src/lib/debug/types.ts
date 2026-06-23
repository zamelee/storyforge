// LLM 监控探针的类型定义
// 由 fetch 拦截器、store、UI 共用。

export type LLMCallStatus = 'pending' | 'streaming' | 'done' | 'error'

/** 推测本次 LLM 调用来自哪个功能模块 */
export type LLMModuleHint =
  | 'outline'
  | 'chapter'
  | 'story-arc'
  | 'character'
  | 'inspiration'
  | 'foreshadow'
  | 'review'
  | 'state'
  | 'worldview'
  | 'rule'
  | 'style'
  | 'unknown'

/** 一次 LLM 调用的完整记录(同一次逻辑请求的所有重试合并为 1 条) */
export interface LLMCall {
  id: string
  timestamp: number
  url: string
  model: string
  moduleHint: LLMModuleHint
  status: LLMCallStatus
  /** 重试次数(0 = 首次即成功 / 0 = 失败未重试) */
  retries: number
  /** 重试历史: [{ attempt, statusCode, errorMessage }] */
  retryHistory: Array<{ attempt: number; statusCode?: number; errorMessage?: string }>
  request: {
    systemPrompt: string
    userPrompt: string
    fullBody: string
    bytes: number
  }
  response: {
    content: string
    fullBody: string
    chunks: string[]
    durationMs: number | null
  }
  error: string | null
}

/** store 的模式选择 */
export type LLMMonitorMode = 'accumulate' | 'track'

/** store 状态 */
export interface LLMMonitorState {
  /** 总开关 */
  enabled: boolean
  /** 是否已弹出过"敏感数据"确认 dialog */
  confirmed: boolean
  /** 是否展开面板 */
  isOpen: boolean
  requestMode: LLMMonitorMode
  responseMode: LLMMonitorMode
  /** 累积模式最大保留数 */
  maxRecords: number
  /** 5 分钟 idle 清空计时起点(0 = 未启动) */
  lastActivityAt: number
  calls: LLMCall[]
}
