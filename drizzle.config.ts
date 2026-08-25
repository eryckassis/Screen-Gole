import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('.env.local')
} catch {
  // In CI, Vercel injects the variables directly into the process.
}

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL_UNPOOLED ou DATABASE_URL precisa estar configurada')
}

if (new URL(databaseUrl).hostname.includes('-pooler')) {
  throw new Error('Migrações exigem DATABASE_URL_UNPOOLED (conexão direta do Neon)')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
})
