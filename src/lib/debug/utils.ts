import type { LLMModuleHint } from './types'

/** 简单 id 生成: 时间戳 + 随机后缀 */
export function makeCallId(): string {
  return 'call-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

/** 根据 body 启发式推测功能模块 */
export function detectModuleHint(_url: string, bodyStr: string): LLMModuleHint {
  const lower = (bodyStr || '').slice(0, 4000)
  if (/outlineNodes|chapterOutline|outline\.volume|outline\.chapter|卷纲|卷级大纲|章节大纲/.test(lower)) return 'outline'
  if (/chapter\.content|chapter\.summarize|章节正文|章节摘要/.test(lower)) return 'chapter'
  if (/storyArc|故事线|story_arc/.test(lower)) return 'story-arc'
  if (/character.*creation|character.*edit|character.*drive|角色创建|角色档案|character-driven/.test(lower)) return 'character'
  if (/inspirationReverse|reverse|inversePrompt|反向灵感|灵感反向/.test(lower)) return 'inspiration'
  if (/foreshadow|伏笔/.test(lower)) return 'foreshadow'
  if (/stateExtract|stateTable|状态表/.test(lower)) return 'state'
  if (/worldview|世界观/.test(lower)) return 'worldview'
  if (/worldRule|worldRules|世界规则/.test(lower)) return 'rule'
  if (/styleLearn|styleApply|文风|风格/.test(lower)) return 'style'
  if (/review|critique|审稿/.test(lower)) return 'review'
  return 'unknown'
}

/** 从 messages 数组里抽出 system + 最后一条 user */
export function extractPrompts(messages: unknown): { systemPrompt: string; userPrompt: string } {
  let systemPrompt = ''
  let userPrompt = ''
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m && typeof m === 'object') {
        const role = (m as { role?: string }).role
        const content = (m as { content?: string }).content ?? ''
        if (role === 'system') systemPrompt = String(content)
        else if (role === 'user') userPrompt = String(content)
      }
    }
  }
  return { systemPrompt, userPrompt }
}

/** 5 分钟 = 5 * 60 * 1000 ms */
export const IDLE_CLEAR_MS = 5 * 60 * 1000
