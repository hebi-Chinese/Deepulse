# 11 · 启动 + env + deepulse.bat

> 从用户双击 `deepulse.bat` 一直到浏览器看到首屏的完整启动流程.

## 启动流程总览

```mermaid
flowchart TD
    A[用户双击 deepulse.bat] --> B[chcp 65001<br/>切 UTF-8]
    B --> C[set BRAIN=deepseek<br/>set TTS=voxcpm<br/>顶部硬编码两行]
    C --> D[预设 AI_KEY placeholder<br/>(单一 key 孔, 不分 brand)]
    D --> E[wipe stale brain envs<br/>BRAIN_TYPE / AI_URL / AI_MODEL]
    E --> F[per-brain mapping<br/>BRAIN=deepseek → AI_URL=deepseek.com, AI_MODEL=deepseek-chat]
    F --> G[per-tts mapping<br/>TTS=voxcpm → VOXCPM_URL, VOXCPM_MODEL local path]
    G --> H{TTS=voxcpm?}
    H -->|是| I[netstat 看 :8001 是否监听]
    I -->|没| J[start /D tools/voxcpm-server<br/>新窗跑 .venv\Scripts\python.exe app.py]
    I -->|有| K[echo skip launch]
    J --> L[echo 启动配置]
    K --> L
    H -->|否| L
    L --> M[call pnpm dev<br/>turbo 并行启 PWA + Server]
    M --> N[turbo: apps/pwa next dev :3000]
    M --> O[turbo: apps/server tsx watch src/index.ts]
    N --> P[Next.js 编译]
    O --> Q[loadEnv → 校验 zod schema]
    Q --> R[createLogger pino + pretty]
    R --> S[buildContainer env → Container]
    S --> T[logStartupConfig]
    T --> U[runColdStart<br/>恢复 cookie + 看 snapshot]
    U --> V[Fastify register cors + ws + 10 plugins]
    V --> W[installShutdown SIGINT/SIGTERM]
    W --> X[app.listen 127.0.0.1:8787]
    P --> Y[用户开浏览器 localhost:3000]
    X --> Y
```

## `deepulse.bat` 关键设计 (按段, PRD-002 简化后)

### CONFIG 顶部硬编码

```bat
set "BRAIN=deepseek"
set "TTS=voxcpm"
if not defined AI_KEY set "AI_KEY=sk-PUT-YOUR-AI-KEY-HERE"
```

Fork 者只改这两行 (BRAIN/TTS) + 自己填 `AI_KEY` 就能切实现.

### Wipe stale

```bat
set "BRAIN_TYPE="
set "AI_URL="
set "AI_MODEL="
```

防 shell 残留 env 跨 brand 串味. 用户上次跑 ollama 留下 `AI_URL=localhost:11434/v1`, 这次想跑 deepseek 但忘改 — wipe 让它干净. `AI_KEY` 不 wipe (用户填一次保留).

### Per-brain mapping (PRD-002 简化, 通用三孔)

```bat
if /I "%BRAIN%"=="claude"   ( set "BRAIN_TYPE=claude" )
if /I "%BRAIN%"=="deepseek" (
    set "BRAIN_TYPE=deepseek"
    set "AI_URL=https://api.deepseek.com/v1"
    set "AI_MODEL=deepseek-chat"
)
if /I "%BRAIN%"=="ollama"   (
    set "BRAIN_TYPE=ollama"
    set "AI_URL=http://localhost:11434/v1"
    set "AI_MODEL=qwen2.5:7b"
)
if /I "%BRAIN%"=="openai"   (
    set "BRAIN_TYPE=openai-compat"
    set "AI_URL=https://api.openai.com/v1"
    set "AI_MODEL=gpt-4o-mini"
)
```

所有 brand 共用 `AI_URL` + `AI_MODEL`, 不再有 brand 专属 URL 孔. BRAIN_TYPE 决定走哪条代码路径.

### Per-TTS mapping

```bat
if /I "%TTS%"=="mock"        ( set "TTS_TYPE=mock" )
if /I "%TTS%"=="gpt-sovits"  ( set "TTS_TYPE=gpt-sovits" )
if /I "%TTS%"=="voxcpm" (
    set "TTS_TYPE=voxcpm"
    set "VOXCPM_URL=http://127.0.0.1:8001"
    set "VOXCPM_MODEL=%~dp0tools\voxcpm-server\VoxCPM2"
)
```

`VOXCPM_MODEL` 是本地路径 — 用户 VPN 关时避免 HF 下载. ModelScope 下的 snapshot 放这.

### VoxCPM 自动起

```bat
if /I "%TTS%"=="voxcpm" (
    netstat -ano | findstr ":8001 " | findstr LISTENING >nul 2>&1
    if errorlevel 1 (
        echo Launching VoxCPM server in separate window...
        if exist "%~dp0tools\voxcpm-server\.venv\Scripts\python.exe" (
            start "VoxCPM TTS Server" /D "%~dp0tools\voxcpm-server" .venv\Scripts\python.exe app.py
        ) else (
            start "VoxCPM TTS Server" /D "%~dp0tools\voxcpm-server" python app.py
        )
    ) else (
        echo VoxCPM already running on :8001, skip launch.
    )
)
```

- 先 netstat 检查 :8001 是否在听 — 防重复跑 bat 起多个
- venv 优先 (装好就用), 没 venv fallback 系统 python
- `start` 新窗 — 用户能单独关掉 vox 不影响 PWA/Server. 也方便看 vox log.
- `/D` 切目录到 `tools/voxcpm-server/`

### 启动 banner

`echo` 关键配置 (`BRAIN_TYPE` / `AI_URL` / `AI_MODEL` / `AI_KEY:~0,8` / `TTS_URL` / `VOXCPM_URL`) — 让用户启动时立即看到. key 只显前 8 位防 shoulder-surfing.

### 跑 pnpm dev

```bat
call pnpm dev
```

`call` 而非直接 `pnpm dev` — 让后面的 `echo Stopped` 和 `pause` 能跑到. 这是 Windows cmd 特性: 不 call 直接调 .cmd 会**永远不返回**.

### 退出处理

```bat
echo --------------------------------------------
echo   Stopped.  Press any key to close...
echo --------------------------------------------
pause >nul
```

让用户看到崩溃 log 再关窗 (而不是 crash 后窗口立刻消失什么也看不到).

### ASCII-only 约束

bat 文件**必须 100% ASCII** ([[feedback_bat_ascii_only]] memory). cmd parser 多字节字符会把 IF paren 匹配乱掉闪退. 改完用 Python 字节扫验.

## `pnpm dev` 跑了什么

`package.json:13`:

```json
"dev": "turbo dev"
```

turbo 会按各包的 `package.json` 里 `scripts.dev` 跑. apps/pwa 是 `next dev -p 3000`, apps/server 是 `tsx watch src/index.ts`. 并行启动.

`pnpm-workspace.yaml:1-7`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/arch-test'
  - 'tools/configs'
```

`tools/*` 不 glob — 只列两个真有 `package.json` 的子包. 其他 (`blender/` / `voxcpm-server/`) 没 `package.json`, glob 会让 pnpm 11 报错.

## env 读取 + 校验

`apps/server/src/index.ts`:

```ts
const env = loadEnv()
```

`loadEnv` (`packages/shared/src/config/index.ts`):

```ts
export function loadEnv(source = process.env): Env {
  return envSchema.parse(autoInferDeepseek(source))
}
```

`autoInferDeepseek` (PRD-002 简化后): set 了 `AI_KEY` 但没 set `BRAIN_TYPE` → 自动推 deepseek + 官方 `AI_URL` + `AI_MODEL=deepseek-chat`. 让"我懒得改 bat, 只 export 一个 AI_KEY"也能跑.

zod schema 校验失败会抛 `ZodError`, fastify 没起来直接终止. 用户在 bat 窗口能看到错误.

## 容器装配顺序 (`apps/server/src/composition.ts`)

```ts
1. createDb(env.DATABASE_URL) → DbClient
2. dbClient.applyMigrations(env.MIGRATIONS_DIR) (默认 infra bundled)
3. createNcmAccountRepo(dbClient) → accountRepo
4. createSystemClock() → clock
5. 返回 Container:
   - brain: createBrain(BRAIN_TYPE, {aiUrl, aiKey, aiModel})  ← PRD-002 三孔
   - tts: createTts(TTS_TYPE, {ttsUrl, voxcpmUrl, voxcpmVoiceDesign})
   - ncm: new NcmClient(NCM_COOKIE, clock)
   - songs/plays/snapshot/account/conversations: 5 个 repo
   - userPrefs: createFilesystemUserPrefsRepo({dataDir: USER_PREFS_DIR ?? <相对源文件>})
   - shortTerm: createShortTermMemoryRepo({redisUrl, idleTtlMs, clock, log: 临时 stderr})
   - longTerm: createFilesystemLongTermRepo({filePath: LONG_TERM_PATH ?? <相对源文件>})
```

注意 brain / TTS 在 `createBrain` 里**不真连**, lazy resolver — 第一次 stream/synthesize 才检查 URL env. 让 startup 不卡.

## 默认数据目录

- DB: `./data/deepulse.db` (相对 server 进程 cwd, 不太 robust 但单用户场景够)
- 用户手写 prefs: `apps/server/data/user-prefs/{long-term,short-term}.md`
- DJ 长期记忆: `apps/server/data/dj-long-term.md`

这些目录第一次启动 `deepulse.bat` 时不存在也 OK — 各 repo 第一次写时会创建 (`createDb` 里 `mkdirSync(dir, {recursive:true})`, `longTerm.append` 里 `mkdir({recursive:true})`).

## 排障速查表

| 症状                                                   | 第一步看                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 前端 `Failed to fetch`                                 | `curl --noproxy "*" http://127.0.0.1:8787/api/login/status` — 200 = 前端问题, refused = 后端死了重起 |
| 端口被占 EADDRINUSE                                    | `netstat -ano \| findstr ":3000"` 找 PID, `Stop-Process -Id <pid> -Force`                            |
| dev server hang                                        | 杀 node 进程 + 根目录 `pnpm dev` 重起                                                                |
| `pnpm dev` 起不来                                      | `pnpm install`; engines `node >= 22.13`, pnpm 11                                                     |
| DJ chat `[出错: BRAIN_TYPE=X 必须 set AI_URL]`         | AI_URL 没 set. 通用孔, 对照 [[04 shared 包]] env 表补                                                |
| server log brainType=openai-compat 但你以为是 deepseek | env 没传到 server 进程. bat 窗 echo 的 `BRAIN_TYPE` 跟 server log 对照                               |
| VoxCPM 窗口闪退                                        | venv 没装 / torch CUDA 错 / GPU 内存爆. 见 `tools/voxcpm-server/`                                    |
| 浏览器有歌名/UI 但无声                                 | 检查 audio 元素 `crossOrigin="anonymous"`; 检查 sharedAudioCtx 是否被 resume (需用户 gesture)        |

## 相关笔记

- [[04 shared 包]] — env 全表
- [[06 apps-server]] — 启动后 Fastify 注册的 10 个 plugin
- [[00 总览]] — 顶层数据流
