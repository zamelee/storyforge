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


---

# StoryForge 关系图布局修复 - 2026-07-18 (c2a79e2)

> **最新提交**: c2a79e2 fix(relation-graph): popover physics + flex layout + cover fit (3 layout issues, Gemini 9122a8b22405cdbe)
> **服务端口**: 999 | URL: http://localhost:999/storyforge/workspace/1
> **协作会话**: Gemini 9122a8b22405cdbe (React + react-force-graph-2d + Tailwind)

---

## 本次目标

修复双显示器（横屏 1703×1080 / 竖屏 1080×1703）下「关系图」3 个布局根因：

1. **A2**: 力导向 3 滑杆（斥力/距离/碰撞）跟 6 个布局按钮挤在主工具条，撑爆 Portrait 宽度
2. **B**: graphCard 在竖屏下不能撑满 main 高度 → 画布留大片空白
3. **C2**: Portrait 下 zoomToFit (contain) 留大块空白，需要 cover（铺满容器）

---

## 已完成改动

### 1. A2: 力导向 3 滑杆 → ⚙️ Popover

**文件**: src/components/relations/RelationGraph.tsx

- imports 新增 Settings, Maximize2 from lucide-react
- 主工具条力导向区域从 3 个 inline <label> 改为 1 个 ⚙️ button + 条件渲染 Popover
- Popover 内容: 标题「物理参数（力导向）」+ 3 滑杆（斥力/距离/碰撞）
- 自写 click-outside + ESC 关闭（document.addEventListener('mousedown' / 'keydown')），**未引入新依赖**（如 @radix-ui / floating-ui）
- 新 state: physicsOpen: boolean, physicsRef: HTMLDivElement

**主工具条前后对比 (Portrait 1080×1703)**:
- 修复前: 621×62 px（含 3 滑杆）
- 修复后: 403×46 px（仅 6 布局按钮 + ⚙️）
- 与右工具条重叠: 81.5×62 → **0**

### 2. B: Flexbox 改造

**文件**: src/components/relations/CharacterRelationPanel.tsx

- line 115: h-[calc(100vh-180px)] → min-h-[calc(100vh-180px)]（min-h 允许 flex 收缩撑满）
- line 280: lex-1 min-h-[500px] → lex flex-col flex-1 min-h-0（flex-col + min-h-0 是 flex 收缩关键）

**文件**: src/components/relations/RelationGraph.tsx

- line 505 (graphCard 根 div): lex flex-col h-full → lex flex-col flex-1 min-h-0（h-full 在 column flex 父下计算不到 align-self stretch）
- line 655 (graph 容器): lex-1 min-h-0 不变（已正确）

**实测 (Portrait 1080×1703)**:
- graphCard: 808×1471 px（正确撑到 main 高度）
- canvas: 806×1388 px（跟随 graphContainer ResizeObserver）

### 3. C2: zoom-to-cover 算法

**文件**: src/components/relations/RelationGraph.tsx

- 新 state: itMode: 'contain' | 'cover'，持久化到 localStorage[sf_relationgraph_fit_mode]
- 新 ref: itModeRef（同步 fitMode 供 ResizeObserver callback 读取，避免 closure 过期）
- 新函数 handleZoomToCover: 手算 bbox + 	argetScale = Math.max(cw/gw, ch/gh) → centerAt(cx, cy, 0) + zoom(targetScale, 400)
- 新函数 handleFit: 根据 fitMode 调 fit 或 cover
- ResizeObserver 250ms debounce 回调内 inline cover 算法（读 graphDataRef.current）
- FIT 按钮 onClick 改 handleFit
- 新增 ▣ (Maximize2) 切换按钮: 切换 fitMode 后 setTimeout(handleFit, 50) 触发一次

**按钮视觉反馈**:
- 当前 fitMode 高亮（accent 背景）
- FIT title: '适应窗口（contain）' 或 '覆盖窗口（cover）'
- ▣ title: '切换为 contain（四周留白）' 或 '切换为 cover（铺满容器，Portrait 友好）'

---

## 中间战（已修复但易重蹈）

### TDZ 错误
- **症状**: ResizeObserver useEffect 在 line 80，但 fitMode/graphData 在 line 161+/202+ 才声明 → deps=[fitMode, handleZoomToCover] 立即求值触发 TDZ
- **解法**: deps 改回 []，fitMode 用 itModeRef = useRef(fitMode) + 同步 useEffect；graphData 用 graphDataRef = useRef(graphData) + 同步 useEffect；ResizeObserver callback 内 inline cover 算法（读 graphDataRef.current）

### flex stretch 被 h-full 覆盖
- **症状**: wrap 是 flex flex-col (column) 时，子元素 height: 100% 计算不到父的 flex-grow 高度
- **解法**: graphCard 的 h-full → lex-1 min-h-0，靠 align-self: stretch 撑满

### line endings
- **症状**: apply_patch 工具会把 CRLF 改 LF，必须事后用 Python 重整为 CRLF，否则 git 警告
- **解法**: 后续所有 patch 用 Python temp file (	mp/_patch_X.py) + Python 执行，绝不用 apply_patch
- 注: 本次 commit 时 git autocrlf=true 自动 normalize CRLF→LF 入库，工作树保留 CRLF 不影响 commit

---

## 实测验证 (Chrome DevTools MCP, page 7, localhost:999)

### Portrait 1080×1703

| 元素 | 修复前 | 修复后 |
|---|---|---|
| 主工具条 (居中) | 621×62 (含 3 滑杆) | **403×46** (仅 6 布局按钮 + ⚙️) |
| 右工具条 (右上) | 166×188 | 166×220 (含 ▣ cover 按钮) |
| **主+右 重叠** | **81.5×62 像素级** | **0** ✅ |
| wrap (graphCard.parent) | n/a | 1471 (正确撑开) |
| graphCard | 808×1388 | 808×1471 ✅ |
| canvas | 806×1388 | 806×1388 |

### Landscape 1703×1080

| 元素 | 数值 |
|---|---|
| graphCard | 1425×1451 (高度 > viewport 但可滚动) |
| canvas | 1423×1388 |
| 主工具条 | 419×34 |
| 右工具条 | 166×220 |
| 重叠 | **0** ✅ |

### Popover 行为
- 点击 ⚙️ → 弹出 220px 宽 Popover 显示 3 滑杆 ✅
- 点击 Popover 外部 → 关闭 ✅
- 按 ESC → 关闭 ✅
- 截图中可见：'物理参数（力导向）' / 斥力 -400 / 距离 120 / 碰撞 45

### Cover 模式
- 点击 ▣ 按钮 → 切换 fitMode → 高亮 ✅
- 再次点击 → 切回 contain ✅
- localStorage 持久化 ✅

---

## 已知遗留（非本任务范围）

1. **React warning**: Cannot update a component (RelationGraph) while rendering a different component (ForceGraph2D) at line 344 (onZoom setState)
   - **pre-existing**, 来自 cb3fa9d 引入
   - onZoom 是 ForceGraph2D 的 prop，但 ForceGraph2D 在 render 阶段同步调用它
   - **建议修复**: defer setState 用 queueMicrotask(() => setZoom(...))，或加 prev === newZoom ? prev : newZoom 短路
   - 待后续独立 commit 处理

2. **Landscape 滚动**: 1080 viewport + 1388 canvas → 出现 ~308px 滚动条
   - 用户接受: '尽量少一些，不是没有，避免元素一直往下落'
   - 这是物理引擎自然结果: 节点数 × 半径 > viewport 短边

3. **TypeScript 验证**: 仍为 4 个 pre-existing 错误（与本次无关）
   - CharacterRelationPanel.tsx:36 graphWidth unused
   - RelationGraph.tsx:40 MORAL_COLOR unused
   - RelationGraph.tsx:297 moral unused
   - RelationGraph.tsx:585 minimap 不在 ForceGraphProps 类型里

---

## 备份

- 	mp/code-backups/RelationGraph.tsx.20260718-111605.bak - 本次修复前起点 (37211 bytes)
- 	mp/code-backups/CharacterRelationPanel.tsx.20260718-111605.bak - 本次修复前起点
- 	mp/code-backups/CharacterRelationPanel.tsx.bak.pre-flexbox - flex 改造前中间状态

---

## 临时脚本（待清理，需用户批准）

- 	mp/_patch6.py 	mp/_patch7.py 	mp/_patch8.py - 初版 Popover 试验
- 	mp/_patch_panel.py 	mp/_patch_wrap.py - flex 改造试验
- 	mp/_patch_tdz.py 	mp/_patch_tdz2.py 	mp/_patch_tdz3.py 	mp/_patch_tdz4.py - TDZ 错误各阶段修复
- 	mp/_patch_gdr.py 	mp/_patch_gdr2.py - ResizeObserver inline cover 试验
- 	mp/_patch_graphcard.py - graphCard flex-1 改造
- 	mp/_patch_item1.py ... 	mp/_patch_item4b.py - **前一会话残留**（Item 1-4 字号/曲率/工具条/中键 pan）

建议全部删除（任务已完成，临时脚本无后续用途）。


---

## 2026-07-18 会话记录 · 关系图 5 项 UX 改进 (A-E)

**commit**: `96d9ccd feat(relation-panel): 5 项 UX 改进 (A-E)`

### 5 项改进（用户确认 OK）

| # | 项 | 实现 |
|---|---|---|
| A | 默认值 | 节点/连线 9px, 斥力 -900, 距离 150, 碰撞 45 |
| B | 同显 + 拖动分屏 + 持久化 | `sf_relationgraph_split` [0.25, 0.85] |
| C | 三按钮视图切换 | 同显 (默认) / 仅图 / 仅表 |
| D | 列表自适应 | `flex-1 min-h-0 min-w-0 overflow-y-auto` |
| E | < 700px 抽屉降级 | FAB (Eye 图标) + Drawer (右侧滑入 w-96) |

### 实测证据 (Chrome DevTools MCP, page 7, localhost:999)

**Landscape 1703×1080 (同显模式)**:
- 同显按钮高亮 (view='both')
- graph 容器 1425×663 (split 0.25, height: 25%)
- list 容器 1425×3207
- localStorage.persist: `sf_relationgraph_split = "0.25"` ✓ (拖动持久化生效)
- dragEnd clamp 到下限 [0.25, 0.85] 生效

**Portrait 600×800 (抽屉降级)**:
- 浮动按钮 "列表 (29)" 右下角 fixed ✓ (degraded = true)
- divider 不渲染 ✓
- 内联 list 不渲染 ✓
- graph 占满全宽 ✓
- Drawer 点击 FAB 打开: 右侧滑入, 含完整 29 条关系 + 关闭按钮
- Drawer 点击 X 关闭: 回到关系图视图 ✓

### TSC 验证

- `CharacterRelationPanel.tsx`: **0 错误**
- `RelationGraph.tsx`: 3 pre-existing 错误 (MORAL_COLOR / moral / minimap) — 不在本任务范围

### 新增临时文件

- `tmp/code-backups/CharacterRelationPanel.tsx.<timestamp>.pre-drawer` — 实施 E 前备份

### 待跟进 (issue/讨论)

1. **panel orient 误判**: 当 panel 内容撑高 (e.g. 29 条关系 → 3207px) 时, ResizeObserver 触发 setOrientation='portrait', 但 viewport 实际是 landscape 1703×1080。结果：landscape 模式下走了 flex-col 上下布局而非 flex-row 左右布局。
   - 设计原意: container-based orientation 避免 matchMedia sidebar pitfall
   - 副作用: 内容一多就触发误判
   - 建议方案: 改用 viewport orientation (matchMedia innerWidth/innerHeight), 但需讨论是否保留 container-based 设计意图

2. **3 个 RelationGraph.tsx pre-existing 错误** (handoff §已知遗留):
   - MORAL_COLOR unused (line 42)
   - moral unused (line 387)
   - minimap 不在 ForceGraphProps 类型 (line 693)
   - 建议后续独立 commit 处理

3. **临时脚本清理**: 上次会话遗留 `tmp/_patch_*.py` × 15+ 文件, 本会话未新增, 等用户批准后批量删除

## 2026-07-19 关系图 Layout 重构 — 上下文检查点

### 当前状态
- dev server 端口 **999** (用户禁止重启)
- 浏览器: Chrome DevTools MCP (StoryForge localhost:999 + Gemini 9122a8b22405cdbe)
- 协作 AI: Gemini 9122a8b22405cdbe
- 最近 commit: f382acf docs(handoff): append 2026-07-18 5 项 UX 改进记录
- 分支: main, 工作树 clean

### 上一会话遗留 4 bug
1. 竖布局当前下半截没有: panel.height(3912) > panel.width(1425) 永远 portrait, 即使 viewport 是 landscape
2. divider 拖不动: 6px row-resize 太小 + clamp 公式 bug
3. listWrap 不自滚: main 是 overflow-y-auto → list 撑高 3207 → main 滚 (3960 vs 1080)
4. 横竖不自动切换: orientation 误判连锁

### 关键发现 (main 不能动)
- WorkspacePage.tsx:290 <main className="flex-1 overflow-y-auto p-6 relative"> 被 26 个子模块依赖滚动
- main 内只有 2 个 child: 右上角 <button> (absolute 不占流) + <Suspense>{renderMainPanel()}</Suspense> (就是我)
- 推翻 Gemini 之前否决方案 A 的理由: main 里没有其他需要参与排版的兄弟节点

### Gemini 最终方案 (9122a8b22405cdbe 已确认)

#### 根容器: absolute inset-6 (脱离文档流 + 保留 main 原 24px 边距)
```tsx
<div
  ref={containerRef}
  className="absolute inset-6 flex flex-col overflow-hidden bg-bg-base border border-border rounded-lg shadow-sm"
>
  ...
</div>
```
- absolute: 脱离 main 的 overflow-y-auto 流, 永远不会被 list 撑爆
- inset-6: 等价 top:24px;right:24px;bottom:24px;left:24px, 保留 main 原 p-6 视觉
- overflow-hidden: 内部防溢出

#### ResizeObserver 测这个根容器
- 拿到的是 main clientHeight - 48px (p-6 减除), 绝对稳定
- 触发 orientation flip 时仅在 height > width

#### PanelGroup 结构
```tsx
<PanelGroup direction={isPortrait ? "vertical" : "horizontal"} autoSaveId="storyforge-graph">
  <Panel defaultSize={65} minSize={30}>...Graph...</Panel>
  <PanelResizeHandle className="...cursor-row|col-resize..." />
  <Panel defaultSize={35} minSize={20}>...List...</Panel>
</PanelGroup>
```

#### 抽屉降级 (< 700px)
- view === both && graphWidth < 700 → Drawer + FAB
- PanelGroup 卸载, 只渲染 Graph

#### 关键修正 (Gemini 最后两点)
1. inset-6 vs inset-0: 选 inset-6, 保留 24px 视觉边距 (和原页面一致)
2. z-index: main 里 <button> (属性面板切换) 也是 absolute, Panel 在后渲染会盖住它 → 给该 button 加 z-50 (不归本任务, 等用户单独决定)

### 实施计划 (待用户拍板)
1. 安装依赖: `npm install react-resizable-panels@^4.12.2`
2. 备份: `cp src/components/relations/CharacterRelationPanel.tsx tmp/code-backups/<ts>.pre-resize-arch`
3. 重构 CharacterRelationPanel.tsx:
   - 移除手写的 split / draggingRef / splitRef / onDragStart / LS_SPLIT / loadLS
   - 移除手写的 divider JSX
   - 保留 view 三按钮 (同显 / 仅图 / 仅表)
   - 根容器改为 absolute inset-6 flex flex-col overflow-hidden
   - 引入 PanelGroup / Panel / PanelResizeHandle (autoSaveId="storyforge-graph")
   - 保留抽屉降级逻辑 (FAB + Drawer)
4. 删除 sf_relationgraph_split localStorage key (用 autoSaveId 替代)
5. TSC 验证 (CharacterRelationPanel.tsx 0 错误)
6. 浏览器实测 3 种状态: Landscape 1703×1080 / Portrait 600×800 / 极端 < 700px
7. Console 检查 (无 React warning, 无 resize loop error)
8. Commit + push + 更新 handoff.md

### 关键约束 (再次强调)
- **不允许** 修改 WorkspacePage.tsx 的 <main> 元素
- **必须保留** 抽屉降级逻辑 (< 700px FAB + Drawer)
- **必须保留** 视图切换三按钮
- **必须使用** react-resizable-panels 4.12.2
- dev server **不要重启** (端口 999 持续运行)
- commit message 中文

## 2026-07-19 关系图 Layout Bug 修复

### 触发条件
上次 commit 253dfe8 (absolute inset-6 + react-resizable-panels 重构) 后,
实测 canvas 高度仍只有 600px, 父级 Panel 994px 丢了 331px。

### 根因 (Bug 1)
Panel 内的 wrapper 是 `<div className="w-full h-full">` (display: block)。
RelationGraph 根 div 用 `flex flex-col flex-1 min-h-0`, 但父级不是 flex 容器,
flex-1 在 block 父级里不生效, 根 div 按内容高度计算 (663px), 丢了 331px。

### 根因 (Bug 2)
`RelationGraph.tsx:344` `onZoom` 回调在 ForceGraph2D render 期间同步 setZoom,
触发 React 18 警告: `Cannot update a component (RelationGraph) while rendering
a different component (ForceGraph2D)`。

### 修复 (commit 553bb99)
1. `CharacterRelationPanel.tsx` 3 处 wrapper 加 `flex flex-col`
   - view === 'graph'
   - view === 'both' && !degraded (Panel id="graph")
   - view === 'both' && degraded
2. `RelationGraph.tsx:343-348` onZoom 用 queueMicrotask 包 setState

### 验证
- canvas 高度 600 → 931 (横屏 landscape 994 - 控件 63 = 931, 100% 撑满)
- console 0 React error
- 切换力导向/放射/树状布局都正常, canvas 尺寸稳定
- TSC 0 新增错误 (3 个 pre-existing 错误与本修复无关)

### 备份
- tmp/code-backups/CharacterRelationPanel.tsx.pre-fix-flex-bug
- tmp/code-backups/RelationGraph.tsx.pre-fix-flex-bug

---

# StoryForge 关系图 contain 模式 fit 算法修复 - 2026-07-19

**项目**: D:/Documents/VibeCoding/storyforge | 分支: main
**服务端口**: 999 (用户明令禁止重启) | URL: http://localhost:999/storyforge/workspace/1

## 目标
contain 模式点击 FIT 后:
1. 节点视觉边界完整在 canvas 内
2. **不被顶部布局工具条 / 右侧控制区压住**

## 关键技术发现
react-force-graph 的 centerAt(P) 实现 (force-graph.mjs:1218, setCenter):
`js
state.zoom.translateTo(state.zoom.__baseElem, x, y, ...)
`
内部 d3-zoom 	ranslateTo 用当前 k 计算 	x = p0x - P*k_current。
图点 Q 屏幕位置 = Q*k + tx = Q*k + p0x - P*k_current。

如果 Q = P 且 k_current = fit 后的 zoomK, 那么 Q*k + p0x - Q*k = p0x = canvas 中心。
但 Gemini 给的公式 centerAt(cx_g + (l-r)/(2k)) 让 centerAt 接受 P > cx_g 的点,
导致图心被推到反方向（向右偏 instead of 左），**符号反了**。

## 正确公式推导
- 图心 cx_g 屏幕 = cx_g*k + tx = cx_g*k + p0x - P*k_current
- 目标 = safe_cx = p0x + (l-r)/2
- 解出 P (centerAt 输入): P = cx_g + (p0x - safe_cx)/k = cx_g - (l-r)/(2k)
- **所以 offsetX = cx_g - (ins.left - ins.right) / (2 * k)** (用减号, 不是加号)

## 修复
文件: src/components/relations/RelationGraph.tsx

1. handleZoomToFit 内符号反转
   offsetX = cx - (ins.left - ins.right) / (2 * k)
   offsetY = cy - (ins.top - ins.bottom) / (2 * k)

2. ResizeObserver 内 contain 路径 (line 161-162) 同步修正
   ox = cx - (ins.left - ins.right) / (2 * k)
   oy = cy - (ins.top - ins.bottom) / (2 * k)

3. handleZoomToFit 头部加同步 fallback, 避免 mount 时 ResizeObserver 没跑导致 safeInsetRef 是初始 0
   - 用 graphContainerRef/layoutBarRef/controlsRef 实时 getBoundingClientRect 同步算一次

## 验证 (Chrome DevTools MCP 实测)
实测 fit 后:
- canvas 804×883, layoutBar bottom=54, controlsLeft=174
- inset: top=66, right=186
- safe 区: top≥66, right≤618
- **亮像素 bbox cx=308.5 (safe_cx=309) ✅ cy=474.5 (safe_cy=474.5) ✅**
- **亮像素 bbox minX=25, maxX=592 (右控制区左沿=804-174=630, maxX<safe right 618) ✅**
- **亮像素 bbox minY=110 (>top inset 66) ✅**

视觉验证: 节点视觉边界完全在工具条下、控制区左边，不再被压。

## 浏览器实测工具
- service_devtools_mcp: page 8 = http://localhost:999/storyforge/workspace/1
- evaluate_script 读 canvas getImageData + DOM 测量工具条位置

## 备份
- tmp/code-backups/RelationGraph.tsx.pre-contain-safe-inset

## 后续
- cover 模式不动（用户最新指示）