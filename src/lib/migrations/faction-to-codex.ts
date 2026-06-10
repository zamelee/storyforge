/**
 * Stage C2(势力)— 旧 `Faction` 表并入「势力」(faction)词条(先迁移后删)
 * ------------------------------------------------------------
 * 消除「势力」概念双轨:旧独立 Faction 表(孤儿 FactionPanel,已无导航入口)
 * 的数据并入人文「势力」词条,然后清空旧行。
 *
 * 映射(Faction → faction 词条条目):
 *   name        → name
 *   description → description
 *   leader      → fields.leader
 *   members     → fields.coreMembers
 *   goals       → fields.goal
 *   relationships → fields.relations
 *   resources   → fields.power
 *   mapRegion   → fields.mapRegion   (faction 词条类已预留此字段)
 *   color       → fields.color
 *
 * 设计要点同 C1:幂等(按词条名去重)、自愈(确保内置分类)、先迁移后删、
 * 兼容旧备份(factions 表 / 导出导入保留,导入旧存档后下次加载自动迁移)。
 */
import { db } from '../db/schema'
import { useCodexStore } from '../../stores/codex'
import type { Faction } from '../types'

export async function migrateFactionToCodex(projectId: number): Promise<void> {
  const factions: Faction[] = await db.factions.where('projectId').equals(projectId).toArray()
  if (factions.length === 0) return

  // 确保内置分类存在(自愈),再取「势力」分类
  await useCodexStore.getState().ensureBuiltIns(projectId)
  const factionCat = await db.codexCategories
    .where('projectId').equals(projectId)
    .filter(c => c.builtInKey === 'faction')
    .first()
  if (!factionCat || factionCat.id == null) {
    console.warn('[C2] 势力分类缺失,本次跳过势力迁移(保留旧数据待重试)')
    return
  }

  const existing = await db.codexEntries
    .where('projectId').equals(projectId)
    .filter(e => e.categoryId === factionCat.id)
    .toArray()
  const existingNames = new Set(existing.map(e => e.name))

  const ts = Date.now()
  let order = existing.length
  const migratedIds: number[] = []
  for (const f of factions) {
    const name = (f.name || '').trim()
    if (!name) { if (f.id != null) migratedIds.push(f.id); continue }
    if (!existingNames.has(name)) {
      const fields: Record<string, string> = {
        leader: f.leader || '',
        coreMembers: f.members || '',
        goal: f.goals || '',
        relations: f.relationships || '',
        power: f.resources || '',
        mapRegion: f.mapRegion || '',
        color: f.color || '',
      }
      await db.codexEntries.add({
        projectId,
        categoryId: factionCat.id,
        name,
        summary: '',
        description: f.description || '',
        fields: JSON.stringify(fields),
        order: order++,
        worldGroupId: null,
        createdAt: ts,
        updatedAt: ts,
      } as any)
      existingNames.add(name)
    }
    if (f.id != null) migratedIds.push(f.id)
  }

  // 先迁移后删:并入成功后清掉旧势力行
  if (migratedIds.length > 0) await db.factions.bulkDelete(migratedIds)
  console.log('[C2] 势力已迁移到「势力」词条:', factions.length, '项')
}
