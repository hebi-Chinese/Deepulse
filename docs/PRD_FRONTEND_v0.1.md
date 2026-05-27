# Claudio 前端 PRD · v0.1 (初稿,未定稿)

> 起草: 2026-05-27
> 状态: **草稿,允许多轮迭代**。当前已落 v1 雨景 + 玻璃面板播放器,本 PRD 是把"塑料感"问题之后的设计方向落地,引导 v2 重做。
> 配套设计: 用 `frontend-design` skill 两轮迭代确定
> 配套规范: `CODING_STANDARDS_NODE_TS.md` / `my-coding-standards.md` / PRD.md (产品总 PRD)

---

## 0. 一句话

**Claudio 不是一个播放器 App, 是一间下雨天的小屋。你站在窗前选歌, 关窗后只剩你和这首歌。** 这个房间是所有 view 的物理容器,所有 UI 元素是房间里的家具,所有动效是房间里发生的物理动作。

---

## 1. 已锁定的设计大方向

### 1.1 走向: **「窗の间」(Window Room)**

**方向标签**: 编辑式 × 日式室内静物 × Lofi 房间

**参考世界观**:
- Studio Ghibli 室内静物 (温暖木质 + 窗外雨景)
- 安达充漫画的雨窗
- Lofi Girl YouTube 直播间的窗外动画
- Apple Weather 沉浸雨景

**拒绝清单** (不允许出现):
- ❌ 飘在背景上的 frosted glass 卡片堆 (上版本的塑料感根源)
- ❌ shadcn 默认 / Tailwind 模板 hero (rounded-2xl + 渐变 + emoji)
- ❌ 紫渐变 / 彩虹 accent
- ❌ 物理收音机 3D 对象 (理由见 §4.6)
- ❌ 顶部 nav tab bar (太 SaaS,违反房间隐喻)
- ❌ IM 风聊天气泡

### 1.2 用户要记一辈子的一个瞬间

**点击 ▶ 进入 Listen 那一刻**: 窗户机械合上 800ms → 外面雨声变小变闷 → 灯变暗 → 所有 chrome 收掉 → 唱片机从下方弹入 → 歌词从底部呵气式浮出 → DJ 呵气云在屏幕左下角凝结。

整套动画用来表达"我把外面的世界关掉了"。这是产品差异点的视觉化。

---

## 2. 视觉系统 (tokens)

### 2.1 颜色 (oklch, 时段 tint 只影响"外面"两个变量)

```css
:root {
  /* 房间内 (恒温,跟时段无关) */
  --room-wall:      oklch(18% 0.03 40);  /* 暖深棕墙 */
  --room-floor:     oklch(22% 0.04 50);  /* 深木地板 / 窗台木 */
  --room-frame:     oklch(35% 0.05 50);  /* 窗框木色 */
  --room-frame-hi:  oklch(45% 0.06 55);  /* 木纹高光 */
  --room-lamp:      oklch(82% 0.13 75);  /* 左下暖灯 */
  --room-lamp-dim:  oklch(60% 0.10 70);  /* Listen 模式灯变暗时用 */

  /* 窗外 (跟时段变,跟天气变) */
  --outside-far:    oklch(50% 0.06 240); /* 远景冷蓝,useTimeTint 接管 */
  --outside-near:   oklch(35% 0.05 245);

  /* 玻璃 + 文字 */
  --glass-tint:      oklch(60% 0.02 230 / 0.15);
  --glass-condense:  oklch(85% 0.02 230 / 0.6);  /* 大水珠主色 */
  --text-on-paper:   oklch(20% 0.02 50);         /* Browse 纸面字 */
  --text-on-glass:   oklch(94% 0.02 70);         /* Listen 玻璃字 */
  --lyric-active:    oklch(96% 0.02 70);
  --lyric-passive:   oklch(50% 0.02 60);
  --dj-cream:        oklch(88% 0.015 65);        /* DJ 用户选歌色 */
  --dj-amber:        oklch(82% 0.13 75);         /* DJ AI 选歌色,等于 lamp */
}
```

### 2.2 字体 (三栈,各司其职)

```css
:root {
  /* Display: 标题 + Claudio logo + 歌曲名 */
  --font-display: "Cormorant Garamond", "Source Han Serif SC", "Songti SC", serif;

  /* Body: 列表 / 搜索 / 队列 */
  --font-body: "Inter", "Source Han Sans SC", system-ui, sans-serif;

  /* Lyric: Listen 模式歌词 (跟 display 同源但更细) */
  --font-lyric: "Source Han Serif SC", "Songti SC", "Cormorant Garamond", serif;
  /* font-weight: 200; */

  /* DJ: 呵气云手写感 */
  --font-dj: "FZShuTi-Heavy", "STKaiti", "KaiTi", "楷体", "Cormorant Garamond", serif;
  /* italic */

  /* Mono: 时间显示 / 数字 / debug */
  --font-mono: "JetBrains Mono", "Menlo", monospace;
}
```

**配对理由**: 衬线 + 楷体打底"有书页气",sans 留给需要扫读列表,mono 留给数字。**不用任何默认 system-ui 替代衬线显示** —— 那是塑料感的视觉来源之一。

### 2.3 间距 (8pt + 编辑式宽松)

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 64px;
  --space-7: 96px;
}
```

**用法约定**: 卡片内 padding 用 `space-4`,section 间隔用 `space-6`,Listen 模式歌词左右留白用 `space-7`。

### 2.4 动效 token

```css
:root {
  --ease-mech:  cubic-bezier(0.65, 0, 0.35, 1);   /* 机械感: 窗户开关 */
  --ease-soft:  cubic-bezier(0.16, 1, 0.3, 1);    /* 软弹: UI 入场 */
  --ease-organic: cubic-bezier(0.4, 0, 0.6, 1);   /* 自然: 歌词 / 云呼吸 */

  --dur-fast:        150ms;
  --dur-normal:      300ms;
  --dur-window-close: 800ms;
  --dur-window-open:  600ms;
  --dur-lyric-line:   600ms;
  --dur-dj-fade:      600ms;
}
```

### 2.5 表面 (surface) 处理

不同物体走不同表面,**禁止全场一套 glass card**:

```css
/* 窗台上的纸 (Browse 用): 暖棕色实色 + 顶端 1px 高光 */
.paper-on-sill {
  background: oklch(28% 0.04 45);
  border-top: 1px solid oklch(45% 0.06 55);
  border-radius: 4px 4px 2px 2px;
  box-shadow:
    inset 0 1px 0 oklch(50% 0.06 55),  /* 顶部木纹反光 */
    0 2px 12px oklch(8% 0.02 40 / 0.4);
}

/* 窗框 (Browse 主视觉边界): 木质感 */
.window-frame {
  background: linear-gradient(
    180deg,
    oklch(40% 0.06 55) 0%,
    oklch(35% 0.05 50) 50%,
    oklch(30% 0.04 48) 100%
  );
  /* + 木纹 SVG noise overlay,0.08 opacity */
  box-shadow:
    inset 0 1px 0 oklch(55% 0.07 55),
    0 8px 24px oklch(8% 0.02 40 / 0.7);
}

/* 呵气云 (DJ 用): 不规则圆角 + backdrop-blur */
.breath-cloud {
  border-radius: 32px 24px 40px 28px / 28px 36px 24px 32px;
  backdrop-filter: blur(12px) saturate(0.85);
  background: radial-gradient(ellipse at 30% 40%,
    rgba(255,255,255,0.10) 0%,
    rgba(255,255,255,0.04) 60%,
    transparent 100%);
  box-shadow:
    inset 0 0 80px rgba(255,255,255,0.06),
    0 0 24px rgba(180,200,230,0.08);
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.15));
  /* 无 border! */
}
```

---

## 3. View 系统 (5 个 view + 1 个模态)

### 3.1 总览

| View | 房间隐喻 | 核心内容 | M 里程碑 | 实施状态 |
|---|---|---|---|---|
| **Browse** | 站在窗前 (向前看) | 搜索 + 推荐 + 队列 | M1 已起,v2 重做 | v0 已有,v2 待做 |
| **Listen** | 关窗沉浸 (模态) | 唱片 + 歌词 + viz + DJ 云 | M3-M4 | **本 PRD 重点设计** |
| **Chat / 调台** | 侧头看墙 (右壁) | 跟 Claude DJ 对话 | M3 | 设计已出,等 M3 实施 |
| **Taste / 品味** | 低头看桌 (sill 展开) | taste.md 手编 + NCM snapshot | M4 | v0.2 PRD 再细化 |
| **Today / 今日** | 抬头看墙 (左壁) | 今日 plan + 天气 + 日程 | M5/M6 | 占位,v0.2 PRD 再细化 |

### 3.2 导航方式 (打破 SaaS 直觉)

**禁止顶部 tab bar**。改用:
- **键盘**:
  - `←/→` 在 Browse ↔ Chat 之间转头 (向右切 Chat = 房间向左平移 30%,墙体露出右半部)
  - `↓` 低头看桌 (Taste)
  - `↑` 抬头看墙 (Today)
  - `Enter` 在某首歌上 = 关窗进 Listen
  - `Esc` 在任何深层 view = 回 Browse (正面看窗)
- **鼠标手势** (二级): 拖拽屏幕边缘 50px 触发对应方向切换
- **移动端**: 底部一行 5 个小圆点,swipe 切 view (但不抢眼)

**视觉切换**: 不做真 3D,做 2D 视差伪装 —— 房间背景层 (墙 + 灯 + 窗框) 整体 translate, view 内容跟着进出。500ms `--ease-mech`。

### 3.3 Listen 是模态,不是平面 view

Listen **覆盖**当前任何 view (通常从 Browse 进),退出回到来源 view。**不参与左右上下导航**。

---

## 4. Listen 模式详细规格 (本 PRD 重点)

### 4.1 整体 ASCII mockup

```text
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                  [屋顶 · 周杰伦]              10:42                 │
│                                                                    │
│ ◯◯                                                                 │
│  ◯              半夜睡不着觉                                        │
│ ◯ ◯                                                                │
│        ◯       把心情哼成歌                                         │
│     ◯◯◯                                                            │
│   ◯                                                                │
│      ◯◯     ━━ 只好到屋顶找另一个梦境 ━━━━━━━━━━━━━ ← active        │
│                                                                    │
│             睡梦中被敲醒                                            │
│      ◯◯                                                            │
│  ◯ ◯◯◯                                                             │
│   ◯◯  ◯◯◯◯◯                                                        │
│                                                                    │
│  ╭─ ✎ 你的选歌 ─────────╮                                          │
│  │ 这是你刚点的《屋顶》, │           ◉                              │
│  │ 十点了正适合周杰伦,这 │         ◐ ◑     ← 唱片 (label = cover) │
│  │ 首是 02 年和温岚对唱_│           ◉                              │
│  ╰─ ─ ─ ─ ─ ─ ─ ─嘘… ─╯                                          │
│                                                                    │
│  ▮▯▮▮▯▮▯▯▮▮▯▮▮▮▯▮▯▮▮▯▮▮▯▯▮▮▮▯▮▯▮▮▯ viz       ⊘ 开窗  │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 唱片机 (vinyl record)

| 属性 | 值 |
|---|---|
| 位置 | `position: absolute; bottom: 200px; left: 50%; transform: translateX(-50%)` |
| 直径 | `clamp(240px, 28vw, 360px)` |
| 旋转 | `animation: spin 12s linear infinite` |
| 暂停 | `animation-play-state: paused`,跟 `state.playing` 双向绑 |
| 视觉层 (底→上) | 1. 黑色基底 `oklch(8% 0 0)` + 8px 暖橙光晕<br>2. 8 圈同心唱纹 `oklch(15% 0 0)` opacity 0.4<br>3. 中心圆标贴: 真实贴 NCM cover_url, mask circle, 占 40%<br>4. 轴心: 8px 暖金圆 `oklch(70% 0.12 60)` + 2px 黑点 |
| 换歌动效 | 旧封面 + 唱片 `rotate(+30deg) + opacity 0 + scale 0.92` (0.4s) → 换封面 → 新的从 `rotate(-30deg) + opacity 0` 弹回 (0.5s spring) |
| 唱针 | **不要** (mobile 坐标对不上, desktop 没增益) |

### 4.3 歌词 (immersive lyrics)

| 属性 | 值 |
|---|---|
| 字体 | `--font-lyric` weight 200 |
| 字号 | `clamp(2rem, 3vw, 3.5rem)` |
| 行距 | 1.7 |
| 颜色 | active = `--lyric-active`,passive = `--lyric-passive` |
| Active 样式 | opacity 1 + letter-spacing 1.05× + `text-shadow: 0 0 4px rgba(255,255,255,0.15)` (水汽散射,不是 glow) |
| Passive ±1 样式 | opacity 0.25 + `filter: blur(1px)` |
| ±2 外 | 不渲染 |
| 容器位置 | 上下垂直居中,绝对定位,Z 在 vinyl 之上, max-width 60vw |
| 初次入场 | 左→右 mask reveal,200ms per char (像有人在雾玻璃上划字) |
| 行切换 | 旧 active 向上 24px + opacity → 0.25 + blur 1px (600ms `--ease-organic`),新 active 从下方 12px fade up |
| 水珠遮挡处理 | 大水珠会经过歌词区,字会被水珠区域 `backdrop-filter: blur(2px) hue-rotate(5deg)` 微微扭曲 (实现:水珠 canvas 在 lyric 上层 z=1, lyric z=0) |
| 无 LRC 兜底 | 只居中显示歌名 + 歌手,8s 周期 `0.4 ↔ 1.0` 呼吸 fade |

### 4.4 音频可视化 bars (viz)

| 属性 | 值 |
|---|---|
| 数据源 | Web Audio: `AudioContext.createMediaElementSource(audioRef)` → `AnalyserNode(fftSize:256)` |
| 频率范围 | 取前 64 bin (0-11kHz),log-scale 抽样到 48 bar |
| 位置 | `position: fixed; bottom: 0; left: 50%; transform: translateX(-50%)` |
| 区域 | 80px 高 × ~336px 宽 (48 bar × 3px + 47 gap × 4px) |
| Bar 视觉 | 宽 3px, 颜色 `oklch(94% 0.02 70 / 0.7)`, 顶部 4px 渐变到 1.0 高光 |
| 朝向 | **只向上长** (不上下对称) |
| 高度 | 0-72px, 频率振幅 lerp |
| 平滑 | 低通 `prev * 0.7 + new * 0.3`,避免抽搐 |
| 静音 | bar 全部 2px (基线呼吸) |
| 暂停 | bar 缓降到基线 + 静止 (300ms ease) |
| 实现 | `useAudioAnalyser(audioRef)` hook,失败返回 null,组件渲染 fallback 静态呼吸条 |
| CORS 风险 | NCM 直链可能跨域 → 拿不到数据,需提前测,fallback 已设计 |

### 4.5 DJ 呵气云 (本 PRD 重点新增)

**全部规格**:

| 属性 | 值 |
|---|---|
| 位置 | `position: fixed; left: 32px; bottom: 120px` (避开 viz + vinyl) |
| 尺寸 | `max-width: min(40vw, 420px); min-height: 96px` |
| 形状 | `border-radius: 32px 24px 40px 28px / 28px 36px 24px 32px` (4 角不等) |
| 背景 | `backdrop-filter: blur(12px) saturate(0.85)` + 雾感 radial gradient (见 §2.5) |
| 边框 | **无** (有 border 立刻矩形感复活) |
| 字体 | `--font-dj` italic, `clamp(0.95rem, 1.2vw, 1.15rem)`, weight 400, color `--dj-cream` |
| Padding | `20px 26px 22px 26px` |
| 对齐 | 左对齐 (闲聊感,不是庄重声明) |
| 眉标位置 | 云的左上 -8px 外, font-size 10px, letter-spacing 0.18em |
| 用户选 (Case A) | 眉标 `✎ 你的选歌`, 颜色 `--dj-cream`/.55 |
| AI 选 (Case B) | 眉标 `♪ Claudio 想给你`, 颜色 `--dj-amber`/.65 |
| 入场 | 后端响应到达后 fade up + scale 0.97→1.0 (600ms `--ease-soft`) |
| 退场 | TTS audio ended + 3000ms 后 fade out + scale 1→0.98 (500ms) |
| 字浮现 | 按 TTS audio duration 估算 charsPerMs, requestAnimationFrame 推进 visibleCount, 每字符 0→0.6→1 微淡入 200ms |
| 呼吸 | TTS audio 走 AnalyserNode → RMS → 云 `transform: scale(1 + rms*0.04)` + inset blur 强度跟动 |
| 静音 (本次) | 云右下 `嘘…` 灰色超小字, 点击 = 停 TTS + fade out 200ms |
| 静音 (本会话) | 长按 `嘘…` 1s → toast "本会话不再播 DJ" + sessionStorage |
| 字幕 | 始终显示 (deaf 可访问) |
| TTS 失败 | 云仍出现, 眉标加 🔇 半透明, 字按 5 chars/sec 估算时长 |
| brain 失败 | 整个云不出现, 静默 fallback |
| **不阻塞音乐** | window 关后音乐立即起播, DJ 后台合成完才"溜进来" |

### 4.6 退出 affordance

右下角 `⊘ 开窗` 文字按钮,`oklch(70% 0.01 50 / 0.4)`, hover 时 0.8。click → 触发 Listen → Browse 切换 (见 §5)。

**键盘**: `Esc` 同效。

### 4.7 控件 (transient)

播放/暂停/上下首/进度条 **默认隐藏**, 鼠标移动时浮出 (`opacity 0→0.7` 200ms), 2s 无动作淡出。**像 YouTube 全屏**。

控件位置: 底部 viz 上方, 居中, 半透明黑色横条 (但 backdrop-blur), 高 48px。

### 4.8 收音机: **NO** (最终决定)

**不画物理收音机**。代替方案:
- 用 **声音** 体现电台味: 切歌时短"调台沙沙声" (~600ms, 默认开, 可关)
- 整会话底色叠**极轻黑胶噪点声** (默认关, opt-in)
- 视觉里唯一"电台暗示": Browse sill 角落一个**小指示灯**, 播放中 hover 才微亮

---

## 5. 模式切换动效 (本 PRD 重点)

### 5.1 Browse → Listen (方案 B, 800ms 总)

**关窗一次, 之后 Listen 内换歌窗户不动**。

```
t=0    用户点队列里某首歌的 ▶, 或者搜索结果某行的 ▶
t=0    sill papers (搜索/队列/推荐) 开始 fade + translateY +12 (300ms, stagger 50)
t=200  灯泡 brightness 30% (800ms 缓变)
t=200  窗外 RainEngine 视差速度降 50%
t=200  窗户**机械合上** (clip-path inset 顶 0%→100%, 800ms `--ease-mech`)
t=400  RainEngine ⇌ RainOnGlassEngine cross-fade (透明度切换, 不切实例)
t=500  外面雨声音量降 50% + 切到"打玻璃"音色 (闷响)
t=700  唱片从底部 translateY +200 + rotate(-20deg) + opacity 0 升起 (spring)
t=800  窗户合完
t=800  音乐 audio.play()
t=800  viz bar opacity 0→0.6
t=1000 歌词第一行从底部呵气式浮出
t=R    (后端 dj/say 返回) 云开始 fade up + 字开始浮现
```

### 5.2 Listen → Browse (600ms, 略快)

```
t=0    用户点 ⊘ 或按 Esc
t=0    云 + 唱片 + 歌词 + viz 同时 fade out + scale 0.95 (200ms)
t=100  RainOnGlassEngine ⇌ RainEngine cross-fade
t=100  外面雨声音量 + 音色恢复
t=100  灯泡恢复 100% brightness
t=100  窗户**打开** (clip-path 顶 100%→0%, 600ms `--ease-mech`)
t=300  sill papers 从下方升起 (200ms, stagger 50)
t=600  全部就位
```

### 5.3 Listen 内换歌 (窗户不动)

只:
- 唱片 + 旧封面 rotate +30 + fade 0.4s → 换封面 → spring 回 0.5s
- 歌词容器整体 fade 0.3s → 换 LRC → fade 0.3s
- viz 持续, 不打断
- 暂停 TTS (如果还在播)
- 新歌起播,等后端返回新 DJ 文案,新呵气云 fade in

### 5.4 暂停 Listen 模式

- 窗户 **不开** (暂停 ≠ 退出, 用户去倒水马上回来)
- 唱片 paused (不转)
- viz 缓降到基线
- 歌词冻结在当前行
- DJ 云保留 (TTS 音频也同步暂停)

### 5.5 跳过到下一首 (Listen 中按下一首)

队列里下一首 → §5.3 流程。**Browse 的队列里给上一首打个灰 ✓** 表示"已跳过"。

---

## 6. Browse 模式重做 (替换当前 glass-card 版)

### 6.1 ASCII mockup

```text
┌─── 整页 = 暖深棕墙 + 左下灯散光 ──────────────────────────────────────┐
│  Claudio                                              10:42 PM      │
│  ─────                                                ─────         │
│                                                                     │
│      ╭══════════ 木窗框 (warm wood frame) ═══════════════════╮      │
│      ║                                                       ║      │
│      ║   ╱   ╱  ╲    ╱   雨在窗外 (沿用 RainEngine)  ╲          ║      │
│      ║     ╱     ╲╲                                          ║      │
│      ║         ╱   ╱   ╲     ╱   ╲                            ║      │
│      ║                                                       ║      │
│      ║                  (透过开着的窗看出去)                    ║      │
│      ║                                                       ║      │
│      ╰═══════════════════════════════════════════════════════╯      │
│      ──────  木窗台 (raised sill, ~40px) ───────────────────────     │
│                                                                     │
│   ┌─── 搜索 (纸条 1) ─────────────────────────────────────────┐    │
│   │   ✎ 写下歌名 或 歌手                                  搜    │    │
│   └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│   今日推荐 · 30 首                       播放队列 · 3                │
│   ─────────                              ─────────                  │
│   01  屋顶                周杰伦          ➤ 屋顶            5:19    │
│   02  晴天                周杰伦          ✓ 哭沙            4:08    │
│   03  一千年以后          林俊杰            晴天            4:30    │
│   ...                                                              │
│                                                                     │
│   晴 雨 雪 雾 雷                  ◉ 小指示灯 (hover 才亮)         [⊙]  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 关键变更 (vs v0 当前实现)

| v0 当前 | v0.1 PRD 要求 |
|---|---|
| 全屏 floating glass cards | 木窗框 + sill 容器, papers-on-sill 表面 |
| Header "Claudio · 个人 AI 电台" 占满宽 | 收成左上小角, 像挂着的小铭牌 |
| Bottom-fixed control bar (玻璃磨砂条) | Browse 不要 control bar (没在播也没必要)。Listen 才有 |
| 天气切换器右上飘着 | 移到 sill 右下角, 跟"小指示灯"并排 |
| 搜索结果展示在玻璃 panel | 纸条形 paper-on-sill 表面, hover 出"播放/加入队列"按钮 |
| 队列显示用 panel | 右侧分栏, sill 上的纸列表, 跳过歌打灰勾 ✓ |
| 无每日推荐 | sill 上左侧主区, **今日推荐 · 30 首** 列表 (NCM 已通 /api/recommend/daily) |
| 时段 tint 影响全页 | 时段 tint 只 tint 窗外的 outside-far/near, 室内不变 |

### 6.3 Browse 没有 DJ

**明确约束**: Browse 模式不出现 DJ 呵气云 / TTS 语音 / 任何 AI 解说。搜索就是搜索, 推荐就是列表。**DJ 只在 Listen 出现**。

---

## 7. 其它 3 个 view (占位规格, v0.2 PRD 再细化)

### 7.1 Chat / 调台

- 触发: `→` 键 / 右滑
- 视觉: 房间向左平移 30%, 露出右墙, 右墙上挂一个"画框" (用 `.paper-on-sill` 同表面+ frame)
- 内容: 上面是对话历史 (用户 msg 卡片右对齐, DJ msg 卡片左对齐 + 自动 TTS), 底部输入框
- 输入触发 brain.stream() 流式回话 + tts.synthesize() 合成
- M3 接 WebSocket 才能真用, v0.1 PRD 占位

### 7.2 Taste / 品味

- 触发: `↓` 键 / 下滑
- 视觉: sill 向上扩展, 占整页, 像桌面摊开了笔记本
- 内容: taste.md markdown 编辑器 (左) + NCM snapshot 概览 (右, 用 /api/snapshot/current)
- M4 落地

### 7.3 Today / 今日

- 触发: `↑` 键 / 上滑
- 视觉: 房间向下平移, 露出墙顶, 墙上挂"台历"
- 内容: 今日 plan 时间轴 (从 plan_items 表读) + 天气 + 飞书日程占位
- M5/M6 落地

---

## 8. 响应式

### 8.1 桌面 (≥1024px)

- 全套规格如上
- 窗框 ~70vw × 70vh
- 唱片机 360px
- DJ 云 max 420px
- 5 view 横竖向导航全开

### 8.2 平板 (640-1024px)

- 窗框收成 ~90vw × 60vh
- 唱片机 280px
- 5 view 仍可横竖向, 但 swipe 手势优先
- DJ 云 max 360px

### 8.3 手机 (<640px)

- **木窗框不渲染** (全屏即玻璃) — 房间在手机失去意义
- Browse: 顶部搜索框固定, 推荐 + 队列做底部抽屉 (drag up to peek, swipe up to expand)
- Listen: 唱片机 240px, 歌词 clamp(1.5rem, 5vw, 2.5rem), viz 隐藏 (太挤)
- DJ 云移到歌词下方水平居中, max-width 90vw
- 5 view 切换: 底部 5 圆点, 点击切, 不 swipe (跟系统手势冲突)

---

## 9. 可访问性

### 9.1 `prefers-reduced-motion: reduce`

- 关 RainEngine + RainOnGlassEngine → 改成 **静帧 PNG** (一张满屏大水珠 + 一道下滑痕)
- 窗户开/关 1.2s → **300ms cross-fade** 替代
- 歌词切换 → 无 translateY, 只 opacity
- DJ 云入场 → fade only, 不 scale
- 唱片旋转 → 暂停 (静态展示封面)
- 5 view 切换 → cross-fade 200ms, 无 parallax

### 9.2 颜色对比

`--lyric-active` (oklch 96%) vs Listen 模式背景 (rain canvas avg oklch ~40%) → 实测对比度 > 7:1 (AAA) ✓

`--text-on-paper` vs `.paper-on-sill` → 对比度 > 8:1 ✓

### 9.3 键盘

- `Space`: 暂停/播放 (任何 view)
- `←/→`: view 切换 (非 Listen) / 上下首 (Listen)
- `↑/↓`: view 切换 (非 Listen) / 音量 (Listen, 5% step)
- `Esc`: 退出 Listen / 关闭抽屉
- `Enter`: 在搜索结果聚焦时 = 播放
- `Tab`: 焦点循环, 焦点环用 `--room-lamp` 暖橙 1px ring

### 9.4 屏幕阅读器

- canvas 全部 `aria-hidden="true"`
- 唱片 `role="img" aria-label="正在播放: 屋顶 · 周杰伦"`
- 歌词 active 行用 `aria-live="polite"` 推到 SR
- DJ 云用 `aria-live="polite"`,文字完整暴露
- viz `aria-hidden="true"`

---

## 10. 现有资产复用清单

| 资产 | v0.1 PRD 怎么用 |
|---|---|
| `RainEngine.ts` | Browse 模式照搬, **就是窗外的雨** |
| `useTimeTint.ts` | 改成只 tint `--outside-far/near` 两个变量, 室内 token 不变 |
| `AtmosphereCanvas.tsx` 主循环 | 拆成 `OutsideCanvas` (窗外, Browse 显示) + `GlassCanvas` (玻璃, Listen 显示), 复用 LoopContext / pointer / ripple |
| `GlassPanel` 当前 Tailwind class | **删**, 改成 `PaperOnSill` (实色暖棕 + inset highlight) |
| `WeatherSwitcher` | 视觉重做 + 位置移到 sill 角落 |
| zod-validated api 客户端 | 完全不动 |
| `/api/dj/say` (M2 已通) | Listen 模式开始时调用, 拿 text + audioUrl |
| brain port `IBrain.generateJson` (M2 已通) | dj.ts plugin 内部用 |
| tts client `GptSovitsTtsClient` (M2 已通) | dj.ts plugin 内部用 |

---

## 11. 实施拆分 (建议 commit 颗粒, 增量可演示)

按这个顺序做, 每个 commit 都能在浏览器看到效果:

1. **token 重做**: 在 globals.css 落 §2 全套 token, 删旧 token
2. **RoomScene 容器**: 墙 + 灯 + 窗框 + sill (空容器, 把现有 player UI 暂时塞进去看效果)
3. **Browse 重做**: PaperOnSill 表面 + 推荐 + 队列 + 搜索, 删 floating glass cards
4. **useViewMode 状态机**: browse | listen 二态, 不含 5 view 全套, 先把 mode 切换搞通
5. **Listen 模态**: 全屏 lyrics + 鼠标 show-controls + ⊘ exit
6. **唱片机组件**: 旋转 + 暂停同步 + 切歌入场
7. **viz bars**: useAudioAnalyser hook + ViewportBars 组件
8. **RainOnGlassEngine**: 大水珠物理 (跟 RainEngine 共享 LoopContext 抽象)
9. **窗户开关动效**: clip-path + cross-fade engines + 雨声音色切换 (音频部分若 M5 前没接 weather 音效, 先用静音 fallback)
10. **DJ 呵气云组件**: 不接 brain, 用 hard-coded 假文本演示视觉
11. **DJ 接真 brain + TTS**: 调 `/api/dj/say`, 字符逐字浮现, 云呼吸
12. **5 view 框架**: Chat / Taste / Today 三个 placeholder view + 导航
13. **响应式 + reduced-motion**

每个 commit 走 typecheck/lint/arch:check + browser 验证 + 推桌宠总结。

---

## 12. 待定项 (v0.2 PRD 再细化)

- [ ] Chat view 的完整对话气泡设计 (M3 真接 WS 时定)
- [ ] Taste view 的 markdown 编辑器选型 (CodeMirror vs Lexical vs 自己实现)
- [ ] Today view 的时间轴可视化 (类似 Apple Calendar?)
- [ ] 天气源 (M5): 接哪个 API (和风/QWeather/系统 location 推断)
- [ ] "调台沙沙声" 音效素材选哪个 (短 600ms wav, 需要找)
- [ ] 黑胶噪点底声音效 (loop wav)
- [ ] DJ 文案的 system prompt 终稿 (现在 polish 那段是占位, 后期得跟 brain 调)
- [ ] DJ 在 Listen 第一首和后续切歌的口播差别 (第一首要"开场欢迎"? 还是都同等)
- [ ] 暂停超过 N 分钟后是否自动退出 Listen (省 CPU? 待测)
- [ ] PWA 离线壳, Service Worker 缓存策略 (M6)
- [ ] 主题切换 v1.5: 黑胶复古 / v2: 二次元 (PRD §10 提到, 但视觉系统得为切换预留架构)
- [ ] 移动端"调台沙沙声"和"黑胶噪点"是否默认禁用 (省流量)

---

## 13. 跟产品总 PRD 的关系

本 PRD 是 `PRD.md` (产品总 PRD) 的**前端落地补充**, 不替代它:

- 产品总 PRD §3 (产品形态), §5 (技术架构), §9 (M0-M6 里程碑) 是上位
- 本前端 PRD 是 §3 + §10 (UI 视觉方向 Q4) 的具体执行方案
- 当产品总 PRD 改动时, 本 PRD 跟改; 反之本 PRD 调整不动总 PRD

---

## 14. 历史轨迹

- 2026-05-26 v1: 雨景 + 玻璃面板 player 落地, 用户评价"塑料感强"
- 2026-05-27 v0.1 (本稿):
  - 第 1 轮 design: 确定"窗の间"方向 + 5 view + 房间隐喻
  - 第 2 轮 design: DJ 呵气云 + 字符逐字浮现 + 云呼吸
  - 多轮对话定:
    - 窗户切换方案 B (一次性合, Listen 内不再开关)
    - 关窗时雨声**变小**不是变响
    - DJ 只在 Listen, Browse 不出现 AI
    - 加唱片机 + viz bars
- 待发: v0.2 PRD (Chat / Taste / Today 详细)

---

## 一句话收束

**这版前端的灵魂是"窗户和呵气"。窗户是物理界限 (内/外, 选歌/听歌), 呵气是有声音的痕迹 (歌词, DJ 解说, 玻璃水珠) — 两者合起来, 让一个人在屏幕前听歌的瞬间, 感觉自己真在某间下雨的房间里, 而不是在用 App。**
