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

---

# StoryForge 关系图筛选 + checkbox 位置改进 - 2026-07-19

**项目**: D:/Documents/VibeCoding/storyforge | 分支: main
**服务端口**: 999 | URL: http://localhost:999/storyforge/workspace/1

## 目标
按用户反馈完善关系图筛选 + checkbox 拖动干扰问题 + checkbox 位置美化

## 本轮 3 项改动

### 1. drag 不再被打断（问题 1 修复）
- 之前 multi 模式下，点节点 body 会 toggle 选中 -> 触发 re-render -> 打断 d3-drag
- 现在 handleNodeClick 接 event 参数，multi 模式下用 screen2GraphCoords 反推图坐标
- 只有命中 checkbox 区域才 toggle；命中 body 一律 return（沉默）
- React state 不变 -> force-graph 不 re-render -> drag 不受影响

### 2. checkbox 移到右上角（Gemini 方案 F）
- 之前 cbX=x+3, cbY=y+5.5 与头像重叠 9.1px
- 现在 cbX = node.x + cardW/2 - cbSize - padding, cbY = node.y - cardH/2 + padding
- 右上固定锚点，与 avatarR/cardW 临界值解耦（不会跳）
- 完全不挡头像

### 3. cardW/cardH 缓存到 node 供 hit test 共用
- PositionedNode 类型加 cardW?/cardH? 字段
- drawNode 渲染时缓存 node.cardW = cardW, node.cardH = cardH
- handleNodeClick 通过 calcCheckboxRect(node) 读取同一份数据
- 用 ?? 兜底（35/50）以防 drawNode 尚未跑过

## 关键代码位置
- src/components/relations/RelationGraph.tsx:71 类型扩展
- src/components/relations/RelationGraph.tsx:77-90 calcCheckboxRect helper
- src/components/relations/RelationGraph.tsx:478-505 handleNodeClick event hit test
- src/components/relations/RelationGraph.tsx:654-655 cardW/cardH 缓存
- src/components/relations/RelationGraph.tsx:667 drawNode 用 calcCheckboxRect

## Gemini 对话 ID
https://gemini.google.com/app/4fac77e442b01914 (同会话继续追问)

## 验证
- TS 检查：3 个 pre-existing 错误（不动），0 新增
- 截图：checkbox 出现在节点右上角（视觉确认）
- drag 不被打断：body 点击不再触发 state 变化
- 手动验证（需用户）：click 命中 checkbox 才 toggle

## 约束遵守
- dev port 999 不重启 ✅
- 不动全局 AGENTS.md
- 备份：tmp/code-backups/RelationGraph.tsx.20260719_115427.bak

---

# StoryForge 关系图 checkbox 尺寸 1/6 改进 - 2026-07-20

**项目**: D:/Documents/VibeCoding/storyforge | 分支: main
**服务端口**: 999 | URL: http://localhost:999/storyforge/workspace/1

## 目标
按用户指示:checkbox 视觉尺寸应为角色标签宽度的 1/6(cardW / 6 动态算)

## 3 项改动

### 1. cbSize 按 cardW / 6 动态算
- 之前固定 11px,字号变大时 checkbox 比例失衡
- 现在 cbSize = Math.max(6, Math.round(cardW / 6)),cardW≈44 → cbSize=7
- padding 同步从 3 缩到 2(保持视觉比例)

### 2. hit test 用 1.8x 放大响应区
- 视觉 checkbox 缩到 7px,鼠标点不准
- 新增 calcCheckboxHitRect 函数,中心不变,边长放大到 cbSize * 1.8 ≈ 12.6px
- 用户点 checkbox 附近 12.6px 范围内都能命中

### 3. 勾的描边粗细按 cbSize 比例缩
- 之前固定 lineWidth = 1.8,适配 11px 视觉
- 现在 lw = Math.max(1, cbSize * 0.17),7px→1.2 / 11px→1.87
- 三角偏移也按比例(/b/c/d 5 个常数替换 cbSize 乘子)
- 避免小 checkbox 上的勾糊掉

## 关键代码位置
- src/components/relations/RelationGraph.tsx:82-92 calcCheckboxRect (cbSize 动态)
- src/components/relations/RelationGraph.tsx:96-106 calcCheckboxHitRect (放大版 hit)
- src/components/relations/RelationGraph.tsx:509 handleNodeClick 用 hit rect
- src/components/relations/RelationGraph.tsx:699-712 drawNode 勾描边按比例缩

## 验证
- TS 检查未跑(node 环境暂不可用,待恢复后跑)
- dev port 999 未重启,HMR 自动应用
- 需用户在浏览器手动验证视觉

## 约束遵守
- dev port 999 不重启
- 备份: tmp/code-backups/RelationGraph.tsx.20260720_153337.bak

## 2026-07-20 消账

### A. 关系图筛选 — 已闭环
- commit `592c6f4` "fix(relation-graph): 关系图筛选 + checkbox 位置改进" (2026-07-19)
- 多选模式下点节点 body 不再打断 d3-drag，checkbox 移到右上角固定锚点 (Gemini 方案 F)
- handoff 现有专门条目: `# StoryForge 关系图筛选 + checkbox 位置改进 - 2026-07-19`

### B. 连线文字重叠 — 已闭环 (两个 commit 合力)
- commit `caa5ab3` "feat(relation-graph): curved parallel links for multi-relation pairs" (2026-07-17)
  - **此前漏写独立消账条目，本次补登**
  - 同一对角色多条关系 (如 沈见微↔林知夏 的 恋人/朋友/亲属) 折成平行弧线，不再叠成一根直线
  - `processLinks` 按 sorted[source,target] 分组，`curvature = (i - (n-1)/2) * 0.25`，奇数中间线 curvature=0
  - drawLink 改为算 bezier `B(0.5) = 0.25*P0 + 0.5*ctrl + 0.25*P2` 顶点放标签
  - ForceGraph2D `linkCanvasObjectMode: 'after'` + `linkCurvature` + `linkColor(alpha)` + `linkWidth`，让内置渲染器画弧和箭头，本组件只画 label
- commit `cb3fa9d` "fix(relation-graph): 4 项交互性修复 (Gemini 9122a8b22405cdbe)" (2026-07-18)
  - Item 1 方向感知曲率 (isReversed 翻转 curvature 符号) — 治反向边重叠
  - step 0.25 → 0.3 (Gemini 上限 0.35)
  - Item 2 中键 pan 自接管
  - Item 3 工具条垂直堆叠
  - Item 4 字号双轨 (nodeFontSize + linkFontSize)
  - handoff 现有专门条目: `## Session 2026-07-18: 4 项问题一次性修复`

### C. character.supplement 模板重复 — 待核实 (本次仅解释含义)
- **症状**: UI「提示词库」页面看到两条同名 `character.supplement`，都是系统内置五角星图标
- **代码层面只有 1 个 system prompt 定义**: `src/lib/ai/prompt-seeds.ts:290 moduleKey: 'character.supplement'`
- **运行时重复最可能的来源**: 某个早期版本或迁移把 system 模板克隆成 user 模板，但 UI 用 system 图标统一渲染，没区分 system/user
- **待核实点**: promptTemplates 表里的 isSystem / isBuiltin 字段实际值，渲染层的 icon 取值逻辑


## 2026-07-20 角色补全抽风闭环 (B fix + D fix)

### 用户报告
「角色生成 → 补全 → 采纳」偶发弹「角色名不匹配」, 且按钮点不了。

### 根因链
1. character.supplement 提示词未要求 LLM 显式输出角色名 (Markdown 用 **外貌:**...**性格:**... 格式, 无 name 字段)
2. parseCharacterOutput 二次抽取拿不到 name → 返回 'AI 生成角色'
3. strict check parsed.name !== targetChar.name 永远不通过 → alert 阻塞
4. alert accept 后紧跟 return, 函数退出, HMR 又重置 state (supplementCharId = null)
5. 用户再点「采纳」 → handleSupplementAccept 第一行 if (!supplementCharId) return 静默退出 → 没反应

### 修复 (双保险)

#### B fix (commit 4356c89)
- parse-character-output.ts 加 expectedName?: string 参数
- systemPrompt 加 hint: 有 expectedName 必须用它作 name, 不要猜
- 返回时确定性覆写: (expectedName && expectedName.trim()) ? expectedName.trim() : (...)
- CharacterPanel.tsx 调用处传 targetChar.name

#### D fix (commit f30ec4c)
- 修复 #1 (治本): prompt-seeds.ts character.supplement 输出格式改 3 步
  1. 首行 `# {{characterName}}` (client 严格解析这一行作为 name)
  2. Markdown 正文
  3. JSON 顶层加 name + fromName, 每条 relationship 加 fromName
- 修复 #2 (治 UX): handleSupplementAccept 不再静默 return
  - !supplementCharId → toast.error('补全会话已丢失...')
  - !targetChar → toast.error('目标角色不存在...')
  - 即使 HMR 重置 state, 用户也得到反馈

### 双保险覆盖矩阵
- 主路径: prompt 显式 name → 二次抽取拿得到 → strict check 通过
- 兜底: 客户端 expectedName 注入 → 即使 LLM 抽风也走通
- 体验: 状态丢失时 toast 提示, 不静默退出

### 关键代码位置
- src/lib/ai/prompt-seeds.ts:340-360 (输出格式 + JSON 模板)
- src/lib/ai/parse-character-output.ts:86 (签名), 110 (hint), 134 (强制覆写)
- src/components/character/CharacterPanel.tsx:10 (import useToast), 152 (toast hook), 293-303 (toast 替代静默 return), 296 (传 expectedName)

### 验证
- TS 检查: 两文件 esbuild transform 通过
- 浏览器实测 (林知夏补全): LLM 输出首行 # 林知夏, JSON 含 name: 林知夏, 采纳后直接进逐字段审查弹层
- HMR 重置后用户可见 toast 提示, 不再是死按钮

### 预写备份
- tmp/code-backups/parse-character-output.ts.202607200843134.bak (6695 bytes)
- tmp/code-backups/CharacterPanel.tsx.202607200843238.bak (42959 bytes, B fix 前)
- tmp/code-backups/prompt-seeds.ts.202607200859044.bak (88371 bytes, D fix 前)
- tmp/code-backups/CharacterPanel.tsx.202607200900049.bak (43054 bytes, D fix 前)

### 约束遵守
- dev port 999 不重启
- 不动全局 AGENTS.md
- prompt-seeds.ts 因新增反引号 escape, 第二次编辑时遇到一次 TS 语法错, 已修

### 用户确认
2026-07-20 用户确认「跑通了」, 双保险策略生效。

## 安全边界 (Safety Boundaries)

### 远程仓库禁令 (2026-07-20 用户明确强调)

- **绝对不向 yuanbw remote 推送任何 commit**
  - yuanbw remote URL: https://github.com/yuanbw2025/storyforge.git
  - 这是原作者仓库,**任何 push 操作都会污染原作者的 main 分支**
  - 即使是 "对齐两端" "同步给原作者看" 等好听理由,也不准
  - 只允许: `git fetch yuanbw` (只读,对比差异), 严禁 `git push yuanbw`
- **只允许向 origin (zamelee/storyforge.git) 推送**
  - 这是用户自己的 fork, 可自由推送

### 备份 / 清理 / 操作原则
- 备份: tmp/code-backups/ 永久保留 (本项目惯例, 不删)
- 临时脚本: tmp/_*.py 一律带下划线前缀, 用完提议用户清理, 不自动删
- 大文件改动: 优先用 Node REPL (避免 shell 转义陷阱), 用 apply_patch 时严格按 unified diff 格式
- TS 模板字符串内反引号: 必须 `\`` 转义, 否则 esbuild 报 syntax error

### 显性归属 (从全局 AGENTS.md §8 继承)
- 本项目: D:/Documents/VibeCoding/storyforge (纯前端, React + IndexedDB)
- 不要管: D:/Documents/VibeCoding/storyforge-server (另一个对话的责任)

## 2026-07-20 两个系统性问题全局分析

### A. 关系网「钢丝球」数据建模层问题

**实测数据**（dev 999 workspace 1, project 1, 当前 IndexedDB storyforge.characterRelations 真实抓取）

- totalRelations: 53
- totalCharacters: 8
- duplicatePairCount: 12（按 (sorted pair, type) 去重仍重复的 key 数）

**典型案例**：「林知夏 (2) ↔ 顾承曜 (3) :: enemy」key 下共存 3 条记录
- id 3  : 3→2, bi=true,  label="控制与反抗"
- id 35 : 2→3, bi=false, label="资源控制者"
- id 41 : 3→2, bi=true,  label="安排与觉醒"

其它典型：沈见微↔陆温言::other 有 2 条同向（id 18 / id 25, label 不同「审慎协作」vs「克制协作」）；沈见微↔林知夏::ally 有 3 条（id 16/23 同向「坚定同盟」重复 + id 34 反向「共同觉醒的同盟」）。

**根因（六层叠加）**

（1）**数据模型层**（src/lib/types/character-relation.ts）
- CharacterRelation 把 isBidirectional 当布尔标志位
- 「敌人/对手/上下级/师父/弟子」这些 RelationType 在语义上是**有向**的（A 是 B 的敌人 ≠ B 是 A 的敌人），但 schema 当成无向标签
- 没有「双向关系」作为派生概念：UI 渲染 `l.bidirectional ? 0 : 6`（箭头长度）只解决视觉，**存储冗余未解**

（2）**store 写入层**（src/stores/character-relation.ts）
- addRelation **裸 add**，无 dedup、无 upsert
- useCharacterRelationStore 没有 updateByPair / mergePair 之类 API

（3）**AI 提取 handler**（src/components/relations/CharacterRelationPanel.tsx handleAcceptExtracted + src/lib/ai/relation-extractor.ts matchRelations）
- isDuplicate 字段是**UI 提示**（默认非 dup 才勾选），不是**强制约束**
- 用户在 UI 上可以「故意」勾选 isDuplicate 项 → 重复入库
- matchRelations 的 dedup key = `${min}-${max}-${type}` 包含 type，但 AI 多次输出 label/description 不稳定，导致同 key 多条

（4）**AI 输出层**（src/lib/ai/prompt-seeds.ts relation.extract）
- 提示词没限定「同一对角色同一类型只输出一条」
- AI 把「敌人」等有向概念当成无向（给 A→B「敌人」又给 B→A「敌人」）

（5）**展示层**（src/components/relations/RelationGraph.tsx）
- processLinks 只按 sorted pair 给多条边分配不同 curvature，**没去重**
- force-graph-2d 渲染所有记录，视觉上同向同 pair 多条线重叠缠绕 → 用户看到的「钢丝球」

（6）**维护工具缺失**
- 关系面板只有「删除单条」，**没有任何「去重」「合并」「清空同 pair」入口**
- 用户发现乱后只能单条删

**建议修复路线**（按代价 / 收益排）

| 序 | 改动 | 代价 | 收益 |
|---|---|---|---|
| 1 | 加 mergePair UI：选中两条 → 合并 label/description（保留较长的），删除另一条 | 小 | 即时治乱 |
| 2 | addRelation 改成 upsert：先查 (projectId, fromId, toId, type) 存在则 update；存在同向多 type 时不 merge（保留独立性） | 小 | 阻止新增重复 |
| 3 | handleAcceptExtracted 默认对 isDuplicate=true **取消勾选**（仅 UI 强制，不靠用户自觉）；再加 toast 提示 N 条被跳过 | 小 | AI 提取不再累积 |
| 4 | processLinks 渲染前 dedup：同 (from, to) 保留 isBidirectional=true + 最新一条；其它折叠成 hover 弹层 | 中 | 视觉根治 |
| 5 | 在 relation.extract prompt 加约束：「同 pair 同 type 合并为一条；如 A→B 与 B→A 都有关系，给两条不同 type；只有 truly symmetric（朋友/盟友）才标 bidirectional」 | 中 | 治本 |
| 6 | schema 升级（v7+）：把 RelationType 拆 directedType / symmetricType，或加 polarity 字段（dominant/submissive）；migration 把现有数据归一 | 大 | 长期正确建模 |

**短期推荐**：1+2+3 三步组合——「先提供 UI 合并工具 + 让 addRelation dedup + 让 AI 提取自动跳过重复」。这三步不依赖 schema 升级，能在不破坏现有数据的前提下根治新增污染。

---

### B. 灵感反推「采纳 → 没有再修正的机会」流程层问题

**现状**（src/components/project/InspirationPanel.tsx）

- handleAdoptWorldview / handleAdoptStoryCore / handleAdoptCharacters
- → await adopt(...)
- → setAdoptedSections(prev => new Set(prev).add(...))
- → 按钮变绿「已采纳」，无后续入口

Adopt 自身在 src/lib/registry/adopt.ts adoptCollection 已支持 duplicatePolicy（characters 表登记为 'merge'，identity = homeWorldGroupId + name），所以**技术层面「再次采纳」是安全的**——同名角色会 merge 而非新增。

但 UI 上完全没有「再次反推 / 撤销 / 在已采纳基础上扩充」的入口：

（1）**没有「重新生成 / 重跑」入口**
- 只能改 inspiration 文本 + 改 userHint 然后点「开始反推」——但这会**覆盖 result / mwResult state**（setResult(parsed)），原结果丢失
- draftKey localStorage 保存了 inspiration, userHint, result, mwResult, mwAdopted，但**没有版本号 / 多版本快照**，刷新页面也只能恢复最后一次

（2）**没有「撤销采纳」入口**
- handleAdoptWorldview 等用 mode: 'replace' 直接覆盖 worldview 单例
- 采纳后 adoptedSections.has('worldview') 锁死按钮，但**对应的 worldview 已经写到 IndexedDB**，无 rollback

（3）**没有「在采纳基础上继续扩充」入口**
- 已采纳世界观 + 故事核心 + 角色后，想「基于现有角色再补 5 个次要角色」——必须重跑 inspiration.reverse 整轮
- 想「为已采纳角色互相补充关系」——必须切到关系面板跑 relation.extract，**两步之间无任何线索衔接**

（4）**没有「局部重生成」入口**
- 世界观 7 个字段、角色 N 个——采纳是粗粒度 section 级，无法挑一个字段重生成

（5）**AI 输出 token / cost 重复消耗**
- 每次「再生成」都是从头跑全文 prompt（buildInspirationReversePrompt），不传「已采纳结果」作为约束 → AI 可能产出与上次冲突的内容

（6）**多世界版无差异**
- handleAdoptMultiWorld 一次性创建世界组 + 世界观 + 故事核心 + 角色，**更没救**：跑一次就建一堆世界组，撤销成本极高

（7）**prompt 也没「追问 / 增量」模式**
- inspiration.reverse 只产出一次完整结果，没提供「基于当前结果追加 3 个角色」这种递进调用

**建议修复路线**

| 序 | 改动 | 代价 | 收益 |
|---|---|---|---|
| 1 | localStorage 加 history[] 保存最近 N 次反推快照（user 可在 UI 上切回旧版） | 小 | 防手抖 |
| 2 | 采纳按钮旁边加「撤销」/「重新生成此段」入口；撤销时按 findExisting 查到的原值回填 | 中 | 治标 |
| 3 | 在已采纳 section 下方加「再生成 N 个次要角色 / 再补充关系」按钮，调增量 prompt（prompt 注册表新增 inspiration.reverse.extend） | 中 | 串起全流程 |
| 4 | section 内每个字段加单字段级「重生成」入口（基于上下文约束） | 中 | 粒度细化 |
| 5 | 在 inspiration.reverse 系统 prompt 加「userMessage 历史摘要」上下文，让 AI 输出与已采纳结果一致 | 中 | 避免重生成产生冲突 |
| 6 | 多世界版采纳前先在 UI 上显示 dry-run 预览（哪些世界组 / 角色会被创建 / merge） | 小 | 防多世界误操作 |

**短期推荐**：1+3 两步——历史快照 + 增量入口。这两个都是纯新增 UI，零破坏性。

---

### 横向洞察（两个问题之外的工程化发散）

- **本项目 adopt() 抽象其实已经做对了**（identity-based upsert + duplicatePolicy），**问题不在抽象层，而是 UI 没有暴露这个能力**——这是本项目最反复出现的 pattern：「底层能力已具备，UI 没串起来」
- **AI 提取类功能（relation.extract / inspiration.reverse / character.supplement）的统一缺口**：UI 都没有「显示 AI 提示词 + 手动 override + 重跑」的标准化流程，每次都是 AI 黑盒 → 用户被动接受
- **数据冗余 vs 视觉冗余**：「钢丝球」**同时是数据冗余（同 pair 多条记录）和视觉冗余（processLinks 不去重）**——两层独立但协同放大问题，单修一层不够
- **「isBidirectional 是布尔」是本项目特有的历史包袱**：早期建模时为简化（双向/单向只画箭头差异），没考虑「敌人/上下级是有向」语义——schema 升级（v7+）值得做但破坏性大
- **本对话的本地 Gemini ID**（用于未来追问）：
  - 4fac77e442b01914 项目技术债清理与重构建议
  - 33ae16915f8d8e3c fit 算法 + safe insets
  - 双链图建模 / 增量反推 prompt 模式可在这两个对话里追问

## 2026-07-20 调研汇总：github + gemini 联合调研结论

### 0. 调研方法
- **github 远端**（yuanbw/main 只读 fetch）：抓最新代码对比本地，看原作者是否已解决这两个问题
- **github 公开项目**（Gemini 推荐 + 自己搜）：找 6 个候选项目验证存在性 + 读 schema
- **Gemini 技术对话**（新建 ID 05393da9aa01f91c 主题"数据建模与流程优化"）：
  - 第一轮：4 个 yes/no 问题（最小破坏路径 + SNA 视角 + schema 拆分 + prompt 改写 + 4 个流程问题）
  - 第二轮：找"武功秘籍"（开源项目 star 数 + schema + 借鉴路线图）

### 1. 远端 yuanbw/main 对照（结论：未解决）

| 模块 | 本地 zamelee | yuanbw/main | 差异 |
|---|---|---|---|
| CharacterRelation schema | isBidirectional boolean | isBidirectional boolean | 完全一致 |
| useCharacterRelationStore.addRelation | 裸 add 无 dedup | 裸 add 无 dedup | 完全一致 |
| matchRelations dedup key | min-max-type | min-max-type | 完全一致 |
| InspirationPanel 采纳/扩充入口 | 仅 5 个 handleAdopt* | 仅 5 个 handleAdopt* | 完全一致 |
| localStorage 反推快照 | 单 result + adoptedSections | 单 result + adoptedSections | 完全一致 |

远端 yuanbw 在这两个长尾问题上跟 zamelee 是同一套代码。没有可直接 cherry-pick 的修复。

yuanbw 最近的相关提交是 ee68677 fix(relations): sync extracted relations to character cards (2026-07-13)，只解决"AI 提取的关系数据没传到角色卡"，跟我们的"钢丝球/采纳后扩充"是两个问题。

### 2. Gemini 推荐的开源项目 + 实际验证

| # | 项目 | Gemini 推荐描述 | 实际验证 | 可借鉴度 |
|---|---|---|---|---|
| 1 | relation-graph/relation-graph | 2265 star JS，专门 React/Vue/Svelte 关系图组件 | 真（2265 star, JS, MIT, 最近更新 2026-07-20）。docs/data-line 真实 schema: { id, from: required, to: required, text, type, data: Record<string, any>, lineShape: RGLineShape, ... } —— 强制 directed，没有 isBidirectional boolean 字段！业务扩展全塞 data: Record<string,any> | ★★★★★ 强推（直接对标 schema 改造） |
| 2 | andreafeccomandi/bibisco | 761 star JS，开源小说软件 | 真（761 star, Angular 1.x + LokiJS, 103 issues open）。bibisco/app/services/RelationsService.js 真实架构：getRelationsNodes + getRelationsEdges 两个 collection，updateRelations 是"delete 整个 collection + 重新 insert 全部"。graph-native nodes/edges 分离 + 原子重建模式 | ★★★★ 推荐（架构借鉴） |
| 3 | langchain-ai/open-canvas | 5.5k star TS，artifact versioning | 真（5.5k star, TS, 已 archived）。真实 schema (packages/shared/src/types.ts): ArtifactV3 { currentIndex: number; contents: ArtifactMarkdownV3[] }，每个版本是 { index, title, fullMarkdown }。header/index.tsx 真实 props：setSelectedArtifact(index) + totalArtifactVersions + prev/next 按钮。线性历史 + currentIndex 导航模式 | ★★★★★ 强推（采纳历史快照直接借鉴） |
| 4 | stanford-oval/storm | 30k star Python，STORM knowledge curation | 真（30k star, Python，前端是 Streamlit，不是 React）。无法直接借鉴前端代码；但 staging area / outline preview → 用户 confirm → 写入 的学术范式可参考 | ★★ 仅参考学术流程，前端栈不符 |
| 5 | sandialabs/talkpipe-writing-assistant | 6 star Python | 真（6 star, Python, Sandia 国家实验室）。仅 6 star，太冷门 | × 不推荐借鉴 |
| 6 | dbamman/characterRelations | 学术界 character relation annotation | HEAD 200，但 API timeout，未能验证 schema。从名字 + Gemini 描述看是学术标注数据集（dyadId/characterA/characterB/coarseCategory/fineCategory/affinity/isDirectional 6 字段），不是工程化项目 | × 不推荐借鉴（纯学术） |

### 3. Gemini 第一轮答案的工程提炼

#### Q1a. 4 步短期路线是否最小破坏？
- Gemini：Yes + 简化版"保留第一条一键清空其余"可省 80% UI 工作
- 我们采纳：保留 4 步路线（已在 handoff §A 确认），但第 1 步可以做"一键去重"作为快速胜利

#### Q1b. 是否弃用 isBidirectional boolean，改 directed edges？
- Gemini：Yes（SNA 视角：一律 directed，UI 根据 type 自适应画箭头）
- 我们采纳：部分采纳。完整 schema 升级破坏性大，但可以：
  - 短期保留 isBidirectional 但 UI 渲染时改用 isDirectedType(type) 映射表
  - 长期（v7+）彻底 schema 升级：isBidirectional 字段废弃

#### Q1c. RelationType 拆 symmetric / directed 两组？
- Gemini：Yes（migration 零破坏）
- 拆分方案采纳：
  - SymmetricRelationType: family / lover / friend / ally / other
  - DirectedRelationType: rival / enemy / master / student / subordinate
- 这是最小代价根治，从 Gemini 的 schema 拆分看，不会破坏 AI 提取（AI 仍按原 type 输出，前端 UI 渲染时分流）

#### Q1d. AI prompt 怎么阻止 A→B 敌人 + B→A 敌人？
- Gemini：prompt 加"互斥与归一化"声明 + 前端防呆兜底
- 我们采纳：在 relation.extract systemPrompt 加约束：对于具有方向性的关系（enemy/rival/master/student/subordinate），若 A 对 B 存在 [type]，只需输出一条 A->B；严禁为了对称而补充输出 B->A，除非双方确有独立的、非因果关联的动机。

#### Q2a. UX 写作/AI 软件的标准范式？
- Gemini：Sudowrite / NovelAI 的 Cards Drawer + Notion AI 的"插入下方 / 替换 / 独立侧边栏"三选一
- 我们采纳：Sudowrite 模式更对路（我们已经有"采纳"流程，只是缺"分步确认"抽屉感）

#### Q2b. "采纳后修改" vs "重新生成" 的心理预期？
- Gemini：本质区别是用户心理契约（"这是我的资产" vs "推倒重来"）
- 我们采纳：两套入口并列——"编辑"按钮（在已采纳区域就地修改）+ "再生成 N 个"按钮（在 inspiration 区域触发 AI 重跑）

#### Q2c. 多世界版"一次性创建一堆"是反模式吗？
- Gemini：Yes，建议"两阶段确认"（预览态 + 勾选落地）
- 我们采纳：短期不重构多世界版，但 handleAdoptMultiWorld 加 dry-run 预览

#### Q2d. 增量模式 prompt 怎么避免与已采纳冲突？
- Gemini：State Injection（在 prompt 头部注入 existing_context: { world_name, accepted_characters, rule }）
- 我们采纳：在 inspiration.reverse.extend 新 prompt 模板中加 existing_context 段

### 4. 横向洞察（最终结论）

从开源项目借鉴的 3 个最值得借鉴的模式：

1. **relation-graph 模式**：directed edges + 业务扩展塞 data bucket
   - 适用：关系网 schema 重构（短期保留兼容，长期弃用 isBidirectional）
   - 文件参考：https://raw.githubusercontent.com/relation-graph/relation-graph/main/README.md + docs/data-line

2. **bibisco 模式**：nodes + edges 分离 collection + atomic rebuild
   - 适用：关系去重 UI 的"一键清空"功能（重建 collection 时 in-memory dedup）
   - 文件参考：https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/RelationsService.js

3. **open-canvas 模式**：ArtifactV3 { currentIndex, contents[] } 线性历史 + prev/next 导航
   - 适用：灵感反推 history[] 多版本快照 + currentIndex 切换
   - 文件参考：https://raw.githubusercontent.com/langchain-ai/open-canvas/main/packages/shared/src/types.ts

### 5. 修正后的修复路线（v2.0）

#### 关系网（钢丝球）
1. 【短期，零破坏】dedup 工具：复用 bibisco 模式，UI 加"一键去重"按钮（in-memory 重建），加 mergePair UI
2. 【短期，零破坏】addRelation upsert：先查 (projectId, fromId, toId, type) 存在则 update
3. 【短期，零破坏】handleAcceptExtracted 强制跳过 isDuplicate=true
4. 【短期，零破坏】processLinks 渲染前 dedup（同 from→to 保留 bi=true + 最新一条）
5. 【短期，零破坏】UI 渲染时改用 isDirectedType 映射表（取代 isBidirectional 控制箭头）—— relation-graph 模式
6. 【短期，零破坏】prompt 改造：加"有向类型不输出反向"约束
7. 【长期 v7+，破坏性】schema 升级：isBidirectional 字段废弃，RelationType 拆 symmetric/directed 两组（migration 零破坏，按 type 自动归类）

#### 灵感反推（采纳后扩充）
1. 【短期，零破坏】反推 history[] 多版本快照 + currentIndex 导航（采纳 + 反悔切换）—— open-canvas 模式
2. 【短期，零破坏】已采纳 section 加"再生成 N 个次要角色"按钮，调用新增 prompt inspiration.reverse.extend，prompt 头部注入 existing_context State Injection
3. 【短期，零破坏】已采纳字段加"重生成"入口（基于上下文约束）
4. 【短期，零破坏】handleAdoptMultiWorld 加 dry-run 预览（哪些世界组会被创建/merge）

### 6. 调研留痕

- Gemini 对话 ID（新建）：05393da9aa01f91c — 已登记到 docs/ai-conversations.md
- Gemini 验证方式：6 个项目用 GitHub API HEAD + GET 验证存在 + stars；其中 relation-graph/relation-graph 和 langchain-ai/open-canvas 进一步读了源码 schema；bibisco 读了 RelationsService.js
- yuanbw 验证方式（只读）：git fetch yuanbw --depth=200 + git show yuanbw/main:<path> 对比本地
- 未发现的盲点：gemini 推荐的 dbamman/characterRelations 是学术数据集而非项目（API timeout）；stanford-oval/storm 前端是 Python Streamlit 不能直接借鉴前端代码（但学术流程可参考）


### 7. 路线图 SVG 索引（10 张）

> 输出目录：`docs/assets/v2-roadmap/`
> 风格：baoyu-diagram 深色主题 + JetBrains Mono（Google Fonts @import）
> 浏览器打开：file:// 直接渲染（注意 file:// 跨域 @import 可能拿不到字体，但从 vite dev 999 加载则正常）

| # | 文件 | 主题 | 内容要点 |
|---|------|------|----------|
| 01 | `01-terminology.svg` | 术语对照 | 8 个核心术语通俗+专业双解释（symmetric/directed/bidirectional/dedup/upsert/history snapshot/state injection/cards drawer） |
| 02 | `02-status-quo.svg` | 现状痛点 | 「关系网像钢丝球」6 层根因鱼骨图（pair 重复 / id 不同 / isDuplicate 漏判 / 渲染合一线 / 无回退 / prompt 不约束） |
| 03 | `03-schema-comparison.svg` | Schema 对比 | 我们 isBidirectional 字段 vs relation-graph 2265★ line schema（无 isBidirectional 字段，类型本身定方向） |
| 04 | `04-bibisco-atomic-rebuild.svg` | 时序图 | bibisco 761★ RelationsService.js 时序：deleteCollection → in-memory dedup → bulkAdd → saveDatabase |
| 05 | `05-open-canvas-history.svg` | 状态机 | open-canvas 5.5k★ ArtifactV3 多版本快照（currentIndex 切换 + prev/next 按钮 + Undo/Redo 语义） |
| 06 | `06-state-injection.svg` | Prompt 流程 | ❌ 一次性全量 vs ✅ existing_context 注入 + 增量生成（LLM 重复率从 40% → <5%） |
| 07 | `07-sudowrite-cards.svg` | 范式对比 | Sudowrite / NovelAI Cards Drawer 颗粒度对比（一键采纳 vs N 选 N） |
| 08 | `08-fix-roadmap.svg` | Gantt | 短期 v2.0（7 项 5.5 人天）+ 长期 v7+（4 项 schema 升级）时间线 |
| 09 | `09-decision-matrix.svg` | 决策卡 | 一页纸 7 项改动表（问题/短期/长期/借鉴/ROI） |
| 10 | `10-engineering-expectations.svg` | **工程化预期** | **8 列总表（改动项/工作量/风险/影响/回归点/依赖/优先级/回滚） + 「先停下」信号** |

#### 关键引用（建议 handoff 阅读路径）

- 讨论起点 → 读 **02 现状痛点** + **09 决策卡**（先搞清楚问题与方案再动手）
- 动手前 → 读 **10 工程化预期**（人天 / 风险 / 回归点 / 回滚预案）
- 借鉴细节 → 读 **03 schema 对比** + **04 bibisco 时序** + **05 open-canvas 状态机**
- 收尾验收 → 对照 **10 表格的「回归测试点」列** + **08 Gantt 的 v2.0 交付点**
