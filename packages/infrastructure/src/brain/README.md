# Brain Adapters

实现 `IBrain` 接口 (在 `@claudio/application/ports/brain`).

## 设计哲学 (用户 2026-06-07): URL 一层, brand 专属, 0 预填

每个 `BRAIN_TYPE` 读**自己专属的 URL env var**, 互不串味. 不预填任何 default URL — 没填 startup throw `BRAIN_TYPE=X 必须 set X_URL env`, 不静默走错地方.

理由: shell 残留 (e.g. `export OPENAI_BASE_URL=""`) 不会跨 brand 串. 用户想用 deepseek 时不会因为环境里有别的 OPENAI\_\* 残留而误打到 openai.

## 已实现

| Type            | 必须 set 的 env                                       | 用途                                |
| --------------- | ----------------------------------------------------- | ----------------------------------- |
| `claude`        | (无 URL)                                              | 用户本机 claude CLI                 |
| `deepseek`      | `DEEPSEEK_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`    | DeepSeek 官方 API                   |
| `ollama`        | `OLLAMA_URL` + `OPENAI_MODEL`                         | 本地 Ollama (不验 key)              |
| `openai-compat` | `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL` | 官方 / 自部署 / OpenRouter 都走这条 |
| `custom`        | (不走 env, composition root 塞 resolver)              | fork 者自己接的私有 LLM             |

## BYO LLM — 4 种典型配置

`claudio.bat` 顶部改 `set "BRAIN=..."` 即可, 下面是各 BRAIN 对应的完整 env. (其实 bat 里 BRAIN=deepseek/ollama/openai 这三种已经替用户 set 了 URL 跟 model 默认, 用户只需要给 key.)

### 1. DeepSeek (推荐: 便宜 + 中文好)

```bat
set BRAIN_TYPE=deepseek
set DEEPSEEK_URL=https://api.deepseek.com/v1
set OPENAI_API_KEY=sk-xxx
set OPENAI_MODEL=deepseek-chat
```

key 在 <https://platform.deepseek.com> 拿. ~¥0.001/条消息.

### 2. Ollama 本地 (推荐: 零成本 + 离线)

```bat
set BRAIN_TYPE=ollama
set OLLAMA_URL=http://localhost:11434/v1
set OPENAI_MODEL=qwen2.5:7b
```

先 `ollama pull qwen2.5:7b`. `OPENAI_API_KEY` 不需要 (Ollama 不验证).

### 3. OpenAI 官方

```bat
set BRAIN_TYPE=openai-compat
set OPENAI_BASE_URL=https://api.openai.com/v1
set OPENAI_API_KEY=sk-proj-xxx
set OPENAI_MODEL=gpt-4o-mini
```

### 4. 任意 OpenAI 兼容服务

(vLLM / LMStudio / OpenRouter / Together / Groq / 阿里通义 / 智谱 / ...)

```bat
set BRAIN_TYPE=openai-compat
set OPENAI_BASE_URL=https://openrouter.ai/api/v1
set OPENAI_API_KEY=sk-or-xxx
set OPENAI_MODEL=meta-llama/llama-3.3-70b-instruct
```

### 5. Custom (私有 LLM)

如果想用某个**不能用 env 配 URL** 的私有 LLM (动态拉取 endpoint / 走 SSO 等), 在 `apps/server/src/composition.ts` 的 `createBrain(env.BRAIN_TYPE, {...})` 里加 `customResolver`:

```ts
createBrain('custom', {
  // ... 别的字段
  customResolver: () => {
    // 这里写你自己的 URL 解析逻辑, 每次 fetch 调一次
    return 'https://my-private-llm.internal/v1'
  },
})
```

然后 `set BRAIN_TYPE=custom`. URL 完全在你代码里, env 里啥也不需要 set.

## 添加全新 brain (非 OpenAI 协议)

如果你的模型**不是** OpenAI 协议 (例如 Cohere / Bedrock 原生 / Mistral SDK):

1. 本目录新建 `<name>/` 子目录
2. `<name>/index.ts` 实现 `IBrain` (`stream` + `generateJson` 两方法)
3. 父级 `./index.ts` 的 `BrainType` 加新 enum + 注册 `createBrain` switch 分支
4. `packages/shared/src/config/index.ts` 的 `BRAIN_TYPE` zod enum 也加上
5. (可选) 加测试 `<name>/index.test.ts`
6. **遵守哲学**: 新 brain 也用专属 URL env var (e.g. `COHERE_URL`), 在 envSchema 加 `optional()` 字段, factory 那个 case 调 `requiredEnvResolver('cohere', 'COHERE_URL', cfg.cohereUrl)`

**架构约束**: 兄弟 adapter 间**不要互相 import** (架构测试会拒绝). Provider 隔离 → 删除一个不会影响其他.
