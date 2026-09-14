# Proxy do Nano Banana

O site é estático — não tem backend. **Qualquer chave colocada no front-end é pública**:
quem abrir o DevTools lê e pode gastar a sua cota. Este proxy resolve isso guardando a
chave no servidor.

```
navegador ──POST /──▶ seu proxy ──x-goog-api-key──▶ generativelanguage.googleapis.com
             (sem chave)            (chave fica aqui)
```

## Publicar (Cloudflare Workers — sem build)

```bash
cd tools/gemini-proxy
npm i -g wrangler          # se ainda não tiver
wrangler login
wrangler secret put GEMINI_API_KEY     # cola a chave do AI Studio
wrangler deploy                        # sai uma URL tipo https://xxx.workers.dev
```

Crie um `wrangler.toml` se quiser fixar o nome:

```toml
name = "prumo-nano-banana"
main = "worker.js"
compatibility_date = "2026-01-01"

[vars]
ALLOWED_ORIGIN = "https://seu-site.com"
```

Depois, no site, abra **⚙️ Configurar IA** e cole a URL do Worker no campo *URL do proxy*.

## Contrato

O `nano-banana.js` manda exatamente isto:

```jsonc
POST <sua-url>
{
  "contents": [{ "role": "user", "parts": [
    { "text": "Edite a foto anexada aplicando APENAS o novo corte..." },
    { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } }
  ]}],
  "generationConfig": { "responseModalities": ["TEXT", "IMAGE"] },
  "model": "gemini-2.5-flash-image"     // só no modo proxy
}
```

O proxy confere o `model` contra uma lista permitida, remove o campo e encaminha para
`https://generativelanguage.googleapis.com/v1/models/<model>:generateContent`. A resposta
volta como veio — inclusive os erros, que o front-end trata (`blocked`, `rate-limit`, `http`).

## Alternativa: Node

Qualquer servidor funciona. O essencial é **não** deixar a chave chegar ao navegador:

```js
// server.mjs  ->  node server.mjs   (porta 8787)
const KEY = process.env.GEMINI_API_KEY;
Bun.serve?.({}) // ou use http do node; o importante é o handler abaixo:
export async function handler(req) {
  const body = await req.json();
  const model = body.model || 'gemini-2.5-flash-image';
  delete body.model;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
    { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body) });
  return new Response(r.body, { status: r.status,
    headers: { 'Content-Type': 'application/json',
               'Access-Control-Allow-Origin': 'https://seu-site.com' } });
}
```

## Se você só quer testar agora

Use o painel **⚙️ Configurar IA** na página e cole a chave direto. Ela fica no
`localStorage` do **seu** navegador (não vai para o git), e o site mostra um ponto
laranja avisando que está em modo de teste. Funciona, mas **não publique assim**.

Chave: https://aistudio.google.com/apikey
