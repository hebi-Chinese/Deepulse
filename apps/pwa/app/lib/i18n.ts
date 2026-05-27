// i18n · 简易双语文案表 — zh / en
// 默认 zh,设置面板可切换;持久化到 localStorage

export const LANGUAGES = ['zh', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABEL: Record<Language, string> = {
  zh: '中文',
  en: 'English',
}

type Dict = {
  readonly appName: string
  readonly tagline: string
  readonly listen: string
  readonly browse: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly searchEmpty: string
  readonly play: string
  readonly enqueue: string
  readonly queue: string
  readonly queueEmpty: string
  readonly nowPlaying: string
  readonly noSongSelected: string
  readonly loadingLyric: string
  readonly noLyric: string
  readonly openWindow: string
  readonly closeWindow: string
  readonly settings: string
  readonly settingsLanguage: string
  readonly settingsWeather: string
  readonly settingsTheme: string
  readonly settingsFont: string
  readonly settingsClose: string
  readonly cmdkPlaceholder: string
  readonly cmdkHintPlay: string
  readonly cmdkHintEnqueue: string
  readonly cmdkHintExit: string
  readonly djTitle: string
  readonly djInputPlaceholder: string
  readonly djSend: string
  readonly djWelcome: string
  readonly djEmpty: string
  readonly themeDark: string
  readonly themeLight: string
  readonly fontSans: string
  readonly fontSerif: string
  readonly recommendDaily: string
  readonly recommendFm: string
  readonly recommendEmpty: string
  readonly recommendHint: string
  readonly weatherClear: string
  readonly weatherRain: string
  readonly weatherSnow: string
  readonly weatherFog: string
  readonly weatherThunder: string
  readonly settingsAccount: string
  readonly accountLoggedOut: string
  readonly accountLoginWithNcm: string
  readonly accountFetchingQr: string
  readonly accountScanWithNcmApp: string
  readonly accountQrExpired: string
  readonly accountRefreshQr: string
  readonly accountScanned: string
  readonly accountSuccess: string
  readonly accountLoggedIn: string
  readonly accountLogout: string
}

const ZH: Dict = {
  appName: 'Claudio',
  tagline: '个人 AI 电台',
  listen: '听歌',
  browse: '浏览',
  search: '搜索',
  searchPlaceholder: '搜歌名 / 歌手 / 专辑',
  searchEmpty: '还没搜过什么',
  play: '播放',
  enqueue: '入列',
  queue: '播放队列',
  queueEmpty: '队列为空',
  nowPlaying: '正在播放',
  noSongSelected: '还没选歌',
  loadingLyric: '加载歌词中…',
  noLyric: '没有歌词',
  openWindow: '开窗',
  closeWindow: '关窗',
  settings: '设置',
  settingsLanguage: '语言',
  settingsWeather: '天气',
  settingsTheme: '主题',
  settingsFont: '字体',
  settingsClose: '关闭',
  cmdkPlaceholder: '搜歌名 / 歌手,Enter 播放,Tab 入列',
  cmdkHintPlay: 'Enter 播放',
  cmdkHintEnqueue: 'Tab 入列',
  cmdkHintExit: 'Esc 关闭',
  djTitle: '跟 DJ 说点啥',
  djInputPlaceholder: '比如:来点周杰伦,或换首歌',
  djSend: '说',
  djWelcome: '嗯,在听。说想听什么我就放。',
  djEmpty: '今天想听点什么?',
  themeDark: '暗',
  themeLight: '亮',
  fontSans: '黑体',
  fontSerif: '宋体',
  recommendDaily: '今日推荐',
  recommendFm: '私人 FM',
  recommendEmpty: '登录后可获取推荐',
  recommendHint: '搜索或让 DJ 推荐都可以开始',
  weatherClear: '晴',
  weatherRain: '雨',
  weatherSnow: '雪',
  weatherFog: '雾',
  weatherThunder: '雷',
  settingsAccount: '网易云账号',
  accountLoggedOut: '未登录,只能拿到 30s 试听片段',
  accountLoginWithNcm: '扫码登录',
  accountFetchingQr: '生成二维码中…',
  accountScanWithNcmApp: '用网易云手机端扫一扫',
  accountQrExpired: '二维码过期了',
  accountRefreshQr: '刷新二维码',
  accountScanned: '已扫码,请在手机确认',
  accountSuccess: '登录成功',
  accountLoggedIn: '已登录',
  accountLogout: '登出',
}

const EN: Dict = {
  appName: 'Claudio',
  tagline: 'Personal AI radio',
  listen: 'Listen',
  browse: 'Browse',
  search: 'Search',
  searchPlaceholder: 'Search title / artist / album',
  searchEmpty: 'No searches yet',
  play: 'Play',
  enqueue: 'Queue',
  queue: 'Up next',
  queueEmpty: 'Queue is empty',
  nowPlaying: 'Now playing',
  noSongSelected: 'No song selected',
  loadingLyric: 'Loading lyrics…',
  noLyric: 'No lyrics',
  openWindow: 'Open window',
  closeWindow: 'Close window',
  settings: 'Settings',
  settingsLanguage: 'Language',
  settingsWeather: 'Weather',
  settingsTheme: 'Theme',
  settingsFont: 'Font',
  settingsClose: 'Close',
  cmdkPlaceholder: 'Search · Enter to play · Tab to queue',
  cmdkHintPlay: 'Enter play',
  cmdkHintEnqueue: 'Tab queue',
  cmdkHintExit: 'Esc close',
  djTitle: 'Talk to the DJ',
  djInputPlaceholder: 'e.g. "play some Jay Chou" or "next track"',
  djSend: 'Send',
  djWelcome: "I'm listening. Tell me what you'd like to hear.",
  djEmpty: 'What would you like to hear today?',
  themeDark: 'Dark',
  themeLight: 'Light',
  fontSans: 'Sans',
  fontSerif: 'Serif',
  recommendDaily: 'Daily picks',
  recommendFm: 'Private FM',
  recommendEmpty: 'Sign in to get recommendations',
  recommendHint: 'Search or ask the DJ to start',
  weatherClear: 'Clear',
  weatherRain: 'Rain',
  weatherSnow: 'Snow',
  weatherFog: 'Fog',
  weatherThunder: 'Thunder',
  settingsAccount: 'NCM account',
  accountLoggedOut: 'Not signed in — only 30s previews available',
  accountLoginWithNcm: 'Sign in via QR',
  accountFetchingQr: 'Generating QR…',
  accountScanWithNcmApp: 'Scan with the NetEase Cloud Music app',
  accountQrExpired: 'QR expired',
  accountRefreshQr: 'Refresh QR',
  accountScanned: 'Scanned — confirm on phone',
  accountSuccess: 'Signed in',
  accountLoggedIn: 'Signed in',
  accountLogout: 'Sign out',
}

export const DICTS: Record<Language, Dict> = { zh: ZH, en: EN }
export type LangKey = keyof Dict
