import { useRef, useCallback, useMemo, useState, useEffect, type ComponentRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useMeasure from 'react-use-measure'
type ForceGraphHandle = ComponentRef<typeof ForceGraph2D>
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useCharacterStore } from '../../stores/character'
import { moralAxisColor } from '../../lib/character/character-axes'
import { Settings, Maximize2 } from 'lucide-react'
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
const LS_NODE_FONT = 'sf_relationgraph_node_font'
const LS_LINK_FONT = 'sf_relationgraph_link_font'
const LS_FIT_MODE = 'sf_relationgraph_fit_mode'
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
// 关系类型按语义分组（图例分段展示，所有 10 种类型均覆盖）
const RELATION_GROUPS: { title: string; types: string[] }[] = [
  { title: '情感关系', types: ['family', 'lover', 'friend'] },
  { title: '冲突关系', types: ['rival', 'enemy'] },
  { title: '师徒关系', types: ['master', 'student'] },
  { title: '组织关系', types: ['ally', 'subordinate'] },
  { title: '其他',     types: ['other'] },
]
// 角色戏份标签
const ROLE_WEIGHT_LABEL: Record<string, string> = {
  main: '主要', secondary: '次要', npc: 'NPC', extra: '路人',
}
// 角色戏份背景色
const ROLE_WEIGHT_BG: Record<string, string> = {
  main: '#3b82f6', secondary: '#f59e0b', npc: '#8b5cf6', extra: '#6b7280',
}
interface GraphNode { id: string; name: string; role: string; color: string; fx?: number; fy?: number; relationColors?: string[] }
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
  // 容器尺寸变化时自动 zoomToFit（debounced），并保留 FIT 手动按钮作为 override
  useEffect(() => {
    const container = graphContainerRef.current;
    const fg = graphRef.current;
    if (!container || !fg) return;
    // 跳过首次触发（observe() 同步触发一次），符合 FIT 不要默认启用
    let firstFire = true;
    let fitDebounce: number | undefined;
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
      if (firstFire) {
        firstFire = false;
        return;
      }
      // 250ms debounce: window drag / panel toggle 会触发多次 resize，等动作停下再 fit 一次
      clearTimeout(fitDebounce);
      fitDebounce = window.setTimeout(() => {
        if (fitModeRef.current === 'cover') {
          // inline cover 计算：手算包围盒 + max(scaleX, scaleY)
          const fg = graphRef.current as unknown as {
            centerAt: (x?: number, y?: number, ms?: number) => unknown
            zoom: (k?: number, ms?: number) => unknown
          } | undefined
          const c = graphContainerRef.current
          const ns = (graphDataRef.current?.nodes ?? []) as Array<{ x?: number; y?: number }>
          const ps = ns.filter(n => typeof n.x === 'number' && typeof n.y === 'number')
          if (fg && c && ps.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
            for (const n of ps) {
              if (n.x! < minX) minX = n.x!
              if (n.x! > maxX) maxX = n.x!
              if (n.y! < minY) minY = n.y!
              if (n.y! > maxY) maxY = n.y!
            }
            const pad = 60
            const gw = Math.max(1, (maxX - minX) + pad * 2)
            const gh = Math.max(1, (maxY - minY) + pad * 2)
            const cw = Math.max(1, c.clientWidth)
            const ch = Math.max(1, c.clientHeight)
            const ts = Math.max(cw / gw, ch / gh)
            ;(fg as any).centerAt((minX + maxX) / 2, (minY + maxY) / 2, 0)
            ;(fg as any).zoom(ts, 400)
          }
        } else {
          // inline contain: 安全区 + 节点视觉半径 + safe 区中心
          const fg = graphRef.current as unknown as {
            centerAt: (x?: number, y?: number, ms?: number) => unknown
            zoom: (k?: number, ms?: number) => unknown
          } | undefined
          const c = graphContainerRef.current
          const ns = (graphDataRef.current?.nodes ?? []) as unknown as Array<{ x?: number; y: number }>
          const ps = ns.filter(n => typeof n.x === 'number' && typeof n.y === 'number')
          if (fg && c && ps.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
            for (const n of ps) {
              if (n.x! < minX) minX = n.x!
              if (n.x! > maxX) maxX = n.x!
              if (n.y! < minY) minY = n.y!
              if (n.y! > maxY) maxY = n.y!
            }
            const gw = Math.max(1, maxX - minX)
            const gh = Math.max(1, maxY - minY)
            const cw = Math.max(1, c.clientWidth)
            const ch = Math.max(1, c.clientHeight)
            const ins = safeInsetRef.current
            const nodeR = nodeVisualR
            const effGw = gw + nodeR * 2
            const effGh = gh + nodeR * 2
            const safeW = Math.max(1, cw - ins.left - ins.right)
            const safeH = Math.max(1, ch - ins.top - ins.bottom)
            const k = Math.min(safeW / effGw, safeH / effGh)
            const cx = (minX + maxX) / 2
            const cy = (minY + maxY) / 2
            const ox = cx - (ins.left - ins.right) / (2 * k)
            const oy = cy - (ins.top - ins.bottom) / (2 * k)

            ;(fg as any).centerAt(ox, oy, 0)
            ;(fg as any).zoom(k, 400)
          }
        }
      }, 250);
    });
    ro.observe(container);
    return () => {
      clearTimeout(fitDebounce);
      ro.disconnect();
    };
  }, [])
  // 实时量 safe inset: 顶部布局工具条 + 右侧控制区占据的矩形
  // contain 模式 fit 时用这些 inset 算出安全可视区，节点视觉边界不压工具条
  useEffect(() => {
    const compute = () => {
      const c = graphContainerRef.current
      if (!c) return
      const cRect = c.getBoundingClientRect()
      const margin = 12 // 工具条和节点的间距
      let top = 0
      let right = 0
      const lb = layoutBarRef.current
      if (lb) {
        const r = lb.getBoundingClientRect()
        // absolute top-2 (8px) + bottom = 工具条下沿到容器上沿的距离
        top = Math.max(0, r.bottom - cRect.top + margin)
      }
      const ctrl = controlsRef.current
      if (ctrl) {
        const r = ctrl.getBoundingClientRect()
        right = Math.max(0, cRect.right - r.left + margin)
      }
      safeInsetRef.current = { top, right, bottom: 0, left: 0 }
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(graphContainerRef.current!)
    if (layoutBarRef.current) ro.observe(layoutBarRef.current)
    if (controlsRef.current) ro.observe(controlsRef.current)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [])

  // 中键 pan：react-force-graph 内部 d3-zoom filter 强制 !ev.button（非左键一律拒绝），
  // 这里自接管 middle button，调 centerAt 偏移图心。
  // centerAt() 无参为 getter 返回 {x, y} 当前位置；centerAt(x, y) 直接 set，无 transitionMs。
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      isPanning.current = true;
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current || !graphRef.current) return;
      const currentZoom = graphRef.current.zoom();
      const dx = e.clientX - lastPanPoint.current.x;
      const dy = e.clientY - lastPanPoint.current.y;
      const center = graphRef.current.centerAt();
      if (!center) return;
      graphRef.current.centerAt(center.x - dx / currentZoom, center.y - dy / currentZoom);
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 1) return;
      isPanning.current = false;
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [])
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined)
  // 中键 pan 状态（不引发重渲染）
  const isPanning = useRef(false)
  const lastPanPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // 顶部布局工具条 + 右侧控制区 ref（contain 模式 safe inset 实时量）
  const layoutBarRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  // safe inset: 节点视觉边界要避开这些区域，单位 px
  const safeInsetRef = useRef<{ top: number; right: number; bottom: number; left: number }>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })
  const { characters } = useCharacterStore()
  const { relations } = useCharacterRelationStore()
  const [zoom, setZoom] = useState(1)
  const [measureRef, bounds] = useMeasure()
  const [nodeFontSize, setNodeFontSize] = useState<number>(() => loadLS<number>(LS_NODE_FONT, 9))
  const [linkFontSize, setLinkFontSize] = useState<number>(() => loadLS<number>(LS_LINK_FONT, 9))
  // 布局模式（持久化）
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => loadLS<LayoutMode>(LS_LAYOUT, null))
  const [levelDistance, setLevelDistance] = useState<number>(() => loadLS<number>(LS_LEVEL, 120))
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(() => loadLS<'contain' | 'cover'>(LS_FIT_MODE, 'contain'))
  const fitModeRef = useRef<'contain' | 'cover'>(fitMode)
  const [physicsOpen, setPhysicsOpen] = useState(false)
  const physicsRef = useRef<HTMLDivElement>(null)
  // 力导向模式可调参数
  const [chargeStrength, setChargeStrength] = useState(-900)
  const [linkDistance, setLinkDistance]   = useState(150)
  const [collideRadius, setCollideRadius] = useState(45)
  // 节点视觉半径：基于实际字符名 measureText 估算 cardW/2 + cardH/2 较大值
  // fit 算法需要这个值算 safe 区的实际可用宽高
  const nodeVisualR = useMemo(() => {
    if (typeof document === 'undefined') return 40
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')!
    const fs = Math.max(6, nodeFontSize)
    const sfs = Math.max(5, nodeFontSize * 0.78)
    // 名字最大宽度
    ctx.font = `${fs}px PingFang SC, Microsoft YaHei, sans-serif`
    let maxNameW = 0
    for (const c of characters) {
      const w = ctx.measureText(c.name).width
      if (w > maxNameW) maxNameW = w
    }
    // 戏份标签最大宽度
    ctx.font = `${sfs}px PingFang SC, sans-serif`
    let maxTagW = 0
    const tagTexts = new Set<string>()
    for (const c of characters) tagTexts.add(ROLE_WEIGHT_LABEL[c.roleWeight as keyof typeof ROLE_WEIGHT_LABEL] ?? c.roleWeight)
    for (const t of tagTexts) {
      const w = ctx.measureText(t).width
      if (w > maxTagW) maxTagW = w
    }
    // 关系计数 "X条关系"
    let maxCntW = 0
    for (let i = 1; i <= 20; i++) {
      const w = ctx.measureText(`${i}条关系`).width
      if (w > maxCntW) maxCntW = w
    }
    const cardW = Math.max(maxNameW, maxTagW, maxCntW) + 8 // +8 = padX*2
    const avatarR = Math.max(6, nodeFontSize * 1.4)
    const cardH = avatarR * 2 + 4 + fs + sfs * 1.5 + 8
    return Math.ceil(Math.max(cardW, cardH) / 2) + 4 // +4 breathing
  }, [characters, nodeFontSize])
  // graphData 改 useState：当 characters/relations 变化时重建，并保留旧节点的 fx/fy
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>(() => ({ nodes: [], links: [] }))
  // ResizeObserver 早期 useEffect 用 ref 持有最新 graphData，避免 closure 过期
  const graphDataRef = useRef(graphData)
  useEffect(() => { graphDataRef.current = graphData }, [graphData])
  useEffect(() => {
    setGraphData(prev => {
      const oldById = new Map(prev.nodes.map(n => [n.id, n]))
      // 预先收集每个角色涉及的关系类型颜色（去重、保持首次出现顺序），
      // 给节点顶部“分段色条”使用
      const colorsByChar = new Map<string, string[]>()
      for (const r of relations) {
        const c = RELATION_COLORS[r.relationType] ?? '#6b7280'
        for (const id of [String(r.fromCharacterId), String(r.toCharacterId)]) {
          const arr = colorsByChar.get(id)
          if (arr) {
            if (!arr.includes(c)) arr.push(c)
          } else {
            colorsByChar.set(id, [c])
          }
        }
      }
      const nodes: GraphNode[] = characters.map(c => {
        const id = String(c.id)
        const old = oldById.get(id)
        return {
          id,
          name: c.name,
          role: `${c.roleWeight}/${c.orderAxis}/${c.moralAxis}`,
          color: moralAxisColor(c.moralAxis),
          relationColors: colorsByChar.get(id) ?? [],
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
    try { localStorage.setItem(LS_NODE_FONT, JSON.stringify(nodeFontSize)) } catch {}
  }, [nodeFontSize])
  useEffect(() => {
    try { localStorage.setItem(LS_LINK_FONT, JSON.stringify(linkFontSize)) } catch {}
  }, [linkFontSize])
  useEffect(() => {
    try { localStorage.setItem(LS_FIT_MODE, JSON.stringify(fitMode)) } catch {}
    fitModeRef.current = fitMode
  }, [fitMode])
  // 点击 physicsRef 外部关闭 Popover
  useEffect(() => {
    if (!physicsOpen) return
    const onDown = (e: MouseEvent) => {
      if (physicsRef.current && !physicsRef.current.contains(e.target as Node)) {
        setPhysicsOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhysicsOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [physicsOpen])
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
    // ForceGraph2D 会在自身 render 期间回调 onZoom；同步 setZoom 会触发 React 18 的
    // "Cannot update a component while rendering a different component" 警告。
    // 推到 microtask：render 退出后再 dispatch setState，警告消失，状态语义不变。
    const fg = graphRef.current
    if (!fg) return
    queueMicrotask(() => setZoom(fg.zoom() ?? 1))
  }, [])
  const handleZoomToFit = useCallback(() => {
    // 容错：safeInsetRef 在 mount 后第一次 fit 时可能未初始化（layoutBarRef 等还没 ref 上）
    // 同步算一次，避开闭包问题
    const cEl = graphContainerRef.current
    if (cEl) {
      const cRect = cEl.getBoundingClientRect()
      const margin2 = 12
      let _top = 0
      let _right = 0
      const lb = layoutBarRef.current
      if (lb) {
        const r = lb.getBoundingClientRect()
        _top = Math.max(0, r.bottom - cRect.top + margin2)
      }
      const ctrl = controlsRef.current
      if (ctrl) {
        const r = ctrl.getBoundingClientRect()
        _right = Math.max(0, cRect.right - r.left + margin2)
      }
      safeInsetRef.current = { top: _top, right: _right, bottom: 0, left: 0 }
    }
    const fg = graphRef.current as unknown as {
      centerAt: (x?: number, y?: number, ms?: number) => { x: number; y: number } | undefined
      zoom: (k?: number, ms?: number) => number | undefined
    } | undefined
    const container = cEl
    if (!fg || !container) return
    const nodes = graphData.nodes as unknown as Array<{ x?: number; y: number }>
    const positioned = nodes.filter(n => typeof n.x === 'number' && typeof n.y === 'number')
    if (positioned.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of positioned) {
      if (n.x! < minX) minX = n.x!
      if (n.x! > maxX) maxX = n.x!
      if (n.y! < minY) minY = n.y!
      if (n.y! > maxY) maxY = n.y!
    }
    const gw = Math.max(1, maxX - minX)
    const gh = Math.max(1, maxY - minY)
    const cw = Math.max(1, container.clientWidth)
    const ch = Math.max(1, container.clientHeight)
    const ins = safeInsetRef.current
    // 节点视觉半径：与 nodePointerAreaPaint 公式对齐，随字号放大
    const nodeR = nodeVisualR
    // 把节点视觉边界也算进图包围盒：effectiveGW = (maxX-minX) + 2*nodeR
    // 这样 k 算出来让节点视觉边界正好填满 safe 区
    const effGw = gw + nodeR * 2
    const effGh = gh + nodeR * 2
    // 有效可视区 = canvas - safe inset（不再减 nodeR，因为已经加到 effG）
    const safeW = Math.max(1, cw - ins.left - ins.right)
    const safeH = Math.max(1, ch - ins.top - ins.bottom)
    // contain: 取最小比例，保证节点视觉边界完整在 safe 区内
    const k = Math.min(safeW / effGw, safeH / effGh)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    // 中心点偏移：把图心放到 safe 区中心（不是 canvas 中心）
    // safe 区中心相对 canvas 中心的偏移 = (left - right) / 2 水平, (top - bottom) / 2 垂直
    const offsetX = cx - (ins.left - ins.right) / (2 * k)
    const offsetY = cy - (ins.top - ins.bottom) / (2 * k)
    fg.centerAt(offsetX, offsetY, 0)
    fg.zoom(k, 400)
  }, [graphData, nodeFontSize])
  // Cover 模式：手算包围盒 + max(scaleX, scaleY)，解决 Portrait 下画布留大块空白的问题 (C 方案)
  const handleZoomToCover = useCallback(() => {
    const fg = graphRef.current as unknown as {
      centerAt: (x?: number, y?: number, ms?: number) => { x: number; y: number } | undefined
      zoom: (k?: number, ms?: number) => number | undefined
    } | undefined
    const container = graphContainerRef.current
    if (!fg || !container) return
    const nodes = graphData.nodes as Array<{ x?: number; y?: number }>
    const positioned = nodes.filter(n => typeof n.x === 'number' && typeof n.y === 'number')
    if (positioned.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of positioned) {
      if (n.x! < minX) minX = n.x!
      if (n.x! > maxX) maxX = n.x!
      if (n.y! < minY) minY = n.y!
      if (n.y! > maxY) maxY = n.y!
    }
    const pad = 60
    const gw = Math.max(1, (maxX - minX) + pad * 2)
    const gh = Math.max(1, (maxY - minY) + pad * 2)
    const cw = Math.max(1, container.clientWidth)
    const ch = Math.max(1, container.clientHeight)
    const targetScale = Math.max(cw / gw, ch / gh)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    fg.centerAt(cx, cy, 0)
    fg.zoom(targetScale, 400)
  }, [graphData])
  const handleFit = useCallback(() => {
    if (fitMode === 'cover') handleZoomToCover()
    else handleZoomToFit()
  }, [fitMode, handleZoomToCover, handleZoomToFit])
  // 节点与连线字号分别控制（不受 globalScale 影响）
  const drawNode = useCallback((rawNode: unknown, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const node = rawNode as PositionedNode
    const char = characters.find(c => String(c.id) === node.id)
    const roleWeight = char?.roleWeight ?? 'main'
    const moral = char?.moralAxis ?? 'neutral'
    const count = relCountMap.get(node.id) ?? 0
    const padX = 4, padY = 2
    const avatarR = Math.max(6, nodeFontSize * 1.4)
    const fontSize = Math.max(6, nodeFontSize)
    const subFontSize = Math.max(5, nodeFontSize * 0.78)
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
    // 顶部关系类型分段色条（Segmented Bar）
    const relColors = node.relationColors ?? []
    if (relColors.length > 0) {
      const segGap = 0.5
      const totalGap = segGap * Math.max(0, relColors.length - 1)
      const segW = Math.max(1, (cardW - totalGap) / relColors.length)
      relColors.forEach((c, i) => {
        ctx.fillStyle = c
        ctx.fillRect(x + i * (segW + segGap), y, segW, barH)
      })
    }
    const cx = node.x
    // 头像圆
    ctx.beginPath()
    ctx.arc(cx, y + padY + avatarR, avatarR, 0, 2 * Math.PI)
    // 头像圆：使用角色戏份色（主要/次要/NPC/路人），与色条语义分工
    ctx.fillStyle = ROLE_WEIGHT_BG[roleWeight] ?? '#3b82f6'
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
  }, [characters, relCountMap, nodeFontSize])
  // 增大节点点击/拖拽响应区：用一个隐形大圆覆盖视觉卡片，避免边缘拖不到
  const nodePointerAreaPaint = useCallback((rawNode: unknown, color: string, ctx: CanvasRenderingContext2D) => {
    const node = rawNode as PositionedNode
    const r = Math.max(30, nodeFontSize * 3.8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fill()
  }, [linkFontSize])
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
    const tagFont = Math.max(5, linkFontSize)
    const lblFont = Math.max(4, linkFontSize * 0.78)
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
  }, [linkFontSize])
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-bg-base relative flex flex-col flex-1 min-h-0">
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
      <div ref={layoutBarRef} className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-bg-base/80 border border-border rounded-lg px-2 py-1 backdrop-blur">
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
        {/* 力导向模式：3 个滑杆挪到独立 Popover（A2 方案），避免主工具条过长撑爆 Portrait */}
        {layoutMode === null && (
          <div ref={physicsRef} className="relative ml-1 pl-2 border-l border-border">
            <button
              onClick={() => setPhysicsOpen(v => !v)}
              className={"p-1 rounded transition-colors " + (physicsOpen ? "bg-accent text-white" : "text-text-muted hover:text-text-primary hover:bg-bg-hover")}
              title="物理参数：斥力 / 距离 / 碰撞"
              aria-label="物理参数设置"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            {physicsOpen && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 bg-bg-base/95 border border-border rounded-lg px-3 py-2.5 backdrop-blur shadow-lg flex flex-col gap-2 min-w-[220px]"
                role="dialog"
                aria-label="力导向参数"
              >
                <div className="text-xs text-text-muted font-medium">物理参数（力导向）</div>
                <label className="flex items-center gap-2 text-xs text-text-muted" title="节点间斥力（绝对值越大越分散）">
                  <span className="w-6 shrink-0">斥力</span>
                  <input type="range" min={-1500} max={-50} step={50} value={chargeStrength} onChange={e => setChargeStrength(parseInt(e.target.value))} className="flex-1 h-1 accent-accent cursor-pointer" />
                  <span className="w-10 text-right tabular-nums">{chargeStrength}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted" title="连线目标距离">
                  <span className="w-6 shrink-0">距离</span>
                  <input type="range" min={40} max={300} step={10} value={linkDistance} onChange={e => setLinkDistance(parseInt(e.target.value))} className="flex-1 h-1 accent-accent cursor-pointer" />
                  <span className="w-10 text-right tabular-nums">{linkDistance}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted" title="节点碰撞半径（越大越不重叠）">
                  <span className="w-6 shrink-0">碰撞</span>
                  <input type="range" min={20} max={80} step={5} value={collideRadius} onChange={e => setCollideRadius(parseInt(e.target.value))} className="flex-1 h-1 accent-accent cursor-pointer" />
                  <span className="w-10 text-right tabular-nums">{collideRadius}</span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 右上角：浮动垂直控制台 (Floating Action Column)
          - Gemini 推荐 pattern：flex-col 垂直堆叠，避免与中部布局栏横向冲突
          - 字号卡（节点 + 连线 2 滑杆）/ 重置按钮 / 缩放按钮组 各占一行 */}
      <div ref={controlsRef} className="absolute top-2 right-2 flex flex-col items-end gap-2 z-20">
        {/* 字号卡：节点 + 连线 2 条滑杆垂直排列，独立可调 */}
        <div className="flex flex-col gap-1.5 bg-bg-base/80 border border-border rounded px-2 py-1.5 backdrop-blur">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted w-6" title="节点卡片字号（角色名/戏份/关系数）">节</span>
            <input
              type="range"
              min={6}
              max={24}
              step={1}
              value={nodeFontSize}
              onChange={e => setNodeFontSize(parseInt(e.target.value))}
              className="w-20 h-1 accent-accent cursor-pointer"
              title={`节点字号: ${nodeFontSize}px`}
            />
            <span className="text-xs text-text-muted w-8 text-right">{nodeFontSize}px</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted w-6" title="连线标签字号（关系短标/长标签）">连</span>
            <input
              type="range"
              min={5}
              max={16}
              step={1}
              value={linkFontSize}
              onChange={e => setLinkFontSize(parseInt(e.target.value))}
              className="w-20 h-1 accent-accent cursor-pointer"
              title={`连线字号: ${linkFontSize}px`}
            />
            <span className="text-xs text-text-muted w-8 text-right">{linkFontSize}px</span>
          </div>
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
            onClick={handleFit}
            className={"w-7 h-7 flex items-center justify-center rounded border text-xs backdrop-blur " + (fitMode === 'contain' ? "bg-accent text-white border-accent" : "bg-bg-base/80 border-border text-text hover:text-text-bright hover:border-accent")}
            title={fitMode === 'contain' ? "适应窗口（contain）" : "覆盖窗口（cover）"}
          >FIT</button>
          <button
            onClick={() => { setFitMode(m => m === 'cover' ? 'contain' : 'cover'); setTimeout(() => handleFit(), 50) }}
            className={"w-7 h-7 flex items-center justify-center rounded border text-xs backdrop-blur " + (fitMode === 'cover' ? "bg-accent text-white border-accent" : "bg-bg-base/80 border-border text-text hover:text-text-bright hover:border-accent")}
            title={fitMode === 'cover' ? "切换为 contain（四周留白）" : "切换为 cover（铺满容器，Portrait 友好）"}
          ><Maximize2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {/* Graph 撑满 flex-1，min-h-0 让 flex 收缩生效 */}
      <div
        ref={measureRef}
        className="flex-1 min-h-0"
        style={{ minHeight: 300 }}
      >
        <div
          ref={graphContainerRef}
          className="w-full h-full"
          onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
        >
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
          {RELATION_GROUPS.map((group, idx) => (
            <div key={group.title} className="flex items-center gap-1.5">
              {idx > 0 && <span className="text-text-muted/40 select-none">|</span>}
              <span className="text-text-muted">{group.title}</span>
              {group.types.map(key => (
                <div key={key} className="flex items-center gap-1 text-text-muted">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: RELATION_COLORS[key] ?? '#6b7280' }} />
                  {RELATION_LABELS[key] ?? key}
                </div>
              ))}
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
  // Gemini 推荐 pattern：以 sortedId 为基准方向，反向边翻转 curvature 符号，
  // 这样同向边曲率符号一致、不同向边自然落在不同侧，避免反向边的文字 t=0.5 重叠
  const step = 0.3
  for (const group of groups.values()) {
    const total = group.length
    group.forEach((link, index) => {
      // 基础偏移（对称分布）
      const baseCurvature = (index - (total - 1) / 2) * step
      // 方向感知：link.source 是字符 id，与 sorted 后的较大值比较
      const isReversed = link.source > link.target
      link.curvature = isReversed ? -baseCurvature : baseCurvature
    })
  }
  return links
}
