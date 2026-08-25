"use client";

import { useEffect, useState } from 'react'
import { createAuthClient } from '@neondatabase/auth/next'
import { useRouter } from 'next/navigation'

const authClient = createAuthClient()

export default function LogoutPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    void authClient.signOut().then((result) => {
      if (result.error) {
        setError(result.error.message || 'Não foi possível sair')
        return
      }
      router.replace('/login')
      router.refresh()
    })
  }, [router])

  return <main className="grid min-h-dvh place-items-center bg-black p-6 text-white"><section className="rounded-3xl bg-[#1b1b1b] p-8 text-center"><h1 className="text-2xl font-bold">{error ? 'Não foi possível sair' : 'Encerrando sessão…'}</h1>{error && <p className="mt-3 text-red-200">{error}</p>}</section></main>
}
