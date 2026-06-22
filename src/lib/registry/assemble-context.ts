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

  for (const layer of LAYERS_BY_TRIM_PRIORITY) {
    if (total <= inputBudget) break
    const removed = kept.filter(s => s.segment.layer === layer && s.segment.trimmable)
    if (!removed.length) continue
    kept = kept.filter(s => s.segment.layer !== layer || !s.segment.trimmable)
    total = kept.reduce((sum, s) => sum + s.segment.tokens, 0)
    trimmed.push(...removed.map(s => s.key))
  }

  return { kept, trimmed }
}
