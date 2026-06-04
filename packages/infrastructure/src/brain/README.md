# Brain Adapters

实现 `IBrain` 接口(在 `@claudio/application/ports/brain`)。

## 已实现

| Type 枚举       | 适配器                            | 用途                                                                            |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `claude`        | `claude/ClaudeCodeBrain`          | 主人本地用 — 包装 `claude` CLI 子进程 (要 Pro 订阅, 不推荐他人复用)             |
| `openai-compat` | `openai-compat/OpenAICompatBrain` | **通用 BYO 入口** — 任何说自己 OpenAI-compatible 的 `/v1/chat/completions` 服务 |
| `deepseek`      | 同上                              | 走 OpenAICompatBrain, 默认 base_url `api.deepseek.com/v1`                       |
| `ollama`        | 同上                              | 走 OpenAICompatBrain, 默认 base_url `localhost:11434/v1`                        |

## BYO LLM — 4 种典型配置

在 `.env` (或环境变量) 选一种贴上即可,无须改代码:

### 1. DeepSeek (推荐:便宜 + 中文好)

```bash
BRAIN_TYPE=deepseek
OPENAI_API_KEY=sk-xxx                # 从 https://platform.deepseek.com 拿
OPENAI_MODEL=deepseek-chat
# OPENAI_BASE_URL 不用设, 工厂自动用 api.deepseek.com/v1
```

### 2. Ollama 本地 (推荐:零成本 + 离线)

```bash
BRAIN_TYPE=ollama
OPENAI_MODEL=qwen2.5:7b              # 先 `ollama pull qwen2.5:7b`
# OPENAI_API_KEY 不用 (Ollama 不验证)
# OPENAI_BASE_URL 默认 localhost:11434/v1
```

### 3. OpenAI 官方

```bash
BRAIN_TYPE=openai-compat
OPENAI_API_KEY=sk-proj-xxx
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL 默认 api.openai.com/v1
```

### 4. 任意 OpenAI 兼容服务 (vLLM / LMStudio / OpenRouter / Together / Groq / 阿里通义 / 智谱 ...)

```bash
BRAIN_TYPE=openai-compat
OPENAI_BASE_URL=https://openrouter.ai/api/v1      # 自己服务的 base_url
OPENAI_API_KEY=sk-or-xxx
OPENAI_MODEL=meta-llama/llama-3.3-70b-instruct    # 该服务支持的 model id
```

## 添加全新 brain (非 OpenAI 协议)

如果你的模型 **不是** OpenAI 协议(例如 Cohere / Bedrock 原生 / Mistral SDK):

1. 本目录新建 `<name>/` 子目录
2. `<name>/index.ts` 实现 `IBrain` (`stream` + `generateJson` 两方法)
3. 父级 `./index.ts` 的 `BrainType` 加新 enum + 注册 `createBrain` switch 分支
4. `packages/shared/src/config/index.ts` 的 `BRAIN_TYPE` zod enum 也加上
5. (可选) 加测试 `<name>/index.test.ts`

**架构约束**:兄弟 adapter 间**不要互相 import**(架构测试会拒绝)。Provider 隔离 → 删除一个不会影响其他。
