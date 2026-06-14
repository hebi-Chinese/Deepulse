# Deepulse 架构笔记

> 给一个完全不知情的人看的全景导览. 每篇里的所有结论都对得上具体源文件 — 文件路径都按 `package/path/file.ts:行号` 给出.
> 用 Obsidian 打开根目录就能看. mermaid 图自动渲染. `[[]]` 双链可点跳转, 也可在 Graph View 看到关系网.

## 阅读顺序

第一次看从 [[00 总览]] 开始, 再按编号往下读. 后续随用随查.

1. [[00 总览]] — 一句话定义, 顶层数据流, 包/app 分布, 关键技术栈
2. [[01 Clean Architecture 分层]] — domain / application / infrastructure / shared 的责任 + 单向依赖
3. [[02 domain 包]] — 业务实体类型 (Song / Bubble / Plan / Mood / Taste / 错误类 / Branded ID)
4. [[03 application 包]] — Ports (IBrain / ITts / INcmClient / IClock / 记忆 / 仓储) + Use cases (run-dj-turn 等) + DJ persona prompt
5. [[04 shared 包]] — env config / dj-ws 协议 / pino logger
6. [[05 infrastructure 包]] — Brain (claude / openai-compat) / TTS (voxcpm / sovits / mock) / NCM / DB + 仓储 / 记忆 / user-prefs / clock
7. [[06 apps-server]] — Fastify 入口, composition root, cold-start, 所有 HTTP / WS 路由
8. [[07 apps-pwa]] — Next.js 前端: Player 顶层组装 / usePlayerLogic 状态机 / DjChat / dj-ws-client / sharedAudioCtx ducking
9. [[08 端到端 · DJ chat 流式对话]] — 从浏览器键入 → WS → use case → brain.stream → 句切 → TTS → audio 帧 → action 触发搜歌切歌
10. [[09 端到端 · 网易云扫码登录]] — qrCreate → 轮询 qrCheck → 803 success → completeQrLogin → cookie 内存 + 可选入 DB + 后台拉 snapshot
11. [[10 端到端 · 切歌字幕]] — Player 检测 currentSong 变化 → /api/dj/subtitle → brain.generateJson + tts.synthesize → useDjCloud 显示并播音 + ducking
12. [[11 启动 + env + bat]] — deepulse.bat → loadEnv → buildContainer → runColdStart → app.listen
13. [[12 数据库 schema 与关键约定]] — drizzle schema 全表 + 重要业务约定 (单行表, JSON 列, append-only, 不可变, branded id)

## 怎么用这份笔记

- **改代码前**: 先去对应的笔记里翻一遍那段在做什么 — 比如改 DJ chat 流就读 [[08 端到端 · DJ chat 流式对话]]
- **加新 adapter / port**: 看 [[01 Clean Architecture 分层]] 的依赖方向, 不要让 application 反向依赖 infrastructure
- **加新 env**: 改 `packages/shared/src/config/index.ts` 的 zod schema, 然后在 [[04 shared 包]] 里同步说明
- **加新 use case**: 在 `packages/application/src/use-cases/<domain>/` 新建, 装到 `apps/server/src/api/*.ts` 路由层, 不要在 fastify handler 里直接编排 ports

## 不写什么

- 不写"未来可能怎么改" — 笔记只记录**当前真实状态**
- 不写 git 历史 — 那是 `git log` 的事
- 不写每个文件的逐行复述 — 笔记重点是**为什么**和**怎么连**, 不是 cat
