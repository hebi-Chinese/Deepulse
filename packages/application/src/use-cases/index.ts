// Use cases · 业务用例 (薄包装: 组合 ports 完成一件事)
// 路由层 (HTTP/WS) 应该只调 use case, 不直接组合多个 ports
//
// 已实现:
//   - dj/run-dj-turn          · DJ 一次回合的完整流
//   - login/complete-qr-login · NCM 扫码登录后的 cookie + snapshot 编排
//   - snapshot/refresh-user-snapshot · 手动刷新 NCM 用户 snapshot

export const USE_CASES_VERSION = 'm3-1' as const

export * from './dj/run-dj-turn.js'
export * from './dj/distill-session.js'
export * from './dj/generate-subtitle.js'
export * from './login/complete-qr-login.js'
export * from './snapshot/refresh-user-snapshot.js'
