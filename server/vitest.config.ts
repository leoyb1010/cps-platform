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
    // 子进程退出兜底：某个套件若残留未关闭的句柄（Prisma 连接/定时器），
    // 不至于让整个套件无限期挂起——发布门禁必须能稳定终止并给出结论。
    teardownTimeout: 20000,
    // 每个测试文件独立子进程：避免文件间共享 process.env.DATABASE_URL 互相污染
    // （e2e 用 test.db、幂等单测用 idem-test.db，必须进程隔离）
    pool: 'forks',
    fileParallelism: false,
  },
  plugins: [swc.vite()],
})
