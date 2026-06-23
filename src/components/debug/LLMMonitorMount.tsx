import { useEffect } from 'react'
import Button from './LLMMonitorButton'
import Panel from './LLMMonitorPanel'
import { useLLMMonitorStore } from '../../lib/debug/store'

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
    const t = setInterval(() => checkIdleClear(), 60 * 1000)
    return () => clearInterval(t)
  }, [checkIdleClear])

  return (
    <>
      <Button />
      <Panel />
    </>
  )
}
