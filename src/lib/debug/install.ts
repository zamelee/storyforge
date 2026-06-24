/**
 * LLM 监控探针 · 安装入口
 *
 * 一旦 import 这文件就执行副作用:
 * 1. 替换 window.fetch(只拦截 chat/completions,其它零开销)
 * 2. 在 body 末尾挂一个 <div id="llm-monitor-root">
 * 3. 在那个 div 上 createRoot().render(<LLMMonitorMount />)
 *
 * 注意:这一步必须在 main.tsx 顶部就 import,比任何业务代码早,才能抓到所有请求。
 */
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { installFetchInterceptor } from './interceptor'
import LLMMonitorMount from '../../components/debug/LLMMonitorMount'

const ROOT_ID = 'llm-monitor-root'
const STATE_KEY = '__llmMonitorInstalled'

declare global {
  interface Window {
    [STATE_KEY]?: boolean
    __llmMonitorUninstall?: () => void
    __llmMonitorRoot?: Root
  }
}

export function installLLMMonitor(): void {
  if (typeof window === 'undefined') return
  if (window[STATE_KEY]) return
  window[STATE_KEY] = true

  // 1. 装 fetch 拦截器
  const uninstall = installFetchInterceptor()
  window.__llmMonitorUninstall = uninstall

  // 2. 挂 DOM + 渲染 React 树
  let rootEl = document.getElementById(ROOT_ID)
  if (!rootEl) {
    rootEl = document.createElement('div')
    rootEl.id = ROOT_ID
    document.body.appendChild(rootEl)
  }
  const root = createRoot(rootEl)
  window.__llmMonitorRoot = root
  // 暴露 store 到 window,方便浏览器 console 调试
  void import('./store').then((m) => { (window as any).__llmMonitorStore = m.useLLMMonitorStore })
  root.render(createElement(LLMMonitorMount))
}

// 自启动
installLLMMonitor()
