// TTS 接口 · 实现：infrastructure/tts/（GPT-SoVITS :8000 客户端）

// 元组在前,类型从元组推导 — 让 zod.enum / array.includes 这些运行时校验和类型保持单一真相源
// 产品决策: 只做正面 + 中性情绪, 不做负面 (恐惧/难过/生气). 电台主播 persona 不该传负面情绪给用户
export const TTS_EMOTIONS = ['中立', '开心'] as const
export type TtsEmotion = (typeof TTS_EMOTIONS)[number]

export type TtsSynthesizeRequest = {
  readonly text: string
  readonly emotion: TtsEmotion
}

export type TtsSynthesizeResult = {
  readonly audioUrl: string
}

export type ITtsClient = {
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>
}
