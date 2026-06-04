// DJ persona prompt 装配
// 系统提示分三段:
//   1. PERSONA       角色 + 真实电台 DJ 节奏感
//   2. USER PREFS    主人手写的长/短期喜好 (从 data/user-prefs/*.md 读)
//   3. CONTEXT       当前场景 (currentSong / queueLen / weather)
// 多轮历史 (最近 6 条) 转成 user/assistant 交替消息

import type { DjContext } from './types.js'
import type { ConversationEntry, BrainMessage, UserPrefs } from '../ports/index.js'

// 真实电台 DJ 风格指令:
//   - 不每句都点评, 有时只用 1 句话承接, 有时一段开场/串场
//   - 用动作标签可以无缝换歌
//   - "节奏感" 体现在: 短句多, 偶尔长句, 不写文绉绉的散文
const PERSONA = `你是流萤(《崩坏:星穹铁道》角色), 此刻作为深夜电台 DJ 陪伴你的"主人"(就是用户)。

## 你的角色
- 第一人称口吻, 称呼"主人", 全中文口语化, 温柔 + 一点俏皮 + 神秘感。
- 是真在做电台节目, 不是客服 — 不要列点, 不要标准回答, 不要"好的, 已为您..."的腔。

## 真实电台 DJ 节奏 (核心)
- **不是每首歌都要长段口播**。模仿真电台 DJ 的节奏感:
    - 开场 (主人刚进来) → 来一段 (2-4 句, 带情绪/天气/时段感)
    - 普通串场 → 一句话承接 (8-15 字), "送你一首" / "下面这个" 这种
    - 你主动推一首特别想分享的歌 → 可以多说 (2-3 句, 讲讲为啥这首)
    - 主人随口问 / 闲聊 → 跟着话题走, 不必每句都拐到歌
- **长短交替, 不要每条都同样长度**。一段长 → 接一两条短 → 再长。
- **一段最长 4 句, 不能写散文**。宁可短促, 不要絮叨。
- 主人没问意见时, 不要主动评价歌好不好。

## 控制播放 (inline 标签会从主人看到的文本里被剥掉, 可自由穿插)
- \`<<play:关键词>>\`   立刻搜索播放, 关键词写歌名或 "歌手 歌名"
- \`<<queue:关键词>>\`  加进队列尾, 不打断当前
- \`<<next>>\`          跳下一首
- 用动作时, 前/后放一句口语承接 (如 "好嘞这就放" / "下一首是这个")。
- 不要假装放歌 — 真要换歌就用标签, 不需要就别加。

## 严禁
- 写英文 (除歌名/艺人名以外)
- 写代码块
- 解释这些规则
- 把动作标签的语法念出来给主人听`

type BuildArgs = {
  readonly history: readonly ConversationEntry[]
  readonly userText: string
  readonly context?: DjContext
  readonly prefs?: UserPrefs
}

export function buildDjPrompt(args: BuildArgs): readonly BrainMessage[] {
  const { history, userText, context, prefs } = args
  // 三段 system: PERSONA 永远在; prefs 可能空 (返 null 时跳过); context 永远在
  // SECURITY: prefs 已在 loadUserPrefs 里做 8KB cap, 但要警惕未来如果有自动写入
  // prefs 的路径, prompt 注入风险会激活 — 现在的信任边界是 "本机手写"
  const sections: string[] = [PERSONA]
  const prefsBlock = formatPrefs(prefs)
  if (prefsBlock !== null) sections.push(prefsBlock)
  sections.push(formatContext(context))
  const messages: BrainMessage[] = [{ role: 'system', content: sections.join('\n\n') }]
  // 历史按 tsMs 升序, 取最近 6 条按时间顺序拼成 user / assistant 交替
  for (const entry of history) {
    messages.push({ role: 'user', content: entry.userMsg })
    messages.push({ role: 'assistant', content: entry.djReply })
  }
  messages.push({ role: 'user', content: userText })
  return messages
}

// 返回 null 表示无 prefs 可拼 (空文件 / 都没填) — 让调用方明确跳过这段, 不靠 '' 的隐式约定
function formatPrefs(prefs?: UserPrefs): string | null {
  if (prefs === undefined) return null
  const longTrim = prefs.longTerm.trim()
  const shortTrim = prefs.shortTerm.trim()
  if (longTrim === '' && shortTrim === '') return null
  const parts: string[] = ['# 主人的喜好 (用这些来挑歌/找话题, 但别复读)']
  if (longTrim !== '') {
    parts.push(`## 长期偏好\n${longTrim}`)
  }
  if (shortTrim !== '') {
    parts.push(`## 最近的状态\n${shortTrim}`)
  }
  return parts.join('\n\n')
}

function formatContext(ctx?: DjContext): string {
  return ['# 当下场景', formatCurrentSong(ctx), ...formatExtras(ctx)].join('\n')
}

function formatCurrentSong(ctx?: DjContext): string {
  if (ctx?.currentSong === undefined) return '当前没歌在放; 主人可能刚进来。'
  return `当前正放: ${ctx.currentSong.title} · ${ctx.currentSong.artists}`
}

function formatExtras(ctx?: DjContext): readonly string[] {
  if (ctx === undefined) return []
  const out: string[] = []
  if (ctx.queueLen !== undefined && ctx.queueLen > 0) {
    out.push(`队列还有 ${String(ctx.queueLen)} 首。`)
  }
  if (ctx.recentlySkipped !== undefined && ctx.recentlySkipped.length > 0) {
    out.push(`最近被跳过: ${ctx.recentlySkipped.slice(0, 3).join('、')}`)
  }
  if (ctx.weatherHint !== undefined && ctx.weatherHint.length > 0) {
    out.push(`外面: ${ctx.weatherHint}`)
  }
  return out
}
