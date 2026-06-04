# Claudio · 给 AI 助手的 setup 引导

> 本文件给 AI 助手 (Claude Code / Cursor / Copilot Chat / 其他) 读. 当你 fork 了这个项目, AI 助手会一进来就读到这份引导, 帮你 / 主人完成首次设置.

## 项目一句话

**Claudio** = 个人 AI 电台 PWA. 浏览器开 `localhost:3000`, AI DJ (LLM) 给你聊天 + 选歌, 网易云负责音源, 流式 TTS 把 DJ 的话变成声音. Clean Architecture 的 pnpm monorepo: `domain` / `application` / `infrastructure` / `shared` + `apps/pwa` (Next.js) + `apps/server` (Fastify).

## 一启动就跑得起来 — Mock 默认

**没配任何 env**, 双击根目录 `启动.bat` (或 `pnpm dev`) 就能跑:

- Brain 默认 `claude` — **但 fork 者大概率没装 claude CLI**, 见下方"必选 1"换成自己的 LLM
- TTS 默认 `mock` — 返回静音 wav, 听不到 DJ 声音但 UI 完整, 能正常挑歌 / 看队列
- NCM 默认无 cookie — 能搜歌 + 听免登录的歌, 想要"我的歌单" 需扫码登录

新 fork 进来想用得舒服, 需要主人 (= 真人用户) 决定下面 3 件事. AI 助手发现 fork 是新的, 应该**主动询问主人**这 3 件:

---

## 必选 1 · 选一个 LLM 当 DJ 大脑 (Brain)

LLM 用来:

- 流式吐 DJ 串场词 (`IBrain.stream`)
- 结构化选歌 / 生成 plan (`IBrain.generateJson` 走 json_object 模式)

| 选项                                                               | 适用                                     | 配置 (写到 `.env`)                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Claude Code CLI**                                                | 主人 / 你已经装了 `claude` 并有 Pro 订阅 | `BRAIN_TYPE=claude`                                                                                        |
| **DeepSeek API**                                                   | 推荐, 便宜 + 中文好                      | `BRAIN_TYPE=deepseek` + `OPENAI_API_KEY=sk-xxx` + `OPENAI_MODEL=deepseek-chat`                             |
| **Ollama 本地**                                                    | 想完全离线 / 不花钱, 有 16GB+ RAM        | `BRAIN_TYPE=ollama` + `OPENAI_MODEL=qwen2.5:7b` (先 `ollama pull`)                                         |
| **OpenAI 官方**                                                    |                                          | `BRAIN_TYPE=openai-compat` + `OPENAI_API_KEY=sk-proj-xxx` + `OPENAI_MODEL=gpt-4o-mini`                     |
| **任意 OpenAI 兼容** (OpenRouter / Together / vLLM / 阿里通义 ...) |                                          | `BRAIN_TYPE=openai-compat` + `OPENAI_BASE_URL=<base>` + `OPENAI_API_KEY=<key>` + `OPENAI_MODEL=<model id>` |

详细文档 [packages/infrastructure/src/brain/README.md](packages/infrastructure/src/brain/README.md)

**AI 助手该问主人**: "你想用哪个 LLM 当 DJ 大脑? 推荐 DeepSeek (~¥0.001/条消息) 或本地 Ollama (免费但慢)."

---

## 必选 2 · 选一个 TTS 决定 DJ 怎么发声

| 选项           | 适用                                                                                                                                                                                        | 配置                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **mock**       | 默认, 静音 wav, 只想看 UI                                                                                                                                                                   | `TTS_TYPE=mock` (或不写)                                |
| **gpt-sovits** | 主人本地 — 流萤声线 (主人定制模型), 需要起 GPT-SoVITS server                                                                                                                                | `TTS_TYPE=gpt-sovits` + `TTS_URL=http://127.0.0.1:8000` |
| **voxcpm**     | **fork 者推荐** — 自然语言 voice design 不需要参考音频, 30 语言, 48kHz. **需要自行实现 adapter**, 见 [packages/infrastructure/src/tts/README.md](packages/infrastructure/src/tts/README.md) | `TTS_TYPE=voxcpm` + 你自己写的 adapter 配               |

**AI 助手该问主人**: "DJ 要不要发声? 不发声直接 mock; 想要声音但不想部署, 我帮你写 voxcpm adapter (~2 小时); 主人已有 GPT-SoVITS server 就 gpt-sovits."

---

## 必选 3 · 网易云账号 (可选)

不登录: 只能搜歌 + 听版权宽松的歌, 推荐位 / 私人 FM / "我的歌单" 都不可用.

登录: 设置面板里有"扫码登录" + "记住我" (后者把 cookie 持久化到 DB, 重启后自动恢复).

**AI 助手该问主人**: "要不要登网易云? 不登也能用, 但你的 DJ 不知道你喜好."

---

## 其他可调 env

| Env              | 作用                                      | 默认                          |
| ---------------- | ----------------------------------------- | ----------------------------- |
| `SERVER_PORT`    | Fastify 后端端口                          | `8787`                        |
| `PWA_PORT`       | Next.js 前端端口                          | `3000`                        |
| `DATABASE_URL`   | SQLite 文件路径                           | `./data/claudio.db`           |
| `USER_PREFS_DIR` | 主人手写的 prefs markdown 目录            | `apps/server/data/user-prefs` |
| `MIGRATIONS_DIR` | drizzle migrations 路径 (prod build 必给) | infra 自带                    |

---

## 项目布局速查 (AI 助手定位用)

```
apps/
  pwa/        Next.js 15 + React 19 + Tailwind 4 — 浏览器界面
  server/     Fastify 5 + WebSocket — 后端 HTTP/WS, 编排用例
packages/
  domain/         核心类型 + Errors (零依赖)
  application/    Ports (IBrain/ITts/INcm/I*Repo/IClock) + Use cases (run-dj-turn, complete-qr-login, refresh-snapshot)
  infrastructure/ Adapters: brain/claude · brain/openai-compat · tts/gpt-sovits · tts/mock · db/* · ncm · ...
  shared/         Config (env), WS protocol schema, errors
tools/
  blender/      场景图原料 (.blend)
启动.bat        Windows 双击启动 (pnpm dev 包装)
```

**Clean Architecture 单向依赖**: `apps → infrastructure → application → domain`. 加新 adapter 在 `infrastructure/<port>/<name>/`, 不要在 `apps` 直接 new 具体类.

---

## 给 AI 助手的工作约定

读 `~/.claude/rules/my-coding-standards.md` 是主人的硬规则:

- 不静默吞错; 错误信息要包含上下文 (操作 + 失败原因 + 相关 ID)
- 函数 < 50 行, 文件 < 800 行, 嵌套 < 4 层
- 注释写 WHY 不写 WHAT
- TODO/FIXME 带日期 (e.g. `// TODO(2026-05-31): ...`)
- 不要写"以防万一"的代码; YAGNI

修改后请跑:

- `pnpm -F @claudio/<pkg> typecheck` 单包
- `pnpm typecheck` 全仓 (慢但稳)
- `pnpm lint` 必绿
- 涉及 UI: 别只说"应该能行", 用 `agent-browser-cli` 实测一遍

---

## Stuck 怎么办

| 症状                     | 第一步                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| 前端报 `Failed to fetch` | `curl --noproxy "*" http://127.0.0.1:8787/api/login/status` — 200 = 前端问题, refused = 后端死了重起 |
| 端口被占 EADDRINUSE      | `netstat -ano \| findstr ":3000"` 找 PID, `Stop-Process -Id <pid> -Force`                            |
| dev server hang          | 杀 node 进程 + 走根目录 `pnpm dev` 重起 (并行启 pwa + server)                                        |
| `pnpm dev` 起不来        | `pnpm install` 看是否依赖装全; 看 `package.json` engines `node >= 20`                                |
| Brain 没响应             | 检查 `BRAIN_TYPE` + `OPENAI_*` 是否配齐 (对照"必选 1")                                               |
