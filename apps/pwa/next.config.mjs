/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@deepulse/shared', '@deepulse/ui'],
  typedRoutes: true,
  // 关掉 dev-only 左下角的 "N" + 英文 Preferences 浮窗,影响沉浸感
  devIndicators: false,
}

export default nextConfig
