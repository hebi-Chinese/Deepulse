"""VoxCPM HTTP wrapper — 把 Python in-process API 包成 :8001/synthesize.

为啥要这层:
  VoxCPM (OpenBMB/VoxCPM2) 是 Python 库, model.generate(text, ...) 在进程内跑.
  Deepulse 后端是 Node/TS 的 Fastify, 不能跨语言直调, 所以包一层 HTTP.

API:
  POST /synthesize { text, ... }  →  { audio_url }
  GET  /outputs/<file>            →  生成的 wav

跟 gpt-sovits :8000/infer_single 的响应字段 (audio_url) 故意对齐, 让 TS adapter
风格一致 (zod 同一套 shape).

VoxCPM2 Voice Design 备注:
  README 说 VoxCPM2 支持 "voice design" 从自然语言描述生成新嗓子, 但 Python
  generate() API 实际上**没有 voice_design 参数**, 看源码只接 prompt_wav_path/
  prompt_text/reference_wav_path 这类. Voice Design 大概率走 Gradio webui 那
  套包装. 目前先用默认嗓子, 后续真要个性化嗓子再加 reference_wav_path 模式.

启动: 见 README.md
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from voxcpm import VoxCPM

# ─── 配置 ──────────────────────────────────────────────────────────────
# 模型: 默认从 HF cache (openbmb/VoxCPM2) 找; 用户 set VOXCPM_MODEL=./VoxCPM2
# 指本地路径就用本地 (国内 ModelScope 下载到本地后这条用得着)
MODEL_NAME = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
HOST = os.environ.get("VOXCPM_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOXCPM_PORT", "8001"))
OUT_DIR = Path(os.environ.get("VOXCPM_OUT_DIR", "outputs"))
# device: 显式 'cuda' 比 auto 安全 — auto 在没 cuda 时静默 fallback CPU, 合成慢 10x
# 没 GPU 的机器手动 set VOXCPM_DEVICE=cpu
DEVICE = os.environ.get("VOXCPM_DEVICE", "cuda")
# 限制单条文本长度防 OOM/超时 — vox 真上限是 token 不是字符, 留点裕度
MAX_TEXT_LEN = 500

OUT_DIR.mkdir(parents=True, exist_ok=True)

# 全局单例 — 模型 4GB 加载一次复用; FastAPI 默认线程池跑 generate 已经够
_model: VoxCPM | None = None


def get_model() -> VoxCPM:
    global _model
    if _model is None:
        _model = VoxCPM.from_pretrained(MODEL_NAME, load_denoiser=False, device=DEVICE)
    return _model


app = FastAPI(title="VoxCPM TTS wrapper", version="1.0")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LEN)
    # cfg/timesteps 暴露给调用方调参
    # timesteps 默认 7 (vox README 是 10) — 4060 Laptop + SoVITS 共显存场景下抢算力,
    # 7 步减 30% 推理时间, 中文电台口播音质差异感知不到
    cfg_value: float = Field(default=2.0, ge=0.5, le=5.0)
    inference_timesteps: int = Field(default=7, ge=4, le=50)


class SynthesizeResponse(BaseModel):
    audio_url: str


@app.post("/synthesize", response_model=SynthesizeResponse)
def synthesize(req: SynthesizeRequest) -> SynthesizeResponse:
    model = get_model()
    try:
        wav = model.generate(
            text=req.text,
            cfg_value=req.cfg_value,
            inference_timesteps=req.inference_timesteps,
        )
    except Exception as err:  # noqa: BLE001 — model 任何报错都 500, 上层包 ExternalServiceError
        raise HTTPException(status_code=500, detail=f"voxcpm generate failed: {err}") from err

    fname = f"{uuid.uuid4().hex}.wav"
    sf.write(OUT_DIR / fname, wav, model.tts_model.sample_rate)
    # 注意: host 给 127.0.0.1 (跟 gpt-sovits 一致), 浏览器才能解析
    return SynthesizeResponse(audio_url=f"http://{HOST}:{PORT}/outputs/{fname}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME}


app.mount("/outputs", StaticFiles(directory=str(OUT_DIR)), name="outputs")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
