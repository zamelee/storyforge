/**
 * Stage C2(势力)回归 · 势力合并到「势力」词条(先迁移后删 · 零丢失)
 *
 * 锁定:旧 factions 表 → 「势力」词条条目(含 mapRegion/color 地图绑定字段保留),
 * 迁移后旧行清空,且幂等(重复运行不重复建)。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { migrateFactionToCodex } from '../../src/lib/migrations/faction-to-codex'

async function seedProjectWithFactions(): Promise<number> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name: 'C2', genre: '', description: '', targetWordCount: 0,
    enableMultiWorld: false, createdAt: now, updatedAt: now,
  } as any) as number
  await db.factions.bulkAdd([
    {
      projectId, name: '天剑宗', description: '正道第一大派', leader: '玄清子',
      members: '长老十二人', goals: '维护正道', resources: '灵脉三处',
      relationships: '与魔教世仇', mapRegion: '东域', color: '#3B82F6',
      createdAt: now, updatedAt: now,
    },
    {
      projectId, name: '血魔教', description: '邪道魁首', leader: '血尊',
      members: '护法四人', goals: '一统修真界', resources: '血池',
      relationships: '与天剑宗死敌', mapRegion: '西荒', color: '#DC2626',
      createdAt: now, updatedAt: now,
    },
  ] as any)
  return projectId
}

describe('Stage C2 · 势力合并到词条', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(async () => { db.close() })

  it('势力 → 「势力」词条,字段(含 mapRegion/color)完整;旧行清空', async () => {
    const projectId = await seedProjectWithFactions()
    await migrateFactionToCodex(projectId)

    const cat = (await db.codexCategories.where('projectId').equals(projectId).toArray())
      .find(c => c.builtInKey === 'faction')!
    expect(cat).toBeTruthy()

    const entries = (await db.codexEntries.where('projectId').equals(projectId).toArray())
      .filter(e => e.categoryId === cat.id)
    expect(entries.map(e => e.name).sort()).toEqual(['血魔教', '天剑宗'].sort())

    const sect = entries.find(e => e.name === '天剑宗')!
    expect(sect.description).toBe('正道第一大派')
    const f = JSON.parse(sect.fields)
    expect(f.leader).toBe('玄清子')
    expect(f.coreMembers).toBe('长老十二人')
    expect(f.goal).toBe('维护正道')
    expect(f.relations).toBe('与魔教世仇')
    expect(f.power).toBe('灵脉三处')
    expect(f.mapRegion).toBe('东域')      // 地图绑定字段保留
    expect(f.color).toBe('#3B82F6')

    // 先迁移后删:旧 factions 行已清空
    expect(await db.factions.where('projectId').equals(projectId).count()).toBe(0)
  })

  it('幂等:重复迁移不重复建', async () => {
    const projectId = await seedProjectWithFactions()
    await migrateFactionToCodex(projectId)
    await migrateFactionToCodex(projectId)
    const cat = (await db.codexCategories.where('projectId').equals(projectId).toArray())
      .find(c => c.builtInKey === 'faction')!
    const entries = (await db.codexEntries.where('projectId').equals(projectId).toArray())
      .filter(e => e.categoryId === cat.id)
    expect(entries.length).toBe(2)
  })

  it('无势力数据:无害 no-op', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: 'C2empty', genre: '', description: '', targetWordCount: 0,
      enableMultiWorld: false, createdAt: now, updatedAt: now,
    } as any) as number
    await migrateFactionToCodex(projectId)
    // 没有势力 → 不会平白创建词条条目
    const cat = (await db.codexCategories.where('projectId').equals(projectId).toArray())
      .find(c => c.builtInKey === 'faction')
    const entries = cat
      ? (await db.codexEntries.where('projectId').equals(projectId).toArray()).filter(e => e.categoryId === cat.id)
      : []
    expect(entries.length).toBe(0)
  })
})
