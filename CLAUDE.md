# Claudio · 给 AI 助手的 setup 引导

> 本文件给 AI 助手 (Claude Code / Cursor / Copilot Chat / 其他) 读. 当你 fork 了这个项目, AI 助手会一进来就读到这份引导, 帮你 / 主人完成首次设置.

## 项目一句话

**Claudio** = 个人 AI 电台 PWA. 浏览器开 `localhost:3000`, AI DJ (LLM) 给你聊天 + 选歌, 网易云负责音源, 流式 TTS 把 DJ 的话变成声音. Clean Architecture 的 pnpm monorepo: `domain` / `application` / `infrastructure` / `shared` + `apps/pwa` (Next.js) + `apps/server` (Fastify).

## 一启动就跑得起来 — Mock 默认

**只想看 UI** 的话: 双击 `claudio.bat` (或 `pnpm dev`), 不发 DJ chat 就行, 搜歌/挑歌都能用.

**要 DJ chat 能回话** 必须配 brain (见必选 1) — 没配会 throw `BRAIN_TYPE=X 必须 set X_URL env`, 这是故意的不静默走错地方.

- Brain 默认 `openai-compat`, **不预填任何 URL** — fork 者必须显式 set 一个 brand 专属 env var, 不然第一次 DJ chat 就抛错
- TTS 默认 `mock` — 返回静音 wav, 听不到 DJ 声音但 UI 完整, 能正常挑歌 / 看队列
- NCM 默认无 cookie — 能搜歌 + 听免登录的歌, 想要"我的歌单" 需扫码登录

新 fork 进来想用得舒服, 需要主人 (= 真人用户) 决定下面 3 件事. AI 助手发现 fork 是新的, 应该**主动询问主人**这 3 件:

---

## 必选 1 · 选一个 LLM 当 DJ 大脑 (Brain)

LLM 用来:

- 流式吐 DJ 串场词 (`IBrain.stream`)
- 结构化选歌 / 生成 plan (`IBrain.generateJson` 走 json_object 模式)

### 设计哲学 (主人 2026-06-07): URL 一层, brand 专属, 不预填

每个 brain 类型读**自己专属的 URL env var**, 没有任何"默认 URL"兜底 — 没填 startup throw, 不静默走错地方.

长 env 字符串放代码块更可读, 每个选项一节:

#### Claude Code CLI

适用: 主人本机装了 `claude` 且有 Pro 订阅.

```bat
set BRAIN_TYPE=claude
```

#### DeepSeek API (推荐: 便宜 + 中文好)

```bat
set BRAIN_TYPE=deepseek
set DEEPSEEK_URL=https://api.deepseek.com/v1
set OPENAI_API_KEY=sk-your-key
set OPENAI_MODEL=deepseek-chat
```

#### Ollama 本地

适用: 完全离线 / 免费, 需 16GB+ RAM, 先 `ollama pull qwen2.5:7b`.

```bat
set BRAIN_TYPE=ollama
set OLLAMA_URL=http://localhost:11434/v1
set OPENAI_MODEL=qwen2.5:7b
```

#### OpenAI 官方

```bat
set BRAIN_TYPE=openai-compat
set OPENAI_BASE_URL=https://api.openai.com/v1
set OPENAI_API_KEY=sk-proj-your-key
set OPENAI_MODEL=gpt-4o-mini
```

#### 任意 OpenAI 兼容

适用: OpenRouter / Together / vLLM / 阿里通义 / LMStudio 等.

```bat
set BRAIN_TYPE=openai-compat
set OPENAI_BASE_URL=https://your-provider/v1
set OPENAI_API_KEY=your-key
set OPENAI_MODEL=model-id-on-that-provider
```

#### Custom

fork 者自己接私有 LLM, 在 `apps/server/src/composition.ts` 的 `createBrain(...)` 调用里加 `customResolver: () => '<url>'`, 不走 env, 详见 brain README.

⚠ **专属性是硬约束**: `BRAIN_TYPE=deepseek` 时只读 `DEEPSEEK_URL`, `OPENAI_BASE_URL` 也不会被偷偷用上来兜底. 反之亦然. 这是为了主人在 shell 里有残留 `OPENAI_BASE_URL=""` 这种 case 不会跨 brand 串味.

### 最简 fork 配置

主人用 deepseek 的话, 改 `claudio.bat` 顶部:

```bat
set "BRAIN=deepseek"
set "DEEPSEEK_API_KEY=sk-your-key"
```

`claudio.bat` 里 BRAIN=deepseek case 会自动 set `DEEPSEEK_URL=https://api.deepseek.com/v1` + `OPENAI_API_KEY=%DEEPSEEK_API_KEY%` + `OPENAI_MODEL=deepseek-chat`, 主人只关心两件 (BRAIN 跟自己的 key).

详细文档 [packages/infrastructure/src/brain/README.md](packages/infrastructure/src/brain/README.md)

**AI 助手该问主人**: "你想用哪个 LLM 当 DJ 大脑? 推荐 DeepSeek (~¥0.001/条消息) 或本地 Ollama (免费但慢)."

---

## 必选 2 · 选一个 TTS 决定 DJ 怎么发声

### 三个实现

#### mock (默认)

只想看 UI, 返回静音 wav, UI 全 ok. `TTS_TYPE=mock` 或不写.

#### gpt-sovits

主人本地, 流萤声线 (主人定制模型), 需起 GPT-SoVITS server :8000.

```bat
set TTS_TYPE=gpt-sovits
set TTS_URL=http://127.0.0.1:8000
```

#### voxcpm (fork 者推荐)

OpenBMB VoxCPM2, 30 语言 + voice design 自然语言描述声音 (性别/年龄/情绪/语速,
不需要参考音频), 48kHz. 已内置 Python wrapper 在 [tools/voxcpm-server/](tools/voxcpm-server/).

```bat
set TTS_TYPE=voxcpm
set VOXCPM_URL=http://127.0.0.1:8001
set VOXCPM_VOICE_DESIGN=温柔女声, 25 岁, 中性情绪
```

**AI 助手该问主人**: "DJ 要不要发声? 不发声直接 mock; 想要声音 fork 者推 voxcpm (`tools/voxcpm-server` 一键起, voice design 自然语言描声); 主人已有 GPT-SoVITS server 就 gpt-sovits."

**起 voxcpm**:

1. **一次性装** (~10 分钟, 首次):

   ```bash
   cd tools/voxcpm-server
   python -m venv .venv && .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **日常用**: `claudio.bat` 顶部 `set "TTS=voxcpm"`. 双击 bat — 它会自动
   `start` 一个新窗跑 `python app.py` (8001 已在跑就跳过). 主人不用另开窗.

首次启动 vox 加载模型 ~30s, 这段时间 DJ 喊话会等; 后续秒回.

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

```text
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
claudio.bat        Windows 双击启动 (pnpm dev 包装)
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

| 症状                                                      | 第一步                                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端报 `Failed to fetch`                                  | `curl --noproxy "*" http://127.0.0.1:8787/api/login/status` — 200 = 前端问题, refused = 后端死了重起                                                              |
| 端口被占 EADDRINUSE                                       | `netstat -ano \| findstr ":3000"` 找 PID, `Stop-Process -Id <pid> -Force`                                                                                         |
| dev server hang                                           | 杀 node 进程 + 走根目录 `pnpm dev` 重起 (并行启 pwa + server)                                                                                                     |
| `pnpm dev` 起不来                                         | `pnpm install` 看是否依赖装全; 看 `package.json` engines `node >= 20`                                                                                             |
| DJ chat 显示 `[出错: BRAIN_TYPE=X 必须 set X_URL env]`    | 主人/fork 者没 set 对应的 brand 专属 URL env (e.g. `BRAIN_TYPE=deepseek` 必须 set `DEEPSEEK_URL`). 设计是故意硬抛, 对照"必选 1"补 set. 不预填任何 default URL.    |
| server log `brainType: openai-compat` 但你以为是 deepseek | env 没传到 server 进程. 看 `claudio.bat` 窗里 echo 的 `BRAIN_TYPE` 跟 server log 对照. 不一致 → bat 没运行到那段; 一致但 server 拿不到 → 检查 cmd → pnpm 中间环节 |
