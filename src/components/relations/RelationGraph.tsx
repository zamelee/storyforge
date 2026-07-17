import { useRef, useEffect, useCallback, useMemo, useState, type ComponentRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

type ForceGraphHandle = ComponentRef<typeof ForceGraph2D>
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useCharacterStore } from '../../stores/character'
import { moralAxisColor } from '../../lib/character/character-axes'

// 关系类型对应颜色
const RELATION_COLORS: Record<string, string> = {
  family:     '#f59e0b',
  lover:      '#ec4899',
  friend:     '#22c55e',
  rival:      '#f97316',
  enemy:      '#ef4444',
  master:     '#a78bfa',
  student:    '#60a5fa',
  ally:       '#14b8a6',
  subordinate:'#94a3b8',
  other:      '#6b7280',
}

// 阵营颜色
const MORAL_COLOR: Record<string, string> = {
  good: '#22c55e', neutral: '#94a3b8', evil: '#ef4444',
}

const RELATION_LABELS: Record<string, string> = {
  family:'亲属', lover:'恋人', friend:'朋友', rival:'对手',
  enemy:'敌人', master:'师父', student:'弟子', ally:'盟友',
  subordinate:'上下级', other:'其他',
}

// 角色戏份标签
const ROLE_WEIGHT_LABEL: Record<string, string> = {
  main: '主要', secondary: '次要', npc: 'NPC', extra: '路人',
}

// 角色戏份背景色
const ROLE_WEIGHT_BG: Record<string, string> = {
  main: '#3b82f6', secondary: '#f59e0b', npc: '#8b5cf6', extra: '#6b7280',
}

interface GraphNode { id: string; name: string; role: string; color: string }
interface GraphLink {
  source: string; target: string; type: string
  bidirectional: boolean; label: string; color: string
}

type PositionedNode = GraphNode & { x: number; y: number }
type PositionedLink = GraphLink & { source: PositionedNode; target: PositionedNode }

function getInitial(name: string): string {
  return name.charAt(0)
}

interface Props { width?: number; height?: number }

export default function RelationGraph({ width: _initialWidth, height: _initialHeight }: Props) {
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { characters } = useCharacterStore()
  const { relations } = useCharacterRelationStore()
  const [zoom, setZoom] = useState(1)
  const [graphSize, setGraphSize] = useState({ width: 700, height: 480 })
  const [fontScale, setFontScale] = useState(1)

  // ResizeObserver：让 Canvas 自动撑满容器
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setGraphSize({ width: Math.floor(width), height: Math.floor(height) })
        }
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // 每个角色的关系计数
  const relCountMap = useMemo(() => {
    const m = new Map<string, number>()
    relations.forEach(r => {
      m.set(String(r.fromCharacterId), (m.get(String(r.fromCharacterId)) ?? 0) + 1)
      m.set(String(r.toCharacterId), (m.get(String(r.toCharacterId)) ?? 0) + 1)
    })
    return m
  }, [relations])

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = characters.map(c => ({
      id: String(c.id),
      name: c.name,
      role: `${c.roleWeight}/${c.orderAxis}/${c.moralAxis}`,
      color: moralAxisColor(c.moralAxis),
    }))
    const links: GraphLink[] = relations.map(r => ({
      source: String(r.fromCharacterId),
      target: String(r.toCharacterId),
      type: r.relationType,
      bidirectional: r.isBidirectional,
      label: r.label ?? RELATION_LABELS[r.relationType] ?? r.relationType,
      color: RELATION_COLORS[r.relationType] ?? '#6b7280',
    }))
    return { nodes, links }
  }, [characters, relations])

  const onZoom = useCallback(() => {
    if (graphRef.current) setZoom(graphRef.current.zoom())
  }, [])

  const handleZoomToFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40)
  }, [])

  // 字体大小由 fontScale 独立控制（不受 globalScale 影响）
  const drawNode = useCallback((rawNode: unknown, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const node = rawNode as PositionedNode
    const char = characters.find(c => String(c.id) === node.id)
    const roleWeight = char?.roleWeight ?? 'main'
    const moral = char?.moralAxis ?? 'neutral'
    const count = relCountMap.get(node.id) ?? 0

    const padX = 4, padY = 2
    const avatarR = Math.max(5, 14 * fontScale)
    const fontSize = Math.max(7, 11 * fontScale)
    const subFontSize = Math.max(5, 8 * fontScale)

    ctx.font = `${fontSize}px PingFang SC, Microsoft YaHei, sans-serif`
    const nameW = ctx.measureText(node.name).width
    ctx.font = `${subFontSize}px PingFang SC, sans-serif`
    const tagW = ctx.measureText(ROLE_WEIGHT_LABEL[roleWeight] ?? roleWeight).width
    const cntW = ctx.measureText(`${count}条关系`).width
    const cardW = Math.max(nameW, tagW, cntW) + padX * 2
    const cardH = avatarR * 2 + padY * 2 + fontSize + subFontSize * 1.5 + 4

    const x = node.x - cardW / 2
    const y = node.y - cardH / 2

    // 卡片背景
    ctx.fillStyle = 'rgba(15, 15, 28, 0.92)'
    ctx.beginPath()
    ctx.roundRect(x, y, cardW, cardH, 6)
    ctx.fill()
    // 边框
    ctx.strokeStyle = (MORAL_COLOR[moral] ?? '#94a3b8') + 'cc'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 顶部阵营色条
    const barH = 2.5
    ctx.fillStyle = MORAL_COLOR[moral] ?? '#94a3b8'
    ctx.fillRect(x, y, cardW, barH)
    ctx.fillRect(x, y + cardH - barH, cardW, barH)

    const cx = node.x

    // 头像圆
    ctx.beginPath()
    ctx.arc(cx, y + padY + avatarR, avatarR, 0, 2 * Math.PI)
    ctx.fillStyle = (MORAL_COLOR[moral] ?? '#94a3b8')
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 首字
    ctx.font = `bold ${Math.round(avatarR * 0.95)}px PingFang SC, Microsoft YaHei`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(getInitial(node.name), cx, y + padY + avatarR)

    // 角色名
    ctx.font = `${fontSize}px PingFang SC, Microsoft YaHei, sans-serif`
    ctx.fillStyle = '#f1f5f9'
    ctx.textBaseline = 'middle'
    ctx.fillText(node.name, cx, y + padY + avatarR * 2 + fontSize * 0.7)

    // 戏份标签
    ctx.font = `${subFontSize}px PingFang SC, sans-serif`
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(ROLE_WEIGHT_LABEL[roleWeight] ?? roleWeight, cx, y + padY + avatarR * 2 + fontSize + subFontSize * 0.8)

    // 关系计数
    if (count > 0) {
      ctx.fillStyle = '#64748b'
      ctx.fillText(`${count}条关系`, cx, y + padY + avatarR * 2 + fontSize + subFontSize * 2)
    }
  }, [characters, relCountMap, fontScale])

  const drawLink = useCallback((rawLink: unknown, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const link = rawLink as PositionedLink
    const start = link.source
    const end = link.target
    if (!start || !end || !start.x || !end.x) return

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.strokeStyle = (link.color as string) + 'aa'
    ctx.lineWidth = 1.5
    ctx.stroke()

    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    const fontSize = Math.max(7, 9 * fontScale)
    ctx.font = `${fontSize}px PingFang SC, sans-serif`
    ctx.fillStyle = link.color + 'cc'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(link.label, midX, midY)
  }, [fontScale])

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-bg-base relative flex flex-col h-full" ref={containerRef}>
      {characters.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted z-10 bg-bg-base/80">
          <p className="text-sm">暂无角色数据，请先在「角色」模块添加角色</p>
        </div>
      )}
      {characters.length > 0 && relations.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted z-10 bg-bg-base/80">
          <p className="text-sm">暂无关系数据，请在下方添加角色关系</p>
        </div>
      )}

      {/* 右上角：字体滑杆 + 缩放按钮 */}
      <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
        {/* 字体大小滑杆 */}
        <div className="flex items-center gap-1.5 bg-bg-base/80 border border-border rounded px-2 py-1 backdrop-blur">
          <span className="text-xs text-text-muted">字</span>
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.05}
            value={Math.round(fontScale * 10) / 10}
            onChange={e => setFontScale(parseFloat(e.target.value))}
            className="w-20 h-1 accent-accent cursor-pointer"
            title={`字体: ${fontScale.toFixed(1)}x`}
          />
          <span className="text-xs text-text-muted w-6">{Math.round(fontScale * 100)}%</span>
        </div>

        {/* 缩放按钮组 */}
        <div className="flex flex-col gap-1">
          <button
            onClick={() => graphRef.current?.zoom(zoom * 1.3, 300)}
            className="w-7 h-7 flex items-center justify-center rounded bg-bg-base/80 border border-border text-text hover:text-text-bright hover:border-accent text-base font-bold backdrop-blur"
            title="放大"
          >+</button>
          <button
            onClick={() => graphRef.current?.zoom(zoom / 1.3, 300)}
            className="w-7 h-7 flex items-center justify-center rounded bg-bg-base/80 border border-border text-text hover:text-text-bright hover:border-accent text-base font-bold backdrop-blur"
            title="缩小"
          >-</button>
          <button
            onClick={handleZoomToFit}
            className="w-7 h-7 flex items-center justify-center rounded bg-bg-base/80 border border-border text-text hover:text-text-bright hover:border-accent text-xs backdrop-blur"
            title="适应窗口"
          >FIT</button>
        </div>
      </div>

      {/* Graph 撑满 flex-1，min-h-0 让 flex 收缩生效 */}
      <div className="flex-1 min-h-0" style={{ minHeight: 300 }}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={graphSize.width}
          height={graphSize.height}
          backgroundColor="#0a0a0f"
          nodeCanvasObject={drawNode}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={drawLink}
          linkCanvasObjectMode={() => 'replace'}
          linkDirectionalArrowLength={(link: object) => ((link as GraphLink).bidirectional ? 0 : Math.max(3, 6))}
          linkDirectionalArrowRelPos={0.85}
          cooldownTicks={100}
          onEngineStop={handleZoomToFit}
          enableNodeDrag
          enableZoomInteraction
          onZoom={onZoom}
          minZoom={0.1}
          maxZoom={8}
          minimap
          minimapNodeColor={() => '#334155'}
          minimapNodeBorder={1}
          minimapPadding={5}
        />
      </div>

      {/* 图例 */}
      <div className="p-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1 shrink-0">
        {Object.entries(RELATION_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1 text-xs text-text-muted">
            <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
            {RELATION_LABELS[key]}
          </div>
        ))}
        <span className="text-text-muted text-xs mx-1">|</span>
        {Object.entries(ROLE_WEIGHT_BG).map(([k, color]) => (
          <div key={k} className="flex items-center gap-1 text-xs text-text-muted">
            <span className="w-2 h-2 inline-block rounded-full" style={{ backgroundColor: color }} />
            {ROLE_WEIGHT_LABEL[k]}
          </div>
        ))}
      </div>
    </div>
  )
}



