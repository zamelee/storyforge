import { useEffect } from 'react'
import Button from './LLMMonitorButton'
import Panel from './LLMMonitorPanel'
import { useLLMMonitorStore } from '../../lib/debug/store'

const KEEP_ALIVE_KEY = 'sf_llm_monitor_keepalive'

export default function LLMMonitorMount() {
  const checkIdleClear = useLLMMonitorStore((s) => s.checkIdleClear)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        const cur = useLLMMonitorStore.getState().isOpen
        useLLMMonitorStore.getState().setOpen(!cur)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const keepAlive = localStorage.getItem(KEEP_ALIVE_KEY) === 'true'
      if (!keepAlive) checkIdleClear()
    }, 60 * 1000)
    return () => clearInterval(t)
  }, [checkIdleClear])

  return (
    <>
      <Button />
      <Panel />
    </>
  )
}
