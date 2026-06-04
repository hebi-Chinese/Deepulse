# TTS Adapters

实现 `ITtsClient` 接口 (在 `@claudio/application/ports/tts`). 唯一方法 `synthesize({text, emotion}) → {audioUrl}`.

## 已实现

| Type 枚举    | 适配器                          | 用途                                                              |
| ------------ | ------------------------------- | ----------------------------------------------------------------- |
| `mock`       | `mock/MockTtsClient`            | **默认**, 返回 1 秒静音 wav (data URI), fork 者跑全链路不报错     |
| `gpt-sovits` | `gpt-sovits/GptSovitsTtsClient` | 主人本地: HTTP POST GPT-SoVITS `:8000/infer_single`, 流萤声线模型 |
| `voxcpm`     | (未打包)                        | 占位, fork 者按下方教程自行加                                     |

## 自己加一个 VoxCPM adapter (~2 小时)

VoxCPM 是 OpenBMB 出的开源 TTS, 2B 参数, 30 语言, **Voice Design** (自然语言描述声音, 无需参考音频), Apache 2.0. 比 GPT-SoVITS 适合 fork 者 — 不要主人的流萤模型也能用.

### 步骤 1: 起 VoxCPM HTTP server

VoxCPM 只给了 Python lib + Gradio webui, 我们要自己包一层 HTTP. 在 `tools/voxcpm-server/` 新建:

**`app.py`** (FastAPI wrapper, 单文件 ~80 行)

```python
from fastapi import FastAPI
from pydantic import BaseModel
from voxcpm import VoxCPM
import soundfile as sf
import uuid
from pathlib import Path

app = FastAPI()
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
OUT_DIR = Path("outputs")
OUT_DIR.mkdir(exist_ok=True)

class Req(BaseModel):
    text: str
    voice_design: str = "温柔女声, 25 岁, 语速适中, 中性情绪"  # 默认人设

@app.post("/synthesize")
def synthesize(req: Req):
    wav = model.generate(
        text=req.text,
        voice_design=req.voice_design,
        cfg_value=2.0,
        inference_timesteps=10,
    )
    fname = f"{uuid.uuid4().hex}.wav"
    sf.write(OUT_DIR / fname, wav, model.tts_model.sample_rate)
    return {"audio_url": f"http://127.0.0.1:8001/outputs/{fname}"}

# 静态服务 outputs/
from fastapi.staticfiles import StaticFiles
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
```

启动:

```bash
pip install voxcpm fastapi uvicorn soundfile
uvicorn app:app --host 127.0.0.1 --port 8001
```

### 步骤 2: 写 TS 端 client

`packages/infrastructure/src/tts/voxcpm/index.ts`:

```ts
import { ExternalServiceError } from '@claudio/shared'
import { request } from 'undici'
import { z } from 'zod'
import type { ITtsClient, TtsSynthesizeRequest, TtsSynthesizeResult } from '@claudio/application'

const respSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  audio_url: z.string().min(1),
})

export class VoxCpmTtsClient implements ITtsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly voiceDesign: string,
  ) {}

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/synthesize`
    const res = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: req.text, voice_design: this.voiceDesign }),
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ExternalServiceError('voxcpm', `HTTP ${String(res.statusCode)}`)
    }
    const json: unknown = await res.body.json()
    const parsed = respSchema.safeParse(json)
    if (!parsed.success) {
      throw new ExternalServiceError('voxcpm', `bad shape: ${parsed.error.message}`)
    }
    return { audioUrl: parsed.data.audio_url }
  }
}
```

### 步骤 3: 工厂注册

修改 `infrastructure/src/tts/index.ts` 的 `createTts` 把 `case 'voxcpm':` 改成:

```ts
case 'voxcpm':
  return new VoxCpmTtsClient(config.voxcpmUrl, config.voxcpmVoiceDesign)
```

`TtsFactoryConfig` 加 `voxcpmUrl` + `voxcpmVoiceDesign` 字段.

### 步骤 4: env 加配置

`packages/shared/src/config/index.ts`:

```ts
VOXCPM_URL: z.string().url().default('http://127.0.0.1:8001'),
VOXCPM_VOICE_DESIGN: z.string().default('温柔女声, 25 岁, 中性情绪'),
```

`apps/server/src/composition.ts` 传给 createTts:

```ts
tts: createTts(env.TTS_TYPE, {
  ttsUrl: env.TTS_URL,
  voxcpmUrl: env.VOXCPM_URL,
  voxcpmVoiceDesign: env.VOXCPM_VOICE_DESIGN,
}),
```

### 步骤 5: 切换

`.env`:

```bash
TTS_TYPE=voxcpm
VOXCPM_VOICE_DESIGN=温柔男声, 30 岁, 慵懒带点磁性  # 你自己描述
```

---

## 添加全新 TTS provider

1. 本目录新建 `<name>/` 子目录
2. `<name>/index.ts` 实现 `ITtsClient`
3. 父级 `./index.ts` 的 `TtsType` 加 enum + 注册 `createTts` 分支
4. `shared/config` 的 `TTS_TYPE` zod enum 也加
5. 兄弟 adapter 间**不要互相 import** (架构测试拒绝)
