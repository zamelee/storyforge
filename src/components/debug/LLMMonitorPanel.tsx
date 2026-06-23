import { useState, useEffect } from 'react'
import { X, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { useLLMMonitorStore } from '../../lib/debug/store'
import type { LLMCall, LLMMonitorMode } from '../../lib/debug/types'

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending:   { text: '等待', cls: 'text-text-muted bg-text-muted/10' },
  streaming: { text: '生成中', cls: 'text-accent bg-accent/10' },
  done:      { text: '完成', cls: 'text-success bg-success/10' },
  error:     { text: '失败', cls: 'text-error bg-error/10' },
}

const MODE_LABEL: Record<LLMMonitorMode, string> = {
  track: '跟踪',
  accumulate: '累积',
}

const MODULE_LABEL: Record<string, string> = {
  outline: '卷纲', chapter: '章节', 'story-arc': '故事线', character: '角色',
  inspiration: '反向灵感', foreshadow: '伏笔', state: '状态表', worldview: '世界观',
  rule: '世界规则', style: '文风', review: '审稿', unknown: '未识别',
}

export default function LLMMonitorPanel() {
  const isOpen = useLLMMonitorStore((s) => s.isOpen)
  const calls = useLLMMonitorStore((s) => s.calls)
  const requestMode = useLLMMonitorStore((s) => s.requestMode)
  const responseMode = useLLMMonitorStore((s) => s.responseMode)
  const lastActivityAt = useLLMMonitorStore((s) => s.lastActivityAt)

  const setOpen = useLLMMonitorStore((s) => s.setOpen)
  const setRequestMode = useLLMMonitorStore((s) => s.setRequestMode)
  const setResponseMode = useLLMMonitorStore((s) => s.setResponseMode)
  const clearAll = useLLMMonitorStore((s) => s.clearAll)
  const checkIdleClear = useLLMMonitorStore((s) => s.checkIdleClear)

  useEffect(() => {
    if (!isOpen) return
    const t = setInterval(() => checkIdleClear(), 30 * 1000)
    return () => clearInterval(t)
  }, [isOpen, checkIdleClear])

  if (!isOpen) return null

  return (
    <div
      className="fixed bottom-20 right-4 z-[9999] w-[min(90vw,800px)] h-[500px] max-h-[80vh] bg-bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-base">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">LLM 监控</span>
          <span className="text-xs text-text-muted">({calls.length} 条)</span>
          {lastActivityAt > 0 && (
            <span className="text-xs text-text-muted">· 5 分钟无操作自动清空</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearAll} title="清空所有记录" className="p-1.5 text-text-muted hover:text-error rounded transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(false)} title="收起" className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-px bg-border overflow-hidden">
        <CallList title="请求" calls={calls} mode={requestMode} onModeChange={setRequestMode} side="request" />
        <CallList title="响应" calls={calls} mode={responseMode} onModeChange={setResponseMode} side="response" />
      </div>
    </div>
  )
}

function CallList({
  title, calls, mode, onModeChange, side,
}: {
  title: string
  calls: LLMCall[]
  mode: LLMMonitorMode
  onModeChange: (m: LLMMonitorMode) => void
  side: 'request' | 'response'
}) {
  return (
    <div className="bg-bg-surface flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-base">
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
        <div className="flex items-center gap-1 text-[11px]">
          {(['track', 'accumulate'] as LLMMonitorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={
                'px-2 py-0.5 rounded transition-colors ' +
                (mode === m ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary')
              }
              title={m === 'track' ? '新请求来时清空旧的(只显示最新)' : '保留所有历史'}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {calls.length === 0 ? (
          <p className="text-xs text-text-muted text-center mt-8">
            暂无记录<br/>
            <span className="opacity-70">触发任意 LLM 调用后会出现在这里</span>
          </p>
        ) : (
          calls.map((c) => <CallCard key={c.id} call={c} side={side} />)
        )}
      </div>
    </div>
  )
}

function CallCard({ call, side }: { call: LLMCall; side: 'request' | 'response' }) {
  const [expanded, setExpanded] = useState(false)
  const statusInfo = STATUS_LABEL[call.status] || STATUS_LABEL.pending
  const time = new Date(call.timestamp).toLocaleTimeString('zh-CN', { hour12: false })

  const mainText = side === 'request'
    ? (call.request.userPrompt || call.request.systemPrompt || '(空)')
    : (call.response.content || '(流式中...)')

  const fullText = side === 'request'
    ? JSON.stringify({
        system: call.request.systemPrompt,
        user: call.request.userPrompt,
        full: call.request.fullBody,
      }, null, 2)
    : JSON.stringify({
        content: call.response.content,
        chunks_count: call.response.chunks.length,
        duration_ms: call.response.durationMs,
      }, null, 2)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard?.writeText(fullText).catch(() => {})
  }

  return (
    <div className="border border-border rounded-lg bg-bg-base overflow-hidden">
      <div
        className="flex items-center justify-between gap-1 px-2 py-1.5 cursor-pointer hover:bg-bg-hover transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {expanded ? <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />}
          <span className="text-[10px] text-text-muted font-mono">{time}</span>
          <span className={'text-[10px] px-1.5 rounded ' + statusInfo.cls}>{statusInfo.text}</span>
          <span className="text-[10px] text-text-muted truncate">
            {MODULE_LABEL[call.moduleHint] || call.moduleHint}
          </span>
          {call.retries > 0 && (
            <span className="text-[10px] text-amber-400">重试×{call.retries}</span>
          )}
        </div>
        <button onClick={handleCopy} title="复制完整内容" className="p-0.5 text-text-muted hover:text-text-primary flex-shrink-0">
          <Copy className="w-3 h-3" />
        </button>
      </div>
      <div className="px-2 pb-1.5">
        <pre className={'text-[11px] text-text-secondary whitespace-pre-wrap break-words font-mono ' +
                         (expanded ? '' : 'line-clamp-3 overflow-hidden')}>
          {mainText}
        </pre>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-border pt-1.5">
          <pre className="text-[10px] text-text-muted whitespace-pre-wrap break-words font-mono max-h-60 overflow-y-auto">
            {fullText}
          </pre>
        </div>
      )}
    </div>
  )
}
