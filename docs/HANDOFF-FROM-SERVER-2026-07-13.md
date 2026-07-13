# HANDOFF — 纯前端项目同步建议(来自 Server 项目,2026-07-13)

> **适用对象**:后续接手 StoryForge 纯前端项目的 AI 会话
> **项目根**:`D:\Documents\VibeCoding\storyforge`(注意:不是 `storyforge-server`)
> **撰写者**:Codex 在 `D:\Documents\VibeCoding\storyforge-server` 会话里为你准备
> **写作日期**:2026-07-13
> **背景**:用户要求拉起纯前端与 server 项目做功能对比,发现几个关键差异

---

## TL;DR

本项目(`D:\Documents\VibeCoding\storyforge`)目前落后 upstream/zamelee **15 个 commit**(含 R-19 / R-20 / R-22 / R-23),**R-23 /models 自动拉取完全缺失**,以及 README 与 git remote 不一致。

**最关键差异**:设置页的模型输入控件是纯 `textbox`(特别是 Ollama 模式),用户必须手动输入模型名(如 `qwen2.5:7b`),而 Server 项目已集成 `🔄 拉取按钮` + `▼ datalist` + `❌ 报错` 机制。

---

## 一、对比实验记录

### 1.1 环境

- Server: `D:\Documents\VibeCoding\storyforge-server`,launcher.py 拉起 · `localhost:1111`
- 纯前端: `D:\Documents\VibeCoding\storyforge`,本次启动 `npm run dev -- --port 2222 --no-open`
- 两者同时跳在一台机器上,互不干扰
- 本次启动不需要动手检查部分 vite 主动跳转(launcher.py 的 `server.open:false` 、本项目 `open: '/storyforge/'` 要 `--no-open` 覆盖)

### 1.2 设置 → AI 模型配置 页面

Server(`localhost:1111/storyforge/settings`):
- 提供商下拉 + API Key + Base URL + `🔄` 拉取按钮 + `▼` · `combobox`(可输入可选择)
- 拉取失败时显示 `❌ 拉取失败: HTTP 401`(说明真的调过 `{baseUrl}/models`)
- Ollama 模式也有 `🔄` + `▼`(当前 Ollama 服务 DOWN,拉取失败但 UI 还是能展示)

本项目(`localhost:2222/storyforge/settings`):
- 提供商下拉 + API Key + Base URL + **纯文本框 / 选下拉**(没有刷新按钮)
- Ollama 模式仅纯文本框,默认填了 `qwen2.5:7b`。用户只能手动输入模型名
- 不会去调服务端 `/models` 接口

**结论**:本项目缺失 R-23 集成。

---

## 二、本项目 git 状态

```
origin   = https://github.com/zamelee/storyforge.git
upstream = https://github.com/zamelee/storyforge.git
HEAD     = c0e4c21 (local latest: "fix: 修复大纲点击报错 Cannot read properties of undefined (reading 'trim')")
upstream/main 比 HEAD 领先 15 个 commits:
  5a39e83 docs(R-22): add R-22 character-binding refactor record + user-facing summary
  b47cca1 fix(outline): bind chapter/detail/batch-detail to assembled characters segment (R-22)
  7612ef4 fix(preset): datalist show-all + keep current model on /models refresh (R-23.1)
  b89a201 feat(preset): new-preset dialog + /models cache + R-23 tests (R-23)
  14a8688 fix(preset): improve warning row contrast (R-22.1)
  e795228 feat(preset): smart binding + reset + lastSelectedPresetId (R-22)
  e361eb9 fix(debug): LLM monitor — split fetch-installed flag from install flag (R-21.1)
  ea77d2b feat(debug): add LLM monitor probe (R-21) — floating panel + fetch interceptor + 5min idle clear
  f58f91f Merge branch 'refactor/phase-1-task-outline-character-binding' — bind outline/story-arc prompts to project character library
  c6906d2 fix(story-arc): bind story-arc prompt to project character library (R-20)
  1fa8c92 fix(assemble-context): protect CORE sources from trim removal (R-19)
  4f043db chore(boot): expose window.__assembleContext at app boot in dev
  7e65303 fix(outline): bind volume/chapter user prompts to project character library
  d14aad0 chore: ignore .tmp/ scratch dir
  9214e83 fix(inspiration-reverse): parse resilience for fence / prose / unclosed + bare quotes in string values
```

⚠ **README 与 git remote 不一致**:`README.md` 写的是 `https://github.com/yuanbw2025/storyforge`,但 `git remote` 是 `https://github.com/zamelee/storyforge.git`。两个都可能是同一个 repo(转让 / 重命名),但以 git remote 为准。

---

## 三、关键问题 · R-23 /models 自动拉取缺失

### 3.1 Server 项目怎么做的(可复用)

| 文件 | 说明 |
|---|---|
| `src/lib/ai/llm-model-cache.ts` | R-23 核心:LLM 模型列表缓存 + `/models` 拉取 · 域名提取 + OpenAI 兼容协议解析 |
| `src/lib/registry/project-tables.ts` | 增加 `llmModelCache` 表 · 主键 = `provider::baseUrl` · 用户级不导出 |
| `src/components/settings/AIConfigPanel.tsx` | 加 `{REFRESH}` 拉取按钮 + `{TRI_DOWN}` datalist · 提供商 / baseUrl 变化时先读缓存 · miss 才调 `/models` |
| `src/lib/types/ai.ts` | 保留硬编码 `PROVIDER_MODELS`(作为默认 list) |

### 3.2 迁移到本项目的差异

| 项目 | Server | 本项目(本地) |
|---|---|---|
| 是否有 `/models` 拉取 | ✅ | ❌ |
| 是否有 llmModelCache | ✅(跨 session 缓存) | ❌ |
| Ollama 模式 UI | `🔄` + `▼` + datalist | 纯 `textbox`, 默认 `qwen2.5:7b` |
| 失败反馈 | 显示错误下可手动输入 | 无拉取与无报错 |

### 3.3 迁移方案

有三个可行路径:

**路径 A(推荐)· cherry-pick upstream 的 R-23 commits**:

```bash
git fetch upstream
git log upstream/main --oneline | grep -i 'R-23'
# 预计有这几个:
#   b89a201 feat(preset): new-preset dialog + /models cache + R-23 tests (R-23)
#   7612ef4 fix(preset): datalist show-all + keep current model on /models refresh (R-23.1)
#
# cherry-pick 这几个提交,冲突中选择 ours
git cherry-pick b89a201 7612ef4
```

这个路径是同源的、是 upstream 已经过测试的代码。但需要你梳理 R-23 本身的 R-22 / R-21 / R-20 / R-19 依赖。

**路径 B · 复用 Server 项目的 3 个文件**:

从 `D:\Documents\VibeCoding\storyforge-server` 拿到:
- `src/lib/ai/llm-model-cache.ts`
- `src/lib/registry/project-tables.ts` 里的 llmModelCache 表声明
- `src/components/settings/AIConfigPanel.tsx` 的拉取/缓存 UI 逻辑

调用接口是同一个,Dexie 表也是同一个。

**路径 C · 等上游 merge 后再接叧**:

你可以先 merge 整个 upstream/main(要看冲突),R-23 会跟着一起过来。

---

## 四、其他差异点

### 4.1 README GitHub URL

`README.md` 的 GitHub 链接写的是 `https://github.com/yuanbw2025/storyforge`,但 git remote 是 `zamelee/storyforge`。两个都可能是同一个 repo(转让 / 重命名),但以 git remote 为准。需要确认:
- 如果 zamelee 是准:修改 README.md 的链接(不然用户会被引到错误的 repo)
- 如果 yuanbw2025 是准:修改 git remote 地址

### 4.2 vite.config.ts 主动弹窗口

本项目 `vite.config.ts` 的 `open: '/storyforge/'` 会在启动时自动跳窗口。用户硬约束"不要自动开浏览器"。建议改为 `server: { open: false }`(和 server 项目一致)。

### 4.3 vite 默认端口

本项目 vite 默认 1111,和 server 项目冲突。合并 upstream 后也会冲突。需要考虑默认端口是否需要改。

---

## 五、推荐同步顺序

1. **验证状态**:
```bash
cd D:\Documents\VibeCoding\storyforge
git fetch upstream
git log HEAD..upstream/main --oneline
# 确认是否还是 15 个 commits 的差距
```

2. **同步 R-23(最高价值)**:
```bash
# 路径 A · cherry-pick(需对 R-23 commit 调整依赖)
git cherry-pick b89a201 7612ef4

# 或者路径 B · 复用 server 项目代码(需手动调整)
# 从 D:\Documents\VibeCoding\storyforge-server 复制这三个文件:
# 复制这三个文件:
#   src/lib/ai/llm-model-cache.ts
#   src/lib/registry/project-tables.ts(llmModelCache 表声明)
#   src/components/settings/AIConfigPanel.tsx(拉取/缓存 UI)
```

3. **小修改**(可同时做):
- ✓ 修 `README.md` GitHub URL(确认是 zamelee 还是 yuanbw2025)
- ✓ `vite.config.ts` 的 `open: '/storyforge/'` 改为 `server: { open: false }`
- ✓ 考虑默认端口 1111 是否改为其他(避免和 server 项目冲突)

4. **验证**:
```bash
npm run dev -- --port 2222 --no-open
# 设置页 -> Ollama 模式 -> 应该能看到 拉取按钮
# (Ollama DOWN 时 会报错 但 UI 完整)
```

---

## 六、作者后续会记录什么(给本项目会话看)

- 2026-07-13:server 项目 PR 2 commit + push(等用户拍板)
- 2026-07-13:服务器项目清理 tmp/ · 删测试项目 · gitignore 截图
- 接下来:PR 3(剩余 enum 类型化)
- 后期:child entity id 完整迁移(本项目不需要,本项目是纯 IndexedDB)
- 本项目如果同步 R-23 后,可以反过来给 server 项目复用你们的代码

---

## 七、跨项目资产

- Server 项目 HANDOFF:`D:\Documents\VibeCoding\storyforge-server\docs\HANDOFF-PR2-DONE-2026-07-13.md`
- 本项目 HANDOFF:本文件(`D:\Documents\VibeCoding\storyforge\docs\HANDOFF-FROM-SERVER-2026-07-13.md`)

两份文档可以互补。

---

## 八、用户硬约束(依然适用)

| 约束 | 处理 |
|---|---|
| 中文交流 + 中文代码注释 | ✅ |
| 不自动开浏览器 | ✅(launcher 不动, vite 也要 `--no-open`) |
| PowerShell 不处理字符串 | ✅ |
| 文件编码保持原状 | ✅ |
| 改 source 文件前备份 | ✅(`tmp/code-backups/` 或其他) |
| 不覆盖用户已有文件 | ✅(写 HANDOFF 前 `git log -- <file>`) |


---

## 二、yuanbw/main 合并分析（2026-07-13）

### 2.1 三端关系

| 端 | HEAD | 版本 | 相对关系 |
|----|------|------|---------|
| 本地 / zamelee/main | d284fb | v3.6.0 | 同步 |
| yuanbw/main（原作者） | 54d57e2 | v3.7.5 | 领先 196 commits，落后本地 16 commits |

**关键发现**：yuanbw 的 16 个"落后"commits（R-19~R-23）**从未合并进 yuanbw/main**——它们存在于本地/我们的 origin，但不在 yuanbw/main。这是平行演进的两个分支。

### 2.2 本地 16 个独有关键 commits（yuanbw 没有）

| Commit | 描述 |
|--------|------|
| 9214e83 | fix(inspiration-reverse): 解析健壮化 |
| d14aad0 | chore: ignore .tmp/ |
| 7e65303 | fix(outline): 卷/章纲关联角色库 |
| 4f043db | chore(boot): 暴露 window.__assembleContext |
| 1fa8c92 | fix(assemble-context): 保护 CORE 源不被 trim 移除（R-19） |
| c6906d2 | fix(story-arc): 故事弧关联角色库（R-20） |
| a77d2b | feat(debug): LLM Monitor 浮窗（R-21） |
| 361eb9 | fix(debug): fetch interceptor 分离（R-21.1） |
| 795228 | feat(preset): 智能关联 + reset + lastSelectedPresetId（R-22） |
| 89a201 | feat(preset): new-preset 对话框 + /models 缓存（R-23） |
| 7612ef4 | fix(preset): datalist show-all（R-23.1） |
| 47cca1 | fix(outline): 章纲/细纲/批量关联角色（R-22） |
| 5a39e83 | docs(R-22): R-22 记录 |
| c0e4c21 | fix(outline): summary.trim() 补丁 |

### 2.3 yuanbw 196 个新 commits——核心功能（本地缺失）

| 功能 | 描述 | 对后端影响 |
|------|------|----------|
| **23维度角色** | identity/fears/values/innerConflict/powerLevel/speechStyle/habits/signatureItem 等 | schema Character 表需扩充 |
| **NS-4 事实账本** | TemporalFact 类型 + act-ledger 模块 + 候选/确认/否决状态机 | schema 需新增表 |
| **NS-5 叙事摘要** | NarrativeSummary（章→卷→全书派生缓存） | schema 需新增表 |
| **导入去重** | d06296c | schema 需 ImportSession 表 |
| **大纲 summary 修复** | 170199c — defaults 注册表机制（优于我们的 summary?.trim()） | 取 yuanbw |

### 2.4 合并冲突清单（试合并结果）

**仅 11 个文件有真实冲突**（可接受）：

| 文件 | 冲突本质 | 建议策略 |
|------|---------|---------|
| src/lib/db/schema.ts | 我们的 llmModelCache（R-23）vs yuanbw schema | 取我们 |
| src/stores/ai-config.ts | R-22/R-23 preset 智能关联 vs yuanbw | 取我们 |
| src/main.tsx | LLM Monitor 安装 vs yuanbw | 需手动二选一 |
| src/lib/registry/context-sources.ts | R-19 CORE 保护 vs yuanbw context 重构 | 需手动合并 |
| src/lib/ai/inspiration-reverse.ts | 我们的健壮化 vs yuanbw | 取我们 |
| src/components/settings/AIConfigPanel.tsx | preset UI vs yuanbw | 取我们 |
| CHANGELOG.md | 日志追加 | 取 yuanbw |
| .gitignore | 追加忽略项 | 合并两者 |
| docs/AI-FUNCTIONS-MANUAL.generated.md | 生成文档 | 取 yuanbw |
| 	ests/registry/project-tables.test.ts | 测试用例差异 | 需手动合并 |
| 	ests/regression/R-17-ensure-schema.test.ts | 测试用例差异 | 需手动合并 |

**大量文件是 AD（yuanbw 新增/我们删除）**——yuanbw 归档了大量旧文档，同时新增了 feature-guide 图片资源、COLLAB-LOG 等。

### 2.5 合并策略建议

**推荐方案：Rebase 而非 Merge**

`powershell
# 1. 从 origin/main 起新分支
git checkout -b merge-yuanbw-v375 origin/main

# 2. 把本地 16 个 commits rebase 到 yuanbw/main 之上
git rebase --onto yuanbw/main fd284fb^ fd284fb
`

这样 yuanbw 的 196 个新 commit 作为新基础，本地 16 个 commits 叠在上面。
冲突只出现在 rebased 的 16 个 commits 范围内。

**最重要的 2 个手动决策**：
1. src/main.tsx — 我们的 LLM Monitor vs yuanbw，只能留一个
2. src/lib/registry/context-sources.ts — R-19 vs yuanbw context 重构

### 2.6 storyforge-server 后端影响

yuanbw 的 196 个新 commit 中，以下必须同步到 ackend/prisma/schema.prisma：
- Character 表：新增 15+ 字段
- 新建 TemporalFact 表（含状态机）
- 新建 NarrativeSummary 表
- 新建 ImportSession 表

---

*更新于 2026-07-13：加入 yuanbw/main 对比分析 + 合并冲突清单*

---

## 三、合并执行计划（已确认，2026-07-13）

> **约束**：遵守 AGENTS.md —— 不直接 push main，所有改动走分支 merge-yuanbw-v375，验证步骤必跑。

### 3.1 最终确认的合并策略

#### 冲突 A：src/main.tsx

| 模块 | 决策 |
|------|------|
| LLM Monitor import | **保留我们的**（import './lib/debug/install'） |
| DEV assemble-context 预加载 | **保留我们的**（if (import.meta.env.DEV) void import(...)） |
| 主题迁移 | **取 yuanbw**（esolveStoryForgeTheme + pplyStoryForgeTheme 更完整） |
| 持久化存储（FB-11） | yuanbw 已有，等效，合并 |
| 注册表校验 | yuanbw 已有，等效，合并 |

#### 冲突 B：src/lib/registry/assemble-context.ts trimToFit

**合并策略**：取我们 R-19 的 CORE_SOURCE_KEYS 截短逻辑 + 把 yuanbw 的 protectedFromTrim 字段也合并进来。

最终行为：
- 以 R-19 为主（更保守，保护 worldview/characters 等关键源不被整段删掉）
- 同时采纳 protectedFromTrim 字段机制（兼容性更好）
- yuanbw 的 chapterOutline 等 protectedFromTrim: true 源也一并保护

#### 11 个冲突文件的统一策略

| 文件 | 策略 |
|------|------|
| src/lib/db/schema.ts | 取我们的（R-23 llmModelCache 特性需保留） |
| src/stores/ai-config.ts | 取我们的（R-22/R-23 preset 智能关联） |
| src/main.tsx | 混合（见上表） |
| src/lib/registry/assemble-context.ts | 合并（见上） |
| src/components/settings/AIConfigPanel.tsx | 取我们的（R-23 preset UI） |
| src/lib/ai/inspiration-reverse.ts | 取我们的（健壮化） |
| CHANGELOG.md | 取 yuanbw（更新到 v3.7.5） |
| .gitignore | 合并两者（都有的不重复） |
| docs/AI-FUNCTIONS-MANUAL.generated.md | 取 yuanbw（自动生成） |
| 	ests/registry/project-tables.test.ts | 手工合并（测试用例都有价值） |
| 	ests/regression/R-17-ensure-schema.test.ts | 手工合并 |

#### 非冲突文件采纳策略

- **23 维度角色字段**：直接采纳（只增不减）
- **NS-4 事实账本**：采纳整个 acts/ 模块（如果用户需要此功能）
- **NS-5 叙事摘要**：采纳（如果用户需要此功能）
- **defaults 注册表机制**（170199c）：采纳（根治大纲 summary undefined）
- **yuanbw 的 LLM Monitor**：放弃（保留我们的 R-21）
- **导入去重**（d06296c）：采纳

### 3.2 执行步骤

`
1. git checkout -b merge-yuanbw-v375 origin/main
2. git rebase --onto yuanbw/main fd284fb^ fd284fb
3. 解决 11 个冲突文件（按上表策略）
4. git rebase --continue
5. 运行测试：npm test
6. 浏览器人工验证（启动 dev server）
7. 确认无崩溃后：git checkout main && git merge merge-yuanbw-v375 && git push origin main
`

### 3.3 待确认

- [ ] NS-4 事实账本是否采纳整套？（用户未明确，按需决定）
- [ ] NS-5 叙事摘要是否采纳？（同上）
- [ ] yuanbw 的 LLM Monitor 思路（b80606 LongCat provider）是否需要？

*确认后更新本节*

---

## 三、合并执行计划（已确认，2026-07-13）

> 目标：将 yuanbw/main（v3.7.5）合入本地分支，保留本地 16 个独有关键 commits。
> 分支策略：Rebase 而非 Merge，避免环形依赖。
> 操作目录：D:\Documents\VibeCoding\storyforge

### 3.1 前置准备

**步骤 0：确认 backup 根**

根据 AGENTS.md §7，代码修改前需创建备份目录：

`powershell
# backup 根： D:\Documents\VibeCoding\storyforge\tmp\code-backups\
New-Item -ItemType Directory -Path "D:\Documents\VibeCoding\storyforge\tmp\code-backups" -Force
`

**步骤 1：确认当前状态**

`powershell
cd D:\Documents\VibeCoding\storyforge
git log -1 --format="%h %s"   # 应为 fd284fb
git status --short
`

### 3.2 分支操作

**步骤 2：从 origin/main 起新分支（不污染 main）**

`powershell
git checkout -b merge-yuanbw-v375 origin/main
`

**步骤 3：执行 rebase**

`powershell
# 把本地 16 个 commits（c0e4c21~fd284fb）rebase 到 yuanbw/main 之上
git rebase --onto yuanbw/main fd284fb^ fd284fb
`

**预期**：冲突出现在 rebased 的 16 个 commits 范围内（11 个文件）。

### 3.3 冲突解决清单（已确认方案）

#### 冲突 1：src/main.tsx

**原则**：我们的 Monitor + DEV 预加载  + yuanbw 主题迁移/持久化/注册表校验 = 合并

**解决步骤**：
1. 取我们的 import './lib/debug/install' 和 DEV 预加载行
2. 取 yuanbw 的 esolveStoryForgeTheme / pplyStoryForgeTheme 主题迁移逻辑
3. 两者都有的 FB-11 / validateRegistry / schema check / prompt store / workflow store 取任一（两者等价）

#### 冲突 2：src/lib/registry/assemble-context.ts

**原则**：取我们的 R-19 CORE_SOURCE_KEYS 截短逻辑，把 yuanbw 的 protectedFromTrim 字段合并进来

**解决步骤**：
1. 保留 CORE_SOURCE_KEYS 常量 + 第二轮截短逻辑（我们的）
2. 把 yuanbw 的 protectedFromTrim?: boolean 字段合并进 ContextSource 接口（types.ts）
3. 在 ssemble-context.ts 中，把 yuanbw 有 protectedFromTrim: true 的源也加入 CORE_SOURCE_KEYS（handoffText/planReconciliationText/heldItems）
4. worldview 和 characters 在我们的版本里已由 CORE 保护；yuanbw 版本这两个源没有 protectedFromTrim，取我们的版本

#### 其余 9 个冲突文件

| 文件 | 策略 |
|------|------|
| .gitignore | 合并两者（追加） |
| CHANGELOG.md | 取 yuanbw（更新的日志） |
| docs/AI-FUNCTIONS-MANUAL.generated.md | 取 yuanbw（自动生成文档） |
| src/lib/ai/inspiration-reverse.ts | 取我们（健壮化解析功能互补可合并） |
| src/components/settings/AIConfigPanel.tsx | 取我们（R-22/R-23 preset UI） |
| src/lib/db/schema.ts | 取我们（R-23 llmModelCache 缓存表保留） |
| src/stores/ai-config.ts | 取我们（R-22/R-23 智能预设关联） |
| 	ests/registry/project-tables.test.ts | 手动合并（测试用例差异） |
| 	ests/regression/R-17-ensure-schema.test.ts | 手动合并（测试用例差异） |

### 3.4 合并后验证

`powershell
# 确认 rebase 成功
git log --oneline -5

# 安装依赖（yuanbw 可能改过 package.json）
npm install

# 运行测试
npm test -- --run

# 启动验证
npm run dev -- --port 2222 --no-open
`

### 3.5 确认合并完成

确认点：
- yuanbw/main 的 196 个新 commits 全部出现
- 本地 16 个 commits（c0e4c21~fd284fb）正确叠在之上
- src/lib/debug/install.ts 保留（我们的 LLM Monitor）
- src/lib/registry/assemble-context.ts 含 CORE_SOURCE_KEYS + 第二轮截短逻辑

### 3.6 注意事项

- **不 commit**：所有冲突解决后 git add . + git rebase --continue，不单独 commit
- **编码**：修改任何文件前用 Python 做字符串处理（AGENTS.md §6）
- **备份**：每次写源文件前在 	mp/code-backups/ 创建备份
- **tmp 文件**：临时脚本用 _ 前缀，结束后列出清理清单

---

*更新于 2026-07-13：合并执行计划（已与用户确认细节）*


---
## 本次修复记录 (2026-07-13)

### 合并状态
- **分支**: `test-merge-yuanbw` (跟踪 origin/main，合并自 yuanbw/main)
- **Commit 范围**: yuanbw/main..HEAD = 16 commits (R-19/R-20/R-21/R-22/R-23 全部在列)
- **上游 tip**: `54d57e2` (yuanbw/main v3.7.5)

### 修复的问题
1. **测试路径硬编码** (D:\AiSystem\storyforge\ → 动态路径):
   - `tests/regression/R-22-chapter-character-binding.test.ts`: 
     - 替换硬编码 → `resolve(dirname(fileURLToPath(import.meta.url)), '../../src/...')`
     - 添加 `import { fileURLToPath } from 'node:url'` 和 `import { dirname, resolve } from 'node:path'`
   - `tests/regression/R-23-llm-model-cache-preset.test.ts` (7 处): 同上模式
2. **AI Manual 过期**: `npm run gen:ai-manual` 重新生成
3. **依赖更新**: `npm install` (package-lock.json 更新)

### 测试结果
- `npm test -- --run`: **72 test files, 300 tests — 全部通过**
- `npm run dev -- --port 2222`: Vite 启动成功，响应正常

### 当前分支
- `test-merge-yuanbw` (已切换自 `merge-yuanbw-v375` 的错误 rebase 状态)
