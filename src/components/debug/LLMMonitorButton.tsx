import { Activity } from 'lucide-react'
import { useLLMMonitorStore } from '../../lib/debug/store'

export default function LLMMonitorButton() {
  const isOpen = useLLMMonitorStore((s) => s.isOpen)
  const setOpen = useLLMMonitorStore((s) => s.setOpen)
  const enabled = useLLMMonitorStore((s) => s.enabled)
  if (!enabled) return null

  return (
    <button
      onClick={() => setOpen(!isOpen)}
      title={isOpen ? '收起 LLM 监控' : '展开 LLM 监控'}
      className={
        'fixed bottom-4 right-4 z-[9998] ' +
        'w-12 h-12 rounded-full shadow-lg border ' +
        'flex items-center justify-center transition-all ' +
        (isOpen
          ? 'bg-accent text-white border-accent'
          : 'bg-bg-surface text-accent border-border hover:border-accent hover:bg-accent/10')
      }
    >
      <Activity className="w-5 h-5" />
    </button>
  )
}
