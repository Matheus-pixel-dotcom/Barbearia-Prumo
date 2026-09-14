# tools/ — suítes de verificação

Três suítes independentes, sem framework: só Node + [jsdom](https://github.com/jsdom/jsdom).
Elas executam o **HTML e o JS reais do repositório** — não há reimplementação da lógica.

```bash
npm i jsdom                 # única dependência
node tools/verify-pages.mjs
node tools/verify-supabase-client.mjs
node tools/verify-behavior.mjs
```

Cada uma sai com exit code `1` se algo falhar, então dá para usar em CI.

Os testes rodam com CDNs **bloqueadas** de propósito (o `ResourceLoader` só serve
arquivos do próprio repositório). Isso torna tudo determinístico e ainda cobre o caso
real de o usuário estar offline ou com a CDN inacessível.

## `verify-pages.mjs`

Carrega as 11 páginas no jsdom, executa os `<script>` clássicos e confere:

- nenhum `SyntaxError` / erro não tratado durante a carga;
- os globals que cada arquivo declara existem — se um script morre em parse, eles somem.

O probe usa `window.eval('typeof X')`, e não `window.X`, porque `const`/`let` no
top-level de um script clássico criam *binding léxico global*, não propriedade de
`window`. Foi isso que esse teste pegou: `script.js`, `auth.js` e `supabase-client.js`
declaravam `const SUPABASE_URL` no mesmo escopo e derrubavam 5 páginas inteiras em
`SyntaxError: Identifier 'SUPABASE_URL' has already been declared`.

Também registra todo `fetch` feito pela página. Foi assim que o caminho duplicado
apareceu impresso: `…/rest/v1//rest/v1/profiles?select=*`.

## `verify-supabase-client.mjs`

Executa `supabase-client.js` com `fetch` stubado e confere, por método:

- a URL exata montada (e que `/rest/v1` não aparece duas vezes em nenhuma);
- método, `apikey`, `Authorization: Bearer …`, `Prefer: return=representation` e o corpo;
- que a origem é normalizada — passar `…/rest/v1/` no construtor não reintroduz o bug;
- que HTTP ≠ 2xx **rejeita** com `SupabaseRequestError` (status, código PostgREST, corpo)
  em vez de devolver `null`/`[]` em silêncio;
- que falha de rede também rejeita.

## `verify-behavior.mjs`

Exercita os handlers de verdade (submit de login, submit de feedback, carga do painel),
injetando um `window.supabase` mockado antes do parse. Cobre exatamente os casos que
antes falhavam sem avisar:

- CDN fora → o login mostra erro e devolve o botão; antes ficava preso em “Entrando…”.
- credencial recusada → aparece a mensagem do servidor.
- `insert` de feedback falhando → mostra erro e **não** limpa o formulário; antes dizia
  “enviado com sucesso” e perdia a avaliação.
- banco fora → os exemplos vêm rotulados como ilustrativos, não misturados aos reais.
- painel com 404 → contador “—” e caixa de erro; antes inventava “Cliente Exemplo” e
  contava 1 cliente.
- `escapeHtml` barra payload malicioso vindo do banco.
- `dashboard.html` bloqueia quem não tem sessão.

## Observação sobre `innerText`

O código usava `element.innerText = …` para os contadores. jsdom não implementa
`innerText` (a atribuição é ignorada silenciosamente), então os testes nunca viam o
valor. Foi trocado por `textContent`, que é suportado em todo lugar e não depende de
layout — para texto puro o resultado é idêntico.
