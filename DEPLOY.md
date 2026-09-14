# Como publicar o Style Relo Barber (deploy)

Este guia coloca o site **completo** no ar: as páginas, a API e o **banco de clientes
compartilhado**. Não é preciso instalar nada no seu computador além do que já existe.

Antes de publicar, entenda onde cada peça pode ficar:

| Peça | Precisa de Node? | Onde roda |
| --- | --- | --- |
| Páginas do site (HTML/CSS/imagens) | não | GitHub Pages, Render, Netlify... |
| **Banco de clientes + login** (`server.js`) | **sim** | Render, Railway, Koyeb, Fly.io, VPS |
| Guardar os cadastros para sempre | — | Supabase (grátis) ou disco do servidor |

> ⚠️ O **GitHub Pages não roda Node**, então sozinho ele não entrega o banco compartilhado —
> nesse caso o site entra no "modo local" (cadastros só no navegador de quem usa).
> Para ter o banco compartilhado, publique também o `server.js` (opção A ou B abaixo).

---

## Opção A — Render (mais simples, recomendado) 🥇

Coloca site + banco no mesmo endereço, com o menor número de cliques.

### A1. Deixe o código na branch `main`
O Render publica a branch `main`. O jeito mais fácil é **aprovar o Pull Request**
do projeto (botão *Merge pull request* no GitHub). Se preferir testar antes, no passo A3
escolha a branch `arena/01a0a05c-barbearia-prumo` no lugar de `main`.

### A2. Crie a conta
1. Acesse **https://render.com** → *Get Started* → **Sign in with GitHub**.
2. Autorize o Render a ver o repositório `Barbearia-Prumo`.

### A3. Crie o serviço
1. No painel do Render: **New +** → **Web Service**.
2. Escolha o repositório **Barbearia-Prumo**.
3. Preencha:

   | Campo | Valor |
   | --- | --- |
   | Name | `style-relo-barber` |
   | Branch | `main` |
   | Runtime / Language | **Node** |
   | Build Command | `node -e "console.log('ok')"` |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |
   | Health Check Path | `/api/health` |

   > Se o arquivo `render.yaml` já estiver na `main`, você pode usar **New + → Blueprint**
   > e o Render configura tudo isso sozinho.

4. Clique em **Create Web Service** e aguarde ~1 minuto.
5. O endereço gerado é algo como `https://style-relo-barber.onrender.com` — **esse é o site
   completo**, com login e banco compartilhado. Teste abrindo `/api/health`:

   ```json
   { "ok": true, "armazenamento": "arquivo local data/db.json", "usuarios": 8, "administradores": 8 }
   ```

### A4. Deixe os cadastros permanentes (importante no plano gratuito)
No plano gratuito do Render o disco é **temporário**: um novo deploy pode zerar o arquivo.
Resolver isso tem 2 caminhos:

* **Supabase (grátis e recomendado)** — passo a passo em [Banco permanente](#banco-permanente-com-supabase) abaixo;
* **Backup manual** — o painel admin tem os botões **⬇️ Backup** e **⬆️ Restaurar**
  (aba *Banco de Clientes*). Baixe o backup antes de cada alteração e restaure depois.

---

## Opção B — Outras hospedagens

### Railway
1. https://railway.app → *New Project* → *Deploy from GitHub repo* → escolha o repositório.
2. O Railway lê o `Procfile` (`web: node server.js`) e sobe o serviço sozinho.
3. Em *Variables*, cadastre as variáveis de ambiente (veja a tabela no fim).
4. Em *Settings → Networking → Generate Domain* para ter o endereço público.

### Docker (Fly.io, Koyeb, VPS, seu servidor)
O projeto já vem com `Dockerfile`:

```bash
docker build -t style-relo-barber .
docker run -d --name relo -p 8000:8000 \
  -v relo-dados:/app/data \
  -e SUPABASE_URL="https://xxxx.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="chave-secreta" \
  style-relo-barber
```

O volume `-v relo-dados:/app/data` é o que mantém os cadastros entre reinícios.
Sem o volume, use o Supabase (abaixo).

---

## Banco permanente com Supabase (grátis)

Serve para qualquer hospedagem e mantém os cadastros para sempre, compartilhados entre
todos os aparelhos.

1. Crie a conta em **https://supabase.com** (pode entrar com GitHub) e crie um projeto.
   *Guarde a senha do banco que ele pedir — não é usada pelo site, mas você pode precisar depois.*
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Cole **todo** o conteúdo do arquivo [`supabase/relo_db.sql`](supabase/relo_db.sql) e clique em **Run**.
4. Abra **Project Settings** (engrenagem) → **API** e copie:
   * **Project URL** → `https://xxxxxxxx.supabase.co`
   * **service_role secret** (em *Project API keys*) → chave longa que começa com `eyJ...`
5. Cadastre as duas variáveis no painel da hospedagem:

   | Variável | Valor |
   | --- | --- |
   | `SUPABASE_URL` | a Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave *service_role* |

6. Salve/reinicie o serviço. Abra `/api/health` e confira:

   ```json
   { "armazenamento": "Supabase (relo_db)" }
   ```

Se o Supabase estiver fora do ar ou com a chave errada, o servidor **avisa no log e continua
funcionando com arquivo local** — o site nunca cai; o `/api/health` mostra o motivo.

🔒 A chave `service_role` é secreta: ela só fica no servidor. A tabela está com *RLS ligado e
sem políticas*, então ninguém consegue ler os cadastros direto do navegador.

---

## Opção C — Site no GitHub Pages + banco no servidor

Se quiser manter o endereço bonito do Pages (`https://matheus-pixel-dotcom.github.io/Barbearia-Prumo/`)
e usar o servidor só para o banco:

1. Publique o `server.js` seguindo a **Opção A** (o Render vai te dar um endereço `https://...onrender.com`).
2. No repositório, abra o arquivo **`config.js`** e coloque o endereço do servidor:

   ```js
   window.RELO_API_BASE = 'https://style-relo-barber.onrender.com';
   ```

3. Faça o merge/commit dessa alteração para a branch `main`.
4. Abra o site do Pages com **Ctrl + F5**. Agora o login e o cadastro do Pages usam o banco do Render
   (a API já está preparada para isso — CORS liberado e sessão por token).

---

## Variáveis de ambiente

| Variável | Para que serve | Padrão |
| --- | --- | --- |
| `PORT` | porta do servidor (a hospedagem define) | `8000` |
| `HOST` | endereço de escuta | `0.0.0.0` |
| `RELO_DATA_DIR` | pasta do banco em arquivo | `./data` |
| `SUPABASE_URL` | endereço do projeto Supabase | *(vazio = arquivo local)* |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do Supabase | *(vazio)* |
| `RELO_SUPABASE_TABLE` | nome da tabela | `relo_db` |

Modelo pronto em [`.env.example`](.env.example).

---

## Depois de publicar — checklist rápido

1. Abra `https://SEU-ENDEREÇO/index.html` → a **caixinha de login** deve aparecer.
2. Entre com um e-mail de admin (ex.: `professor@gmail.com`) → deve abrir o **painel**.
3. Confira em `/api/health` qual armazenamento está em uso.
4. Entre com um e-mail comum → deve cair como **cliente** (não abre o painel).
5. Faça um **⬇️ Backup** no painel só para garantir.

### Coisas boas de saber sobre o plano gratuito do Render
* O serviço "dorme" após ~15 minutos sem visitas e leva de 30 a 60 segundos para acordar na
  primeira visita (depois fica rápido).
* O disco é temporário: sem Supabase, os cadastros podem ser zerados em um novo deploy
  (por isso o backup).
* Domínio próprio (ex.: `stylerelobarber.com.br`) pode ser apontado em *Settings → Custom Domain*.
