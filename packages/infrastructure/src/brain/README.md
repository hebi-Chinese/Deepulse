# Brain Adapters

实现 `IBrain` 接口 (在 `@deepulse/application/ports/brain`).

## 设计哲学 (PRD-002, 2026-06-14): AI_URL + AI_KEY + AI_MODEL 通用三孔

所有非 claude brand 共用同一对 env 孔位:

- `BRAIN_TYPE` 决定走哪条**代码路径** (claude CLI vs OpenAI compat)
- `AI_URL` 决定连**哪个 endpoint**
- `AI_KEY` 通用 API key
- `AI_MODEL` 通用 model 名

`AI_URL` 没填 startup 不抛 — 第一次 fetch 时 lazy throw `BRAIN_TYPE=X 必须 set AI_URL env`. 不静默走错地方.

历史: 旧设计每 brand 各一个 URL 孔 (`DEEPSEEK_URL` / `OLLAMA_URL` / `OPENAI_BASE_URL`), 用户反馈"孔太多容易出问题", 简化为三孔, 见 [PRD-002](../../../../架构笔记/PRD/2026-06-14/PRD-002-env%20简化为%20AI_URL+AI_KEY%20一对一.md).

## 已实现

| Type            | 必须 set 的 env                            | 用途                                |
| --------------- | ------------------------------------------ | ----------------------------------- |
| `claude`        | (无 AI\_\*)                                | 用户本机 claude CLI                 |
| `deepseek`      | `AI_URL` + `AI_KEY` + `AI_MODEL`           | DeepSeek 官方 API                   |
| `ollama`        | `AI_URL` + `AI_KEY`(任意非空) + `AI_MODEL` | 本地 Ollama (不验 key)              |
| `openai-compat` | `AI_URL` + `AI_KEY` + `AI_MODEL`           | 官方 / 自部署 / OpenRouter 都走这条 |
| `custom`        | (不走 env, composition root 塞 resolver)   | fork 者自己接的私有 LLM             |

## BYO LLM — 4 种典型配置

`deepulse.bat` 顶部改 `set "BRAIN=..."` 即可, 下面是各 BRAIN 对应的完整 env. (其实 bat 里 BRAIN=deepseek/ollama/openai 这三种已经替用户 set 了 AI_URL 跟 AI_MODEL 默认, 用户只需要给 AI_KEY.)

### 1. DeepSeek (推荐: 便宜 + 中文好)

```bat
set BRAIN_TYPE=deepseek
set AI_URL=https://api.deepseek.com/v1
set AI_KEY=sk-xxx
set AI_MODEL=deepseek-chat
```

key 在 <https://platform.deepseek.com> 拿. ~¥0.001/条消息.

### 2. Ollama 本地 (推荐: 零成本 + 离线)

```bat
set BRAIN_TYPE=ollama
set AI_URL=http://localhost:11434/v1
set AI_KEY=fake-ollama-key
set AI_MODEL=qwen2.5:7b
```

先 `ollama pull qwen2.5:7b`. `AI_KEY` 不验证但不能为空 (OpenAI 协议会拒空 key).

### 3. OpenAI 官方

```bat
set BRAIN_TYPE=openai-compat
set AI_URL=https://api.openai.com/v1
set AI_KEY=sk-proj-xxx
set AI_MODEL=gpt-4o-mini
```

### 4. 任意 OpenAI 兼容服务

(vLLM / LMStudio / OpenRouter / Together / Groq / 阿里通义 / 智谱 / ...)

```bat
set BRAIN_TYPE=openai-compat
set AI_URL=https://openrouter.ai/api/v1
set AI_KEY=sk-or-xxx
set AI_MODEL=meta-llama/llama-3.3-70b-instruct
```

### 5. Custom (私有 LLM)

如果想用某个**不能用 env 配 URL** 的私有 LLM (动态拉取 endpoint / 走 SSO 等), 在 `apps/server/src/composition.ts` 的 `createBrain(env.BRAIN_TYPE, {...})` 里加 `customResolver`:

```ts
createBrain('custom', {
  // ... 别的字段 (aiUrl 可不传, customResolver 接管)
  customResolver: () => {
    // 这里写你自己的 URL 解析逻辑, 每次 fetch 调一次
    return 'https://my-private-llm.internal/v1'
  },
})
```

然后 `set BRAIN_TYPE=custom`. URL 完全在你代码里, env 里 `AI_URL` 可不 set.

## 添加全新 brain (非 OpenAI 协议)

如果你的模型**不是** OpenAI 协议 (例如 Cohere / Bedrock 原生 / Mistral SDK):

1. 本目录新建 `<name>/` 子目录
2. `<name>/index.ts` 实现 `IBrain` (`stream` + `generateJson` 两方法)
3. 父级 `./index.ts` 的 `BrainType` 加新 enum + 注册 `createBrain` switch 分支
4. `packages/shared/src/config/index.ts` 的 `BRAIN_TYPE` zod enum 也加上
5. (可选) 加测试 `<name>/index.test.ts`
6. 仍然用 `AI_URL` 作为 endpoint 孔, 跟其他 brand 一致 (PRD-002 哲学: 一对一孔位)

**架构约束**: 兄弟 adapter 间**不要互相 import** (架构测试会拒绝). Provider 隔离 → 删除一个不会影响其他.
