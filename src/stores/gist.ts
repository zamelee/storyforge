/**
 * Gist 云备份 store（FB-11 数据持久 · A）
 *
 * 把项目数据备份到 GitHub 私密 Gist —— 数据离开浏览器存到 GitHub 云端,
 * 清浏览器 / 换设备都不丢,可一键拉回。配置存 localStorage,不动 DB schema。
 */
import { create } from 'zustand'
import {
  exportToGist, importFromGist, validateGitHubPAT, listStoryforgeGists,
  type GistBackupMeta,
} from '../lib/export/gist-export'
import { exportProjectJSON, importProjectJSON } from '../lib/export/json-export'

const PAT_KEY = 'sf-gist-pat'
const USER_KEY = 'sf-gist-user'
const AUTO_KEY = 'sf-gist-auto'
const projKey = (projectId: number) => `sf-gist-proj-${projectId}`

interface ProjBackup { gistId: string; lastBackupAt: number }

function readProj(projectId: number): ProjBackup | null {
  try { const s = localStorage.getItem(projKey(projectId)); return s ? JSON.parse(s) : null } catch { return null }
}
function writeProj(projectId: number, v: ProjBackup) {
  localStorage.setItem(projKey(projectId), JSON.stringify(v))
}

interface GistState {
  pat: string | null
  username: string | null
  autoBackup: boolean
  busy: boolean
  error: string | null

  /** 连接 GitHub:验证 PAT 并保存 */
  connect: (pat: string) => Promise<boolean>
  disconnect: () => void
  setAutoBackup: (on: boolean) => void
  /** 备份指定项目到云端(创建/更新该项目的 Gist) */
  backupProject: (projectId: number) => Promise<{ url: string } | null>
  /** 从指定 Gist 恢复(新建一个项目),返回新项目 id */
  restoreFromGist: (gistId: string) => Promise<number | null>
  /** 列出该账号下所有故事熔炉备份(换设备找回用) */
  listBackups: () => Promise<GistBackupMeta[]>
  /** 读某项目的本地备份状态(gistId / 上次备份时间) */
  projBackup: (projectId: number) => ProjBackup | null
}

export const useGistStore = create<GistState>((set, get) => ({
  pat: localStorage.getItem(PAT_KEY),
  username: localStorage.getItem(USER_KEY),
  autoBackup: localStorage.getItem(AUTO_KEY) === '1',
  busy: false,
  error: null,

  connect: async (pat) => {
    set({ busy: true, error: null })
    try {
      const login = await validateGitHubPAT(pat.trim())
      localStorage.setItem(PAT_KEY, pat.trim())
      localStorage.setItem(USER_KEY, login)
      set({ pat: pat.trim(), username: login, busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : '连接失败' })
      return false
    }
  },

  disconnect: () => {
    localStorage.removeItem(PAT_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(AUTO_KEY)
    set({ pat: null, username: null, autoBackup: false })
  },

  setAutoBackup: (on) => {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
    set({ autoBackup: on })
  },

  backupProject: async (projectId) => {
    const { pat } = get()
    if (!pat) { set({ error: '未连接 GitHub' }); return null }
    set({ busy: true, error: null })
    try {
      const data = await exportProjectJSON(projectId)
      const existing = readProj(projectId)
      const res = await exportToGist(data, { pat, gistId: existing?.gistId })
      writeProj(projectId, { gistId: res.gistId, lastBackupAt: Date.now() })
      set({ busy: false })
      return { url: res.url }
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : '备份失败' })
      return null
    }
  },

  restoreFromGist: async (gistId) => {
    const { pat } = get()
    if (!pat) { set({ error: '未连接 GitHub' }); return null }
    set({ busy: true, error: null })
    try {
      const data = await importFromGist(gistId, pat)
      const newId = await importProjectJSON(data as any)
      set({ busy: false })
      return newId
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : '恢复失败' })
      return null
    }
  },

  listBackups: async () => {
    const { pat } = get()
    if (!pat) return []
    return listStoryforgeGists(pat)
  },

  projBackup: (projectId) => readProj(projectId),
}))
