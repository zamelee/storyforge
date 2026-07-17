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
