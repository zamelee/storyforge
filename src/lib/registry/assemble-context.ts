/**
 * assembleContext(Phase 1.3a) · 统一上下文装配入口。
 *
 * 1.3a 只新增入口。1.3b 再把 ai.start/chat 调用迁移到这里。
 */
import { estimateTokens, getModelPreset, type ContextLayer, type ContextSegment } from '../ai/context-budget'
import { CONTEXT_SOURCES, CONTEXT_SOURCE_BY_KEY } from './context-sources'
import type { AssembleContextInput, AssembleContextResult, ContextSource } from './types'

/** 拿不到模型时的保守默认输入预算(原固定 24K 偏紧,放宽避免内部提前裁) */
const FALLBACK_INPUT_BUDGET = 48_000
const LAYERS_BY_TRIM_PRIORITY: ContextLayer[] = ['L3', 'L2', 'L1']
// 核心上下文源:即使总 token 超预算,也不允许整段删除,只允许 content 截短。
// 这些是 AI 大纲生成必需的最小上下文:世界观、故事核心、角色库、世界规则。
const CORE_SOURCE_KEYS = new Set(['worldview', 'storyCore', 'characters', 'worldRules', 'existingVolumeOutlines', 'chapterOutline', 'chapterContent', 'detailedOutline'])


/**
 * 输入预算 = 所选模型的上下文窗口(减输出预留与安全边际)。
 * 这样上下文只在「真的接近模型窗口」时才按优先级软裁,而不是被固定小预算提前砍。
 */
function deriveInputBudget(input: AssembleContextInput): number {
  if (input.inputBudgetTokens && input.inputBudgetTokens > 0) return input.inputBudgetTokens
  if (input.provider && input.model) {
    const preset = getModelPreset(input.provider, input.model)
    const budget = preset.maxContext - preset.maxOutput - Math.round(preset.maxContext * 0.05)
    if (budget > 0) return budget
  }
  return FALLBACK_INPUT_BUDGET
}



// DEV 环境自挂到 window,方便 DevTools console 直接调用: window.__assembleContext({...})
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __assembleContext?: typeof assembleContext }).__assembleContext = assembleContext
}
export async function assembleContext(input: AssembleContextInput): Promise<AssembleContextResult> {
  if (import.meta.env?.DEV && typeof window !== 'undefined') { (window as unknown as { __assembleContext?: typeof assembleContext }).__assembleContext = assembleContext }
  const selected = selectSources(input)
  const omitted: string[] = []
  const keyedSegments: { key: string; segment: ContextSegment }[] = []

  for (const source of selected) {
    if (!requirementsMet(source, input)) {
      omitted.push(source.key)
      continue
    }
    if (source.enabled && !await source.enabled(input)) {
      omitted.push(source.key)
      continue
    }
    const content = await source.read(input)
    if (!content.trim()) {
      omitted.push(source.key)
      if (import.meta.env?.DEV) console.warn(`[assembleContext] source ${source.key} returned empty content for project ${input.projectId} (worldGroupId=${input.worldGroupId}, outlineNodeId=${input.outlineNodeId})`)
      continue
    }
    const capped = capBySourceBudget(content, source.budgetTokens)
    keyedSegments.push({
      key: source.key,
      segment: {
        label: source.label,
        layer: source.layer,
        content: capped,
        tokens: estimateTokens(capped),
        trimmable: source.layer !== 'L0',
      },
    })
  }

  const totalBeforeTrim = keyedSegments.reduce((sum, s) => sum + s.segment.tokens, 0)
  const inputBudget = deriveInputBudget(input)
  const overBudgetBeforeTrim = totalBeforeTrim > inputBudget
  const { kept, trimmed } = trimToFit(keyedSegments, inputBudget)
  const segments = kept.map(s => s.segment)

  return {
    text: segments.map(s => s.content).join('\n\n'),
    segments,
    included: kept.map(s => s.key),
    omitted,
    trimmed,
    totalInputTokens: segments.reduce((sum, s) => sum + s.tokens, 0),
    inputBudget,
    overBudgetBeforeTrim,
  }
}

function selectSources(input: AssembleContextInput): ContextSource[] {
  if (!input.sourceKeys?.length) return CONTEXT_SOURCES
  return input.sourceKeys
    .map(key => CONTEXT_SOURCE_BY_KEY.get(key))
    .filter((source): source is ContextSource => !!source)
}

function requirementsMet(source: ContextSource, input: AssembleContextInput): boolean {
  if (source.requiresWorldGroupId && !Object.prototype.hasOwnProperty.call(input, 'worldGroupId')) return false
  if (source.requiresOutlineNodeId && input.outlineNodeId == null && input.chapterId == null) return false
  if (source.requiresChapterId && input.chapterId == null) return false
  return true
}

function capBySourceBudget(content: string, budgetTokens: number): string {
  if (!budgetTokens || estimateTokens(content) <= budgetTokens) return content
  const approxChars = Math.max(100, Math.floor(budgetTokens * 1.4))
  return `${content.slice(0, approxChars)}\n…（该上下文源已按预算截断）`
}

function trimToFit(
  segments: { key: string; segment: ContextSegment }[],
  inputBudget: number,
): { kept: { key: string; segment: ContextSegment }[]; trimmed: string[] } {
  let kept = [...segments]
  const trimmed: string[] = []
  let total = kept.reduce((sum, s) => sum + s.segment.tokens, 0)
  if (total <= inputBudget) return { kept, trimmed }

  // 先按 L3 -> L2 -> L1 优先级裁剪非 CORE 段
  for (const layer of LAYERS_BY_TRIM_PRIORITY) {
    if (total <= inputBudget) break
    const removed = kept.filter(s => s.segment.layer === layer && s.segment.trimmable && !CORE_SOURCE_KEYS.has(s.key))
    if (!removed.length) continue
    kept = kept.filter(s => s.segment.layer !== layer || !s.segment.trimmable || CORE_SOURCE_KEYS.has(s.key))
    total = kept.reduce((sum, s) => sum + s.segment.tokens, 0)
    trimmed.push(...removed.map(s => s.key))
  }

  // 仍超预算:对 CORE 段按 content 截短(保留段,只缩短内容)
  // 特殊处理:characters 段截短时,优先保留所有角色名(name 字段),即使简介被砍
  if (total > inputBudget) {
    for (const item of kept) {
      if (total <= inputBudget) break
      if (!CORE_SOURCE_KEYS.has(item.key)) continue
      const overflow = total - inputBudget
      const targetTokens = Math.max(64, item.segment.tokens - overflow - 32)
      if (item.segment.tokens <= targetTokens) continue
      const approxChars = Math.max(40, Math.floor(targetTokens * 1.4))

      if (item.key === 'characters') {
        const names = extractCharacterNames(item.segment.content)
        if (names.length > 0) {
          const namesHeader = '【已创建的角色 · 名字清单(简介已裁)】\n' + names.join(' / ') + '\n\n'
          const remainingBudget = approxChars - namesHeader.length
          if (remainingBudget > 40) {
            item.segment.content = namesHeader + item.segment.content.slice(0, remainingBudget) + '\n...(简介已截断,以上名字均为可用角色)'
          } else {
            item.segment.content = namesHeader
          }
        } else {
          item.segment.content = item.segment.content.slice(0, approxChars) + '\n...(核心上下文源已按预算截断)'
        }
      } else {
        item.segment.content = item.segment.content.slice(0, approxChars) + '\n...(核心上下文源已按预算截断)'
      }

      item.segment.tokens = estimateTokens(item.segment.content)
      total = kept.reduce((sum, s) => sum + s.segment.tokens, 0)
    }
  }

  return { kept, trimmed }
}

/**
 * 从角色库 content 中抽取所有 name 字段(每行"- name(...)"格式)
 */
function extractCharacterNames(content: string): string[] {
  const names: string[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    // 识别 buildCharacterContext 的多种输出格式:
    // 1. "苏妄凝（主要 · 中立善良）..."     ← main
    // 2. "方屹：特助..."                    ← secondary(中文冒号)
    // 3. "苏妄凝、方屹(其他)..."            ← others(顿号分隔)
    // 4. "- 苏妄凝(...)..."                 ← 列表项
    const m = line.match(/^[\s-]*([\u4e00-\u9fa5A-Za-z·（）()0-9]{2,})\s*[（(:：]/)
    if (m && m[1]) {
      const name = m[1].trim()
      if (!names.includes(name)) names.push(name)
      // 顿号或逗号分隔的同义词(others 列表)
      const rest = line.substring(m.index! + m[0].length)
      const more = rest.split(/[、,，]/)
      for (const part of more) {
        const t = part.trim()
        if (t.length >= 2 && t.length <= 20) {
          const m2 = t.match(/^([\u4e00-\u9fa5A-Za-z·（）()0-9]{2,})[（(]/)
          if (m2 && m2[1] && !names.includes(m2[1])) names.push(m2[1])
        }
      }
    }
  }
  return names
}
