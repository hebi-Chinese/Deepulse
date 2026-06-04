// Infrastructure 层 · 实现 application 定义的 ports
// adapter 同族用子目录组织（brain/, ncm/, tts/, calendar/, signal/, db/）
// 注意：兄弟 adapter 不能互相 import（架构测试强制）

export * from './brain/index.js'
export * from './tts/index.js'
export * from './calendar/index.js'
export * from './signal/index.js'
export * from './ncm/index.js'
export * from './user-prefs/index.js'
export * from './clock/index.js'
