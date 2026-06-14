// Deepulse 架构约束（PRD §5.3 + CODING_STANDARDS_NODE_TS §5.2）
// 依赖方向：apps → application → domain；infrastructure 实现 application 的 ports
// 兄弟 adapter 禁止互相 import；pwa 禁止触 server 内部；ui 不依赖业务

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-must-be-pure',
      severity: 'error',
      comment: 'domain 层不允许 import 任何业务包或基础设施',
      from: { path: '^packages/domain' },
      to: {
        pathNot: [
          '^packages/domain',
          '^node_modules/(typescript|@types/.+)',
          '^(node:|fs|path|url|util|crypto|stream|events)$',
        ],
      },
    },
    {
      name: 'application-cannot-touch-infrastructure',
      severity: 'error',
      comment: 'application 只依赖 domain 和自己；infrastructure 反过来实现 ports',
      from: { path: '^packages/application' },
      to: { path: '^packages/infrastructure' },
    },
    {
      name: 'infrastructure-adapter-siblings-isolated',
      severity: 'error',
      comment: '兄弟 adapter 禁止互相 import（brain/claude 不能用 brain/deepseek）',
      from: { path: '^packages/infrastructure/src/([^/]+)/([^/]+)' },
      to: { path: '^packages/infrastructure/src/$1/(?!$2)' },
    },
    {
      name: 'pwa-cannot-touch-server-internals',
      severity: 'error',
      comment: 'PWA 只能通过 HTTP/WS 契约访问 server，不能直接 import',
      from: { path: '^apps/pwa' },
      to: { path: '^apps/server' },
    },
    {
      name: 'ui-cannot-import-business-packages',
      severity: 'error',
      comment: 'UI 只能用 shared/types；业务包是后端关心',
      from: { path: '^packages/ui' },
      to: {
        path: '^packages/(domain|application|infrastructure)',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '孤立模块（不被任何人 import）；Next.js 框架约定文件豁免',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)(index|main)\\.(js|ts|tsx|mjs|cjs)$',
          // Next.js 框架约定文件（按路径自动加载）
          'apps/pwa/.+\\.config\\.(ts|mjs|js|cjs)$',
          'apps/pwa/app/.+/(page|layout|error|loading|not-found|template|default|route)\\.tsx?$',
          'apps/pwa/app/(page|layout|error|loading|not-found|template|default|route)\\.tsx?$',
          'apps/pwa/middleware\\.tsx?$',
          'apps/pwa/instrumentation\\.tsx?$',
          'apps/pwa/next-env\\.d\\.ts$',
          // ESLint flat config
          '.+/eslint\\.config\\.js$',
          // 测试入口
          '.+\\.test\\.(ts|tsx|js)$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.next|node_modules|dist|build|coverage|\\.tsbuildinfo)' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
