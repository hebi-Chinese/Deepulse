'use client'

// AccountSection · 设置面板里的"网易云账号"区
// 状态机驱动展示: idle/loggedOut → 按钮; fetching → loading; pending/scanned → QR;
// expired → 刷新按钮; success → 成功提示; loggedIn → 用户名 + 登出

import { useNcmLogin } from './useNcmLogin'

import type { LanguageHook } from './useLanguage'

type Props = {
  readonly language: LanguageHook
}

export function AccountSection({ language }: Props) {
  const login = useNcmLogin()
  const { t } = language
  return (
    <section className="settings-group">
      <div className="settings-label">{t('settingsAccount')}</div>
      <Body login={login} language={language} />
    </section>
  )
}

function Body({ login, language }: { readonly login: ReturnType<typeof useNcmLogin>; readonly language: LanguageHook }) {
  const { t } = language
  const s = login.state
  if (s.kind === 'fetching') return <HintText>{t('accountFetchingQr')}</HintText>
  if (s.kind === 'pending' || s.kind === 'scanned') {
    return <QrPanel qrImg={s.qrImg} hint={s.kind === 'scanned' ? t('accountScanned') : t('accountScanWithNcmApp')} />
  }
  if (s.kind === 'success') return <SuccessHint>{t('accountSuccess')}</SuccessHint>
  if (s.kind === 'expired') {
    return (
      <div className="flex flex-col gap-2">
        <HintText>{t('accountQrExpired')}</HintText>
        <PrimaryButton onClick={() => { void login.startLogin() }}>{t('accountRefreshQr')}</PrimaryButton>
      </div>
    )
  }
  if (s.kind === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <ErrorHint>{s.message}</ErrorHint>
        <PrimaryButton onClick={() => { void login.startLogin() }}>{t('accountRefreshQr')}</PrimaryButton>
      </div>
    )
  }
  // idle
  if (s.loggedIn) {
    return (
      <div className="flex flex-col gap-2">
        <HintText>{`✓ ${t('accountLoggedIn')}`}</HintText>
        <SecondaryButton onClick={() => { void login.logout() }}>{t('accountLogout')}</SecondaryButton>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <HintText>{t('accountLoggedOut')}</HintText>
      <PrimaryButton onClick={() => { void login.startLogin() }}>{t('accountLoginWithNcm')}</PrimaryButton>
    </div>
  )
}

function QrPanel({ qrImg, hint }: { readonly qrImg: string; readonly hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={qrImg}
        alt="QR"
        width={180}
        height={180}
        className="rounded-lg bg-white p-2"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="text-xs text-white/60 text-center">{hint}</div>
    </div>
  )
}

function HintText({ children }: { readonly children: React.ReactNode }) {
  return <div className="text-xs text-white/55">{children}</div>
}

function SuccessHint({ children }: { readonly children: React.ReactNode }) {
  return <div className="text-xs text-emerald-300/85">{children}</div>
}

function ErrorHint({ children }: { readonly children: React.ReactNode }) {
  return <div className="text-xs text-red-300/85">{children}</div>
}

function PrimaryButton({ onClick, children }: { readonly onClick: () => void; readonly children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-xs rounded-lg bg-white/15 hover:bg-white/25 text-white tracking-widest transition-all"
    >
      {children}
    </button>
  )
}

function SecondaryButton({ onClick, children }: { readonly onClick: () => void; readonly children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-xs rounded-lg bg-white/6 hover:bg-white/12 text-white/75 tracking-widest transition-all"
    >
      {children}
    </button>
  )
}
