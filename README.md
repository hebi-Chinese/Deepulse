# Claudio · 个人 AI 电台

浏览器里开一个 PWA, AI DJ 给你聊天 + 选歌, 网易云音乐做音源, 流式 TTS 把 DJ 的话变成声音。Clean Architecture 的 pnpm monorepo。

## 前置

- Node.js >= 20 (推荐 22 LTS)
- pnpm >= 11 (`npm i -g pnpm`)
- Windows / macOS / Linux

## 起 dev

```bash
pnpm install
pnpm dev          # turbo 并行起 PWA (:3000) + server (:8787)
```

Windows 用户也可以直接双击根目录 `claudio.bat`。

打开 [http://localhost:3000](http://localhost:3000) 就能用。

## fork 起来要做什么

读 [CLAUDE.md](./CLAUDE.md) — 给 AI 助手 (Claude Code / Cursor / Copilot) 看的 fork 引导, 把 LLM 大脑 / TTS 声音 / 网易云账号三件事告诉它, 它会自动帮你配。

人工配也行, 三个必选项:

1. **LLM 大脑**: 改 `claudio.bat` 顶部 `set BRAIN=...` (deepseek / ollama / openai / claude), 详见 [brain/README](./packages/infrastructure/src/brain/README.md)
2. **TTS 声音**: `set TTS=...` (mock / gpt-sovits / voxcpm), 详见 [tts/README](./packages/infrastructure/src/tts/README.md)
3. **网易云账号** (可选): PWA 设置面板里扫码登录

## 仓库结构

```
apps/
  server/        Fastify 5 + WS 后端 (:8787)
  pwa/           Next.js 15 + React 19 前端 (:3000)
packages/
  domain/        业务实体 + Errors (零外部依赖)
  application/   use-cases + ports (只依赖 domain)
  infrastructure/  adapters (brain/tts/ncm/db/clock/...)
  shared/        config (env) + logger + 跨层共享
tools/
  configs/       共享 ESLint / Prettier / tsconfig
  arch-test/     dependency-cruiser 守住依赖方向
```

依赖单向: `apps → infrastructure → application → domain`。架构由 `pnpm arch:check` 强制。

## 常用命令

```bash
pnpm dev          # 起 PWA + server (turbo)
pnpm typecheck    # 全仓 tsc --noEmit
pnpm lint         # ESLint --max-warnings 0
pnpm arch:check   # dependency-cruiser
pnpm build        # 生产构建
```

## 端口

| Port | Service                     |
| ---- | --------------------------- |
| 3000 | PWA                         |
| 8787 | Server                      |
| 3001 | NCM API (server 自动 spawn) |
| 8000 | GPT-SoVITS (可选, 需自起)   |

## 状态

WIP 私有项目, 非生产就绪。
