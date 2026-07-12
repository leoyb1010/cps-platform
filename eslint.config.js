// 前端 ESLint 扁平配置（eslint 9 flat config）。
// 目标：引入 lint 基线 + 关键的 no-floating-promises（type-aware），
// 但不为海量存量告警把 CI 变红——存量规则降级为 warn，唯 no-floating-promises 保持 error（资金链路漏 await 是真 bug）。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // 只 lint 前端应用源码 src/；server/ 为独立后端子项目、scripts/ 与 services/ 为独立脚本/子服务，均不在本基线内
  { ignores: ['dist', 'server', 'scripts', 'services', 'public', 'node_modules', 'playwright-report', 'coverage', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // projectService：自动按最近 tsconfig 解析类型，供 type-aware 规则使用
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 关键规则：漏 await 的 Promise 在资金/审计链路会静默吞错 → 保持 error
      '@typescript-eslint/no-floating-promises': 'error',
      // 未用变量降级为 warn：与前端 tsconfig noUnusedLocals:false 的既定取向一致，避免存量刷红
      '@typescript-eslint/no-unused-vars': 'warn',
      // TS 由编译器自身查未定义引用，no-undef 会对浏览器全局(window/document…)误报，官方建议关闭
      'no-undef': 'off',
    },
  },
)
