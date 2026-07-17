import { useRef, useCallback, useMemo, useState, useEffect, type ComponentRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useMeasure from 'react-use-measure'
type ForceGraphHandle = ComponentRef<typeof ForceGraph2D>
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useCharacterStore } from '../../stores/character'
import { moralAxisColor } from '../../lib/character/character-axes'
// 布局模式（react-force-graph 原生 dagMode）
type LayoutMode = null | 'radialout' | 'radialin' | 'td' | 'bu' | 'lr'
const LAYOUT_OPTIONS: { key: LayoutMode; label: string; title: string }[] = [
  { key: null,         label: '力导向', title: '力导向布局：物理引擎自动散开节点（默认）' },
  { key: 'radialout',  label: '放射↗', title: '放射状布局：由内向外发散，适合阵营/组织图' },
  { key: 'radialin',   label: '放射↙', title: '放射状布局：由外向内聚集，适合中心人物' },
  { key: 'td',         label: '上→下', title: 'Top-Down 树状层级' },
  { key: 'bu',         label: '下→上', title: 'Bottom-Up 树状层级' },
  { key: 'lr',         label: '左→右', title: 'Left-Right 树状层级' },
]
const LS_LAYOUT = 'sf_relationgraph_layout'
const LS_LEVEL  = 'sf_relationgraph_level'
const LS_FONT   = 'sf_relationgraph_font'
function loadLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v == null ? fallback : (JSON.parse(v) as T) }
  catch { return fallback }
}
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
interface GraphNode { id: string; name: string; role: string; color: string; fx?: number; fy?: number }
interface GraphLink {
  source: string; target: string; type: string
  bidirectional: boolean; label: string; color: string; curvature?: number
}
type PositionedNode = GraphNode & { x: number; y: number }
type PositionedLink = GraphLink & { source: PositionedNode; target: PositionedNode }
function getInitial(name: string): string {
  return name.charAt(0)
}
interface Props { width?: number; height?: number }
 export default function RelationGraph({ width: _initialWidth, height: _initialHeight }: Props) {
  // ResizeObserver: dynamic canvas resize, avoid ForceGraph2D remount
  useEffect(() => {
    const container = graphContainerRef.current;
    const fg = graphRef.current;
    if (!container || !fg) return;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      const canvas = (fg as any).scene?.canvas;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
        (fg as any).renderer?.resize?.(w, h);
        (fg as any).d3ReheatSimulation?.();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [])
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined)
  const { characters } = useCharacterStore()
  const { relations } = useCharacterRelationStore()
  const [zoom, setZoom] = useState(1)
  const [measureRef, bounds] = useMeasure()
  const [fontScale, setFontScale] = useState<number>(() => loadLS<number>(LS_FONT, 1))
  // 布局模式（持久化）
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => loadLS<LayoutMode>(LS_LAYOUT, null))
  const [levelDistance, setLevelDistance] = useState<number>(() => loadLS<number>(LS_LEVEL, 120))
  // 力导向模式可调参数
  const [chargeStrength, setChargeStrength] = useState(-400)
  const [linkDistance, setLinkDistance]   = useState(120)
  const [collideRadius, setCollideRadius] = useState(45)
  // graphData 改 useState：当 characters/relations 变化时重建，并保留旧节点的 fx/fy
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>(() => ({ nodes: [], links: [] }))
  useEffect(() => {
    setGraphData(prev => {
      const oldById = new Map(prev.nodes.map(n => [n.id, n]))
      const nodes: GraphNode[] = characters.map(c => {
        const id = String(c.id)
        const old = oldById.get(id)
        return {
          id,
          name: c.name,
          role: `${c.roleWeight}/${c.orderAxis}/${c.moralAxis}`,
          color: moralAxisColor(c.moralAxis),
          fx: old?.fx,
          fy: old?.fy,
        }
      })
      const links: GraphLink[] = relations.map(r => ({
        source: String(r.fromCharacterId),
        target: String(r.toCharacterId),
        type: r.relationType,
        bidirectional: r.isBidirectional,
        label: r.label ?? RELATION_LABELS[r.relationType] ?? r.relationType,
        color: RELATION_COLORS[r.relationType] ?? '#6b7280',
      }))
      // 同一对角色多条关系时分配不同 curvature，使连线呈扇形展开避免重叠
      processLinks(links)
      return { nodes, links }
    })
  }, [characters, relations])
  // 布局变化后重新加热引擎 + 自动 fit，让用户看到完整层级铺开
  // 即使 layoutMode 持久化后初次 mount 也要跑（dagMode 已切但 zoom 还在旧位置）
  useEffect(() => {
    try { localStorage.setItem(LS_LAYOUT, JSON.stringify(layoutMode)) } catch {}
    // 三次延迟避开 dagMode 尚未挂载的竞态; 加上 graphData 让初始化也 fit
    const timeouts: number[] = []
    const fit = () => {
      const fg = graphRef.current as unknown as { d3ReheatSimulation?: () => void } | undefined
      fg?.d3ReheatSimulation?.()
      graphRef.current?.zoomToFit(400, 50)
    }
    // 三次延迟分别处理：dagMode 切换 / 引擎冷却重计算 / 最终 fit
    timeouts.push(window.setTimeout(fit, 100))
    timeouts.push(window.setTimeout(fit, 400))
    timeouts.push(window.setTimeout(fit, 1000))
    return () => timeouts.forEach(clearTimeout)
  }, [layoutMode, graphData])
  useEffect(() => {
    try { localStorage.setItem(LS_LEVEL, JSON.stringify(levelDistance)) } catch {}
  }, [levelDistance])
  // 字号持久化
  useEffect(() => {
    try { localStorage.setItem(LS_FONT, JSON.stringify(fontScale)) } catch {}
  }, [fontScale])
  // 每个角色的关系计数
  const relCountMap = useMemo(() => {
    const m = new Map<string, number>()
    relations.forEach(r => {
      m.set(String(r.fromCharacterId), (m.get(String(r.fromCharacterId)) ?? 0) + 1)
      m.set(String(r.toCharacterId), (m.get(String(r.toCharacterId)) ?? 0) + 1)
    })
    return m
  }, [relations])
  // 力导向布局：调整 d3-force 力学参数（斥力 / 链接距离 / 碰撞），避免节点挤在中心
  useEffect(() => {
    const fg = graphRef.current as unknown as
      | { d3Force?: (n: string) => { strength?: (s: number) => unknown; distance?: (d: number) => unknown; radius?: (r: number) => unknown } }
      | undefined
    if (!fg || layoutMode !== null) return
    try {
      const d3Force = (fg as any).d3Force
      if (typeof d3Force !== 'function') return
      d3Force('charge')?.strength?.(chargeStrength)
      d3Force('link')?.distance?.(linkDistance)
      d3Force('collide')?.radius?.(collideRadius)
      ;(fg as any).d3ReheatSimulation?.()
    } catch { /* 引擎可能尚未挂载，跳过 */ }
  }, [layoutMode, graphData, chargeStrength, linkDistance, collideRadius])
  // 检测是否有锁定节点
  const hasLockedNodes = useMemo(() => graphData.nodes.some(n => n.fx != null || n.fy != null), [graphData])
  // 重置布局：解锁所有节点的 fx/fy，让物理引擎重新接管
  const handleResetLayout = useCallback(() => {
    setGraphData(prev => {
      const nodes = prev.nodes.map(n => { const { fx, fy, ...rest } = n; return rest })
      return { ...prev, nodes }
    })
    setTimeout(() => {
      const fg = graphRef.current as unknown as { d3ReheatSimulation?: () => void } | undefined
      fg?.d3ReheatSimulation?.()
    }, 50)
  }, [])
  // 拖动结束：固定节点坐标，物理引擎不再拉回
  const handleNodeDragEnd = useCallback((node: unknown) => {
    const n = node as PositionedNode
    n.fx = n.x
    n.fy = n.y
  }, [])
  // 拖动过程中持续同步坐标，避免回弹
  const handleNodeDrag = useCallback((node: unknown) => {
    const n = node as PositionedNode
    n.fx = n.x
    n.fy = n.y
  }, [])
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
    // 卡片背景（半透明深色）
    ctx.fillStyle = 'rgba(15, 15, 28, 0.92)'
    ctx.beginPath()
    ctx.roundRect(x, y, cardW, cardH, 6)
    ctx.fill()
    // 仅保留顶部阵营色条（去掉外框线，色条就是该角色的阵营标签）
    const barH = 2.5
    ctx.fillStyle = MORAL_COLOR[moral] ?? '#94a3b8'
    ctx.fillRect(x, y, cardW, barH)
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
  // 增大节点点击/拖拽响应区：用一个隐形大圆覆盖视觉卡片，避免边缘拖不到
  const nodePointerAreaPaint = useCallback((rawNode: unknown, color: string, ctx: CanvasRenderingContext2D) => {
    const node = rawNode as PositionedNode
    const r = Math.max(30, 18 + 14 * fontScale + 14 * fontScale)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fill()
  }, [fontScale])
  const drawLink = useCallback((rawLink: unknown, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const link = rawLink as PositionedLink
    const start = link.source
    const end = link.target
    if (!start || !end || !start.x || !end.x) return
    // 标签位置：lineCanvasObjectMode='after' 时内置已画弧线（由 linkCurvature 控制），
    // 我们只需把标签放在贝塞尔曲线 t=0.5 顶点。curvature=0 时退化为直线中点。
    const curvature = link.curvature ?? 0
    let textX: number, textY: number
    if (curvature === 0) {
      textX = (start.x + end.x) / 2
      textY = (start.y + end.y) / 2
    } else {
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.sqrt(dx * dx + dy * dy) || 1
      // 控制点 = 中点 + 法向量 * (length * curvature * 0.5)
      const nx = -dy / length
      const ny = dx / length
      const ctrlOffset = length * curvature * 0.5
      const ctrlX = (start.x + end.x) / 2 + nx * ctrlOffset
      const ctrlY = (start.y + end.y) / 2 + ny * ctrlOffset
      // 二次贝塞尔 B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
      textX = 0.25 * start.x + 0.5 * ctrlX + 0.25 * end.x
      textY = 0.25 * start.y + 0.5 * ctrlY + 0.25 * end.y
    }
    // 连线叠字：第一行 短标（关系类型），第二行 长 label（用户自定义）
    const shortTag = RELATION_LABELS[link.type] ?? link.type
    const longLabel = (link.label && link.label !== shortTag) ? link.label : ''
    const tagFont = Math.max(7, 9 * fontScale)
    const lblFont = Math.max(6, 7 * fontScale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 第一行：短标（彩色）
    ctx.font = `bold ${tagFont}px PingFang SC, Microsoft YaHei, sans-serif`
    ctx.fillStyle = link.color
    ctx.fillText(shortTag, textX, textY - tagFont * 0.6)
    // 第二行：长 label（灰色细字）
    if (longLabel) {
      ctx.font = `${lblFont}px PingFang SC, sans-serif`
      ctx.fillStyle = '#94a3b8'
      ctx.fillText(longLabel.length > 14 ? longLabel.slice(0, 14) + '…' : longLabel, textX, textY + lblFont * 0.8)
    }
  }, [fontScale])
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-bg-base relative flex flex-col h-full">
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
      {/* 顶部居中：布局切换 + 层级距离滑杆（仅非力导向布局显示） */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-bg-base/80 border border-border rounded-lg px-2 py-1 backdrop-blur">
        <span className="text-xs text-text-muted">布局</span>
        {LAYOUT_OPTIONS.map(opt => (
          <button
            key={String(opt.key ?? 'null')}
            onClick={() => setLayoutMode(opt.key)}
            title={opt.title}
            className={
              'px-2 py-0.5 text-xs rounded transition-colors ' +
              (layoutMode === opt.key
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover')
            }
          >{opt.label}</button>
        ))}
        {layoutMode !== null && (
          <>
            <span className="text-xs text-text-muted ml-1">层级</span>
            <input
              type="range"
              min={40}
              max={400}
              step={10}
              value={levelDistance}
              onChange={e => setLevelDistance(parseInt(e.target.value))}
              className="w-20 h-1 accent-accent cursor-pointer"
              title={`层级距离: ${levelDistance}px`}
            />
            <span className="text-xs text-text-muted w-8 text-right">{levelDistance}</span>
          </>
        )}
        {/* 力导向模式：斥力/距离/碰撞 3 个滑杆 */}
        {layoutMode === null && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            <label className="flex items-center gap-1 text-xs text-text-muted" title="节点间斥力（绝对值越大越分散）">
              <span>斥</span>
              <input type="range" min={-1500} max={-50} step={50} value={chargeStrength} onChange={e => setChargeStrength(parseInt(e.target.value))} className="w-16 h-1 accent-accent cursor-pointer" />
              <span className="w-8 text-right">{chargeStrength}</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-text-muted" title="连线目标距离">
              <span>距</span>
              <input type="range" min={40} max={300} step={10} value={linkDistance} onChange={e => setLinkDistance(parseInt(e.target.value))} className="w-16 h-1 accent-accent cursor-pointer" />
              <span className="w-8 text-right">{linkDistance}</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-text-muted" title="节点碰撞半径（越大越不重叠）">
              <span>碰</span>
              <input type="range" min={20} max={80} step={5} value={collideRadius} onChange={e => setCollideRadius(parseInt(e.target.value))} className="w-16 h-1 accent-accent cursor-pointer" />
              <span className="w-8 text-right">{collideRadius}</span>
            </label>
          </div>
        )}
      </div>
      {/* 右上角：字体滑杆 + 重置布局 + 缩放按钮 */}
      <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
        {/* 字体大小滑杆（1%–100%） */}
        <div className="flex items-center gap-1.5 bg-bg-base/80 border border-border rounded px-2 py-1 backdrop-blur">
          <span className="text-xs text-text-muted" title="节点与连线上的字号缩放">字</span>
          <input
            type="range"
            min={0.01}
            max={1.0}
            step={0.01}
            value={Math.round(fontScale * 100) / 100}
            onChange={e => setFontScale(parseFloat(e.target.value))}
            className="w-20 h-1 accent-accent cursor-pointer"
            title={`字号: ${Math.round(fontScale * 100)}%`}
          />
          <span className="text-xs text-text-muted w-8 text-right">{Math.round(fontScale * 100)}%</span>
        </div>
        {/* 重置布局：解锁所有已拖动节点，让物理引擎重新接管 */}
        <button
          onClick={handleResetLayout}
          disabled={!hasLockedNodes}
          className="w-7 h-7 flex items-center justify-center rounded bg-bg-base/80 border border-border text-text hover:text-text-bright hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-base font-bold backdrop-blur"
          title={hasLockedNodes ? '重置布局：解锁所有节点' : '当前没有锁定的节点'}
        >⟳</button>
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
      <div
        ref={measureRef}
        className="flex-1 min-h-0"
        style={{ minHeight: 300 }}
      >
        <div ref={graphContainerRef} className="w-full h-full">
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={bounds.width || 700}
            height={bounds.height || 600}
            backgroundColor="#0a0a0f"
            nodeCanvasObject={drawNode}
            nodeCanvasObjectMode={() => 'replace'}
            nodePointerAreaPaint={nodePointerAreaPaint}
            linkCanvasObject={drawLink}
            linkCanvasObjectMode={() => 'after'}
            linkCurvature="curvature"
            linkColor={(link: object) => ((link as GraphLink).color + 'aa')}
            linkWidth={1.5}
            linkDirectionalArrowLength={(link: object) => ((link as GraphLink).bidirectional ? 0 : Math.max(3, 6))}
            linkDirectionalArrowRelPos={0.85}
            // 首帧稳定：后台预热 100 ticks，第一帧就是散开的最终形态
            warmupTicks={100}
            // 让引擎自然平息，不要过早停止
            cooldownTicks={Infinity}
            // 布局切换：null = 力导向；其它 = react-force-graph 内置 dagMode
            dagMode={(layoutMode ?? null) as any}
            dagLevelDistance={levelDistance}
            enableNodeDrag
            enableZoomInteraction
            onZoom={onZoom}
            onNodeDrag={handleNodeDrag}
            onNodeDragEnd={handleNodeDragEnd}
            minZoom={0.1}
            maxZoom={8}
            minimap={true}
            minimapNodeColor={() => '#334155'}
            minimapNodeBorder={1}
            minimapPadding={5}
          />
        </div>
      </div>
      {/* 图例：拆两行 */}
      <div className="p-3 border-t border-border flex flex-col gap-1 shrink-0 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-text-muted">角色颜色图示：</span>
          {Object.entries(ROLE_WEIGHT_BG).map(([k, color]) => (
            <div key={k} className="flex items-center gap-1 text-text-muted">
              <span className="w-2 h-2 inline-block rounded-full" style={{ backgroundColor: color }} />
              {ROLE_WEIGHT_LABEL[k]}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-text-muted">关系颜色图示：</span>
          {Object.entries(RELATION_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1 text-text-muted">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
              {RELATION_LABELS[key]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
// 给同一对端点的多条连线分配不同曲率，避免互相重叠（Gemini 推荐 pattern）
function processLinks(links: GraphLink[]): GraphLink[] {
  const groups = new Map<string, GraphLink[]>()
  for (const link of links) {
    const key = [link.source, link.target].sort().join('-')
    const arr = groups.get(key)
    if (arr) arr.push(link)
    else groups.set(key, [link])
  }
  const step = 0.25
  for (const group of groups.values()) {
    const total = group.length
    group.forEach((link, index) => {
      // 奇数条时中间那条 curvature=0（直线），其他按 0.25 步长对称偏移
      link.curvature = (index - (total - 1) / 2) * step
    })
  }
  return links
}
