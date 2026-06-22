/**
 * Phase 26.4 — 灵感反推
 *
 * 用户写碎片灵感 → AI 反向生成世界观草稿、故事核心、初始角色卡
 */

import type {
  ChatMessage,
  CharacterMoralAxis,
  CharacterOrderAxis,
  CharacterRoleWeight,
} from '../types'
import { usePromptStore } from '../../stores/prompt'
import { renderPrompt } from './prompt-engine'

// ── 类型 ────────────────────────────────────────────────────────────────

export interface ReverseWorldview {
  worldOrigin: string
  powerHierarchy: string
  continentLayout: string
  climateByRegion: string
  historyLine: string
  races: string
  factionLayout: string
}

export interface ReverseStoryCore {
  logline: string
  theme: string
  centralConflict: string
  plotPattern: string
  mainPlot: string
}

export interface ReverseCharacter {
  name: string
  roleWeight: CharacterRoleWeight
  moralAxis: CharacterMoralAxis
  orderAxis: CharacterOrderAxis
  shortDescription: string
  personality: string
  background: string
  motivation: string
  arc: string
}

export interface ReverseResult {
  worldview: ReverseWorldview
  storyCore: ReverseStoryCore
  characters: ReverseCharacter[]
}

// ── 多世界版类型 ─────────────────────────────────────────────────────────

import type { WorldGroupType } from '../types'

export interface ReverseWorld {
  name: string
  type: WorldGroupType
  // 与 Worldview 实际字段严格对齐（v3 字段名）
  worldOrigin: string
  powerHierarchy: string
  continentLayout: string
  climateByRegion: string
  historyLine: string
  races: string
  factionLayout: string
  entryCondition: string
  powerRestriction: string
}

export interface ReverseCharacterMW extends ReverseCharacter {
  /** 所属世界名称（空 = 跨世界） */
  homeWorld: string
  isCrossWorld: boolean
}

export interface ReverseMultiWorldResult {
  storyCore: ReverseStoryCore
  worlds: ReverseWorld[]
  characters: ReverseCharacterMW[]
}

const VALID_WG_TYPES: WorldGroupType[] = ['primary', 'traversal', 'instance', 'parallel', 'ascension', 'custom']
const VALID_WEIGHTS: CharacterRoleWeight[] = ['main', 'secondary', 'npc', 'extra']
const VALID_MORAL: CharacterMoralAxis[] = ['good', 'neutral', 'evil']
const VALID_ORDER: CharacterOrderAxis[] = ['lawful', 'neutral', 'chaotic']

function parseAxes(c: Record<string, unknown>): Pick<ReverseCharacter, 'roleWeight' | 'moralAxis' | 'orderAxis'> {
  return {
    roleWeight: VALID_WEIGHTS.includes(c.roleWeight as CharacterRoleWeight)
      ? c.roleWeight as CharacterRoleWeight
      : 'main',
    moralAxis: VALID_MORAL.includes(c.moralAxis as CharacterMoralAxis)
      ? c.moralAxis as CharacterMoralAxis
      : 'neutral',
    orderAxis: VALID_ORDER.includes(c.orderAxis as CharacterOrderAxis)
      ? c.orderAxis as CharacterOrderAxis
      : 'neutral',
  }
}

export function buildInspirationReverseMultiWorldPrompt(
  projectName: string,
  genres: string,
  inspiration: string,
  userHint?: string,
): ChatMessage[] {
  const tpl = usePromptStore.getState().getActive('inspiration.reverse.multiworld')
  const { messages } = renderPrompt(tpl, {
    projectName,
    genres,
    inspiration,
    userHint: userHint || '',
  })
  return messages
}

export function parseReverseMultiWorldOutput(output: string): ReverseMultiWorldResult | null {
  const p = extractJsonCandidate(output) as any
  if (!p) {
    console.warn('[inspiration.reverse.multiworld] parse failed, no JSON candidate extracted')
    return null
  }
  try {
    const storyCore: ReverseStoryCore = {
      logline: String(p.storyCore?.logline || ''),
      theme: String(p.storyCore?.theme || ''),
      centralConflict: String(p.storyCore?.centralConflict || ''),
      plotPattern: String(p.storyCore?.plotPattern || ''),
      mainPlot: String(p.storyCore?.mainPlot || ''),
    }
    const worlds: ReverseWorld[] = Array.isArray(p.worlds)
      ? p.worlds.map((w: Record<string, unknown>): ReverseWorld => ({
          name: String(w.name || '未命名世界'),
          type: VALID_WG_TYPES.includes(w.type as WorldGroupType) ? (w.type as WorldGroupType) : 'traversal',
          worldOrigin: String(w.worldOrigin || ''),
          powerHierarchy: String(w.powerHierarchy || ''),
          continentLayout: String(w.continentLayout || ''),
          climateByRegion: String(w.climateByRegion || ''),
          historyLine: String(w.historyLine || ''),
          races: String(w.races || ''),
          factionLayout: String(w.factionLayout || ''),
          entryCondition: String(w.entryCondition || ''),
          powerRestriction: String(w.powerRestriction || ''),
        }))
      : []
    const characters: ReverseCharacterMW[] = Array.isArray(p.characters)
      ? p.characters.map((c: Record<string, unknown>): ReverseCharacterMW => ({
          name: String(c.name || ''),
          ...parseAxes(c),
          shortDescription: String(c.shortDescription || ''),
          personality: String(c.personality || ''),
          background: String(c.background || ''),
          motivation: String(c.motivation || ''),
          arc: String(c.arc || ''),
          homeWorld: String(c.homeWorld || ''),
          isCrossWorld: Boolean(c.isCrossWorld),
        }))
      : []
    if (worlds.length === 0) return null
    return { storyCore, worlds, characters }
  } catch {
    return null
  }
}

// ── 构建 Prompt ─────────────────────────────────────────────────────────

export function buildInspirationReversePrompt(
  projectName: string,
  genres: string,
  inspiration: string,
  userHint?: string,
): ChatMessage[] {
  const tpl = usePromptStore.getState().getActive('inspiration.reverse')
  const { messages } = renderPrompt(tpl, {
    projectName,
    genres,
    inspiration,
    userHint: userHint || '',
  })
  return messages
}

// ── 解析输出 ─────────────────────────────────────────────────────────────

export function parseReverseOutput(output: string): ReverseResult | null {
  const parsed = extractJsonCandidate(output) as any
  if (!parsed) {
    console.warn('[inspiration.reverse] parse failed, no JSON candidate extracted')
    return null
  }

  try {

    const worldview: ReverseWorldview = {
      worldOrigin: String(parsed.worldview?.worldOrigin || ''),
      powerHierarchy: String(parsed.worldview?.powerHierarchy || ''),
      continentLayout: String(parsed.worldview?.continentLayout || ''),
      climateByRegion: String(parsed.worldview?.climateByRegion || ''),
      historyLine: String(parsed.worldview?.historyLine || ''),
      races: String(parsed.worldview?.races || ''),
      factionLayout: String(parsed.worldview?.factionLayout || ''),
    }

    const storyCore: ReverseStoryCore = {
      logline: String(parsed.storyCore?.logline || ''),
      theme: String(parsed.storyCore?.theme || ''),
      centralConflict: String(parsed.storyCore?.centralConflict || ''),
      plotPattern: String(parsed.storyCore?.plotPattern || ''),
      mainPlot: String(parsed.storyCore?.mainPlot || ''),
    }

    const characters: ReverseCharacter[] = Array.isArray(parsed.characters)
      ? parsed.characters.map((c: Record<string, unknown>) => ({
          name: String(c.name || ''),
          ...parseAxes(c),
          shortDescription: String(c.shortDescription || ''),
          personality: String(c.personality || ''),
          background: String(c.background || ''),
          motivation: String(c.motivation || ''),
          arc: String(c.arc || ''),
        }))
      : []

    return { worldview, storyCore, characters }
  } catch {
    return null
  }
}

// ---- shared: extract first complete JSON object from AI stream output ------------------
//
// Why: the previous parser used a single regex that returned null on any malformed
// output, causing the inspiration reverse panel to show the structured-output hint
// (driven by AIStreamOutput.isStructured) but never render the bottom adopt cards
// (driven by this parser). Best-effort fallback strategy:
//   (a) try a markdown code fence
//   (b) try the whole trimmed output as JSON
//   (c) scan for the first balanced top-level { ... } and try that
function extractJsonCandidate(output: string): Record<string, unknown> | null {
  if (!output) return null
  const trimmed = output.trim()

  // We try each candidate strategy in order, and on failure retry once after
  // sanitizing stray double quotes inside JSON string values (a common model
  // quirk: it writes bare `"` to quote a term inside a JSON string value,
  // breaking JSON.parse).

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const fromFence = fenceMatch ? fenceMatch[1].trim() : ""

  const candidates: string[] = []
  if (fromFence) candidates.push(fromFence)
  candidates.push(trimmed)

  for (const c of candidates) {
    if (!c) continue
    const direct = tryParseJson(c)
    if (direct) return direct
    if (c.startsWith("{") || c.startsWith("[")) {
      const sliced = sliceFirstCompleteJson(c)
      const parsed = sliced ? tryParseJson(sliced) : null
      if (parsed) return parsed
    }
    const repaired = tryParseJson(sanitizeStrayQuotesInJsonString(c))
    if (repaired) return repaired
  }

  // (c) skip prefix explanation text and try the first balanced object
  const braceStart = trimmed.indexOf("{")
  if (braceStart >= 0) {
    const sliced = sliceFirstCompleteJson(trimmed.slice(braceStart))
    if (sliced) {
      const direct = tryParseJson(sliced)
      if (direct) return direct
      const repaired = tryParseJson(sanitizeStrayQuotesInJsonString(sliced))
      if (repaired) return repaired
    }
  }

  return null
}

// ---- shared: repair bare double quotes inside JSON string values ---------
//
// Heuristic only. When walking a string value, if we see `"` that is NOT
// followed (after whitespace) by a JSON structural char ("," "}" "]" ":"),
// we treat it as a stray nested quote and replace it with U+201C/U+201D so
// the outer string stays open. Real closers are preserved.
//
// This covers the common model output pattern:
//   "worldOrigin": "现代都市现实世界...虚构的国内一线城市"云城"。没有..."
// where the model embeds `"云城"` directly in the value.
function sanitizeStrayQuotesInJsonString(input: string): string {
  if (!input) return input
  let out = ""
  let inString = false
  let escape = false
  let nextQuote: "open" | "close" = "open"
  const OPEN = "\u201C"
  const CLOSE = "\u201D"
  const structural = new Set([",", "}", "]", ":"])
  const ws = new Set([" ", "\t", "\r", "\n"])
  const peekNonWs = (start: number): string => {
    let k = start
    while (k < input.length && ws.has(input[k])) k++
    return input[k] || ""
  }
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      if (escape) { out += ch; escape = false; continue }
      if (ch === "\\") { out += ch; escape = true; continue }
      if (ch === "\"") {
        const nx = peekNonWs(i + 1)
        if (structural.has(nx)) {
          out += "\""
          inString = false
          nextQuote = "open"
        } else {
          out += nextQuote === "open" ? OPEN : CLOSE
          nextQuote = nextQuote === "open" ? "close" : "open"
        }
        continue
      }
      out += ch
      continue
    }
    if (ch === "\"") {
      out += ch
      inString = true
      continue
    }
    out += ch
  }
  return out
}

function tryParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

function sliceFirstCompleteJson(input: string): string | null {
  const open = input[0]
  if (open !== "{" && open !== "[") return null
  const close = open === "[" ? "]" : "}"
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (ch === "\\") { escape = true; continue }
      if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") { inString = true; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return input.slice(0, i + 1)
    }
  }
  return null
}
