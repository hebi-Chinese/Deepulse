# TTS Adapters

实现 `ITtsClient` 接口 (在 `@claudio/application/ports/tts`). 唯一方法 `synthesize({text, emotion}) → {audioUrl}`.

## 已实现

| Type 枚举    | 适配器                          | 用途                                                                |
| ------------ | ------------------------------- | ------------------------------------------------------------------- |
| `mock`       | `mock/MockTtsClient`            | **默认**, 返回 1 秒静音 wav (data URI), fork 者跑全链路不报错       |
| `gpt-sovits` | `gpt-sovits/GptSovitsTtsClient` | 用户本地: HTTP POST GPT-SoVITS `:8000/infer_single`, 流萤声线模型   |
| `voxcpm`     | `voxcpm/VoxCpmTtsClient`        | OpenBMB VoxCPM2: HTTP POST `:8001/synthesize`, 30 语言 voice design |

`voxcpm` 配套 Python wrapper 在 `tools/voxcpm-server/` (见那里的 README).

## emotion 怎么传

`ITtsClient.synthesize({text, emotion})` 的 `emotion` 是 Claudio 内部 5 选 1
枚举 (开心/难过/生气/中立/害羞).

- `gpt-sovits` 原生有 emotion 字段, 直传
- `voxcpm` 没有 emotion, adapter 把 emotion 翻成中文 hint 拼到 `voice_design`
  尾巴, 让 vox 自己渲染
- `mock` 不在意, 静音 wav

## 自己加一个 TTS provider

1. 本目录新建 `<name>/` 子目录
2. `<name>/index.ts` 实现 `ITtsClient`
3. 父级 `./index.ts` 的 `TtsType` 加 enum + 注册 `createTts` 分支
4. `shared/config` 的 `TTS_TYPE` zod enum 也加
5. 兄弟 adapter 间**不要互相 import** (架构测试拒绝)
6. brand 专属 URL env (e.g. `XYZ_URL`), 没设就在 factory case 里抛 — 跟 brain
   一样的"不预填, 不静默走错地方"哲学

## 模式参考

- gpt-sovits 跟 voxcpm 几乎同构 (undici + zod schema + rewriteHost), 是最好的
  抄写起点
- 要 streaming TTS 可参考 brain/openai-compat 的 SSE 模式
