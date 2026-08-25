const response = await fetch('http://localhost:3000/api/auth/sign-in/social', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
  redirect: 'manual',
})

const body = await response.text()
let keys = []
try { keys = Object.keys(JSON.parse(body)) } catch { /* A resposta pode ser um redirect sem JSON. */ }
console.log(JSON.stringify({ status: response.status, redirected: response.status >= 300 && response.status < 400, responseKeys: keys }))
if (response.status >= 500 || body.includes('auth.invalid.local')) process.exitCode = 1
