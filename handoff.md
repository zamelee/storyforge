# StoryForge 角色补全功能 - 2026-07-16

> **最新提交**: c8b563d feat(character): add supplement with strict name-check toggle + all-in-one flow
> **推送**: main -> https://github.com/zamelee/storyforge.git
> **验证时间**: 2026-07-17
> **服务端口**: 999 | URL: http://localhost:999/storyforge/

---
# StoryForge 角色补全功能 - 2026-07-16

**项目**: D:/Documents/VibeCoding/storyforge | 分支: main
**服务端口**: 999 | URL: http://localhost:999/storyforge/

---

## 现状（c8b563d 已推送）

### 已完成的改动

#### 1. prompt-seeds.ts
- character.supplement 模板（系统提示词）：指示 LLM 补全所有核心字段，relationships 用【关系类型中文】角色名：描述格式
- RelationType 枚举（10种）完整发给 LLM

#### 2. parse-character-output.ts（新增文件）
- parseCharacterOutput()：统一解析 AI 输出，含智能 name 检测（name/角色名均可）
- parseRelationshipsFromText()：提取末尾 JSON 代码块中的 relationships_json[]

#### 3. character-adapter.ts（新增文件）
- 导出 parseCharacterOutput + fieldConfig

#### 4. prompt.ts
- character.supplement 注册到 PROMPT_REGISTRY，category=角色设计

#### 5. CharacterPanel.tsx
- handleSupplementClick：打开补全弹窗，自动触发 AI 调用
- SupplementDialog（内嵌弹窗）：
  - 模式选择下拉：只补空字段（默认）/ 重写全部字段
  - 严格校验角色名勾选框（默认勾选）：勾选时只写入名字匹配的角色，防止 AI 生成多余角色
  - 【取消】【确认补全】按钮
- handleSupplementAccept：解析 → 逐字段采纳逻辑（fill-empty 保留旧值，overwrite-all 全量覆盖）→ 名字严格过滤 → batch-save
- 采纳后直接落盘，无中间审查弹层

---

## 待验证

- 点「补全」-> AI 输出 -> 点「采纳」-> 弹层是否正常显示各字段对比
- 采纳后 characterRelations 表是否有新记录
- 关系类型枚举是否能正确映射（relationType）

---

## 本次修复记录

### 2026-07-16 - prompt-seeds.ts 反引号语法错误
- 问题: 模板字符串（JS template literal）内写了原始反引号，导致 esbuild 报错
- 原因: prompt-seeds.ts 使用反引号定义模板，但 JSON 代码块示例也用了三个反引号，未转义
- 修复: 从备份恢复后，用 Python bytes 替换精确修复行 341 和 354
- 备份: tmp/code-backups/prompt-seeds.ts.bak

---

## 2026-07-16 浏览器实测结论

### 已实测通过
- 端口 999 页面正常加载，未重启服务。
- 角色生成页可打开。
- 点击角色后，右侧详情正常显示「补全」按钮。
- 点击「补全」后，弹出「一键补全缺失字段」确认框：
  - 默认模式：只补空字段（保留已有内容）
  - 可选模式：重写全部字段
  - 有「取消」按钮
- 点击「确认补全」后，AI 正常调用 character.supplement 模板。
- AI 输出包含 Markdown 文本 + JSON 关系块。
- 输出区已有「重试 / 好示例 / 反例 / 采纳 / 关闭」。
- 点击「采纳」后，出现逐字段「采纳确认」弹层。
- 弹层按字段显示旧值 / 新值，并默认保持旧值。
- 弹层正确解析 relationships_json，并显示 4 条关系网连线预览：
  - 沈见微 -> 林知夏：ally / 坚定同盟
  - 沈见微 -> 顾承曜：enemy / 规则对抗者
  - 沈见微 -> 陆温言：rival / 温柔假面识破者
  - 沈见微 -> 江临川：enemy / 特权冲突者

### 未执行
- 未点击最终「确认采纳」，避免直接写入用户当前小说数据。
- 因此 characterRelations 表写库未做破坏性实测，但 UI 已能解析并预览待写入关系。

### 本轮追加修复
- CharacterPanel.tsx: 修复 alert 字符串中真实换行导致的 Unterminated string constant。
- parse-character-output.ts: 修复 parseRelationshipsFromText 正则被换行拆坏的问题，改为 /`json\s*([\s\S]*?)\s*`/。
- CharacterPanel.tsx: 删除重复的局部 SUPPLEMENT_FIELDS，改用顶层 SUPPLEMENT_FIELDS: (keyof Character)[]。
- CharacterPanel.tsx: reviewData.parsed 类型由 Record<string,string> 改为 ParsedCharacter。

### 备份
- tmp/code-backups/prompt-seeds.ts.bak
- tmp/code-backups/CharacterPanel.tsx.bak
- tmp/code-backups/parse-character-output.ts.bak


---

## 2026-07-16 人物关系文本格式化

### 目标
- 人物关系字段不再保存成一坨文本。
- 每条关系独立一行。
- 每条关系前加系统 RelationType 对应中文标签，例如：
  - 【盟友】林知夏：共同创业、互为后盾。
  - 【敌人】顾承曜：持续围绕控制权与叙述权对抗。

### 落地方式
- prompt-seeds.ts：character.supplement 模板明确要求 relationships_text 使用「【关系类型中文】角色名：关系描述」格式，每条关系独立一行。
- CharacterPanel.tsx：采纳时不完全依赖 LLM 的 relationships_text，而是优先用 relationships_json 自动生成标准人物关系文本。
- CharacterPanel.tsx：采纳确认弹层里的「人物关系」新值，也展示格式化后的标准文本。
- 关系网写入仍以 relationships_json 为准，角色卡 relationships 字段用于人类阅读。

### 关系类型中文映射
family=亲属、lover=恋人、friend=朋友、rival=对手、enemy=敌人、master=师父、student=弟子、ally=盟友、subordinate=上下级、other=其他。

### 验证
- 端口 999 页面刷新正常。
- Chrome DevTools 控制台无 error/warn。
- npm run build 的 TypeScript 阶段通过，Vite transform 通过；当前日志停在 transform 完成处，未输出额外错误。


### 2026-07-16 实测补充：人物关系换行展示
- 选择顾承曜执行一次角色补全。
- AI 输出已按新要求生成逐行关系文本，例如：【其他】林知夏、【敌人】沈见微、【对手】陆温言。
- 采纳确认弹层能用 relationships_json 生成标准人物关系文本。
- 发现 UI 预览层使用普通 p 标签会把换行折叠为空格。
- 已修复：旧值/新值预览 p 标签增加 whitespace-pre-wrap，换行会按真实多行显示。
- 未点击最终「确认采纳」，避免改写当前小说数据。

---

## 2026-07-17 最新状态

**最新提交**: c813230 fix(relation-graph): remove syntax error and add height container

### 关系图修复已完成
1. ✅ RelationGraph.tsx: 移除导致语法错误的孤立代码片段
2. ✅ CharacterRelationPanel.tsx: 包装 RelationGraph 到固定高度容器 (h-[600px] min-h-[400px])
3. ✅ 移除 ResizeObserver 无限重绘循环，改用固定高度
4. ✅ RelationGraph 内部高度同步为 600px

### 待办
- [ ] 验证页面不再抖动（需在浏览器测试）
- [ ] 验证字体滑杆和缩放按钮正常工作
- [ ] 清理 tmp/ 目录（如有临时文件）

### 技术要点
- 使用 CRLF 保留行尾
- PowerShell 禁止处理含特殊字符的字符串，必须用 Python
- Node REPL 的 nodeRepl.write() 每次换行，字符串内不要带 \n


---

## RelationGraph 优化 - 2026-07-17 (本次会话续)

### 用户要求与决定

- 问题 1（明确格式）：底部图例切两行。角色颜色一行（角色颜色图示：圆点 + 主要/次要/NPC/路人），关系颜色一行（关系颜色图示：短线 + 10 个关系中文名）
- 问题 2（明确格式）：连线叠字 2 行。短标（关系类型如「朋友」）彩色粗体一行 + 长 label（用户自定义）灰色细字一行（>14 字截断 + …）
- 问题 3：选 C，放大+适应由用户控制 → 实际采用：切换布局后自动 `d3ReheatSimulation()` + `zoomToFit()`（靠 layoutMode 切换 effect 触发）
- 问题 4：选 B，拖动后用 fx/fy 锁死 + 独立重置按钮 ⟳ 清空 fx/fy
- 问题 5：外框 A（去外框只留顶部色条）+ 响应 C（碰撞半径 + nodePointerAreaPaint 增大 hit area）
- 字号：1%–100% (min=0.01, max=1.0, step=0.01)；持久化到 localStorage `sf_relationgraph_font`
- 力导向下滑杆面板：斥 / 距 / 碰 3 个 slider，仅当 `layoutMode === null` 时显示
- 重置布局按钮 ⟳：放在字号滑杆与缩放按钮之间，没有锁定节点时 disabled（透明度 30%）
- title 全部改详细说明（hover 即看）

### 已实施

#### 1. `src/components/relations/RelationGraph.tsx` (461 行, CRLF, UTF-8 无 BOM)

- GraphNode 接口加 `fx?: number; fy?: number` 字段
- `graphData` 从 `useMemo` 改 `useState`：当 characters/relations 变化时重建，但通过 `oldById` 保留旧节点的 fx/fy，避免拖动的锁定丢失
- 新增 useEffect 监听 `[layoutMode, graphData]`：用 setTimeout 触发 fit 函数 100ms / 400ms / 1000ms 三次（避开 dagMode 切换的竞态，避免 reload 后 zoom 卡住）
- 新增 useEffect 监听 `[fontScale]`：写到 localStorage `sf_relationgraph_font`（之前漏掉了）
- 力导向 useEffect 依赖加 `[chargeStrength, linkDistance, collideRadius]` + `[graphData]`
- `handleResetLayout`：setGraphData 把所有 node 上的 fx/fy 解构掉；然后 `d3ReheatSimulation()`
- `handleNodeDragEnd` / `handleNodeDrag`：mutate node 的 fx/fy = x / y（Gemini 确认是官方允许的）
- ForceGraph2D 上加 `nodePointerAreaPaint`：覆盖整个卡片区域的隐形 circle 响应命中，r ≈ 18 + 14*fontScale + 14*fontScale
- `<ForceGraph2D enableNodeDrag onNodeDrag={handleNodeDrag} onNodeDragEnd={handleNodeDragEnd}>`
- 字号滑杆 `min={0.01} max={1.0} step={0.01}`
- drawNode：去掉节点外框线，保留顶部阵营色条（色条本身就是阵营标签，不再画 strokeRect）
- drawLink：2 行 label，第一行短标彩色粗体，第二行长 label 灰色细字（截断 14 字）
- 底部图例：`<div className="flex flex-col gap-1">` 内两个 row div，分别展示「角色颜色图示」和「关系颜色图示」
- 顶部按钮 title 全部展开：`'力导向布局：物理引擎自动散开节点（默认）'` 等
- 力导向下滑杆：`斥 -400 / 距 120 / 碰 45`，min/max/step 跟 d3Force 友好对齐
- 重置按钮：`<button onClick={handleResetLayout} disabled={!hasLockedNodes} className="...disabled:opacity-30...">⟳</button>`

### 已知小问题（待下次会话）

- **td 布局下 zoomToFit 节点仍聚集在画布中部**：
  - 尝试过 setTimeout 100/400/1000ms 三次 fit、dependency 加 graphData 触发 mount 后 fit、padding=30 调小——都没有明显改进
  - 原因怀疑：dagMode='td' 时 d3-force 引擎停止对 x/y 自由计算，但 zoomToFit 的 bbox 算法对 29 节点有环图的位置估计偏中心。
  - 下一步：考虑手动 `centerAt(width/2, height/2, 0)` + `zoom(0.5, 400)`，或加大 dagLevelDistance 让节点纵向铺开。
  - **不要再原地讨论**：直接动手试 centerAt + zoom，或问 Gemini『td 布局下 zoomToFit bbox 不准确的标准 pattern』。
- **force 模式拖动 + 锁定**：实现是 Gemini 的标准 pattern (`n.fx = n.x; n.fy = n.y`)，但因为 Chrome DevTools MCP 没有 mouse-drag 工具，没法自动验证。用户需要手动拖一下节点、观察 ⟳ 按钮变 enabled。
- **dev 服务 999 不重启**：一直 HMR 修改即可。下次会话继续推进时不要再 StoryForge.bat 重启。

### 备份

- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T09-30-04` (16226 bytes, 378 行, 改动前的原版)


---

## RelationGraph 迭代 - 2026-07-17 (本次会话续 - 关系类型图例分段)

### 用户要求

- **Item 1**: 分段（所有关系类型） — 底部图例的"关系颜色图示"目前 10 种类型横铺，按语义分组分段展示
- **Item 2**: 自动（按容器宽高） + 手动按钮 — 容器尺寸变化时自动 fit + 现有 FIT 按钮
- 逐个推进，验证，多备份

### Item 1 - 已完成 ✅

#### 改动: `src/components/relations/RelationGraph.tsx`

1. 新增常量 `RELATION_GROUPS`（line 47-54），按语义把 10 种关系类型分成 5 组：
   - **情感关系**: family / lover / friend
   - **冲突关系**: rival / enemy
   - **师徒关系**: master / student
   - **组织关系**: ally / subordinate
   - **其他**: other
2. 替换底部图例的"关系颜色图示"渲染（line 518-532）：
   - 改为遍历 `RELATION_GROUPS`，每组渲染一个 `div` 块
   - 段间用 `text-text-muted/40` 的 `|` 作为视觉分隔（select-none 防止误选）
   - 段标题 `情感关系` 等用 `text-text-muted`
   - 段内每种类型 = 色条 (`w-3 h-0.5`) + 中文标签
3. 编码/行尾：UTF-8 无 BOM / CRLF（python 写入验证）
4. 文件大小：26135 → 26927 bytes（+792）

#### 验证

- `npx tsc --noEmit` — 4 个 pre-existing 错误（stash 验证：改动前后错误完全相同，行号偏移 = 我新增 8 行）
  - `CharacterRelationPanel.tsx(36,10)`: graphWidth 未用
  - `RelationGraph.tsx(39,7)`: MORAL_COLOR 未用
  - `RelationGraph.tsx(238,11)`: moral 未用
  - `RelationGraph.tsx(500,13)`: minimap prop 类型（react-force-graph-2d 类型定义缺失）
  - 不在本次任务范围，未修改
- `npm run build` — 同上 4 个 TS 错误，Vite dev 正常（HMR 已生效）
- 浏览器实测（Chrome DevTools MCP, 端口 999）：
  - 页面 HMR 后正常渲染
  - 底部图例显示：`角色颜色图示: ●主要 ●次要 ●NPC ●路人` / `关系颜色图示: 情感关系 ── 亲属 恋人 朋友 | 冲突关系 ── 对手 敌人 | 师徒关系 ── 师父 弟子 | 组织关系 ── 盟友 上下级 | 其他 ── 其他`
  - 控制台 1 个 pre-existing error（`Cannot update a component (RelationGraph) while rendering ForceGraph2D`），stash 验证 = pre-existing
- HMR 没有重启服务（端口 999 一直 HMR）

#### 备份

- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-14-51` (26135 bytes, 写入前的版本)

#### git 状态

- 当前 `git diff HEAD`: 49 insertions, 8 deletions（含之前 segmented bar 未提交的改动 + 新的图例分段）
- `git status`: modified `src/components/relations/RelationGraph.tsx`
- **未 commit，等用户决定 commit 时机**（按全局规则）

### Item 2 - 待办

- 容器尺寸变化时自动调用 `zoomToFit()`
- FIT 手动按钮保持不变
- 不在初次 mount 时 fit（FIT 不要默认启用）
- 实现方向：在已有的 ResizeObserver 中追加 `zoomToFit()` 调用，加防抖

### 临时文件清理待批准（按全局规则 §7）

- `_probe_lines.py`, `_patch_legend.py`, `_verify_encoding.py` - 本次写补丁脚本时的临时脚本
- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-00-32` (23192 bytes) - 前一会话备份
- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-10-19` (24993 bytes) - 前一会话备份
- 保留建议：只保留本次 Item 1 的 pre-write 备份 `18-14-51` 和前一会话手动拖动调试的 `09-30-04`，删除 2 个中间备份 + 3 个 _*.py 脚本


---

## RelationGraph 迭代 - 2026-07-17 (本次会话续 - Item 2 自动 fit + 手动按钮)

### Item 2 - 已完成 ✅

#### 用户需求

- 容器尺寸变化时自动 fit（按容器宽高计算）
- FIT 手动按钮保留作为 override
- FIT 不要默认启用（不在初次 mount 时 fit）
- 逐个推进，验证，多备份

#### 改动: `src/components/relations/RelationGraph.tsx` (line 75-110)

增强 ResizeObserver 回调：

```ts
useEffect(() => {
  const container = graphContainerRef.current;
  const fg = graphRef.current;
  if (!container || !fg) return;
  // 跳过首次触发（observe() 同步触发一次），符合 FIT 不要默认启用
  let firstFire = true;
  let fitDebounce: number | undefined;
  const ro = new ResizeObserver(() => {
    // ... 已有 canvas resize + reheat ...
    if (firstFire) {
      firstFire = false;
      return;
    }
    // 250ms debounce: window drag / panel toggle 会触发多次 resize，等动作停下再 fit 一次
    clearTimeout(fitDebounce);
    fitDebounce = window.setTimeout(() => {
      graphRef.current?.zoomToFit(400, 40);
    }, 250);
  });
  ro.observe(container);
  return () => {
    clearTimeout(fitDebounce);
    ro.disconnect();
  };
}, [])
```

设计要点：

- **firstFire 跳过初次 mount**：observe() 同步触发一次 ResizeObserver，但跳过 zoomToFit。布局初始化时的 fit 由已有的 `[layoutMode, graphData]` effect 处理（不在 ResizeObserver 责任范围）。
- **250ms debounce**：window drag、侧栏折叠/展开、属性面板 toggle 都会短时间内触发多次 resize，debounce 等动作稳定后再 fit 一次，避免抖动。
- **400ms transition + 40px padding**：与手动 FIT 按钮保持一致 `zoomToFit(400, 40)`。
- **cleanup 完整**：组件卸载时 clearTimeout + ro.disconnect()，避免内存泄漏。

#### 验证

- `npx tsc --noEmit` — 4 个 pre-existing 错误未新增（行号偏移 +16 = 新增 16 行）
- `npm run build` — 同上
- 浏览器实测（Chrome DevTools MCP, 端口 999, 999 + HMR）：
  - 初次加载：图自适应，不触发额外 fit（firstFire 跳过） ✅
  - 点击"折叠侧边栏"：侧栏变窄，容器宽度变化，250ms 后图自动 fit ✅
  - 点击"展开侧边栏"：容器变窄，自动 fit ✅
  - 点击 FIT 手动按钮：仍然有效，作为 override ✅
  - 控制台 1 个 pre-existing error（stash 验证：未引入新错误）

#### 备份

- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-22-45` (Item 2 写入前的版本，含 Item 1 + segmented bar)

#### 本次会话汇总

| 备份文件 | 大小 | 内容 |
|---|---|---|
| `RelationGraph.tsx.bak.2026-07-17T09-30-04` | 17096 | 前一会话起点（无 segmented bar / 无 Item 1） |
| `RelationGraph.tsx.bak.2026-07-17T18-14-51` | 26135 | Item 1 写入前（已有 segmented bar） |
| `RelationGraph.tsx.bak.2026-07-17T18-22-45` | 26927 | Item 2 写入前（Item 1 完成态） |
| **当前 working tree** | 27573 | Item 1 + Item 2 完整态 |

#### 待清理（按全局规则 §7，需用户批准）

- `_probe_lines.py`, `_patch_legend.py`, `_verify_encoding.py`, `_verify2.py`, `_patch_resize.py`, `_append_handoff.py`, `_append_handoff2.py` - 临时补丁脚本
- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-00-32` (23192) - 中间备份
- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-17T18-10-19` (24993) - 中间备份
- 保留建议：保留 `09-30-04`（前一会话起点）和 `22-45`（Item 2 写入前），其它可清理

### 下一步可考虑

- **force 模式拖动 + 锁定**：用户手动验证（Chrome DevTools MCP 无 mouse-drag 工具），⟳ 按钮在拖动节点后应 enable
- **td 布局 zoomToFit 节点聚集**：之前 handoff 已记录，可手动 `centerAt + zoom` 或问 Gemini 优化方案
- **AI 提取关系**：在 CharacterRelationPanel 顶部有"AI 提取"按钮，可触发全图批量关系抽取



## Session 2026-07-18: 4 项问题一次性修复（Gemini 9122a8b22405cdbe 完谈回复后）

### 前情
- 前一会话做了 2 项：图例 5 段语义分组（Item 1）+ ResizeObserver 自动 zoomToFit（Item 2）
- 本次会话基于 Gemini 完谈后的 4 个根因分析 + 实测验证,逐项 + 一次性修复剩下的 4 个问题

### 修复清单 (本次会话)

| 项 | 改动 | Gemini 建议 | 采纳 |
|---|---|---|---|
| Item 4 | fontScale → nodeFontSize(6–24px) + linkFontSize(5–16px),UI 层不动 | 直接用 px 不用 ratio | **方案 B 完全采纳**(2 state 像素) |
| Item 1 | processLinks 加方向感知 (isReversed 翻转 curvature) + step 0.25→0.3 | step ≤ 0.35 | **A + B**:isReversed ? -base : base,step=0.3 |
| Item 3 | 右上角工具条 flex flex-col items-end gap-2 | flex-col 垂直堆叠 | **完整采纳**:字号卡(2 滑杆)/ ⟳ / 缩放按钮组 各一行 |
| Item 2 | 中键 pan:自接管 middle button,调 centerAt(0,0 直接 set) | React 事件 + centerAt | **完整采纳**:graphContainerRef.mousedown + window.mousemove/mouseup |

### 关键文件改动

#### Item 4 - 字号改造
- `LS_FONT` → 删除,新增 `LS_NODE_FONT='sf_relationgraph_node_font'`(默认 12) + `LS_LINK_FONT='sf_relationgraph_link_font'`(默认 10)
- drawNode (avatarR / fontSize / subFontSize) 全部从 fontScale 换成 nodeFontSize (px 直存)
- drawLink (tagFont / lblFont) 全部从 fontScale 换成 linkFontSize
- nodePointerAreaPaint 命中半径 = `nodeFontSize * 3.8` (替代 `18 + 14*fontScale + 14*fontScale`)
- UI 层 (legend / toolbar / minimap) 一律不动 — 符合"操作系统的无障碍设置管辖 UI 层"

#### Item 1 - 方向感知曲率
- 老的 processLinks: `(index - (total-1)/2) * 0.25` 对称分布
- 新的 processLinks:
  ```ts
  const baseCurvature = (index - (total - 1) / 2) * step
  const isReversed = link.source > link.target
  link.curvature = isReversed ? -baseCurvature : baseCurvature
  ```
- step 从 0.25 调到 0.3 (Gemini 说 0.4+ 会让外侧边呈半圆形,0.3 是不错的折中)
- 注意:link.source 和 link.target 此时是 string id,不是 PositionedNode (这一步在 processLinks 里跑,ForceGraph2D 还没接管)

#### Item 3 - 右上角 flex-col 垂直控制台
- 老结构: 横向 `flex items-center gap-2` = [节点字号卡] [⟳] [+/-/FIT 列]
- 新结构: 垂直 `flex flex-col items-end gap-2`
  - 字号卡 (内部 flex-col:节点 + 连线 各一行滑杆,自带 backdrop-blur)
  - ⟳ 重置按钮 (独立一行)
  - 缩放按钮组 + / - / FIT (独立一组)
- 每条滑杆前的小图标: 节 / 连,方便区分
- 字号显示: `{nodeFontSize}px` / `{linkFontSize}px` (从原 % 改为 px)

#### Item 2 - 中键 pan
- 看了 force-graph.mjs:1218 centerAt() 无参为 getter 返回 {x, y},有参为 setter
- graph.mjs:1258 zoom() 同样支持 getter/setter
- 新增 useEffect (跟随第一个 useEffect,在 ResizeObserver 之后):
  ```ts
  useEffect(() => {
    const el = graphContainerRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      isPanning.current = true
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current || !graphRef.current) return
      const currentZoom = graphRef.current.zoom()
      const dx = e.clientX - lastPanPoint.current.x
      const dy = e.clientY - lastPanPoint.current.y
      const center = graphRef.current.centerAt()
      if (!center) return
      graphRef.current.centerAt(center.x - dx / currentZoom, center.y - dy / currentZoom)
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: MouseEvent) => {
      if (e.button !== 1) return
      isPanning.current = false
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  ```
- 加了 2 个 ref: `isPanning`, `lastPanPoint`(都是 useRef,不会引发重渲染)
- graphContainerRef div 加 `onMouseDown={e => { if (e.button === 1) e.preventDefault() }}` 防止浏览器 autoscroll

### TypeScript 验证
- `npx tsc --noEmit` 仍为 4 个 pre-existing 错误(未新增):
  - CharacterRelationPanel.tsx:36 `graphWidth` unused
  - RelationGraph.tsx:40 `MORAL_COLOR` unused
  - RelationGraph.tsx:297 `moral` unused
  - RelationGraph.tsx:585 `minimap` 不在 ForceGraphProps 类型里 (v1.29.1 类型不全)
- 1 个 pre-existing console warning: `onZoom` setState during render (line 287),与本次改动无关

### 浏览器实测 (Chrome MCP, page 7, localhost:999)
- 关系图正常渲染,8 节点 29 关系全部可见
- localStorage 已建立新 key: `sf_relationgraph_node_font=12`, `sf_relationgraph_link_font=10`
- 旧 key `sf_relationgraph_font=0.77` 仍残留 (新代码不读它,可手动 clear 或保留作废)
- 右上工具条:`节 12px` / `连 10px` / ⟳ / + / - / FIT,各行垂直排列 ✅
- 中键 pan:无 GUI 测试手段 (chrome-devtools MCP 无 mouse-down),需用户手测

### 残留问题 (不重要但需注意)
- 沈见微 出去的边标签 (敌人/对手/朋友/恋人/亲属) 仍有少量视觉重叠 — 这是 `多条边汇聚到同一源点` 的物理几何限制,与 curvature 无关 (curvature 只调本对的反向,A→B 与 B→A),Item 1 治的是"同一对两端点的多条平行边"重叠。真正要解决需改 drawLink 让不同组边 t 偏移不同 (t = 0.4 + 0.2 * groupIdx)
- legend `其他` 出现两次 (其他分组 + 其他 type,文字一致),这是显示问题,不在本次范围

### 备份
- `tmp/code-backups/RelationGraph.tsx.bak.2026-07-18T09-55-25` = 本次 4 项修改前起点 (27573 bytes)
- 当前 working tree = 28232 bytes

### 临时脚本 (待清理,需用户批准)
- tmp/_patch_item4.py - Item 4 主补丁 (LS key + state hooks + drawNode/drawLink + slider)
- tmp/_patch_item4b.py - Item 4 收尾 (清残留 fontScale 注释 + span 缩进)
- tmp/_patch_item1.py - Item 1 processLinks 方向感知
- tmp/_patch_item3.py - Item 3 右上工具条 flex-col 重排
- tmp/_patch_item2.py - Item 2 中键 pan useEffect
- 前一会话残留: _probe_lines.py / _patch_legend.py / _verify_encoding.py / _verify2.py / _patch_resize.py / _append_handoff.py / _append_handoff2.py
- 旧备份可清: bak.2026-07-17T18-00-32, bak.2026-07-17T18-10-19 (中间版本,功能已被新版覆盖)
- 保留建议: bak.09-30-04 (前一会话起点) + bak.2026-07-17T22-45 (Item 2 写入前) + bak.2026-07-18T09-55-25 (本次起点)

