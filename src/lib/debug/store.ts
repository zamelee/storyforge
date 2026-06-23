import { create } from 'zustand'
import type { LLMCall, LLMMonitorMode, LLMCallStatus } from './types'
import { IDLE_CLEAR_MS } from './utils'

export interface LLMMonitorActions {
  setEnabled: (v: boolean) => void
  setConfirmed: () => void
  setOpen: (v: boolean) => void
  setRequestMode: (m: LLMMonitorMode) => void
  setResponseMode: (m: LLMMonitorMode) => void
  clearAll: () => void
  checkIdleClear: () => void
}

export type LLMMonitorStore = {
  enabled: boolean
  confirmed: boolean
  isOpen: boolean
  requestMode: LLMMonitorMode
  responseMode: LLMMonitorMode
  maxRecords: number
  lastActivityAt: number
  calls: LLMCall[]
} & LLMMonitorActions

export const useLLMMonitorStore = create<LLMMonitorStore>((set, get) => ({
  enabled: false,
  confirmed: false,
  isOpen: false,
  requestMode: 'track',
  responseMode: 'track',
  maxRecords: 50,
  lastActivityAt: 0,
  calls: [],

  setEnabled: (v) => set({ enabled: v }),
  setConfirmed: () => set({ confirmed: true }),
  setOpen: (v) => set({ isOpen: v }),
  setRequestMode: (m) => set({ requestMode: m }),
  setResponseMode: (m) => set({ responseMode: m }),
  clearAll: () => set({ calls: [], lastActivityAt: 0 }),
  checkIdleClear: () => {
    const s = get()
    if (!s.lastActivityAt) return
    if (Date.now() - s.lastActivityAt > IDLE_CLEAR_MS && s.calls.length > 0) {
      set({ calls: [], lastActivityAt: 0 })
    }
  },
}))

/** 拦截器专用 API(非 hook 形式) */
export const llmMonitorApi = {
  isEnabled: (): boolean => useLLMMonitorStore.getState().enabled,

  addOrUpdate: (call: LLMCall): void => {
    const s = useLLMMonitorStore.getState()
    if (!s.enabled) return
    useLLMMonitorStore.setState({ lastActivityAt: Date.now() })
    const existing = s.calls.find((c) => c.id === call.id)
    let next: LLMCall[]
    if (existing) {
      next = s.calls.map((c) => (c.id === call.id ? call : c))
    } else {
      if (s.requestMode === 'track' || s.responseMode === 'track') {
        next = [call]
      } else {
        next = [...s.calls, call]
        if (next.length > s.maxRecords) next = next.slice(next.length - s.maxRecords)
      }
    }
    useLLMMonitorStore.setState({ calls: next })
  },

  setStatus: (id: string, status: LLMCallStatus, error?: string): void => {
    const s = useLLMMonitorStore.getState()
    if (!s.enabled) return
    useLLMMonitorStore.setState({
      lastActivityAt: Date.now(),
      calls: s.calls.map((c) =>
        c.id === id ? { ...c, status, error: error ?? c.error } : c
      ),
    })
  },
}
