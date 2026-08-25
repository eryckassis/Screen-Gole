import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import '@fontsource-variable/manrope'
import './globals.css'

const loginFont = localFont({
  src: './fonts/fontNice.woff2',
  variable: '--font-login',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Screen Gole — Sala ao vivo',
  description: 'Compartilhe sua tela e acompanhe transmissões em uma sala permanente.',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#1a1a1a',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={loginFont.variable}>
      <body>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
