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

O `wrangler.toml` já está aqui com o nome `prumo-nano-banana`. Antes de publicar, troque
`ALLOWED_ORIGIN` pela origem do seu site (o padrão `*` aceita chamada de qualquer lugar).

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

## Alternativa: Node (sem Cloudflare)

`server.mjs` é um servidor Node puro, sem dependências:

```bash
GEMINI_API_KEY=AIza... node tools/gemini-proxy/server.mjs
# Proxy do Nano Banana em http://0.0.0.0:8787
```

Variáveis:

| var | default | para quê |
|---|---|---|
| `GEMINI_API_KEY` | — (obrigatória) | a chave. Nunca sai do processo |
| `PORT` | `8787` | porta |
| `ALLOWED_ORIGIN` | `*` | **restrinja em produção** à origem do site |
| `GEMINI_UPSTREAM` | URL do Google | só para testar contra um servidor falso |

Serve em `/` e em `/api/nano-banana`. Sem `GEMINI_API_KEY` ele responde `500` explicando,
em vez de encaminhar algo sem autenticação.

## Teste do proxy

`tools/verify-proxy.mjs` sobe um "Gemini falso" local, sobe o proxy apontando para ele e
faz HTTP de verdade (22 verificações): a chave chega no upstream e não volta para o
cliente, a allowlist de modelos funciona, erros e status passam intactos, CORS e
preflight funcionam, e sem chave o proxy avisa.

O último trecho é ponta a ponta: abre o `ia-tryon.html` real no jsdom com o fetch de
verdade, dispara a captura e confere que **a imagem chega no chat** depois de atravessar
o proxy — sem nenhuma chave no navegador.

```bash
node tools/verify-proxy.mjs
```

## Se você só quer testar agora

Use o painel **⚙️ Configurar IA** na página e cole a chave direto. Ela fica no
`localStorage` do **seu** navegador (não vai para o git), e o site mostra um ponto
laranja avisando que está em modo de teste. Funciona, mas **não publique assim**.

Chave: https://aistudio.google.com/apikey
