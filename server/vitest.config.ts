import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // 每个测试文件独立子进程：避免文件间共享 process.env.DATABASE_URL 互相污染
    // （e2e 用 test.db、幂等单测用 idem-test.db，必须进程隔离）
    pool: 'forks',
    fileParallelism: false,
  },
  plugins: [swc.vite()],
})
