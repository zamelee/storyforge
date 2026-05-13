/**
 * 大文档分块导入流水线（Phase 18）
 *
 * 设计目标：让百万字～千万字小说也能稳定解析入库，并保证：
 *   · 每块即时写库（标签切走、刷新页面、断电都不丢已解析数据）
 *   · 单块失败自动重试 3 次，全失败后整体失败仍可手动重试
 *   · 支持暂停 / 恢复 / 取消
 *   · 状态、进度、日志全程通过 useImportStatusStore 暴露给 UI
 *   · 每 N 块 + 终末跑一次 AI 跨块角色合并，避免"一个人多个名"
 *
 * 严格串行（用户授权："慢点就慢点，保证不断就行"）。
 */

import { db } from '../db/schema'
import { chat } from '../ai/client'
import { renderPrompt } from '../ai/prompt-engine'
import { usePromptStore } from '../../stores/prompt'
import { useAIConfigStore } from '../../stores/ai-config'
import { useCharacterStore } from '../../stores/character'
import { useWorldviewStore } from '../../stores/worldview'
import { useOutlineStore } from '../../stores/outline'
import { useImportSessionStore } from '../../stores/import-session'
import { useImportStatusStore } from '../../stores/import-status'
import { extractJSON, IMPORT_MAX_TOKENS } from '../ai/adapters/import-adapter'
import type { UnifiedParseResult } from '../types/import-session-data'
import type { AIConfig, ChatMessage, Character, CharacterRole } from '../types'
import type { ImportSession, ChunkState } from '../types/import-session'
import {
  registerChunkTexts as _registerChunkTexts,
  hasChunkTexts as _hasChunkTexts,
  clearChunkTexts as _clearChunkTexts,
  getChunkText,
} from './chunk-text-registry'
import {
  mergeUnified, buildRollingContext, normalizeUnified, buildFinalReport,
} from './unified-merge'

// 保留原有 API：UI / 其他模块一直从 pipeline 引入这三个函数。
export const registerChunkTexts = _registerChunkTexts
export const hasChunkTexts = _hasChunkTexts
export const clearChunkTexts = _clearChunkTexts

/** 跨块合并的触发周期 */
const MERGE_EVERY_N = 10

/** 单块最大重试次数（用户已批准 3 次） */
const MAX_ATTEMPTS = 3

/** 重试之间等多久（避免触发 rate limit），毫秒 */
const RETRY_DELAY_MS = 1500

/** 控制器：用户暂停 / 取消时切给 pipeline */
let activeController: AbortController | null = null
let activePauseFlag = { paused: false }

export function pausePipeline() {
  activePauseFlag.paused = true
  activeController?.abort()
  useImportStatusStore.getState().setPhase('paused')
  useImportStatusStore.getState().pushActivity('warn', '⏸ 用户暂停')
}

export function cancelPipeline() {
  activeController?.abort()
  activePauseFlag.paused = true
  useImportStatusStore.getState().setPhase('idle')
  useImportStatusStore.getState().pushActivity('warn', '✕ 用户取消任务')
}

export function isPipelineRunning() {
  return activeController !== null && !activePauseFlag.paused
}

/** 暴露给 UI：跑一次完整的流水线（新会话 或 续跑现有会话） */
export async function runSession(args: {
  sessionId: number
  projectId: number
}): Promise<void> {
  const { sessionId, projectId } = args
  const sessionStore = useImportSessionStore.getState()
  const statusStore = useImportStatusStore.getState()

  // 拉最新 session
  let session = await sessionStore.load(sessionId)
  if (!session) throw new Error(`找不到导入会话 #${sessionId}`)

  // 重置控制
  activeController = new AbortController()
  activePauseFlag = { paused: false }

  statusStore.attachSession({
    sessionId,
    filename: session.filename,
    totalChunks: session.totalChunks,
    finishedChunks: session.chunks.filter(c => c.status === 'done').length,
    failedChunks: session.chunks.filter(c => c.status === 'failed').length,
    phase: 'running',
  })
  statusStore.pushActivity('info',
    `▶ 开始处理「${session.filename}」共 ${session.totalChunks} 块`)
  await sessionStore.patch(sessionId, { status: 'running' })
  await sessionStore.log(sessionId, -1, 'info',
    `开始处理：共 ${session.totalChunks} 块，已完成 ${
      session.chunks.filter(c => c.status === 'done').length} 块`)

  try {
    let processedSinceMerge = 0

    for (const chunk of session.chunks) {
      // 已完成的跳过
      if (chunk.status === 'done') continue
      // 检查暂停 / 取消
      if (activePauseFlag.paused) {
        await sessionStore.patch(sessionId, { status: 'paused' })
        statusStore.pushActivity('warn', '已暂停，可点恢复继续')
        return
      }

      session = await sessionStore.load(sessionId) // 重新读一次（防外部修改）
      if (!session) return

      const ok = await runChunk(session, chunk.index, projectId)
      if (ok) processedSinceMerge++

      // 每 N 块跑一次合并
      if (processedSinceMerge >= MERGE_EVERY_N) {
        processedSinceMerge = 0
        if (!activePauseFlag.paused) {
          await runCharacterMerge(sessionId, projectId, /*final*/ false)
        }
      }
    }

    if (activePauseFlag.paused) return

    // 终末合并 + 收尾
    await runCharacterMerge(sessionId, projectId, /*final*/ true)

    const fresh = await sessionStore.load(sessionId)
    if (!fresh) return
    const failedCount = fresh.chunks.filter(c => c.status === 'failed').length
    const doneCount = fresh.chunks.filter(c => c.status === 'done').length

    const report = buildFinalReport(fresh)
    await sessionStore.patch(sessionId, {
      status: failedCount === 0 ? 'done' : 'failed',
      finalReport: report,
      fatalError: failedCount > 0
        ? `${failedCount} 个块在重试 ${MAX_ATTEMPTS} 次后仍失败`
        : undefined,
    })
    statusStore.setPhase(failedCount === 0 ? 'done' : 'failed')
    statusStore.pushActivity(failedCount === 0 ? 'success' : 'warn',
      `任务结束：成功 ${doneCount} 块，失败 ${failedCount} 块`)
    if (failedCount > 0) {
      statusStore.setFatalError(`${failedCount} 个块多次重试仍失败，可在面板内单独重试这些块。`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if ((err as Error).name === 'AbortError') {
      statusStore.pushActivity('warn', '已中止')
      return
    }
    await sessionStore.patch(sessionId, { status: 'failed', fatalError: msg })
    statusStore.setPhase('failed')
    statusStore.setFatalError(msg)
    statusStore.pushActivity('error', `任务异常终止：${msg}`)
  } finally {
    activeController = null
  }
}

/** 跑单个 chunk，返回是否成功 */
async function runChunk(
  session: ImportSession,
  chunkIndex: number,
  projectId: number,
): Promise<boolean> {
  const sessionStore = useImportSessionStore.getState()
  const statusStore = useImportStatusStore.getState()
  const chunkState = session.chunks.find(c => c.index === chunkIndex)!

  // 重新切出本块原文（session 没保存原文，由调用方上传时已切；
  // 但因 session 不保存原文，我们让 ImportDocPanel 在 runSession 前把切好的文本
  // 缓存到 module 层的 IN_MEM_CHUNK_TEXT 里）
  const text = getChunkText(session.id!, chunkIndex)
  if (!text) {
    await sessionStore.patchChunk(session.id!, chunkIndex, {
      status: 'failed',
      errorMessage: '内存里找不到本块原文（页面刷新后续跑需重新上传同一文件）',
      attempts: chunkState.attempts,
      finishedAt: Date.now(),
    })
    statusStore.markChunkFinished({ success: false })
    statusStore.pushActivity('error',
      `块 ${chunkIndex + 1} 无原文，跳过（请重新上传文件以续跑）`, chunkIndex)
    await sessionStore.log(session.id!, chunkIndex, 'error', '原文丢失，跳过')
    return false
  }

  for (let attempt = chunkState.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    if (activePauseFlag.paused) return false

    statusStore.setActiveChunk(chunkIndex, attempt + 1)
    await sessionStore.patchChunk(session.id!, chunkIndex, {
      status: 'running',
      attempts: attempt + 1,
      startedAt: chunkState.startedAt || Date.now(),
    })

    const attemptNo = attempt + 1
    statusStore.pushActivity('info',
      `▶ 块 ${chunkIndex + 1}/${session.totalChunks} 解析中（第 ${attemptNo} 次）`,
      chunkIndex)
    await sessionStore.log(session.id!, chunkIndex, 'info',
      `第 ${attemptNo} 次尝试 · ${chunkState.charCount.toLocaleString()} 字`)

    try {
      const result = await parseChunkOnce({
        chunkIndex,
        totalChunks: session.totalChunks,
        knownContext: session.rollingContext || '（尚无已识别上下文）',
        rawDocument: text,
        signal: activeController?.signal,
      })

      // 入库
      const counts = await applyChunkResult(projectId, result)

      // 更新 session.merged 和 rollingContext
      const merged = mergeUnified(session.merged || {}, result)
      const rolling = buildRollingContext(merged)

      await sessionStore.patchChunk(session.id!, chunkIndex, {
        status: 'done',
        errorMessage: undefined,
        extractedCounts: counts,
        finishedAt: Date.now(),
      })
      await sessionStore.patch(session.id!, { merged, rollingContext: rolling })

      statusStore.markChunkFinished({ success: true })
      statusStore.pushActivity('success',
        `✓ 块 ${chunkIndex + 1} 完成 · 入库 世界观${counts.worldviewFields}/角色${counts.characters}/大纲${counts.outlineNodes}`,
        chunkIndex)
      await sessionStore.log(session.id!, chunkIndex, 'success',
        `成功：世界观+${counts.worldviewFields} 角色+${counts.characters} 大纲+${counts.outlineNodes}`)
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      const msg = err instanceof Error ? err.message : String(err)
      statusStore.pushActivity('warn',
        `块 ${chunkIndex + 1} 第 ${attemptNo} 次失败：${msg.slice(0, 80)}`, chunkIndex)
      await sessionStore.log(session.id!, chunkIndex, 'warn',
        `第 ${attemptNo} 次失败：${msg}`)
      await sessionStore.patchChunk(session.id!, chunkIndex, {
        status: 'pending',
        errorMessage: msg,
      })
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS)
      } else {
        // 最终失败
        await sessionStore.patchChunk(session.id!, chunkIndex, {
          status: 'failed',
          finishedAt: Date.now(),
        })
        statusStore.markChunkFinished({ success: false })
        statusStore.pushActivity('error',
          `✗ 块 ${chunkIndex + 1} 重试 ${MAX_ATTEMPTS} 次仍失败：${msg.slice(0, 80)}`,
          chunkIndex)
        await sessionStore.log(session.id!, chunkIndex, 'error',
          `最终失败：${msg}`)
        return false
      }
    }
  }
  return false
}

/** 调一次 AI 解析一个 chunk */
async function parseChunkOnce(args: {
  chunkIndex: number
  totalChunks: number
  knownContext: string
  rawDocument: string
  signal?: AbortSignal
}): Promise<UnifiedParseResult> {
  const tpl = usePromptStore.getState().getActive('import.parse-chunk')
  const { messages } = renderPrompt(tpl, {
    chunkIndex: args.chunkIndex + 1,
    totalChunks: args.totalChunks,
    knownContext: args.knownContext.slice(0, 2000),
    rawDocument: args.rawDocument,
  })
  const baseConfig = useAIConfigStore.getState().config
  const overrideMax = Math.max(baseConfig.maxTokens ?? 4096, IMPORT_MAX_TOKENS.all)
  const config: AIConfig = { ...baseConfig, maxTokens: overrideMax }
  if (!config.apiKey) throw new Error('未配置 AI API Key')

  const output = await chatWithAbort(messages, config, args.signal)
  const obj = extractJSON(output) as UnifiedParseResult
  return normalizeUnified(obj)
}

async function chatWithAbort(
  messages: ChatMessage[],
  config: AIConfig,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    const e = new Error('aborted')
    e.name = 'AbortError'
    throw e
  }
  // 用 chat() 非流式（流式取消处理稍麻烦；解析任务不需要 token-by-token）
  // 用 Promise.race 监听 abort
  return await Promise.race([
    chat(messages, config),
    new Promise<string>((_, reject) => {
      if (!signal) return
      const onAbort = () => {
        const e = new Error('aborted')
        e.name = 'AbortError'
        reject(e)
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }),
  ])
}

/** 把 chunk 解析结果即时写到 DB（worldview/characters/outline 表） */
async function applyChunkResult(
  projectId: number,
  result: UnifiedParseResult,
): Promise<{ worldviewFields: number; characters: number; outlineNodes: number }> {
  let worldviewFields = 0
  let charactersAdded = 0
  let outlineAdded = 0

  // ── 世界观：合并写 ─────────────────────────────────────────────
  if (result.worldview) {
    const wvStore = useWorldviewStore.getState()
    await wvStore.loadAll(projectId)
    const existing = useWorldviewStore.getState().worldview
    const patch: Record<string, string> = {}
    for (const [k, v] of Object.entries(result.worldview)) {
      if (typeof v === 'string' && v.trim()) {
        const cur = (existing?.[k as keyof typeof existing] as string) || ''
        // 同字段已有内容就追加（避免覆盖前面块的内容）
        patch[k] = cur ? `${cur}\n\n${v.trim()}` : v.trim()
        worldviewFields++
      }
    }
    if (Object.keys(patch).length > 0) {
      await wvStore.saveWorldview({ projectId, ...patch })
    }
  }

  // ── 角色：直接 add（合并交给跨块合并 step） ──────────────────
  if (Array.isArray(result.characters)) {
    const chStore = useCharacterStore.getState()
    for (const c of result.characters) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) continue
      const role = (c.role as CharacterRole) || 'minor'
      await chStore.addCharacter({
        projectId,
        name: c.name.trim(),
        role,
        shortDescription: String(c.shortDescription || ''),
        appearance: String(c.appearance || ''),
        personality: String(c.personality || ''),
        background: String(c.background || ''),
        motivation: String(c.motivation || ''),
        abilities: String(c.abilities || ''),
        relationships: String(c.relationships || ''),
        arc: String(c.arc || ''),
      })
      charactersAdded++
    }
  }

  // ── 大纲：递归写 ───────────────────────────────────────────────
  if (Array.isArray(result.outline)) {
    const olStore = useOutlineStore.getState()
    const writeNode = async (
      node: Record<string, unknown>,
      parentId: number | null,
      orderRef: { value: number },
    ): Promise<void> => {
      if (!node || typeof node.title !== 'string' || !node.title.trim()) return
      const isVolume = node.type === 'volume' ||
        (Array.isArray(node.children) && node.children.length > 0)
      const id = await olStore.addNode({
        projectId,
        parentId,
        type: isVolume ? 'volume' : 'chapter',
        title: node.title.trim(),
        summary: String(node.summary || ''),
        order: orderRef.value++,
      })
      outlineAdded++
      if (Array.isArray(node.children)) {
        const childOrder = { value: 0 }
        for (const c of node.children) {
          await writeNode(c as Record<string, unknown>, id, childOrder)
        }
      }
    }
    // 顶层 order 接着已有大纲数量
    await olStore.loadAll(projectId)
    const startOrder = useOutlineStore.getState().nodes
      .filter(n => n.parentId === null).length
    const ref = { value: startOrder }
    for (const n of result.outline) {
      await writeNode(n as Record<string, unknown>, null, ref)
    }
  }

  return {
    worldviewFields,
    characters: charactersAdded,
    outlineNodes: outlineAdded,
  }
}

/** 跑跨块角色合并（用 AI 找别名 / 同人） */
async function runCharacterMerge(
  sessionId: number,
  projectId: number,
  isFinal: boolean,
): Promise<void> {
  if (activePauseFlag.paused) return
  const statusStore = useImportStatusStore.getState()
  const sessionStore = useImportSessionStore.getState()

  statusStore.setPhase('merging')
  statusStore.pushActivity('info',
    isFinal ? '🔀 终末跨块角色合并...' : '🔀 阶段性跨块角色合并...')

  // 拉当前项目所有角色
  const allChars = await db.characters.where('projectId').equals(projectId).toArray()
  if (allChars.length < 2) {
    statusStore.setPhase('running')
    statusStore.pushActivity('info', '角色数 < 2，跳过合并')
    return
  }
  // 角色清单（截到最近 200 个，避免 prompt 爆炸）
  const recent = allChars.slice(-200)
  const lines = recent.map(c =>
    `${c.name}｜${c.role}｜${(c.shortDescription || '').slice(0, 40)}`,
  )
  const characterList = lines.join('\n')

  try {
    const tpl = usePromptStore.getState().getActive('import.merge-characters')
    const { messages } = renderPrompt(tpl, { characterList })
    const baseConfig = useAIConfigStore.getState().config
    const config: AIConfig = {
      ...baseConfig,
      maxTokens: Math.max(baseConfig.maxTokens ?? 4096, 4096),
    }
    if (!config.apiKey) throw new Error('未配置 AI API Key')

    const output = await chatWithAbort(messages, config, activeController?.signal)
    const parsed = extractJSON(output) as { mergeGroups?: Array<{
      canonical: string
      aliases: string[]
      reason?: string
    }>}

    let mergedCount = 0
    if (parsed?.mergeGroups && Array.isArray(parsed.mergeGroups)) {
      for (const g of parsed.mergeGroups) {
        if (!g.canonical || !Array.isArray(g.aliases) || g.aliases.length < 2) continue
        const merged = await applyMergeGroup(projectId, g.canonical, g.aliases, recent)
        if (merged > 0) {
          mergedCount += merged
          await sessionStore.log(sessionId, -1, 'success',
            `合并：${g.aliases.join(' = ')} → ${g.canonical}${g.reason ? '（' + g.reason + '）' : ''}`)
          statusStore.pushActivity('success',
            `合并：${g.aliases.join(' = ')} → ${g.canonical}`)
        }
      }
    }
    if (mergedCount === 0) {
      statusStore.pushActivity('info', '本轮无角色需要合并')
    }
    // 通知 UI 刷新
    await useCharacterStore.getState().loadAll(projectId)
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    const msg = err instanceof Error ? err.message : String(err)
    statusStore.pushActivity('warn', `角色合并失败（不影响主流程）：${msg.slice(0, 80)}`)
    await sessionStore.log(sessionId, -1, 'warn', `角色合并失败：${msg}`)
  } finally {
    statusStore.setPhase('running')
  }
}

/** 把同一组角色合并：选 canonical 那条，把其他条目的信息合并进来后删除 */
async function applyMergeGroup(
  projectId: number,
  canonical: string,
  aliases: string[],
  pool: Character[],
): Promise<number> {
  const targets = pool.filter(c => aliases.includes(c.name) && c.projectId === projectId)
  if (targets.length < 2) return 0

  // 优先选名字 == canonical 的，否则选 aliases[0] 那个
  const primary = targets.find(t => t.name === canonical) || targets[0]
  if (!primary.id) return 0

  const others = targets.filter(t => t.id !== primary.id)
  const append = (cur: string, extra: string) => {
    const e = (extra || '').trim()
    if (!e) return cur
    if (cur && cur.includes(e)) return cur
    return cur ? `${cur}\n\n${e}` : e
  }

  let merged: Partial<Character> = {
    name: canonical,
    shortDescription: primary.shortDescription,
    appearance: primary.appearance,
    personality: primary.personality,
    background: primary.background,
    motivation: primary.motivation,
    abilities: primary.abilities,
    relationships: primary.relationships,
    arc: primary.arc,
  }
  // 收集别名（写到 relationships 里附记）
  const aliasNote = `（曾用名/别称：${aliases.filter(a => a !== canonical).join('、')}）`

  for (const o of others) {
    merged.shortDescription = append(merged.shortDescription || '', o.shortDescription)
    merged.appearance = append(merged.appearance || '', o.appearance)
    merged.personality = append(merged.personality || '', o.personality)
    merged.background = append(merged.background || '', o.background)
    merged.motivation = append(merged.motivation || '', o.motivation)
    merged.abilities = append(merged.abilities || '', o.abilities)
    merged.relationships = append(merged.relationships || '', o.relationships)
    merged.arc = append(merged.arc || '', o.arc)
  }
  merged.relationships = append(merged.relationships || '', aliasNote)

  await db.transaction('rw', db.characters, async () => {
    await db.characters.update(primary.id!, { ...merged, updatedAt: Date.now() })
    for (const o of others) {
      if (o.id) await db.characters.delete(o.id)
    }
  })
  return others.length
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/** 单独重试某个失败的块（用户在 ReportModal 里点的"重试失败块"） */
export async function retryFailedChunks(args: {
  sessionId: number
  projectId: number
}): Promise<void> {
  const { sessionId, projectId } = args
  const sessionStore = useImportSessionStore.getState()
  const session = await sessionStore.load(sessionId)
  if (!session) return
  // 把失败的重置成 pending 并清空 attempts
  const chunks: ChunkState[] = session.chunks.map(c =>
    c.status === 'failed'
      ? { ...c, status: 'pending', attempts: 0, errorMessage: undefined }
      : c,
  )
  await sessionStore.patch(sessionId, { chunks, status: 'running', fatalError: undefined })
  await runSession({ sessionId, projectId })
}
