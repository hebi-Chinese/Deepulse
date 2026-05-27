// DB 入口 · 导出 client + repos 工厂
// 注: repo 接口和 DTO 类型现在统一在 @claudio/application 暴露 (Clean Arch port 在 application)
// 这里只导出 *factory function* — 想要 IXxxRepo 请 import from '@claudio/application'

export * from './client.js'
export * from './schema.js'

export { createSongRepo } from './repos/song-repo.js'
export { createPlaysRepo } from './repos/plays-repo.js'
export { createBubblesRepo } from './repos/bubbles-repo.js'
export { createPlanRepo } from './repos/plan-repo.js'
export { createPrefsRepo } from './repos/prefs-repo.js'
export { createNcmSnapshotRepo } from './repos/ncm-snapshot-repo.js'
export { createNcmAccountRepo } from './repos/account-repo.js'
export { createConversationsRepo } from './repos/conversations-repo.js'
export { createTasteRepo } from './repos/taste-repo.js'
