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
