/**
 * R-16: readCharacters must not silently drop characters when worldGroupId is null.
 *
 * Regression target:
 *   Before this fix, readCharacters (defined in src/lib/registry/context-sources.ts) had:
 *     if (!hasExplicitWorldGroupId({ worldGroupId })) return rows
 *     const wg = worldGroupId ?? null
 *     return rows.filter(c => c.isCrossWorld || (c.homeWorldGroupId ?? null) === wg)
 *   The `hasExplicitWorldGroupId` check used hasOwnProperty which returned true when the
 *   caller passed `worldGroupId: null` (object literal has the key), so the function entered
 *   the filter branch. For projects with no worldGroup, all characters had homeWorldGroupId
 *   === null, so the filter (null === null) coincidentally returned all rows. BUT for
 *   multi-world projects, the call with null would drop all characters, causing the
 *   assembleContext segments to omit the characters block, and the AI would generate
 *   new character names instead of using the project character library.
 *
 *   Fix: when worldGroupId is null/undefined, return rows directly without filtering.
 *
 *   Test strategy: import assembleContext and call it with worldGroupId=null against a
   *   fresh in-memory Dexie where we manually insert characters. Assert that the
   *   characters segment is included in the result with the expected content.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { assembleContext } from '../../src/lib/registry/assemble-context'

describe('R-16: readCharacters handles null worldGroupId correctly', () => {
  beforeAll(async () => {
    // 清空避免与其它测试或旧数据冲突
    await db.characters.clear()
    // 插入 3 个测试角色,全部 homeWorldGroupId = null
    await db.characters.bulkAdd([
      { projectId: 999, name: '甲', roleWeight: 'main', homeWorldGroupId: null, isCrossWorld: false } as any,
      { projectId: 999, name: '乙', roleWeight: 'secondary', homeWorldGroupId: null, isCrossWorld: false } as any,
      { projectId: 999, name: '丙', roleWeight: 'npc', homeWorldGroupId: null, isCrossWorld: false } as any,
    ])
  })

  it('returns characters segment with content when worldGroupId is null', async () => {
    const result = await assembleContext({
      projectId: 999,
      worldGroupId: null,
      outlineNodeId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      sourceKeys: ['characters'],
    })
    console.log('included:', result.included, 'omitted:', result.omitted)
    expect(result.included).toContain('characters')
    expect(result.omitted).not.toContain('characters')
    const charsSeg = result.segments.find(s => s.label === '角色档案')
    expect(charsSeg).toBeDefined()
    expect(charsSeg!.content).toContain('甲')
    expect(charsSeg!.content).toContain('乙')
    expect(charsSeg!.content).toContain('丙')
  })
})
