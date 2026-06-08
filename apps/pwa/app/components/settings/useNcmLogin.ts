'use client'

// useNcmLogin · 网易云扫码登录状态机
//
// 状态:
//   idle      — 显示 "扫码登录" / 或已登录信息
//   fetching  — 调 qrCreate 拿二维码中
//   pending   — 拿到 QR,等用户扫
//   scanned   — 已扫码,等用户在手机确认
//   success   — 登录成功 (1.5s 后回 idle 显示已登录)
//   expired   — 二维码过期
//   error     — 网络出错
//
// 轮询: 拿到 unikey 后每 2s 调 check,直到 success / expired / unmount

import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../../lib/api'

const POLL_INTERVAL_MS = 2000

export type LoginState =
  | { readonly kind: 'idle'; readonly loggedIn: boolean }
  | { readonly kind: 'fetching' }
  | { readonly kind: 'pending'; readonly unikey: string; readonly qrImg: string }
  | { readonly kind: 'scanned'; readonly unikey: string; readonly qrImg: string }
  | { readonly kind: 'success' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error'; readonly message: string }

export type NcmLoginHook = {
  readonly state: LoginState
  readonly remember: boolean
  readonly setRemember: (v: boolean) => void
  readonly startLogin: () => Promise<void>
  readonly logout: () => Promise<void>
  readonly reset: () => void
}

type SetState = React.Dispatch<React.SetStateAction<LoginState>>
type Cancelled = { current: boolean }
type Timer = { current: number | null }
type RememberRef = { current: boolean }

type PollCtx = {
  readonly setState: SetState
  readonly cancelled: Cancelled
  readonly pollRef: Timer
  // 用 ref 而不是闭包变量, 这样 startLogin 时 remember 的最新值能传给轮询里的 qrCheck
  readonly rememberRef: RememberRef
}

export function useNcmLogin(): NcmLoginHook {
  const [state, setState] = useState<LoginState>({ kind: 'idle', loggedIn: false })
  const [remember, setRemember] = useState(false)
  const pollRef: Timer = useRef<number | null>(null)
  const cancelledRef: Cancelled = useRef(false)
  const rememberRef: RememberRef = useRef(false)
  rememberRef.current = remember
  // ctx 走 ref,不在每次 render 都是新对象 — 否则 useEffect dep 永远变,
  // cleanup 反复触发把 cancelled flip 来 flip 去,把 inflight 的 startLogin 杀掉
  const ctxRef = useRef<PollCtx>({ setState, cancelled: cancelledRef, pollRef, rememberRef })

  useInitialStatusCheck(ctxRef)

  const startLogin = useCallback(async () => {
    await runStartLogin(ctxRef.current)
  }, [])
  const logout = useCallback(async () => {
    await runLogout(ctxRef.current)
  }, [])
  const reset = useCallback(() => {
    stopPoll(pollRef)
    setState((s) => (s.kind === 'idle' ? s : { kind: 'idle', loggedIn: false }))
  }, [])

  return { state, remember, setRemember, startLogin, logout, reset }
}

// ─── helpers ────────────────────────────────────────────────────────────

function useInitialStatusCheck(ctxRef: React.RefObject<PollCtx>): void {
  useEffect(() => {
    const ctx = ctxRef.current
    ctx.cancelled.current = false
    api
      .loginStatus()
      .then((r) => {
        if (!ctx.cancelled.current) ctx.setState({ kind: 'idle', loggedIn: r.loggedIn })
      })
      .catch((err: unknown) => {
        // 网络挂 / server down / 5xx 都 fallback 到"未登录" — 退化合理 (登录态不可见胜过卡 UI)
        // 但必须留痕, 用户 F12 才能区分"真没登录"还是"server 死了"
        console.warn('[useNcmLogin] loginStatus check failed, assuming logged-out:', err)
      })
    return () => {
      ctx.cancelled.current = true
      stopPoll(ctx.pollRef)
    }
  }, [ctxRef])
}

function stopPoll(pollRef: Timer): void {
  if (pollRef.current !== null) {
    window.clearTimeout(pollRef.current)
    pollRef.current = null
  }
}

async function runStartLogin(ctx: PollCtx): Promise<void> {
  stopPoll(ctx.pollRef)
  ctx.setState({ kind: 'fetching' })
  try {
    const r = await api.loginQrCreate()
    if (ctx.cancelled.current) return
    ctx.setState({ kind: 'pending', unikey: r.unikey, qrImg: r.qrImg })
    schedulePoll(r.unikey, r.qrImg, ctx)
  } catch (err: unknown) {
    ctx.setState({ kind: 'error', message: err instanceof Error ? err.message : '生成二维码失败' })
  }
}

async function runLogout(ctx: PollCtx): Promise<void> {
  stopPoll(ctx.pollRef)
  try {
    await api.logout()
  } finally {
    if (!ctx.cancelled.current) ctx.setState({ kind: 'idle', loggedIn: false })
  }
}

function schedulePoll(unikey: string, qrImg: string, ctx: PollCtx): void {
  const tick = (): void => {
    api
      .loginQrCheck(unikey, ctx.rememberRef.current)
      .then((r) => {
        if (ctx.cancelled.current) return
        if (r.state === 'success') {
          ctx.setState({ kind: 'success' })
          window.setTimeout(() => {
            if (!ctx.cancelled.current) ctx.setState({ kind: 'idle', loggedIn: true })
          }, 1500)
          return
        }
        if (r.state === 'expired') {
          ctx.setState({ kind: 'expired' })
          return
        }
        ctx.setState({
          kind: r.state === 'scanned' ? 'scanned' : 'pending',
          unikey,
          qrImg,
        })
        ctx.pollRef.current = window.setTimeout(tick, POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (ctx.cancelled.current) return
        ctx.setState({ kind: 'error', message: err instanceof Error ? err.message : '轮询失败' })
      })
  }
  ctx.pollRef.current = window.setTimeout(tick, POLL_INTERVAL_MS)
}
