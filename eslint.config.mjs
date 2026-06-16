// ESLint 扁平配置(AUDIT-3 · §11.5 决策③)
//
// 策略:观察期。`npm run lint` 供开发者本地查看,**暂不进 ci 脚本、不阻断 CI**。
// 噪音大的规则降级为 warn/off(项目体量大,一次性全 error 会淹没真问题);
// 仅高价值规则(react-hooks/rules-of-hooks)设 error。后续清理一轮后再逐步收紧。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist', 'dev-dist', 'coverage', 'node_modules',
      '**/*.config.{js,ts,mjs,cjs}', 'scripts/**', 'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', fetch: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', Blob: 'readonly',
        URL: 'readonly', crypto: 'readonly', indexedDB: 'readonly',
      },
    },
    rules: {
      // ── 高价值:保持 error ──
      'react-hooks/rules-of-hooks': 'error',

      // ── 观察期降噪(项目现状,先 warn / off,后续收紧)──
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off', // 纯前端 Dexie/动态结构大量 as any,本就需要
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'warn', // 中文项目偶有全角空格,观察期 warn
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
)
