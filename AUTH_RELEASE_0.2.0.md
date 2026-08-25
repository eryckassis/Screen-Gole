# Ativação da autenticação 0.2.0

Esta entrega usa Managed Better Auth do Neon, Drizzle, Vercel e a sinalização WebRTC existente. Não adiciona Supabase nem Prisma.

## 1. Neon Auth e Google

No projeto `neon-coral-horizon`, habilite o Neon Auth e configure o Google como único provedor. Cadastre as URLs do site de produção e do localhost no painel do Neon Auth e no Google Cloud conforme os valores exibidos pelo próprio painel.

Copie para os ambientes Preview e Production da Vercel:

- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET` com pelo menos 32 caracteres aleatórios
- `INITIAL_ROOM_OWNER_EMAIL` com o e-mail Google do proprietário da sala `main`

Não prefixe essas variáveis com `NEXT_PUBLIC_` e não coloque nenhuma delas no frontend Tauri.

## 2. Branch de banco

Crie um branch de desenvolvimento a partir do branch atualmente usado pelo projeto. Use a conexão direta desse branch como `DATABASE_URL_UNPOOLED` e a conexão pooled como `DATABASE_URL`.

Execute somente no branch de desenvolvimento:

```bash
pnpm db:migrate
```

A migração `drizzle/0002_sudden_edwin_jarvis.sql` preserva tabelas e dados permanentes, inclusive `stream_profiles`, e limpa apenas sessões, peers e sinais transitórios durante a ativação.

## 3. Preview e produção

Faça primeiro um Preview Deployment apontando para o branch Neon de desenvolvimento. Valide duas contas Google, proprietário, membro, convite, revogação, transmissão e retorno `neegy://auth/callback`.

Depois da validação, aplique a mesma migração à conexão direta de produção, confirme as três variáveis na Vercel e faça o deploy de produção.

## 4. Instalador Windows

O instalador 0.2.0 é gerado por:

```bash
pnpm tauri build
```

Saída esperada:

`src-tauri/target/release/bundle/nsis/Screen Gole_0.2.0_x64-setup.exe`

O token do aplicativo é salvo no Windows Credential Manager. O Google sempre abre no navegador padrão e retorna pelo protocolo `neegy://auth/callback`.
