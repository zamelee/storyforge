/**
 * 世界地图 3D 渲染引擎
 * 基于 Three.js，将 WorldMapData 渲染为可旋转的 3D 地形
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type {
  WorldMapData, MapRegion, MapMountainRange,
  MapMarker, Point2D,
} from '../types/world-map'

// ── 地形颜色 ────────────────────────────────────────────────

const TERRAIN_COLORS: Record<string, number> = {
  ocean: 0x1a3a5f,
  deepocean: 0x0f2a45,
  coast: 0x2a5a80,
  plains: 0x4a7a3a,
  forest: 0x2d5a2a,
  'dense-forest': 0x1a4a1a,
  desert: 0xb89840,
  tundra: 0xa0a0b0,
  swamp: 0x3a5a30,
  'mountain-region': 0x7a6a5a,
  hills: 0x6a7a4a,
  volcanic: 0x5a2a1a,
  ice: 0xd0d0e0,
  grassland: 0x5a8a4a,
}

/** 地形类型对应的高度 */
const TERRAIN_HEIGHT: Record<string, number> = {
  deepocean: -8,
  ocean: -5,
  coast: -2,
  plains: 2,
  grassland: 3,
  forest: 4,
  'dense-forest': 5,
  hills: 8,
  'mountain-region': 12,
  desert: 2,
  tundra: 3,
  swamp: 0,
  volcanic: 10,
  ice: 4,
}

// ── 主类 ────────────────────────────────────────────────────

export interface Map3DOptions {
  selectedMarkerId?: string | null
  hoveredMarkerId?: string | null
  onSelectMarker?: (marker: MapMarker | null) => void
  onHoverMarker?: (markerId: string | null) => void
}

export class WorldMap3DRenderer {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private container: HTMLElement
  private data: WorldMapData | null = null
  private animFrameId: number | null = null

  // 交互
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private markerMeshes: Map<string, THREE.Object3D> = new Map()
  private markerData: Map<string, MapMarker> = new Map()
  private options: Map3DOptions = {}

  // 文字标签
  private labelSprites: THREE.Sprite[] = []
  // 选中高亮
  private selectionRing: THREE.Mesh | null = null

  constructor(container: HTMLElement) {
    this.container = container
    const w = container.clientWidth
    const h = container.clientHeight

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1810)
    this.scene.fog = new THREE.Fog(0x1a1810, 800, 2000)

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, w / h, 1, 5000)
    this.camera.position.set(600, 500, 600)
    this.camera.lookAt(600, 0, 400)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    // Controls — 360° 旋转 + 缩放 + 平移
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 100
    this.controls.maxDistance = 2000
    this.controls.maxPolarAngle = Math.PI * 0.85 // 允许接近翻转但不完全翻转
    this.controls.minPolarAngle = 0.05
    this.controls.target.set(600, 0, 400)

    // Lights
    const ambientLight = new THREE.AmbientLight(0x8888aa, 0.6)
    this.scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffe8c0, 1.2)
    dirLight.position.set(400, 600, -200)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(2048, 2048)
    dirLight.shadow.camera.left = -800
    dirLight.shadow.camera.right = 800
    dirLight.shadow.camera.top = 800
    dirLight.shadow.camera.bottom = -800
    this.scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x4488cc, 0.3)
    fillLight.position.set(-300, 200, 400)
    this.scene.add(fillLight)

    // Event handlers
    this._onResize = this._onResize.bind(this)
    this._onClick = this._onClick.bind(this)
    this._onMouseMove = this._onMouseMove.bind(this)
    window.addEventListener('resize', this._onResize)
    this.renderer.domElement.addEventListener('click', this._onClick)
    this.renderer.domElement.addEventListener('mousemove', this._onMouseMove)

    this._animate()
  }

  // ── 公开接口 ─────────────────────────────────────────────

  setData(data: WorldMapData, options: Map3DOptions = {}) {
    this.data = data
    this.options = options

    // 清空旧场景（保留灯光和相机）
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
        toRemove.push(obj)
      }
    })
    toRemove.forEach(obj => {
      obj.removeFromParent()
      if ('geometry' in obj && obj.geometry) (obj.geometry as THREE.BufferGeometry).dispose()
      if ('material' in obj && obj.material) {
        const mat = obj.material as THREE.Material | THREE.Material[]
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()
      }
    })
    this.markerMeshes.clear()
    this.markerData.clear()
    this.labelSprites = []
    this.selectionRing = null

    // 构建场景
    this._buildTerrain(data)
    this._buildMountains(data)
    this._buildRivers(data)
    this._buildRoads(data)
    this._buildMarkers(data)
    this._buildLabels(data)
    this._buildWaterPlane(data)

    // 调整相机目标
    this.controls.target.set(data.width / 2, 0, data.height / 2)
    this.camera.position.set(data.width / 2, data.height * 0.6, data.height * 1.1)
    this.controls.update()
  }

  updateOptions(options: Map3DOptions) {
    this.options = { ...this.options, ...options }
    this._updateSelection()
  }

  dispose() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId)
    window.removeEventListener('resize', this._onResize)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ── 动画循环 ─────────────────────────────────────────────

  private _animate() {
    this.animFrameId = requestAnimationFrame(() => this._animate())
    this.controls.update()
    // 标签始终面向相机
    for (const sprite of this.labelSprites) {
      sprite.lookAt(this.camera.position)
    }
    this.renderer.render(this.scene, this.camera)
  }

  // ── 构建地形 ─────────────────────────────────────────────

  private _buildTerrain(data: WorldMapData) {
    const sorted = [...data.regions].sort((a, b) => a.zIndex - b.zIndex)
    for (const region of sorted) {
      this._buildRegion(region)
    }
  }

  private _buildRegion(region: MapRegion) {
    if (region.polygon.length < 3) return

    const isWater = region.type === 'ocean' || region.type === 'deepocean' || region.type === 'coast'
    const height = TERRAIN_HEIGHT[region.type] ?? 2
    const color = region.color
      ? parseInt(region.color.replace('#', ''), 16)
      : (TERRAIN_COLORS[region.type] ?? 0x4a7a3a)

    // 创建 Shape
    const shape = new THREE.Shape()
    const pts = region.polygon
    shape.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1])
    }
    shape.closePath()

    if (isWater) {
      // 水域：扁平面
      const geo = new THREE.ShapeGeometry(shape)
      // 旋转到 XZ 平面
      this._rotateGeoToXZ(geo, height)
      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        roughness: 0.3,
        metalness: 0.1,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.receiveShadow = true
      this.scene.add(mesh)
    } else {
      // 陆地：拉伸为立体
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: Math.max(1, Math.abs(height)),
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 2,
        bevelSegments: 2,
      }
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      this._rotateExtrudedGeoToXZ(geo, height > 0 ? 0 : height)
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.05,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
    }
  }

  /** 水面 */
  private _buildWaterPlane(data: WorldMapData) {
    const geo = new THREE.PlaneGeometry(data.width * 1.5, data.height * 1.5)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5f,
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
      metalness: 0.3,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(data.width / 2, -6, data.height / 2)
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  // ── 山脉 ─────────────────────────────────────────────────

  private _buildMountains(data: WorldMapData) {
    for (const mtn of data.mountains) {
      this._buildMountainRange(mtn)
    }
  }

  private _buildMountainRange(mtn: MapMountainRange) {
    const peakH = mtn.height === 'epic' ? 40 : mtn.height === 'high' ? 28 : mtn.height === 'medium' ? 18 : 12
    const pts = mtn.ridgeLine
    if (pts.length < 2) return

    const step = Math.max(25, mtn.width * 0.9)
    const totalLen = this._pathLength(pts)

    for (let d = 0; d < totalLen; d += step) {
      const pt = this._pointAlongPath(pts, d)
      if (!pt) continue

      const h = peakH * (0.7 + Math.random() * 0.3)
      const r = peakH * 0.4

      // 圆锥体山峰
      const geo = new THREE.ConeGeometry(r, h, 6)
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6a5a48,
        roughness: 0.9,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(pt[0], h / 2 + (TERRAIN_HEIGHT['mountain-region'] || 12), pt[1])
      mesh.castShadow = true
      this.scene.add(mesh)

      // 雪顶
      if (peakH >= 18) {
        const snowGeo = new THREE.ConeGeometry(r * 0.35, h * 0.25, 6)
        const snowMat = new THREE.MeshStandardMaterial({
          color: 0xe8e0d0,
          roughness: 0.5,
        })
        const snowMesh = new THREE.Mesh(snowGeo, snowMat)
        snowMesh.position.set(pt[0], h * 0.85 + (TERRAIN_HEIGHT['mountain-region'] || 12), pt[1])
        this.scene.add(snowMesh)
      }
    }
  }

  // ── 河流 ─────────────────────────────────────────────────

  private _buildRivers(data: WorldMapData) {
    for (const river of data.rivers) {
      this._buildRiverLine(river.path, river.width || 2, 0x4a90c0)
      if (river.tributaries) {
        for (const trib of river.tributaries) {
          this._buildRiverLine(trib.path, trib.width || 1, 0x4a90c0)
        }
      }
    }
  }

  private _buildRiverLine(path: Point2D[], width: number, color: number) {
    if (path.length < 2) return
    const points = path.map(p => new THREE.Vector3(p[0], 1, p[1]))
    const curve = new THREE.CatmullRomCurve3(points)
    const geo = new THREE.TubeGeometry(curve, path.length * 4, width * 0.5, 6, false)
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
      metalness: 0.1,
    })
    const mesh = new THREE.Mesh(geo, mat)
    this.scene.add(mesh)
  }

  // ── 道路 ─────────────────────────────────────────────────

  private _buildRoads(data: WorldMapData) {
    for (const road of data.roads) {
      if (road.path.length < 2) continue
      const points = road.path.map(p => new THREE.Vector3(p[0], 2, p[1]))
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const color = road.type === 'trade' ? 0xc9a84c : road.type === 'major' ? 0x8a7a60 : 0x6a5a4a
      const mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 5,
        gapSize: 3,
        linewidth: 1,
      })
      const line = new THREE.Line(geo, mat)
      line.computeLineDistances()
      this.scene.add(line)
    }
  }

  // ── 城市标记 ─────────────────────────────────────────────

  private _buildMarkers(data: WorldMapData) {
    for (const marker of data.markers) {
      const isCapital = marker.type === 'capital'
      const size = isCapital ? 8 : 4 + marker.importance
      const baseHeight = this._getTerrainHeight(data, marker.x, marker.y)

      // 标记柱
      const geo = new THREE.CylinderGeometry(size * 0.3, size * 0.5, size, 8)
      const color = isCapital ? 0xc9a84c : 0xb08060
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(marker.x, baseHeight + size / 2, marker.y)
      mesh.castShadow = true
      mesh.userData = { markerId: marker.id }
      this.scene.add(mesh)
      this.markerMeshes.set(marker.id, mesh)
      this.markerData.set(marker.id, marker)

      // 顶部球
      const sphereGeo = new THREE.SphereGeometry(size * 0.4, 8, 8)
      const sphereMat = new THREE.MeshStandardMaterial({
        color: isCapital ? 0xffe0a0 : 0xe0c0a0,
        emissive: isCapital ? 0x443300 : 0x000000,
        roughness: 0.3,
      })
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      sphere.position.set(marker.x, baseHeight + size + size * 0.3, marker.y)
      sphere.userData = { markerId: marker.id }
      this.scene.add(sphere)

      // 城市名标签
      const label = this._createTextSprite(marker.name, {
        fontSize: isCapital ? 16 : 12,
        color: isCapital ? '#c9a84c' : '#b0a080',
        bgColor: 'rgba(26,24,16,0.7)',
      })
      label.position.set(marker.x, baseHeight + size + size * 0.8 + 6, marker.y)
      label.scale.set(marker.name.length * (isCapital ? 9 : 7), isCapital ? 16 : 12, 1)
      this.scene.add(label)
      this.labelSprites.push(label)
    }
  }

  // ── 文字标注 ─────────────────────────────────────────────

  private _buildLabels(data: WorldMapData) {
    for (const label of data.labels) {
      const sprite = this._createTextSprite(label.text, {
        fontSize: label.fontSize || 14,
        color: label.color || '#8a7d60',
        bgColor: 'transparent',
      })
      const h = this._getTerrainHeight(data, label.x, label.y)
      sprite.position.set(label.x, h + 15, label.y)
      sprite.scale.set(label.text.length * (label.fontSize || 14) * 0.7, (label.fontSize || 14) * 1.2, 1)
      this.scene.add(sprite)
      this.labelSprites.push(sprite)
    }
  }

  // ── 选中高亮 ─────────────────────────────────────────────

  private _updateSelection() {
    // 移除旧高亮
    if (this.selectionRing) {
      this.scene.remove(this.selectionRing)
      this.selectionRing.geometry.dispose()
      ;(this.selectionRing.material as THREE.Material).dispose()
      this.selectionRing = null
    }

    const id = this.options.selectedMarkerId
    if (!id) return

    const mesh = this.markerMeshes.get(id)
    if (!mesh) return

    const ringGeo = new THREE.RingGeometry(10, 13, 24)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat)
    this.selectionRing.rotation.x = -Math.PI / 2
    this.selectionRing.position.set(mesh.position.x, 1, mesh.position.z)
    this.scene.add(this.selectionRing)
  }

  // ── 事件处理 ─────────────────────────────────────────────

  private _onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private _onClick(e: MouseEvent) {
    if (!this.data) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)
    const meshes = Array.from(this.markerMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes, true)

    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object
      while (obj && !obj.userData?.markerId) obj = obj.parent
      const markerId = obj?.userData?.markerId
      if (markerId) {
        const marker = this.markerData.get(markerId)
        this.options.onSelectMarker?.(marker || null)
        return
      }
    }
    this.options.onSelectMarker?.(null)
  }

  private _onMouseMove(e: MouseEvent) {
    if (!this.data) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)
    const meshes = Array.from(this.markerMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes, true)

    if (intersects.length > 0) {
      this.renderer.domElement.style.cursor = 'pointer'
      let obj: THREE.Object3D | null = intersects[0].object
      while (obj && !obj.userData?.markerId) obj = obj.parent
      this.options.onHoverMarker?.(obj?.userData?.markerId || null)
    } else {
      this.renderer.domElement.style.cursor = 'default'
      this.options.onHoverMarker?.(null)
    }
  }

  // ── 工具方法 ─────────────────────────────────────────────

  /** 估算某坐标处的地形高度 */
  private _getTerrainHeight(data: WorldMapData, x: number, y: number): number {
    // 从内到外查找包含该点的区域，取最高层级
    let maxH = 0
    for (const region of data.regions) {
      if (this._pointInPolygon(x, y, region.polygon)) {
        const h = TERRAIN_HEIGHT[region.type] ?? 2
        if (h > maxH) maxH = h
      }
    }
    return maxH
  }

  private _pointInPolygon(px: number, py: number, poly: Point2D[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    return inside
  }

  /** ShapeGeometry 旋转到 XZ 平面 */
  private _rotateGeoToXZ(geo: THREE.BufferGeometry, yOffset: number) {
    // ShapeGeometry 默认在 XY 平面，旋转到 XZ
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i) // 原 Y → 新 Z
      pos.setXYZ(i, x, yOffset, y)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }

  /** ExtrudeGeometry 旋转到 XZ 平面 */
  private _rotateExtrudedGeoToXZ(geo: THREE.BufferGeometry, yBase: number) {
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i) // 原 Y → 新 Z
      const z = pos.getZ(i) // 原 Z (拉伸方向) → 新 Y (高度)
      pos.setXYZ(i, x, z + yBase, y)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }

  /** 创建文字 Sprite */
  private _createTextSprite(text: string, opts: {
    fontSize: number
    color: string
    bgColor: string
  }): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const fontSize = opts.fontSize * 2 // 高清
    ctx.font = `bold ${fontSize}px "serif"`
    const metrics = ctx.measureText(text)
    const textWidth = metrics.width + 12
    const textHeight = fontSize * 1.4

    canvas.width = Math.ceil(textWidth)
    canvas.height = Math.ceil(textHeight)

    if (opts.bgColor !== 'transparent') {
      ctx.fillStyle = opts.bgColor
      ctx.beginPath()
      ctx.roundRect(0, 0, canvas.width, canvas.height, 4)
      ctx.fill()
    }

    ctx.font = `bold ${fontSize}px "serif"`
    ctx.fillStyle = opts.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    return new THREE.Sprite(mat)
  }

  private _pathLength(pts: Point2D[]): number {
    let len = 0
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0]
      const dy = pts[i][1] - pts[i - 1][1]
      len += Math.sqrt(dx * dx + dy * dy)
    }
    return len
  }

  private _pointAlongPath(pts: Point2D[], distance: number): Point2D | null {
    let walked = 0
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0]
      const dy = pts[i][1] - pts[i - 1][1]
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (walked + segLen >= distance) {
        const t = (distance - walked) / segLen
        return [pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t]
      }
      walked += segLen
    }
    return pts.length > 0 ? pts[pts.length - 1] : null
  }
}
