/**
 * Phase 25.4 — 多世界系统 Store
 */
import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { WorldGroup, WorldGroupLink } from '../lib/types'

const now = () => Date.now()

interface WorldGroupStore {
  groups: WorldGroup[]
  links: WorldGroupLink[]
  activeGroupId: number | null
  loading: boolean

  // 加载
  loadAll: (projectId: number) => Promise<void>

  // 世界组 CRUD
  createGroup: (data: Omit<WorldGroup, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updateGroup: (id: number, patch: Partial<WorldGroup>) => Promise<void>
  deleteGroup: (id: number) => Promise<void>
  reorderGroups: (projectId: number, orderedIds: number[]) => Promise<void>

  // 世界间关系
  createLink: (data: Omit<WorldGroupLink, 'id' | 'createdAt'>) => Promise<number>
  deleteLink: (id: number) => Promise<void>

  // 确保默认主世界组存在
  ensurePrimaryGroup: (projectId: number) => Promise<number>

  // 开启多世界：确保主世界组 + 把现有项目级数据归属到主世界组
  migrateToMultiWorld: (projectId: number) => Promise<void>

  // 切换活跃世界
  setActiveGroup: (id: number | null) => void
}

export const useWorldGroupStore = create<WorldGroupStore>((set, get) => ({
  groups: [],
  links: [],
  activeGroupId: null,
  loading: false,

  loadAll: async (projectId: number) => {
    set({ loading: true })
    const [groups, links] = await Promise.all([
      db.worldGroups.where('projectId').equals(projectId).sortBy('order'),
      db.worldGroupLinks.where('projectId').equals(projectId).toArray(),
    ])
    const primary = groups.find(g => g.type === 'primary')
    set({
      groups,
      links,
      activeGroupId: primary?.id ?? groups[0]?.id ?? null,
      loading: false,
    })
  },

  createGroup: async (data) => {
    const id = await db.worldGroups.add({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    } as WorldGroup) as number
    const groups = await db.worldGroups
      .where('projectId').equals(data.projectId)
      .sortBy('order')
    set({ groups })
    return id
  },

  updateGroup: async (id, patch) => {
    await db.worldGroups.update(id, { ...patch, updatedAt: now() })
    const groups = get().groups.map(g =>
      g.id === id ? { ...g, ...patch, updatedAt: now() } : g
    )
    set({ groups })
  },

  deleteGroup: async (id) => {
    const group = get().groups.find(g => g.id === id)
    if (!group || group.type === 'primary') return // 不允许删主世界

    const pid = group.projectId

    // 级联删除该组下的所有数据
    await db.transaction('rw', [
      db.worldGroups, db.worldGroupLinks,
      db.worldviews, db.powerSystems, db.geographies,
      db.histories, db.worldNodes, db.characters,
      db.outlineNodes,
    ], async () => {
      // 删除关联的设定数据
      const allWv = await db.worldviews.where('projectId').equals(pid).toArray()
      for (const wv of allWv) {
        if (wv.worldGroupId === id) await db.worldviews.delete(wv.id!)
      }
      const allPs = await db.powerSystems.where('projectId').equals(pid).toArray()
      for (const ps of allPs) {
        if (ps.worldGroupId === id) await db.powerSystems.delete(ps.id!)
      }
      const allGeo = await db.geographies.where('projectId').equals(pid).toArray()
      for (const geo of allGeo) {
        if (geo.worldGroupId === id) await db.geographies.delete(geo.id!)
      }
      const allHist = await db.histories.where('projectId').equals(pid).toArray()
      for (const h of allHist) {
        if (h.worldGroupId === id) await db.histories.delete(h.id!)
      }
      const allWn = await db.worldNodes.where('projectId').equals(pid).toArray()
      for (const wn of allWn) {
        if (wn.worldGroupId === id) await db.worldNodes.delete(wn.id!)
      }
      // 历史年表事件 / 关键词（有 worldGroupId，此前漏删 → 孤儿数据）
      const allHte = await db.historicalTimelineEvents.where('projectId').equals(pid).toArray()
      for (const e of allHte) {
        if (e.worldGroupId === id) await db.historicalTimelineEvents.delete(e.id!)
      }
      const allHk = await db.historicalKeywords.where('projectId').equals(pid).toArray()
      for (const k of allHk) {
        if (k.worldGroupId === id) await db.historicalKeywords.delete(k.id!)
      }
      // 设定词条：删该世界的词条 + 该世界的自定义分类（内置分类 worldGroupId=null 为全局，不会匹配）
      const allCe = await db.codexEntries.where('projectId').equals(pid).toArray()
      for (const e of allCe) {
        if (e.worldGroupId === id) await db.codexEntries.delete(e.id!)
      }
      const allCc = await db.codexCategories.where('projectId').equals(pid).toArray()
      for (const c of allCc) {
        if (c.worldGroupId === id) await db.codexCategories.delete(c.id!)
      }

      // 角色：清除归属（不删角色本身）
      const allChars = await db.characters.where('projectId').equals(pid).toArray()
      for (const c of allChars) {
        if (c.homeWorldGroupId === id) {
          await db.characters.update(c.id!, { homeWorldGroupId: null })
        }
      }

      // 大纲：清除世界标记
      const allOutline = await db.outlineNodes.where('projectId').equals(pid).toArray()
      for (const n of allOutline) {
        if (n.worldGroupId === id) {
          await db.outlineNodes.update(n.id!, { worldGroupId: null })
        }
      }

      // 删除相关链接
      await db.worldGroupLinks.where('fromGroupId').equals(id).delete()
      await db.worldGroupLinks.where('toGroupId').equals(id).delete()

      // 删除世界组本身
      await db.worldGroups.delete(id)
    })

    // 刷新 store
    const groups = get().groups.filter(g => g.id !== id)
    const links = get().links.filter(l => l.fromGroupId !== id && l.toGroupId !== id)
    const activeGroupId = get().activeGroupId === id
      ? (groups.find(g => g.type === 'primary')?.id ?? groups[0]?.id ?? null)
      : get().activeGroupId
    set({ groups, links, activeGroupId })
  },

  reorderGroups: async (projectId, orderedIds) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.worldGroups.update(orderedIds[i], { order: i, updatedAt: now() })
    }
    const groups = await db.worldGroups
      .where('projectId').equals(projectId)
      .sortBy('order')
    set({ groups })
  },

  createLink: async (data) => {
    const id = await db.worldGroupLinks.add({
      ...data,
      createdAt: now(),
    } as WorldGroupLink) as number
    const links = await db.worldGroupLinks
      .where('projectId').equals(data.projectId)
      .toArray()
    set({ links })
    return id
  },

  deleteLink: async (id) => {
    await db.worldGroupLinks.delete(id)
    set({ links: get().links.filter(l => l.id !== id) })
  },

  ensurePrimaryGroup: async (projectId: number) => {
    const existing = await db.worldGroups
      .where('projectId').equals(projectId)
      .filter(g => g.type === 'primary')
      .first()
    if (existing?.id) return existing.id

    const id = await db.worldGroups.add({
      projectId,
      name: '主世界',
      description: '',
      type: 'primary',
      icon: '🏠',
      order: 0,
      createdAt: now(),
      updatedAt: now(),
    } as WorldGroup) as number

    // 刷新
    const groups = await db.worldGroups
      .where('projectId').equals(projectId)
      .sortBy('order')
    set({ groups, activeGroupId: id })
    return id
  },

  migrateToMultiWorld: async (projectId: number) => {
    // 1. 确保主世界组存在
    const primaryId = await get().ensurePrimaryGroup(projectId)

    // 2. 把现有 worldGroupId 为空的项目级数据归属到主世界组
    await db.transaction('rw', [
      db.worldviews, db.powerSystems, db.geographies, db.histories, db.worldNodes,
      db.historicalTimelineEvents, db.historicalKeywords,
    ], async () => {
      const stamp = async <T extends { id?: number; worldGroupId?: number | null }>(
        table: { toArray: () => Promise<T[]>; update: (id: number, c: Partial<T>) => Promise<number> },
        records: T[],
      ) => {
        for (const r of records) {
          if (r.worldGroupId == null && r.id != null) {
            await table.update(r.id, { worldGroupId: primaryId } as Partial<T>)
          }
        }
      }
      await stamp(db.worldviews, await db.worldviews.where('projectId').equals(projectId).toArray())
      await stamp(db.powerSystems, await db.powerSystems.where('projectId').equals(projectId).toArray())
      await stamp(db.geographies, await db.geographies.where('projectId').equals(projectId).toArray())
      await stamp(db.histories, await db.histories.where('projectId').equals(projectId).toArray())
      await stamp(db.worldNodes, await db.worldNodes.where('projectId').equals(projectId).toArray())
      await stamp(db.historicalTimelineEvents, await db.historicalTimelineEvents.where('projectId').equals(projectId).toArray())
      await stamp(db.historicalKeywords, await db.historicalKeywords.where('projectId').equals(projectId).toArray())
      // 设定词条：只盖章「词条」到主世界（使其归属主世界，与 worldview 一致）；
      // 内置/自定义「分类」保持 worldGroupId=null 为全局结构，所有世界共用，不盖章。
      await stamp(db.codexEntries, await db.codexEntries.where('projectId').equals(projectId).toArray())
    })
  },

  setActiveGroup: (id) => {
    set({ activeGroupId: id })
  },
}))
