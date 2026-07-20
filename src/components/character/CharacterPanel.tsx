import { useState, useEffect } from 'react'
import {
  Plus, Sparkles, Trash2, ChevronDown, ChevronRight, X, Wand2,
} from 'lucide-react'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'
import { useCharacterStore } from '../../stores/character'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIConfigStore } from '../../stores/ai-config'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildCharacterPrompt, buildCharacterSupplementPrompt } from '../../lib/ai/adapters/character-adapter'
import { parseCharacterOutput, parseRelationshipsFromText, splitCharacterSections, type ParsedCharacter, type ParsedRelationshipsOutput } from '../../lib/ai/parse-character-output'
import { useCharacterRelationStore } from '../../stores/character-relation'
import type { RelationType } from '../../lib/types/character-relation'
import { adopt } from '../../lib/registry/adopt'
import { assembleContext } from '../../lib/registry/assemble-context'
import AIStreamOutput from '../shared/AIStreamOutput'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import PromptRunPanel from '../shared/PromptRunPanel'
import type {
  Project, Character, CharacterMoralAxis, CharacterOrderAxis, CharacterRoleWeight,
} from '../../lib/types'
import CharacterStatusPanel from './CharacterStatusPanel'
import CharacterAxesPicker from './CharacterAxesPicker'
import {
  MORAL_AXIS_LABELS,
  ORDER_AXIS_LABELS,
  ROLE_WEIGHT_LABELS,
  filterCharactersByRoleWeight,
} from '../../lib/character/character-axes'

const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  family: '👨‍👩‍👧 亲属', lover: '❤️ 恋人', friend: '🤝 朋友',
  rival: '⚔️ 对手', enemy: '💀 敌人', master: '🎓 师父',
  student: '📖 弟子', ally: '🤜 盟友', subordinate: '📋 上下级', other: '🔗 其他',
}

const RELATION_TYPE_TEXT_LABELS: Record<RelationType, string> = {
  family: '亲属', lover: '恋人', friend: '朋友', rival: '对手', enemy: '敌人',
  master: '师父', student: '弟子', ally: '盟友', subordinate: '上下级', other: '其他',
}

const ALL_RELATION_TYPES: RelationType[] = [
  'family', 'lover', 'friend', 'rival', 'enemy', 'master', 'student', 'ally', 'subordinate', 'other',
]

const REL_TYPE_ALIASES: Record<string, RelationType> = {
  '亲属': 'family', '恋人': 'lover', '朋友': 'friend', '对手': 'rival', '敌人': 'enemy',
  '师父': 'master', '弟子': 'student', '盟友': 'ally', '上下级': 'subordinate', '其他': 'other',
  '宿敌': 'enemy', '姐妹': 'family', '兄弟': 'family', '父子': 'family',
  '父女': 'family', '母女': 'family', '兄妹': 'family', '姐弟': 'family',
}

function normalizeRelationType(raw: string): RelationType {
  const v = (raw || '').trim().toLowerCase()
  if (ALL_RELATION_TYPES.includes(v as RelationType)) return v as RelationType
  for (const [alias, rt] of Object.entries(REL_TYPE_ALIASES)) {
    if (raw.includes(alias)) return rt
  }
  return 'other'
}

function formatRelationshipsText(
  relOutput: ParsedRelationshipsOutput | null,
  existingCharacters: Character[],
  currentCharacterId: number,
): string | null {
  if (!relOutput || relOutput.relationships_json.length === 0) return null

  const lines = relOutput.relationships_json
    .filter(rel => {
      const toChar = existingCharacters.find(c => c.name === rel.toName)
      return toChar && toChar.id !== currentCharacterId
    })
    .map(rel => {
      const relationType = normalizeRelationType(rel.relationType)
      const label = RELATION_TYPE_TEXT_LABELS[relationType]
      const description = (rel.description || rel.label || '').trim()
      return `【${label}】${rel.toName}：${description}`
    })
    .filter(line => !line.endsWith('：'))

  return lines.length > 0 ? lines.join('\n') : null
}

function isRealEmpty(v: string): boolean {
  if (!v || !v.trim()) return true
  if (/^(点击|请|填写|暂无|待填|输入)/.test(v.trim())) return true
  return false
}

const SUPPLEMENT_FIELDS: (keyof Character)[] = [
  'shortDescription', 'appearance', 'personality', 'background',
  'motivation', 'abilities', 'relationships', 'arc',
]

const FIELD_LABELS: Record<string, string> = {
  shortDescription: '一句话简介', appearance: '外貌', personality: '性格',
  background: '背景故事', motivation: '核心动机', abilities: '能力/技能',
  relationships: '人物关系', arc: '角色弧光',
}

// ── 常量 ───────────────────────────────────────────────────────

// 首字圆的柔和色板（按角色 index 循环取色）
const GLYPH_COLORS = [
  'bg-[#C17D5E]/15 text-[#C17D5E]',   // 陶土
  'bg-[#7BA08A]/15 text-[#7BA08A]',   // 青竹
  'bg-[#8B7BB0]/15 text-[#8B7BB0]',   // 紫藤
  'bg-[#B08B6B]/15 text-[#B08B6B]',   // 琥珀
  'bg-[#6B8EB0]/15 text-[#6B8EB0]',   // 墨蓝
  'bg-[#B06B7B]/15 text-[#B06B7B]',   // 玫红
]

interface Props {
  project: Project
  view?: 'generator' | 'main'
}

// ── 主面板 ─────────────────────────────────────────────────────

export default function CharacterPanel({ project, view = 'generator' }: Props) {
  const { characters, loadAll, addCharacter, updateCharacter, deleteCharacter } = useCharacterStore()
  const { groups, activeGroupId } = useWorldGroupStore()
  const { config: aiConfig } = useAIConfigStore()
  const [selected, setSelected] = useState<number | null>(null)
  const [hint, setHint] = useState('')
  const [parsing, setParsing] = useState(false)
  const [showRolePicker, setShowRolePicker] = useState(false)
  const [draftAxes, setDraftAxes] = useState<{
    roleWeight: CharacterRoleWeight | null
    moralAxis: CharacterMoralAxis | null
    orderAxis: CharacterOrderAxis | null
  }>({ roleWeight: null, moralAxis: null, orderAxis: null })
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  // 多世界：角色世界过滤器（'all' | 'cross' | 世界组 id）
  const [worldFilter, setWorldFilter] = useState<'all' | 'cross' | number>('all')
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [supplementCharId, setSupplementCharId] = useState<number | null>(null)
  const [supplementStrictCheck, setSupplementStrictCheck] = useState(true)
  const [supplementMode, setSupplementMode] = useState<'fill' | 'overwrite'>('fill')
const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
const [reviewData, setReviewData] = useState<{
  parsed: ParsedCharacter
  relOutput: ParsedRelationshipsOutput | null
} | null>(null)
const [fieldChecked, setFieldChecked] = useState<Record<string, boolean>>({})
const { addRelation } = useCharacterRelationStore()
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'character.generate',
    project.enableMultiWorld ? String(worldFilter) : 'project',
  ))

  const aiSupp = useAIStream(createAISessionKey(
    project.id!,
    'character.supplement',
    project.enableMultiWorld ? String(worldFilter) : 'project',
  ))

  useEffect(() => { loadAll(project.id!) }, [project.id, loadAll])

  // 多世界过滤：跨世界角色在任意世界都显示
  const worldFilteredChars = !project.enableMultiWorld || worldFilter === 'all'
    ? characters
    : worldFilter === 'cross'
      ? characters.filter(c => c.isCrossWorld)
      : characters.filter(c => c.isCrossWorld || c.homeWorldGroupId === worldFilter)
  const displayedChars = view === 'main'
    ? filterCharactersByRoleWeight(worldFilteredChars, 'main')
    : worldFilteredChars

  const selectedChar = characters.find(c => c.id === selected)

  // 多世界模式下新建角色时归属的世界（过滤器选了具体世界则用它，否则用当前活跃世界）
  const newCharHomeWorld = (): number | null => {
    if (!project.enableMultiWorld) return null
    if (typeof worldFilter === 'number') return worldFilter
    if (worldFilter === 'cross') return null
    return activeGroupId
  }

  const handleAdd = async () => {
    if (!draftAxes.roleWeight || !draftAxes.moralAxis || !draftAxes.orderAxis) return
    setShowRolePicker(false)
    const id = await addCharacter({
      projectId: project.id!, name: '新角色',
      roleWeight: draftAxes.roleWeight,
      moralAxis: draftAxes.moralAxis,
      orderAxis: draftAxes.orderAxis,
      shortDescription: '', appearance: '', personality: '',
      background: '', motivation: '', abilities: '', relationships: '', arc: '',
      homeWorldGroupId: newCharHomeWorld(),
      isCrossWorld: project.enableMultiWorld && worldFilter === 'cross',
    })
    setDraftAxes({ roleWeight: null, moralAxis: null, orderAxis: null })
    setSelected(id)
  }

  const handleUpdate = (field: keyof Character, value: string) => {
    if (selectedChar?.id) updateCharacter(selectedChar.id, { [field]: value })
  }

  const handleAIGenerate = async () => {
    // 统计阵容缺口
    const weightCounts: Record<CharacterRoleWeight, number> = {
      main: 0, secondary: 0, npc: 0, extra: 0,
    }
    characters.forEach(c => { weightCounts[c.roleWeight]++ })
    const rosterGap = `当前阵容：主要 ${weightCounts.main}、次要 ${weightCounts.secondary}、NPC ${weightCounts.npc}、路人 ${weightCounts.extra}`
    const existing = characters.map(c =>
      `${c.name}（${ROLE_WEIGHT_LABELS[c.roleWeight]} · ${ORDER_AXIS_LABELS[c.orderAxis]}${MORAL_AXIS_LABELS[c.moralAxis]}）`,
    ).join('、')
    const enrichedHint = [hint, rosterGap].filter(Boolean).join('\n')
    // 多世界：按当前选中/活跃世界读取上下文（此前写死单世界）
    const targetWorld = project.enableMultiWorld
      ? (typeof worldFilter === 'number' ? worldFilter : activeGroupId)
      : null
    const assembled = await assembleContext({
      projectId: project.id!,
      worldGroupId: targetWorld,
      provider: aiConfig.provider,
      model: aiConfig.model,
      sourceKeys: ['worldview', 'storyCore', 'powerSystem', 'codex', 'characters', 'creativeRules', 'worldRules', 'historical', 'locations'],
    })
    const worldCtx = assembled.text
    const opts = {
      parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
      overrides: (systemOverride != null || userOverride != null) ? {
        systemPrompt: systemOverride ?? undefined,
        userPromptTemplate: userOverride ?? undefined,
      } : undefined,
    }
    const messages = buildCharacterPrompt(project.name, project.genre ?? '', worldCtx, existing, enrichedHint, opts)
    ai.start(messages, undefined, { category: 'character.generate', projectId: project.id! })
  }


  // ── 补全相关 ───────────────────────────────────────────────────

  const openSupplement = (charId: number) => {
    setSupplementCharId(charId)
    setSupplementMode('fill')
    setSupplementOpen(true)
  }

  const confirmSupplement = async () => {
    if (!supplementCharId) return
    setSupplementOpen(false)
    const char = characters.find(c => c.id === supplementCharId)
    if (!char) return

    const targetWorld = project.enableMultiWorld
      ? (typeof worldFilter === 'number' ? worldFilter : activeGroupId)
      : null
    const assembled = await assembleContext({
      projectId: project.id!,
      worldGroupId: targetWorld,
      provider: aiConfig.provider,
      model: aiConfig.model,
      sourceKeys: ['worldview', 'storyCore', 'powerSystem', 'codex', 'characters', 'creativeRules', 'worldRules', 'historical', 'locations'],
    })
    const worldCtx = assembled.text
    const otherChars = characters
      .filter(c => c.id !== supplementCharId)
      .map(c => `${c.name}（${ROLE_WEIGHT_LABELS[c.roleWeight]}）`)
      .join('、')

    const msgs = buildCharacterSupplementPrompt(
      {
        name: char.name,
        shortDescription: char.shortDescription,
        appearance: char.appearance,
        personality: char.personality,
        background: char.background,
        motivation: char.motivation,
        abilities: char.abilities,
        relationships: char.relationships,
        arc: char.arc,
      },
      worldCtx,
      otherChars,
    )
    aiSupp.start(msgs, undefined, { category: 'character.supplement', projectId: project.id! })
  }

  // 采纳：解析并打开逐字段审查弹层
  const handleSupplementAccept = async (text: string) => {
    if (!supplementCharId) return
    const targetChar = characters.find(c => c.id === supplementCharId)
    if (!targetChar) return
    aiSupp.reset()
    setParsing(true)
    const parsed = await parseCharacterOutput(text, aiConfig, targetChar.name)  // B fix: 注入已知角色名,避免第二次 LLM 抽取 name 字段抽风
    const relOutput = parseRelationshipsFromText(text)
    setParsing(false)
        if (!parsed) { alert('解析 AI 输出失败，请重试'); return }

    // 严格校验角色名：防止 AI 扩展生成其他角色
    if (supplementStrictCheck) {
      const pName = (parsed.name || '').trim()
      if (pName && pName !== targetChar.name) {
        alert("角色名不匹配！AI 解析出的角色名为【" + pName + "】，但当前正在补全的是【" + targetChar.name + "】。可能是 AI 扩展生成了其他角色的内容。如需写入，可取消勾选【严格校验角色名】。")
        return
      }
    }

    // 构建字段勾选状态空字段默认勾选新值，有内容默认保持旧值
    const checkedInit: Record<string, boolean> = {}
    for (const f of SUPPLEMENT_FIELDS) {
      const oldV = (targetChar as any)[f] || ''
      const newV = (parsed as any)[f] || ''
      checkedInit[f] = isRealEmpty(oldV) && !!newV.trim()
    }

    setReviewData({ parsed, relOutput })
    setFieldChecked(checkedInit)
    setReviewDialogOpen(true)
  }

  // 确认采纳：将选中的字段写入 character，关系写入 characterRelations
  const handleSupplementConfirm = async () => {
    if (!reviewData || !supplementCharId) return
    setReviewDialogOpen(false)
    const { parsed, relOutput } = reviewData
    const targetChar = characters.find(c => c.id === supplementCharId)
    if (!targetChar) return

    const updateData: Partial<Character> = {}
    const formattedRelationships = formatRelationshipsText(relOutput, characters, supplementCharId)
    for (const f of SUPPLEMENT_FIELDS) {
      if (!fieldChecked[f]) continue
      const newVal = f === 'relationships' && formattedRelationships
        ? formattedRelationships
        : (parsed as any)[f] || ''
      ;(updateData as any)[f] = newVal
    }

    if (Object.keys(updateData).length > 0) {
      await updateCharacter(supplementCharId, updateData)
    }

    // 写入关系网
    if (relOutput && relOutput.relationships_json.length > 0) {
      for (const rel of relOutput.relationships_json) {
        const toChar = characters.find(c => c.name === rel.toName)
        if (!toChar || toChar.id === supplementCharId) continue
        const rt = normalizeRelationType(rel.relationType)
        await addRelation({
          projectId: project.id!,
          fromCharacterId: supplementCharId,
          toCharacterId: toChar.id!,
          relationType: rt,
          label: rel.label || rt,
          description: rel.description || '',
          isBidirectional: rel.bidirectional || false,
        })
      }
    }

    await loadAll(project.id!)
    setReviewData(null)
    setFieldChecked({})
  }

  const selectedCharForSupp = characters.find(c => c.id === supplementCharId)
  // 补全弹窗
  const renderSupplementDialog = () => {
    if (!supplementOpen || !selectedCharForSupp) return null
    const hasContent = SUPPLEMENT_FIELDS.some(f => selectedCharForSupp[f])
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-bg-surface border border-border rounded-xl shadow-xl p-6 w-[420px] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">一键补全缺失字段</h3>
            <button onClick={() => setSupplementOpen(false)} className="p-1 text-text-muted hover:text-text-primary rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary">
            正在补全角色：<span className="font-medium text-accent">{selectedCharForSupp.name}</span>
          </p>
          {!hasContent ? (
            <p className="text-sm text-text-secondary">所有字段均未填写，将全部生成。</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">检测到部分字段已有内容，请选择写入模式：</p>
              <select
                value={supplementMode}
                onChange={e => setSupplementMode(e.target.value as 'fill' | 'overwrite')}
                className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="fill">只补空字段（保留已有内容）</option>
                <option value="overwrite">重写全部字段</option>
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={supplementStrictCheck}
              onChange={e => setSupplementStrictCheck(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-bg-base text-accent focus:ring-accent"
            />
            严格校验角色名（防止 AI 生成多余角色）
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setSupplementOpen(false)}
              className="px-4 py-2 text-sm text-text-secondary bg-bg-elevated border border-border rounded hover:text-text-primary transition-colors"
            >
              取消
            </button>
            <button
              onClick={confirmSupplement}
              className="px-4 py-2 text-sm text-white bg-accent rounded hover:bg-accent-hover transition-colors"
            >
              确认补全
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 逐字段审查弹层
  const renderSupplementReviewDialog = () => {
    if (!reviewDialogOpen || !reviewData || !supplementCharId) return null
    const targetChar = characters.find(c => c.id === supplementCharId)
    if (!targetChar) return null
    const { parsed, relOutput } = reviewData
    const formattedRelationships = formatRelationshipsText(relOutput, characters, supplementCharId)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-bg-surface border border-border rounded-xl shadow-2xl w-[680px] max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="text-base font-semibold text-text-primary">采纳确认 · {targetChar.name}</h3>
              <p className="text-xs text-text-muted mt-0.5">请勾选要写入的字段，关系会自动写入关系网</p>
            </div>
            <button
              onClick={() => { setReviewDialogOpen(false); setReviewData(null) }}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-3">
            {SUPPLEMENT_FIELDS.map(field => {
              const oldVal = (targetChar as any)[field] || ''
              const newVal = field === 'relationships' && formattedRelationships
                ? formattedRelationships
                : (parsed as any)[field] || ''
              const checked = !!fieldChecked[field]
              const oldEmpty = isRealEmpty(oldVal)
              if (!newVal.trim() && oldEmpty) return null

              return (
                <div key={field} className="border border-border rounded-lg p-3 bg-bg-base">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">{FIELD_LABELS[field]}</span>
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setFieldChecked(prev => ({ ...prev, [field]: e.target.checked }))}
                        className="accent-accent"
                      />
                      {checked
                        ? <span className="text-accent font-medium">{oldEmpty ? '采用新值' : '覆盖旧值'}</span>
                        : <span>{oldEmpty ? '保持空' : '保持旧值'}</span>}
                    </label>
                  </div>
                  {oldEmpty ? null : (
                    <div className="mb-2">
                      <p className="text-xs text-text-muted mb-1">旧值</p>
                      <p className="text-xs text-text-secondary bg-bg-elevated rounded p-2 max-h-20 overflow-y-auto whitespace-pre-wrap">
                        {oldVal.slice(0, 200)}{oldVal.length > 200 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  {newVal.trim() ? (
                    <div>
                      <p className="text-xs text-text-muted mb-1">新值</p>
                      <p className="text-xs text-accent bg-accent/5 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {newVal}
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {relOutput && relOutput.relationships_json.length > 0 && (
              <div className="border border-border rounded-lg p-3 bg-bg-base">
                <p className="text-sm font-medium text-text-primary mb-3">
                  关系网连线预览（将写入 {relOutput.relationships_json.length} 条）
                </p>
                <div className="space-y-2">
                  {relOutput.relationships_json.map((rel, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs bg-bg-elevated rounded p-2 flex-wrap">
                      <span className="text-text-muted">{targetChar.name}</span>
                      <span className="text-accent font-medium">
                        {RELATION_TYPE_LABELS[normalizeRelationType(rel.relationType)] || rel.relationType}
                      </span>
                      <span className="font-medium text-text-primary">{rel.label}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-text-primary">{rel.toName}</span>
                      {rel.bidirectional && (
                        <span className="text-xs text-info bg-info/10 px-1.5 py-0.5 rounded">双向</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              onClick={() => { setReviewDialogOpen(false); setReviewData(null) }}
              className="px-4 py-2 text-sm text-text-secondary bg-bg-elevated border border-border rounded hover:text-text-primary transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSupplementConfirm}
              className="px-4 py-2 text-sm text-white bg-accent rounded hover:bg-accent-hover transition-colors"
            >
              确认采纳
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 补全 AI 输出
  const renderSupplementOutput = () => {
    if (!aiSupp.output && !aiSupp.isStreaming && !aiSupp.error) return null
    return (
      <AIStreamOutput
        output={aiSupp.output}
        isStreaming={aiSupp.isStreaming}
        error={aiSupp.error}
        tokenUsage={aiSupp.tokenUsage}
        onStop={aiSupp.stop}
        onAccept={handleSupplementAccept}
        onRetry={confirmSupplement}
        onDismiss={() => { aiSupp.reset(); setReviewDialogOpen(false); setReviewData(null) }}
        moduleKey="character.supplement"
        placeholder="点击「确认补全」开始补全角色字段…"
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        {view === 'generator' && (
          <>
            <div className="relative">
              <button
                onClick={() => setShowRolePicker(!showRolePicker)}
                className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-hover transition-colors"
              >
                <Plus className="w-4 h-4" /> 新建角色 <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
              {showRolePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRolePicker(false)} />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-bg-surface border border-border rounded-lg shadow-lg p-3 w-[430px]">
                    <CharacterAxesPicker {...draftAxes} onChange={setDraftAxes} compact />
                    <button
                      onClick={handleAdd}
                      disabled={!draftAxes.roleWeight || !draftAxes.moralAxis || !draftAxes.orderAxis}
                      className="mt-3 w-full px-3 py-2 bg-accent text-white text-sm rounded disabled:opacity-40"
                    >
                      创建并分流
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-1">
              <AutoResizeTextarea
                value={hint}
                onChange={e => setHint(e.target.value)}
                placeholder="角色要求（可选）"
                className="w-full max-w-xs px-2 py-1.5 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent resize-none"
                minRows={1}
                maxRows={5}
              />
              <button
                onClick={handleAIGenerate}
                disabled={ai.isStreaming}
                className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated text-text-secondary text-sm rounded-md hover:text-accent disabled:opacity-50 transition-colors border border-border hover:border-accent/50"
              >
                <Sparkles className="w-3.5 h-3.5" /> AI 设计角色
              </button>
            </div>
          </>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {view === 'main' ? '主要角色' : '角色生成'} · {displayedChars.length}
        </span>
      </div>

      {/* 多世界：世界过滤器 */}
      {project.enableMultiWorld && groups.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setWorldFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              worldFilter === 'all'
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-base text-text-secondary border-border hover:border-accent/50'
            }`}
          >
            全部
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setWorldFilter(g.id!)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                worldFilter === g.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-base text-text-secondary border-border hover:border-accent/50'
              }`}
            >
              <span>{g.icon || '🌐'}</span>{g.name}
            </button>
          ))}
          <button
            onClick={() => setWorldFilter('cross')}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              worldFilter === 'cross'
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-base text-text-secondary border-border hover:border-accent/50'
            }`}
          >
            🌐 跨世界
          </button>
        </div>
      )}

      {/* 调参浮窗 */}
      {view === 'generator' && (
        <PromptRunPanel
          moduleKey="character.generate"
          parameterValues={parameterValues}
          onParamChange={setParameterValues}
          systemOverride={systemOverride}
          onSystemOverrideChange={setSystemOverride}
          userOverride={userOverride}
          onUserOverrideChange={setUserOverride}
        />
      )}

      {/* AI 解析中提示 */}
      {view === 'generator' && parsing && (
        <div className="flex items-center gap-2 px-4 py-3 bg-accent/5 border border-accent/20 rounded-lg text-sm text-accent animate-pulse">
          <Sparkles className="w-4 h-4 shrink-0" />
          AI 正在将角色内容分字段整理，请稍候…
        </div>
      )}

      {/* AI 输出 */}
      {view === 'generator' && (ai.output || ai.isStreaming || ai.error) && (
        <AIStreamOutput
          output={ai.output}
          isStreaming={ai.isStreaming}
          error={ai.error} tokenUsage={ai.tokenUsage}
          onStop={ai.stop}
          onAccept={async (text: string) => {
            ai.reset()
            setParsing(true)

            // 分割多角色 Markdown，逐个解析并落盘
            const sections = splitCharacterSections(text)
            const results: any[] = []
            for (const section of sections) {
              const parsed = await parseCharacterOutput(section, aiConfig)
              if (!parsed) continue

              // 从本节 markdown 提取角色名兜底
              const nameMatch = section.match(/(?:^|\n)(?:##\s*(?:\d+\.)?\s*)?([^\n#*【】]{1,20})(?:\s|$)/m)
              const fallbackName = nameMatch?.[1]?.trim() || parsed.name || 'AI 生成角色'

              const result = await adopt({
                projectId: project.id!,
                worldGroupId: newCharHomeWorld(),
                target: 'characters',
                mode: 'add',
                data: {
                  name:             parsed.name             || fallbackName,
                  roleWeight:       parsed.roleWeight       || 'main',
                  moralAxis:        parsed.moralAxis        || 'neutral',
                  orderAxis:        parsed.orderAxis        || 'neutral',
                  shortDescription: parsed.shortDescription || '',
                  appearance:       parsed.appearance       || '',
                  personality:      parsed.personality      || '',
                  background:       parsed.background       || section,
                  motivation:       parsed.motivation       || '',
                  abilities:        parsed.abilities        || '',
                  relationships:    parsed.relationships    || '',
                  arc:              parsed.arc              || '',
                },
              })
              results.push(result)
            }

            setParsing(false)
            await loadAll(project.id!)
            // 选中第一个成功落盘的角色
            const firstWritten = results.find(r => r?.written?.[0]?.id != null)
            if (firstWritten?.written[0]?.id != null) setSelected(firstWritten.written[0].id)
          }}
          onRetry={handleAIGenerate}
          onDismiss={ai.reset}
          moduleKey="character.generate"
        />
      )}

      {/* 主体：左侧列表 + 右侧详情 */}
      {displayedChars.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
          <div className="text-4xl opacity-20">📖</div>
          <p className="text-sm">
            {view === 'main' ? '还没有主要角色，可在「角色生成」中创建或调整戏份。' : '还没有角色，点击「新建角色」开始创作'}
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* 左侧角色列表 */}
          <div className="w-40 shrink-0 space-y-0.5">
            {displayedChars.map((c, i) => {
              const active = selected === c.id
              const colorClass = GLYPH_COLORS[i % GLYPH_COLORS.length]
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(active ? null : c.id!)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                    active
                      ? 'bg-accent/8 border-l-2 border-accent'
                      : 'hover:bg-bg-hover border-l-2 border-transparent'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${colorClass}`}>
                    {c.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>{c.name}</p>
                    <p className="text-[10px] text-text-muted truncate">
                      {c.shortDescription?.slice(0, 10) || `${ROLE_WEIGHT_LABELS[c.roleWeight]} · ${MORAL_AXIS_LABELS[c.moralAxis]}`}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 右侧详情卡 */}
          <div className="flex-1 min-w-0">
            {selectedChar ? (
              <CharacterDetailCard
                char={selectedChar}
                charIndex={characters.findIndex(c => c.id === selectedChar.id)}
                projectId={project.id!}
                onUpdate={handleUpdate}
                onDelete={() => { deleteCharacter(selectedChar.id!); setSelected(null) }}
                multiWorld={!!project.enableMultiWorld}
                worldGroups={groups}
                onSupplement={openSupplement}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-text-muted text-sm">
                ← 选择一个角色查看详情
              </div>
            )}
          </div>
        </div>
      )}

      {/* 补全弹窗 */}
      {renderSupplementDialog()}

      {/* 补全 AI 输出 */}
      {renderSupplementOutput()}
      {renderSupplementReviewDialog()}
    </div>
  )
}

// ── 角色详情卡（design 风格） ────────────────────────────────────

function CharacterDetailCard({
  char, charIndex, projectId, onUpdate, onDelete, multiWorld, worldGroups, onSupplement,
}: {
  char: Character
  charIndex: number
  projectId: number
  onUpdate: (f: keyof Character, v: string) => void
  onDelete: () => void
  multiWorld?: boolean
  worldGroups?: import('../../lib/types').WorldGroup[]
  onSupplement?: (charId: number) => void
}) {
  const { updateCharacter } = useCharacterStore()
  const [expanded, setExpanded] = useState(true)
  const glyphColor = GLYPH_COLORS[charIndex % GLYPH_COLORS.length]

  const fields: { key: keyof Character; label: string }[] = [
    { key: 'appearance',   label: '外貌' },
    { key: 'personality',  label: '性格' },
    { key: 'background',   label: '背景故事' },
    { key: 'motivation',   label: '动机' },
    { key: 'abilities',    label: '能力' },
    { key: 'relationships', label: '人物关系' },
    { key: 'arc',          label: '角色弧' },
  ]

  return (
    <div className="space-y-4">
      {/* 头部：大号首字 + 名字 + 标签 */}
      <div className="flex items-start gap-4">
        {/* 大号首字 */}
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-serif font-bold shrink-0 ${glyphColor}`}>
          {char.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          {/* 角色元信息行 */}
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-0.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-elevated text-text-secondary">
              {ROLE_WEIGHT_LABELS[char.roleWeight]}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-elevated text-text-secondary">
              {ORDER_AXIS_LABELS[char.orderAxis]}{MORAL_AXIS_LABELS[char.moralAxis]}
            </span>

            {/* 多世界：归属世界 + 跨世界标记 */}
            {multiWorld && (
              <>
                <select
                  value={char.isCrossWorld ? 'cross' : (char.homeWorldGroupId ?? '')}
                  onChange={e => {
                    if (!char.id) return
                    const v = e.target.value
                    if (v === 'cross') {
                      updateCharacter(char.id, { isCrossWorld: true, homeWorldGroupId: null })
                    } else {
                      updateCharacter(char.id, { isCrossWorld: false, homeWorldGroupId: v ? Number(v) : null })
                    }
                  }}
                  className="px-1.5 py-0.5 bg-bg-elevated text-text-secondary text-[10px] rounded border border-border focus:outline-none focus:border-accent cursor-pointer"
                  title="角色所属世界"
                >
                  <option value="cross">🌐 跨世界</option>
                  {(worldGroups || []).map(g => (
                    <option key={g.id} value={g.id}>{g.icon || '🌐'} {g.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* 名字（可编辑） */}
          <InlineInput
            value={char.name}
            onChange={v => onUpdate('name', v)}
            className="text-2xl font-bold font-serif text-text-primary"
          />

          {/* 一句话简介（引号样式） */}
          {char.shortDescription ? (
            <InlineInput
              value={char.shortDescription}
              onChange={v => onUpdate('shortDescription', v)}
              className="text-sm text-text-secondary mt-1 italic"
              prefix={"“"}
              suffix={"”"}
              placeholder="点击添加一句话简介…"
            />
          ) : (
            <InlineInput
              value=""
              onChange={v => onUpdate('shortDescription', v)}
              className="text-sm text-text-muted mt-1 italic"
              placeholder="点击添加一句话简介…"
            />
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          {onSupplement && (
            <button
              onClick={() => onSupplement(char.id!)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-accent bg-accent/10 hover:bg-accent/20 rounded transition-colors"
              title="一键补全缺失字段"
            >
              <Wand2 className="w-3.5 h-3.5" />
              补全
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button onClick={onDelete} className="p-1.5 text-text-muted hover:text-error rounded transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CharacterAxesPicker
        roleWeight={char.roleWeight}
        moralAxis={char.moralAxis}
        orderAxis={char.orderAxis}
        onChange={axes => {
          if (!char.id || !axes.roleWeight || !axes.moralAxis || !axes.orderAxis) return
          updateCharacter(char.id, axes as Pick<Character, 'roleWeight' | 'moralAxis' | 'orderAxis'>)
        }}
        compact
      />

      {/* Phase 23.1: 动态状态面板 */}
      <CharacterStatusPanel projectId={projectId} characterName={char.name} />

      {/* 字段列表 — 横排 label: value */}
      {expanded && (
        <div className="space-y-0 divide-y divide-border/40">
          {fields.map(f => {
            const val = (char[f.key] as string) || ''
            return (
              <div key={String(f.key)} className="flex gap-4 py-3 first:pt-0">
                <span className="w-16 shrink-0 text-xs text-text-muted pt-0.5 text-right">{f.label}</span>
                <div className="flex-1 min-w-0">
                  <InlineTextarea
                    value={val}
                    onChange={v => onUpdate(f.key, v)}
                    placeholder={`点击填写${f.label}…`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
