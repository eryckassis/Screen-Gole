"use client";

import { createAuthClient } from '@neondatabase/auth/next'
import { LoginScreen } from '@/components/auth/login-screen'

const authClient = createAuthClient()

export function LoginClient({ next }: { next: string }) {
  return (
    <LoginScreen
      onContinue={async () => {
        const completionUrl = new URL('/auth/complete', window.location.origin)
        completionUrl.searchParams.set('next', next)
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: completionUrl.toString(),
        })
        if (result.error) throw new Error(result.error.message || 'Não foi possível entrar com o Google.')
      }}
    />
  )
}
