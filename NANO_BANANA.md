# Nano Banana no Style Relo Barber 🍌

Integração da IA de imagem do Google (**Nano Banana / Gemini Image**) com o site
da barbearia. Com ela, o cliente envia uma foto, escolhe um corte e vê na hora uma
**prévia realista de como o corte fica nele** — mantendo rosto, pele, fundo e
iluminação da foto original.

---

## ⏱️ Como ligar em 2 minutos

A IA precisa de uma **chave de API do Google**. O passo a passo:

1. **Abra** <https://aistudio.google.com/apikey> e entre com sua conta Google.
2. **Clique em** "Create API key" (Criar chave de API) e copie a chave gerada.
   Ela começa com `AIza...`.
3. **Crie o arquivo** `.env` na raiz do projeto (ao lado de `server.js`):

   ```bash
   cp .env.example .env
   ```

4. **Abra o `.env`** e cole sua chave:

   ```env
   GEMINI_API_KEY=AIza_sua_chave_real_aqui
   ```

5. **Rode o servidor:**

   ```bash
   npm run serve
   ```

   No console deve aparecer:

   ```
   IA:      Nano Banana ATIVO (gemini-3.1-flash-image-preview)
            Limite: 30 gerações/hora por visitante
   ```

6. **Pronto.** Abra <http://localhost:8000/ia-tryon.html>, suba uma foto e clique
   num estilo. O selo no topo muda de "IA em modo demonstrativo" para
   **"Nano Banana ativo"**.

> 💡 **Sem a chave nada quebra.** O site continua funcionando igualzinho, só que o
> simulador mostra o aviso de modo demonstrativo em vez de gerar a imagem.

---

## 🔒 Segurança (importante pro TCC)

* A chave fica **só no servidor** (`server.js` / `nano-banana.js`). O navegador do
  cliente **nunca** vê a chave.
* O arquivo `.env` está no `.gitignore` e o servidor **bloqueia** qualquer tentativa
  de baixá-lo pela web (retorna 404).
* Nunca cole a chave direto no código nem no HTML — ela ficaria pública.

---

## 🧩 O que cada parte faz

| Arquivo | Papel |
|---|---|
| `nano-banana.js` | Módulo do **servidor**. Monta os prompts, chama a API do Google, faz fallback entre modelos, trata erros e bloqueios. |
| `server.js` | Expõe as rotas `/api/ia/*`, valida as entradas, protege a cota e **guarda a chave**. |
| `ia-gemini.js` | Cliente no **navegador**. Chama as rotas, mostra a imagem, religa os botões de estilo que antes não faziam nada. |
| `.env` | Guarda a `GEMINI_API_KEY`. **Não sobe pro GitHub.** |
| `.env.example` | Modelo comentado do `.env` (sob pro GitHub, sem segredo). |

### Rotas da API

| Rota | Método | O que faz |
|---|---|---|
| `/api/ia/status` | GET | Diz se a IA está ativa e qual modelo usa (não gasta cota). |
| `/api/ia/simular` | POST | Gera a prévia do corte. Corpo: `{ fotoBase64, estilo, tipo, volume, rosto, proporcao }`. |
| `/api/ia/analisar` | POST | Lê o rosto (formato, simetria, tipo de cabelo) e devolve JSON. Corpo: `{ fotoBase64 }`. |
| `/api/ia/chat` | POST | Resposta da Relo IA com um modelo real. Corpo: `{ mensagem, historico, contexto }`. |

---

## 🖼️ Onde a IA aparece no site

1. **Simulador (`ia-tryon.html`)** — o cliente sobe uma foto (ou usa a câmera), toca
   num estilo e a IA gera a prévia. Mostra comparação **antes/depois**, permite
   baixar a imagem e já preenche o card final + o link de agendamento no WhatsApp.
2. **Câmera IA (`face-recognition.html`)** — após capturar o rosto, tocar numa
   recomendação gera a prévia do corte sugerido.
3. **Chat da Relo IA (`chat-ia.js`)** — conversa com um modelo de texto real
   (`gemini-2.5-flash`). Se a IA estiver desligada ou falhar, cai automaticamente
   para as regras locais, então o chat **nunca fica mudo**.

---

## 🛡️ Limites e proteções

* **Cota por visitante** (`IA_LIMITE_POR_HORA`, padrão 30/hora) evita que um loop ou
  um visitante mal-intencionado queime o crédito da chave.
* **Validação antes da cota**: pedido sem foto ou com imagem inválida recebe `400`
  sem gastar nenhuma geração.
* **Fallback de modelo**: o Google renomeou os modelos algumas vezes
  (`gemini-2.5-flash-image` → `gemini-3.1-flash-image`, com/sem `-preview`). O código
  tenta vários em ordem até algum responder, então não quebra por nome antigo.
* **Bloqueios de segurança** do Google (conteúdo impróprio etc.) viram uma mensagem
  amigável em vez de erro técnico.
* **Timeout** de 90s por geração (configurável).

---

## ⚙️ Opções do `.env`

```env
# Obrigatório
GEMINI_API_KEY=AIza...

# Opcionais (os padrões já funcionam)
#NANO_BANANA_MODEL=gemini-3.1-flash-image-preview  # força um modelo de imagem
#GEMINI_TEXT_MODEL=gemini-2.5-flash                # modelo do chat e da análise
#IA_LIMITE_POR_HORA=30                              # gerações por visitante/hora
#GEMINI_API_BASE=                                   # endpoint alternativo/proxy
#GEMINI_TIMEOUT_MS=90000                            # timeout da geração
#PORT=8000
#HOST=0.0.0.0
```

---

## 💰 Custo

A geração de imagem é paga por imagem (a análise e o chat de texto custam frações de
centavo). Valores de referência (Google AI, 2026):

| Modelo | Aprox. por imagem |
|---|---|
| `gemini-3.1-flash-image` (padrão) | ~US$ 0,045 a 0,067 |
| `gemini-3-pro-image-preview` | ~US$ 0,134 |

A cota por visitante + a validação prévia são justamente para você não ser pego de
surpresa na fatura. Comece com `IA_LIMITE_POR_HORA` baixo durante a demonstração.

> Para apresentar o TCC sem gastar, você pode deixar a chave só na sua máquina e
> aumentar o limite só na hora da banca.

---

## 🧪 Como testar sem gastar crédito

Os testes abaixo usam um **Gemini falso** local (devolvem um PNG gerado na hora) e
validam o fluxo inteiro sem tocar na API real nem gastar nada:

```bash
# roda os testes de unidade do módulo (fora do repositório)
node /tmp/teste/mock.js
```

Para conferir o servidor de forma rápida:

```bash
curl http://localhost:8000/api/ia/status
```

---

## ❓ Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Selo mostra "modo demonstrativo" | Sem `.env` ou sem chave | Crie o `.env` e cole `GEMINI_API_KEY`; reinicie. |
| `AI key not valid` | Chave errada/expirada | Gere outra em aistudio.google.com/apikey. |
| `Limite de N gerações por hora` | Cota atingida | Espere 1h ou aumente `IA_LIMITE_POR_HORA`. |
| `A imagem foi bloqueada...` | Filtro de segurança do Google | Use outra foto (rosto visível, sem conteúdo sensível). |
| Site aberto direto (sem servidor) | Não há `/api` | A IA precisa de `npm run serve`; sem ele fica em modo demonstrativo. |
