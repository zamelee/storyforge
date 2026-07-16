import { useState, useEffect, useSyncExternalStore, useRef } from 'react'
import { Wifi, WifiOff, Eye, EyeOff, CheckCircle, Trash2, ScrollText, Info, X } from 'lucide-react'
import { useAIConfigStore, type TestResult } from '../../stores/ai-config'
import { useLLMMonitorStore } from '../../lib/debug/store'
import type { AIProvider } from '../../lib/types'
import { PROVIDER_MODELS } from '../../lib/types'
import { getLogs, subscribeLogs, clearLogs, formatLog } from '../../lib/ai/logger'
import { loadModels, suggestPresetNameFromBaseUrl } from '../../lib/ai/llm-model-cache'
import { useDialog } from '../shared/Dialog'

const PROVIDER_OPTIONS: { value: AIProvider; label: string; cors: boolean; hint: string }[] = [
  { value: 'deepseek', label: 'DeepSeek', cors: false, hint: '获取 Key: platform.deepseek.com → API Keys（需点击下方「切换到本地代理」）' },
  { value: 'qwen', label: '通义千问', cors: true, hint: '获取 Key: dashscope.console.aliyun.com → API-KEY 管理' },
  { value: 'doubao', label: '豆包', cors: false, hint: '获取 Key: console.volcengine.com → 模型推理 → API Key（火山引擎不支持浏览器直连，需点击下方「切换到本地代理」）' },
  { value: 'minimax', label: 'MiniMax', cors: true, hint: '获取 Key: platform.minimaxi.com → API Keys' },
  { value: 'glm', label: '智谱 GLM', cors: true, hint: '获取 Key: open.bigmodel.cn → API Keys' },
  { value: 'wenxin', label: '文心一言', cors: true, hint: '获取 Key: console.bce.baidu.com → 千帆大模型 → API Key' },
  { value: 'gemini', label: 'Gemini', cors: true, hint: '获取 Key: aistudio.google.com → API Keys' },
  { value: 'poe', label: 'Poe', cors: true, hint: '获取 Key: poe.com → Settings → API → API Key' },
  { value: 'openai', label: 'OpenAI', cors: false, hint: '获取 Key: platform.openai.com → API Keys（需点击下方「切换到本地代理」）' },
  { value: 'kimi', label: 'Kimi', cors: false, hint: '获取 Key: platform.moonshot.cn → API Key 管理（需点击下方「切换到本地代理」）' },
  { value: 'claude', label: 'Claude', cors: false, hint: '获取 Key: console.anthropic.com → API Keys（需点击下方「切换到本地代理」）' },
  { value: 'nvidia', label: 'NVIDIA NIM', cors: false, hint: '获取 Key: build.nvidia.com → 登录后获取 API Key（需点击下方「切换到本地代理」）' },
  { value: 'modelscope', label: '魔搭社区', cors: true, hint: '获取 Key: modelscope.cn → 我的 → Access Token' },
  { value: 'agnes', label: 'Agnes AI（免费）', cors: true, hint: '清华系免费全模态 · 获取 Key: platform.agnes-ai.com（若连不上可点下方「切换到本地代理」）' },
  { value: 'ollama', label: 'Ollama (本地)', cors: true, hint: '本地运行 Ollama，无需 API Key' },
  { value: 'custom', label: '自定义', cors: true, hint: '填写任何兼容 OpenAI 格式的 API' },
]

const THEME_OPTIONS = [
  { value: 'forge',  label: '熔炉',   emoji: '🔥', desc: '暗夜琥珀 · 火光余烬', swatches: ['#1A0F0A', '#D97757', '#C8A155'] },
  { value: 'scroll', label: '古卷',   emoji: '📜', desc: '旧纸染黄 · 铁胆墨香', swatches: ['#E5D5A8', '#7B3A1A', '#8B5E1A'] },
  { value: 'paper',  label: '纸与墨', emoji: '🖊', desc: '素纸如雪 · 墨迹清朗', swatches: ['#FAF7F0', '#B85C3F', '#8A7E6A'] },
]

export default function AIConfigPanel() {
  const { config, setConfig, switchProvider, testConnection,
    rememberApiKey, setRememberApiKey,
    presets, activePresetId, lastSelectedPresetId, saveAsPreset, applyPreset, updatePresetFromCurrent, renamePreset, deletePreset, resetToLastSelectedPreset } = useAIConfigStore()
  const dialog = useDialog()
  const llmMonitorEnabled = useLLMMonitorStore((s) => s.enabled)
  const llmMonitorSetEnabled = useLLMMonitorStore((s) => s.setEnabled)
  const llmMonitorConfirmed = useLLMMonitorStore((s) => s.confirmed)
  const llmMonitorSetConfirmed = useLLMMonitorStore((s) => s.setConfirmed)
    const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [showMonitorConfirm, setShowMonitorConfirm] = useState(false)
  const [monitorKeepAlive, setMonitorKeepAlive] = useState(() => localStorage.getItem('sf_llm_monitor_keepalive') === 'true')
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  // R-23: 新建空白预设(B-1:从零建)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newPreset, setNewPreset] = useState({
    name: '',
    provider: 'custom' as import('../../lib/types').AIProvider,
    apiKey: '',
    model: '',
    baseUrl: 'https://',
    temperature: 0.7,
    maxTokens: 0,
  })
  // R-23: 模型选择 — datalist 列表 + 拉取/缓存
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsFromCache, setModelsFromCache] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const modelsCacheKey = useRef('')
  const modelInputRef = useRef<HTMLInputElement>(null)

  const handleSavePreset = () => {
    if (!presetName.trim()) return
    saveAsPreset(presetName.trim())
    setPresetName('')
    setSavingPreset(false)
  }

  // 点 "保存当前为预设" 时,默认填入 baseUrl 域名(可改)
  const openSavePreset = () => {
    const suggested = suggestPresetNameFromBaseUrl(config.baseUrl)
    setPresetName(suggested)
    setSavingPreset(true)
  }

  // 订阅日志变化
  const logs = useSyncExternalStore(subscribeLogs, getLogs)

  const currentTheme = localStorage.getItem('storyforge-theme') || 'forge'
  const currentProviderInfo = PROVIDER_OPTIONS.find((p) => p.value === config.provider)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection()
    setTestResult(result)
    setTesting(false)
  }

  const handleThemeChange = (theme: string) => {
    localStorage.setItem('storyforge-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    window.dispatchEvent(new Event('themechange'))
  }

  const handleRenamePreset = async (id: string, currentName: string) => {
    const name = await dialog.prompt({
      title: '重命名预设',
      defaultValue: currentName,
      placeholder: '输入新的预设名称',
    })
    if (name?.trim()) renamePreset(id, name.trim())
  }

  const handleDeletePreset = async (id: string, name: string) => {
    const ok = await dialog.confirm({
      title: `删除预设「${name}」？`,
      message: '此操作不可恢复。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (ok) deletePreset(id)
  }

  // 切换 provider 时清空测试结果
  useEffect(() => {
    setTestResult(null)
  }, [config.provider])

  // R-23: 拉取模型列表(provider + baseUrl 变化时,从 cache 读;miss 才调 /models)
  useEffect(() => {
    const key = `${config.provider}::${config.baseUrl}`
    if (key === modelsCacheKey.current) return
    modelsCacheKey.current = key
    setModels([])
    setModelsError(null)
    if (!config.baseUrl || !config.baseUrl.startsWith('http')) return
    setLoadingModels(true)
    void loadModels(config.provider, config.baseUrl, config.apiKey, false)
      .then(({ models, fromCache }) => {
        if (modelsCacheKey.current === key) {
          // B 方案:当前 model 不在列表里时加到首位,确保旧值仍可见可点回
          const cur = config.model
          const next = cur && !models.includes(cur) ? [cur, ...models] : models
          setModels(next)
          setModelsFromCache(fromCache)
        }
      })
      .catch((e: Error) => {
        if (modelsCacheKey.current === key) setModelsError(e.message)
      })
      .finally(() => {
        if (modelsCacheKey.current === key) setLoadingModels(false)
      })
  }, [config.provider, config.baseUrl, config.apiKey])

  // R-23: 用户主动点 🔄 强制刷新
  const handleRefreshModels = async () => {
    if (!config.baseUrl || !config.baseUrl.startsWith('http')) return
    const key = `${config.provider}::${config.baseUrl}`
    setLoadingModels(true)
    setModelsError(null)
    try {
      const { models } = await loadModels(config.provider, config.baseUrl, config.apiKey, true)
      if (modelsCacheKey.current === key) {
        setModels(models)
        setModelsFromCache(false)
      }
    } catch (e) {
      if (modelsCacheKey.current === key) setModelsError((e as Error).message)
    } finally {
      if (modelsCacheKey.current === key) setLoadingModels(false)
    }
  }

  // R-23: 临时清空 model 输入框,触发 datalist 显示全部 option(H5 datalist 在 input 有值时只过滤匹配)
  const handleShowAllModels = () => {
    if (modelInputRef.current) {
      modelInputRef.current.value = ''
      setConfig({ model: '' })
      modelInputRef.current.focus()
    }
  }

  // R-23: 保存新建预设(B-1:从零建,先把 newPreset 临时应用,saveAsPreset,再还原)
  const handleSaveNewPreset = () => {
    if (!newPreset.name.trim()) return
    const orig = { ...config }
    setConfig(newPreset)
    const id = saveAsPreset(newPreset.name.trim())
    setConfig(orig)
    setCreatingNew(false)
    setNewPreset({ name: '', provider: 'custom', apiKey: '', model: '', baseUrl: 'https://', temperature: 0.7, maxTokens: 0 })
    if (id) applyPreset(id)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-text-primary mb-6">设置</h2>

      {/* AI 配置 */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 mb-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">AI 模型配置</h3>
        <p className="text-[11px] text-text-muted mb-4 rounded-lg border border-border bg-bg-base px-3 py-2">
          API Key 默认仅保存在本次浏览器会话；勾选“记住在本机”才会写入 localStorage。发起 AI 生成、测试连接或使用自定义 baseUrl 时，相关提示词和上下文会发送到你配置的模型服务。
        </p>

        {/* ── API 配置预设（多套一键切换） ── */}
        <div className="mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-text-secondary">配置预设</label>
            {savingPreset ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingPreset(false) }}
                  placeholder="预设名称，如「DeepSeek 主力」"
                  className="px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent w-44"
                />
                <button onClick={handleSavePreset} className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover">保存</button>
                <button onClick={() => setSavingPreset(false)} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">取消</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={openSavePreset}
                  className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                >
                  ＋ 保存当前为预设
                </button>
                <button
                  onClick={() => setCreatingNew(true)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                >
                  ＋ 新建(空白)
                </button>
              </div>
            )}
          </div>

          {/* "已修改未关联" 提示行:activePresetId=null 时(改动后跟任何预设都不一致),提示用户保存 */}
          {activePresetId === null && lastSelectedPresetId && (
            <div className="mb-2 px-2 py-1.5 text-[11px] rounded border border-warning/30 bg-warning/15 text-warning flex items-center gap-2 flex-wrap">
              <span>⚠️ 已修改(未关联预设)</span>
              {presets.find(x => x.id === lastSelectedPresetId) && (
                <button
                  onClick={() => updatePresetFromCurrent(lastSelectedPresetId!)}
                  className="px-1.5 py-0.5 rounded bg-warning/20 hover:bg-warning/30 text-warning font-medium"
                  title={`保存到「${presets.find(x => x.id === lastSelectedPresetId)?.name}」`}
                >
                  💾 保存到「{presets.find(x => x.id === lastSelectedPresetId)?.name}」
                </button>
              )}
              <button
                onClick={() => setSavingPreset(true)}
                className="px-1.5 py-0.5 rounded bg-warning/20 hover:bg-warning/30 text-warning font-medium"
                title="另存为新预设"
              >
                📋 另存为新预设
              </button>
              {presets.find(x => x.id === lastSelectedPresetId) && (
                <button
                  onClick={resetToLastSelectedPreset}
                  className="px-1.5 py-0.5 rounded bg-warning/20 hover:bg-warning/30 text-warning font-medium"
                  title={`放弃改动,回到「${presets.find(x => x.id === lastSelectedPresetId)?.name}」`}
                >
                  ↺ 放弃改动
                </button>
              )}
            </div>
          )}

          {presets.length === 0 ? (
            <p className="text-xs text-text-muted">还没有预设。配好一套 API 后点「保存当前为预设」，之后可一键切换。</p>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {presets.map(p => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs rounded-full border transition-colors ${
                    activePresetId === p.id
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-base text-text-secondary border-border hover:border-accent/50'
                  }`}
                >
                  <button onClick={() => applyPreset(p.id)} title={`${p.config.provider} · ${p.config.model}`}>
                    {p.name}
                  </button>
                  <button
                    onClick={() => updatePresetFromCurrent(p.id)}
                    title="把当前配置保存到这个预设"
                    className={`${activePresetId === p.id ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'} hover:opacity-100`}
                  >💾</button>
                  {activePresetId === p.id && activePresetId !== lastSelectedPresetId && (
                    <button
                      onClick={resetToLastSelectedPreset}
                      title={`重置回「${presets.find(x => x.id === lastSelectedPresetId)?.name || '最近预设'}」`}
                      className="opacity-70 hover:opacity-100"
                    >↺</button>
                  )}
                  <button
                    onClick={() => { void handleRenamePreset(p.id, p.name) }}
                    title="重命名"
                    className="opacity-0 group-hover:opacity-70 hover:opacity-100"
                  >✎</button>
                  <button
                    onClick={() => { void handleDeletePreset(p.id, p.name) }}
                    title="删除"
                    className="opacity-0 group-hover:opacity-70 hover:opacity-100 hover:text-red-400"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">提供商</label>
            <select
              value={config.provider}
              onChange={(e) => switchProvider(e.target.value as AIProvider)}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{!opt.cors ? ' ⚠️' : ''}
                </option>
              ))}
            </select>
            {/* 配置提示 */}
            {currentProviderInfo && (
              <p className={`mt-1.5 text-xs ${currentProviderInfo.cors ? 'text-text-muted' : 'text-amber-500'}`}>
                {currentProviderInfo.hint}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
                placeholder={config.provider === 'ollama' ? '不需要 Key' : '输入 API Key...'}
                className="w-full px-3 py-2 pr-10 bg-bg-base border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <label className="mt-2 flex items-start gap-2 text-[11px] text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={rememberApiKey}
                onChange={e => setRememberApiKey(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span>
                在本机记住 API Key（写入 localStorage）。不勾选时仅本次浏览器会话有效。
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Base URL</label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
                className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
              />
              {(() => {
                // 需要代理的 provider 及其代理路径 / 原始地址映射
                const PROXY_MAP: Record<string, { proxy: string; direct: string }> = {
                  deepseek: { proxy: '/deepseek-proxy/v1', direct: 'https://api.deepseek.com/v1' },
                  openai:   { proxy: '/openai-proxy/v1',   direct: 'https://api.openai.com/v1' },
                  kimi:     { proxy: '/kimi-proxy/v1',     direct: 'https://api.moonshot.cn/v1' },
                  claude:   { proxy: '/claude-proxy/v1',   direct: 'https://api.anthropic.com/v1' },
                  nvidia:   { proxy: '/nvidia-proxy/v1',   direct: 'https://integrate.api.nvidia.com/v1' },
                  doubao:   { proxy: '/doubao-proxy/api/v3', direct: 'https://ark.cn-beijing.volces.com/api/v3' },
                  agnes:    { proxy: '/agnes-proxy/v1',    direct: 'https://apihub.agnes-ai.com/v1' },
                }
                const pm = PROXY_MAP[config.provider]
                if (!pm) return null
                const isProxy = config.baseUrl.startsWith('/' + config.provider)
                return (
                  <div className="mt-1.5 flex gap-2">
                    {!isProxy ? (
                      <button
                        onClick={() => setConfig({ baseUrl: pm.proxy })}
                        className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >
                        🔄 切换到本地代理
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfig({ baseUrl: pm.direct })}
                        className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >
                        🔗 恢复直连
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">模型</label>
              {/* R-23: 模型选择 — datalist(可输入可选择)+ 🔄 拉取/刷新 */}
              <div className="flex gap-1.5">
                <input
                  ref={modelInputRef}
                  type="text"
                  list={`models-datalist-${config.provider}`}
                  value={config.model}
                  onChange={(e) => setConfig({ model: e.target.value })}
                  placeholder={loadingModels ? '加载模型列表中...' : models.length > 0 ? '选择或输入模型名' : '输入模型名,或点 🔄 拉取'}
                  className="flex-1 px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={handleShowAllModels}
                  disabled={models.length === 0}
                  title="临时清空输入,显示 datalist 全部模型"
                  className="px-2.5 py-2 bg-bg-base border border-border rounded-lg text-text-secondary hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-40"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={loadingModels || !config.baseUrl?.startsWith('http')}
                  title={loadingModels ? '加载中...' : '点击重新从服务端拉取模型列表(覆盖缓存)'}
                  className="px-2.5 py-2 bg-bg-base border border-border rounded-lg text-text-secondary hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-40"
                >
                  {loadingModels ? '⏳' : '🔄'}
                </button>
              </div>
              <datalist id={`models-datalist-${config.provider}`}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {(() => {
                const selected = PROVIDER_MODELS[config.provider]?.find((m) => m.value === config.model)
                return selected?.desc ? (
                  <p className="mt-1 text-xs text-text-muted">{selected.desc}</p>
                ) : null
              })()}
              <p className="mt-1 text-xs text-text-muted">
                {loadingModels && '⏳ 拉取模型列表...'}
                {!loadingModels && modelsError && <span className="text-error">❌ 拉取失败:{modelsError}(手动输入即可)</span>}
                {!loadingModels && !modelsError && models.length > 0 && (
                  <>{modelsFromCache ? '📦 缓存 ' : '🌐 已拉取 '}{models.length} 个模型</>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Temperature: {config.temperature}
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={config.temperature}
                onChange={(e) => setConfig({ temperature: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Max Tokens:
                {config.maxTokens === 0
                  ? <span className="text-accent font-normal ml-1">不限制（模型最大）</span>
                  : <><span className="ml-1">{config.maxTokens}</span><span className="text-text-muted font-normal ml-1">（≈{Math.round(config.maxTokens * 0.6)}字）</span></>
                }
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.maxTokens === 0}
                    onChange={(e) => setConfig({ maxTokens: e.target.checked ? 0 : 8192 })}
                    className="accent-accent"
                  />
                  不限
                </label>
                {config.maxTokens > 0 && (
                  <input
                    type="range"
                    min={1024}
                    max={65536}
                    step={1024}
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ maxTokens: Number(e.target.value) })}
                    className="w-full accent-accent"
                  />
                )}
              </div>
              {config.maxTokens > 0 && (
                <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                  <span>1K</span><span>16K</span><span>32K</span><span>64K</span>
                </div>
              )}
            </div>
          </div>

          {/* FB-8: 上下文窗口(高级·可选) — 本地/自定义模型按实际填写,修"误报超出窗口" */}
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-1.5">
              上下文窗口 <span className="text-text-muted font-normal">(高级 · 可选)</span>
              {config.contextWindow
                ? <span className="text-accent ml-1">{config.contextWindow.toLocaleString()} token</span>
                : <span className="text-text-muted ml-1">按模型预设</span>}
            </label>
            <input
              type="number"
              min={0}
              value={config.contextWindow || ''}
              onChange={(e) => setConfig({ contextWindow: Number(e.target.value) || undefined })}
              placeholder="本地/自定义模型请按实际填写，如 131072；留空 = 用内置预设"
              className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-muted mt-1">
              识别不到的模型默认按 8K 计算,会误报「上下文超出窗口」。本地模型(LM Studio / Ollama)请在此填真实窗口,如 128000 / 262144。
            </p>
          </div>

          {/* 测试连接 */}
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={testing || !config.apiKey}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 disabled:opacity-40 transition-colors text-sm"
              >
                {testing ? (
                  <span className="animate-spin">⏳</span>
                ) : testResult?.ok ? (
                  <CheckCircle className="w-4 h-4" />
                ) : testResult && !testResult.ok ? (
                  <WifiOff className="w-4 h-4" />
                ) : (
                  <Wifi className="w-4 h-4" />
                )}
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-1.5 px-3 py-2 text-text-muted hover:text-text-secondary text-sm transition-colors"
              >
                <ScrollText className="w-4 h-4" />
                日志 {logs.length > 0 && `(${logs.length})`}
              </button>
            </div>
            {/* 测试结果详情 */}
            {testResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                <p>{testResult.message}</p>
                {testResult.duration && (
                  <p className="text-xs mt-0.5 opacity-70">耗时 {testResult.duration}ms</p>
                )}
              </div>
            )}
            {/* CORS 错误提示 */}
            {testResult && !testResult.ok && config.provider === 'deepseek' &&
              (testResult.message.includes('CORS') || testResult.message.includes('网络错误')) && (
              <p className="text-xs text-amber-400 px-1">
                {import.meta.env.DEV
                  ? '💡 本地运行时，可点击「切换到本地代理」解决此问题'
                  : '💡 建议改用 Gemini（支持浏览器直调）或在本地运行此工具'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 日志面板 */}
      {showLogs && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">连接日志</h3>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
            >
              <Trash2 className="w-3 h-3" /> 清空
            </button>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-text-muted">暂无日志，点击「测试连接」生成</p>
            ) : (
              logs.map((log) => (
                <pre key={log.id} className="text-text-secondary whitespace-pre-wrap break-all">
                  {formatLog(log)}
                </pre>
              ))
            )}
          </div>
        </div>
      )}

      {/* LLM 监控探针 */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-text-primary mb-1">LLM 监控探针</h3>
            <p className="text-xs text-text-muted leading-relaxed">右下角悬浮按钮 + 浮窗,实时查看所有 AI 调用的请求 / 响应。开启后会把 prompt 与响应文本保留在浏览器内存中,5 分钟无操作自动清空;关闭则不占任何资源。</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={llmMonitorEnabled} onChange={async (e) => {
              const v = e.target.checked
              if (v && !llmMonitorConfirmed) {
                setShowMonitorConfirm(true)
                return
              }
              llmMonitorSetEnabled(v)
            }} className="accent-accent w-4 h-4" />
            <span className="text-sm text-text-secondary">启用</span>
          </label>
        </div>

          {/* LLM Monitor 启用确认弹层 */}
          {showMonitorConfirm && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 px-4">
              <div className="w-full max-w-sm rounded-lg border border-border bg-bg-surface shadow-2xl">
                <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-text-primary">启用 LLM 监控?</h2>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-text-muted">
                      此工具会把所有 LLM 调用的请求和响应文本保留在浏览器内存中（包括世界观/角色库/未公开剧情等敏感数据）。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMonitorConfirm(false)}
                    className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="px-4 py-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monitorKeepAlive}
                      onChange={(e) => setMonitorKeepAlive(e.target.checked)}
                      className="mt-0.5 accent-accent w-4 h-4"
                    />
                    <div>
                      <p className="text-xs text-text-secondary font-medium">持续监控（不受 5 分钟自动清空影响）</p>
                      <p className="text-[11px] text-text-muted mt-0.5">勾选后 LLM Monitor 持续保留记录，调试期间建议开启。</p>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowMonitorConfirm(false)}
                    className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMonitorConfirm(false)
                      if (monitorKeepAlive) {
                        localStorage.setItem('sf_llm_monitor_keepalive', 'true')
                      }
                      llmMonitorSetConfirmed()
                      llmMonitorSetEnabled(true)
                    }}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    我已了解，启用
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* 主题切换 */}
      <div className="bg-bg-surface border border-border rounded-xl p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4">主题</h3>
        <div className="flex flex-col gap-3">
          {THEME_OPTIONS.map((theme) => {
            const isActive = currentTheme === theme.value
            return (
              <button
                key={theme.value}
                onClick={() => handleThemeChange(theme.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-border-hover hover:bg-bg-hover'
                }`}
              >
                {/* 色块预览 */}
                <div className="flex items-end gap-1 flex-shrink-0">
                  {theme.swatches.map((c, j) => (
                    <div
                      key={j}
                      style={{
                        width: j === 0 ? 28 : 18,
                        height: j === 0 ? 28 : 18,
                        background: c,
                        borderRadius: j === 0 ? 6 : 4,
                        border: '1px solid rgba(0,0,0,0.08)',
                        marginBottom: j === 0 ? 0 : 5,
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
                {/* 文字 */}
                <div className="flex-1">
                  <p className="text-sm text-text-primary font-medium leading-none mb-1">
                    {theme.emoji} {theme.label}
                  </p>
                  <p className="text-xs text-text-muted">{theme.desc}</p>
                </div>
                {/* 选中标记 */}
                {isActive && (
                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
﻿
      {/* R-23: 新建(空白)预设 Dialog */}
      {creatingNew && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-bg-surface border border-border rounded-xl p-5 w-[min(90vw,500px)] max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-text-primary mb-4">新建预设(从零)</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">预设名称 *</label>
                <input
                  value={newPreset.name}
                  onChange={e => setNewPreset({ ...newPreset, name: e.target.value })}
                  placeholder="如「我的新预设」"
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">提供商</label>
                <select
                  value={newPreset.provider}
                  onChange={e => setNewPreset({ ...newPreset, provider: e.target.value as AIProvider })}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                >
                  {PROVIDER_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">API Key</label>
                <input
                  type="password"
                  value={newPreset.apiKey}
                  onChange={e => setNewPreset({ ...newPreset, apiKey: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Base URL</label>
                <input
                  value={newPreset.baseUrl}
                  onChange={e => setNewPreset({ ...newPreset, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">模型</label>
                <input
                  value={newPreset.model}
                  onChange={e => setNewPreset({ ...newPreset, model: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={newPreset.temperature}
                    onChange={e => setNewPreset({ ...newPreset, temperature: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Max Tokens (0=不限)</label>
                  <input
                    type="number"
                    min="0"
                    value={newPreset.maxTokens}
                    onChange={e => setNewPreset({ ...newPreset, maxTokens: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setCreatingNew(false)}
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
              >
                取消
              </button>
              <button
                onClick={handleSaveNewPreset}
                disabled={!newPreset.name.trim()}
                className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>
    </div>
  )
}
