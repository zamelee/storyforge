/**
 * 云备份卡（GitHub Gist）—— FB-11 数据持久 · A
 *
 * 把项目备份到 GitHub 私密 Gist：数据离开浏览器存到云端，清浏览器 / 换设备都不丢，可一键拉回。
 * 需要用户提供一个带 `gist` 权限的 GitHub Personal Access Token（opt-in）。
 */
import { useState } from 'react'
import { Cloud, CloudUpload, CloudDownload, Check, Loader2, LogOut, ExternalLink } from 'lucide-react'
import { useGistStore } from '../../stores/gist'
import type { GistBackupMeta } from '../../lib/export/gist-export'

interface Props {
  projectId: number
  onImported?: (newId: number) => void
}

export default function CloudBackupCard({ projectId, onImported }: Props) {
  const { pat, username, autoBackup, busy, error, connect, disconnect, backupProject, restoreFromGist, listBackups, setAutoBackup, projBackup } = useGistStore()
  const [patInput, setPatInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [backups, setBackups] = useState<GistBackupMeta[] | null>(null)
  const proj = projBackup(projectId)

  const handleConnect = async () => {
    if (!patInput.trim()) return
    const ok = await connect(patInput)
    if (ok) { setPatInput(''); setMsg('已连接 GitHub') }
  }
  const handleBackup = async () => {
    setMsg(null)
    const r = await backupProject(projectId)
    if (r) setMsg('✓ 已备份到云端')
  }
  const handleShowRestore = async () => {
    setMsg(null)
    setBackups(await listBackups())
  }
  const handleRestore = async (gistId: string, title: string) => {
    if (!confirm(`从云端恢复「${title}」？将新建一个项目，不会覆盖当前项目。`)) return
    const newId = await restoreFromGist(gistId)
    if (newId) { setMsg('✓ 已从云端恢复为新项目'); setBackups(null); onImported?.(newId) }
  }

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Cloud className="w-5 h-5 text-sky-400" />
        <h3 className="text-sm font-semibold text-text-primary">云备份（GitHub）</h3>
      </div>
      <p className="text-xs text-text-muted mb-3">
        备份到你的 GitHub 私密 Gist —— 数据存在云端，<strong>清浏览器 / 换设备都不丢</strong>，可一键拉回。
      </p>

      {!pat ? (
        // 未连接:填 PAT
        <div className="space-y-2">
          <input
            type="password"
            value={patInput}
            onChange={e => setPatInput(e.target.value)}
            placeholder="粘贴 GitHub Personal Access Token（需 gist 权限）"
            className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleConnect} disabled={busy || !patInput.trim()}
              className="px-3 py-1.5 rounded bg-sky-500/80 text-white text-sm hover:bg-sky-500 disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} 连接 GitHub
            </button>
            <a href="https://github.com/settings/tokens/new?scopes=gist&description=storyforge-backup" target="_blank" rel="noreferrer"
              className="text-xs text-sky-400 hover:underline flex items-center gap-0.5">
              如何创建 Token <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-[11px] text-text-muted">Token 只存在你本机浏览器，仅用于读写你自己的私密 Gist。</p>
        </div>
      ) : (
        // 已连接
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-success" /> 已连接 <strong>@{username}</strong>
            </span>
            <button onClick={() => { disconnect(); setBackups(null) }} className="text-[11px] text-text-muted hover:text-error flex items-center gap-0.5">
              <LogOut className="w-3 h-3" /> 断开
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleBackup} disabled={busy}
              className="px-3 py-1.5 rounded bg-sky-500/80 text-white text-sm hover:bg-sky-500 disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} 立即备份到云端
            </button>
            <button onClick={handleShowRestore} disabled={busy}
              className="px-3 py-1.5 rounded border border-border text-text-secondary text-sm hover:bg-bg-hover disabled:opacity-50 flex items-center gap-1.5">
              <CloudDownload className="w-4 h-4" /> 从云端恢复
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={autoBackup} onChange={e => setAutoBackup(e.target.checked)} className="accent-sky-400" />
            自动备份（每隔几分钟把改动推到云端）
          </label>

          {proj?.lastBackupAt && (
            <p className="text-[11px] text-text-muted">本项目上次云备份：{new Date(proj.lastBackupAt).toLocaleString('zh-CN')}</p>
          )}

          {backups && (
            <div className="border border-border rounded p-2 space-y-1 max-h-48 overflow-y-auto bg-bg-base">
              {backups.length === 0 ? (
                <p className="text-xs text-text-muted">云端暂无备份。</p>
              ) : backups.map(b => (
                <button key={b.gistId} onClick={() => handleRestore(b.gistId, b.description || b.filename)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-bg-hover text-xs">
                  <div className="text-text-primary truncate">{b.description || b.filename}</div>
                  <div className="text-[10px] text-text-muted">更新于 {new Date(b.updatedAt).toLocaleString('zh-CN')}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(msg || error) && (
        <p className={`text-xs mt-2 ${error ? 'text-error' : 'text-success'}`}>{error || msg}</p>
      )}
    </div>
  )
}
