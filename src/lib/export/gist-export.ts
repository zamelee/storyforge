import type { ProjectExportData } from './json-export'

const GIST_API = 'https://api.github.com/gists'

export interface GistConfig {
  pat: string       // GitHub Personal Access Token
  gistId?: string   // 已有 Gist ID（用于更新）
}

export interface GistResult {
  gistId: string
  url: string
}

/**
 * 将项目数据导出到 GitHub Gist（私密）
 * - 若 gistId 为空：创建新 Gist
 * - 若 gistId 存在：更新已有 Gist
 */
export async function exportToGist(
  data: ProjectExportData,
  config: GistConfig
): Promise<GistResult> {
  const filename = `storyforge-${data.project.name.replace(/\s+/g, '-')}.json`
  const content = JSON.stringify(data, null, 2)

  const body = {
    description: `故事熔炉备份 — ${data.project.name} (${new Date().toLocaleString('zh-CN')})`,
    public: false,
    files: {
      [filename]: { content },
    },
  }

  const headers = {
    Authorization: `Bearer ${config.pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  let response: Response
  if (config.gistId) {
    // 更新已有 Gist (PATCH)
    response = await fetch(`${GIST_API}/${config.gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
  } else {
    // 创建新 Gist (POST)
    response = await fetch(GIST_API, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message ?? `GitHub API 错误 ${response.status}`)
  }

  const json = await response.json()
  return {
    gistId: json.id,
    url: json.html_url,
  }
}

/** 一条云端备份（用于"从云端恢复"列表） */
export interface GistBackupMeta {
  gistId: string
  filename: string
  description: string
  updatedAt: string
}

/**
 * 列出该 GitHub 账号下所有"故事熔炉备份"Gist（按更新时间倒序）。
 * 换设备 / 清空浏览器后,即便本地没存 gistId,也能从这里找回备份。
 */
export async function listStoryforgeGists(pat: string): Promise<GistBackupMeta[]> {
  const response = await fetch(`${GIST_API}?per_page=100`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub API 错误 ${response.status}`)
  const gists = await response.json() as any[]
  const out: GistBackupMeta[] = []
  for (const g of gists) {
    const file = Object.values(g.files || {}).find((f: any) => /^storyforge-.*\.json$/i.test(f?.filename || '')) as any
    if (file) out.push({ gistId: g.id, filename: file.filename, description: g.description || '', updatedAt: g.updated_at })
  }
  return out
}

/**
 * 从指定 Gist 拉回备份并解析成 ProjectExportData（再交给 importProjectJSON 恢复）。
 */
export async function importFromGist(gistId: string, pat: string): Promise<ProjectExportData> {
  const response = await fetch(`${GIST_API}/${gistId}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message ?? `GitHub API 错误 ${response.status}`)
  }
  const json = await response.json()
  const file = Object.values(json.files || {}).find((f: any) => /^storyforge-.*\.json$/i.test(f?.filename || '')) as any
  if (!file) throw new Error('该 Gist 里没有故事熔炉备份文件')
  // 大文件 GitHub 会截断,truncated=true 时要去 raw_url 取全文
  let content: string = file.content
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url)
    content = await raw.text()
  }
  return JSON.parse(content) as ProjectExportData
}

/** 验证 PAT 是否有效（调用 /user 接口） */
export async function validateGitHubPAT(pat: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!response.ok) throw new Error('PAT 无效或权限不足')
  const json = await response.json()
  return json.login as string
}
