/**
 * 解析 AI 生成的大纲文本，提取结构化数据
 */

export interface ParsedVolume {
  title: string
  summary: string
}

export interface ParsedChapter {
  title: string
  summary: string
}

/**
 * 解析卷级大纲文本
 *
 * 支持的格式：
 * - ## 第一卷：标题 / **第一卷：标题**
 * - 1. 第一卷：标题 / 第一卷 标题
 * - 卷一：标题
 */
export function parseVolumeOutlineOutput(text: string): ParsedVolume[] {
  const volumes: ParsedVolume[] = []

  // 按行处理
  const lines = text.split('\n')
  let currentVol: { title: string; summaryLines: string[] } | null = null

  const flushVol = () => {
    if (currentVol) {
      const summary = currentVol.summaryLines
        .map(l => l.replace(/^[（(]?(?:情节|内容|摘要|概述|简介|故事)[）)摘要：:：\s]*/i, '').trim())
        .filter(l => l.length > 0)
        .join('')
      volumes.push({ title: currentVol.title, summary })
      currentVol = null
    }
  }

  for (const line of lines) {
    const stripped = line.replace(/^\s+/, '')

    // 识别卷标题行
    const volHeadMatch = stripped.match(
      /^(?:#+\s*|(?:\d+[.)、]\s*))?(?:第([零一二三四五六七八九十百\d]+)卷|卷([零一二三四五六七八九十百\d]+))[：:：\s]*(.*)/
    )
    if (volHeadMatch) {
      flushVol()
      const restTitle = volHeadMatch[3]?.trim() || ''
      const volNum = volHeadMatch[1] || volHeadMatch[2] || ''
      // 标题：若 rest 里有内容就用，否则用"第X卷"
      const title = restTitle
        ? `第${volNum}卷：${restTitle}`
        : `第${volNum}卷`
      currentVol = { title, summaryLines: [] }
      continue
    }

    // 摘要行（去掉列表符号和"情节摘要："前缀）
    if (currentVol) {
      const contentLine = stripped
        .replace(/^[-*•]\s*/, '')
        .replace(/^(?:情节摘要|摘要|内容简介|故事摘要)[：:：]\s*/i, '')
      if (contentLine.length > 0) {
        currentVol.summaryLines.push(contentLine)
      }
    }
  }

  flushVol()

  // 如果正则没匹配到任何卷（格式特殊），尝试按 ## / 数字 + 粗体标题分割
  if (volumes.length === 0) {
    return parseFallback(text)
  }

  return volumes
}

/**
 * 兜底解析：把文本按 ## 标题或 **标题** 分割，每段作为一卷
 */
function parseFallback(text: string): ParsedVolume[] {
  const volumes: ParsedVolume[] = []
  const blocks = text.split(/\n(?=#+\s|\*\*第)/)
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const title = lines[0]
      .replace(/^#+\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim()
    const summary = lines.slice(1).join('')
    if (title) volumes.push({ title, summary })
  }
  return volumes
}

/**
 * 解析章节大纲文本
 *
 * 支持的格式：
 * - 第X章：标题  情节摘要：...
 * - ## 第X章 标题
 * - 1. 章节标题
 */
export function parseChapterOutlineOutput(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = []
  const lines = text.split('\n')
  let currentCh: { title: string; summaryLines: string[] } | null = null

  const flushCh = () => {
    if (currentCh) {
      const summary = currentCh.summaryLines
        .map(l => l.replace(/^(?:情节摘要|摘要|内容|故事摘要)[：:：]\s*/i, '').trim())
        .filter(l => l.length > 0)
        .join('')
      chapters.push({ title: currentCh.title, summary })
      currentCh = null
    }
  }

  for (const line of lines) {
    const stripped = line.replace(/^\s+/, '')

    // 章节标题行
    const chHeadMatch = stripped.match(
      /^(?:#+\s*|(?:\d+[.)、]\s*))?(?:第([零一二三四五六七八九十百\d]+)章)[：:：\s]*(.*)/
    )
    if (chHeadMatch) {
      flushCh()
      const chNum = chHeadMatch[1] || ''
      const restTitle = chHeadMatch[2]?.trim() || ''
      const title = restTitle ? `第${chNum}章：${restTitle}` : `第${chNum}章`
      currentCh = { title, summaryLines: [] }
      continue
    }

    // 纯数字序号 + 标题（无"章"字），如 "1. 觉醒"
    const numTitleMatch = stripped.match(/^(\d+)[.)、]\s+([^\n]+)/)
    if (numTitleMatch && !currentCh) {
      flushCh()
      currentCh = { title: numTitleMatch[2].trim(), summaryLines: [] }
      continue
    }

    // 摘要行
    if (currentCh) {
      const contentLine = stripped
        .replace(/^[-*•]\s*/, '')
        .replace(/^(?:情节摘要|摘要|内容简介|涉及角色)[：:：]\s*/i, '')
      if (contentLine.length > 0 && !contentLine.match(/^(?:涉及的主要角色|主要角色)[：:：]/)) {
        currentCh.summaryLines.push(contentLine)
      }
    }
  }

  flushCh()
  return chapters
}
