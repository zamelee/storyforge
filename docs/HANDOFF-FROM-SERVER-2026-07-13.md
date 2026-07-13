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

