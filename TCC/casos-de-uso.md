# Casos de uso — Style Relo Barber (passo a passo)

Documento de apoio do TCC. Cada caso de uso descreve **o que o usuário faz, passo a passo**,
o que o sistema responde e o que muda no banco de dados — é a versão escrita do diagrama de
caso de uso (`TCC/diagrama-caso-de-uso.html`).

**Atores**

| Ator | Tipo | Quem é |
| --- | --- | --- |
| **Usuário (cliente)** | primário | visitante/cliente do site |
| **Supervisor** | primário | equipe da barbearia (barbeiro, recepção, gerente de vendas) |
| **Administrador** | primário | dono/gestor do sistema |
| **Supabase** | secundário (sistema externo) | banco de dados na nuvem que recebe a cópia dos cadastros |
| **WhatsApp** | secundário (sistema externo) | canal de agendamento e contato |
| **Câmera / face-api.js** | secundário (recurso) | leitura facial que roda no navegador do cliente |

**Convenções:** `RF` = requisito funcional relacionado · `RN` = regra de negócio ·
`RNF` = requisito não funcional. Ator genérico “Usuário” herda o comportamento do cliente;
Supervisor e Administrador herdam os casos do Usuário e acrescentam os seus (generalização
de atores), como mostra o diagrama.

---

## UC01 — Cadastrar-se no site

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Atores secundários** | Supabase |
| **Objetivo** | Criar a conta que dá acesso à área do cliente |
| **Pré-condições** | Nenhuma (basta abrir o site) |
| **Pós-condições** | Cliente criado no banco; sessão iniciada; cópia agendada para a nuvem |
| **Requisitos** | RF01, RNF02, RNF05 |

**Fluxo principal**

1. O usuário abre o site e clica em **Criar conta** (ou em **Login** → aba *Criar conta*).
2. O sistema mostra o formulário com nome, e-mail, senha e confirmação de senha.
3. O usuário preenche os dados e envia.
4. O sistema valida: nome com 2+ caracteres, e-mail em formato válido, senha com 6+ caracteres
   e confirmação igual à senha.
5. O sistema confere se o e-mail já existe no banco.
6. O sistema gera um **sal** aleatório e grava apenas o **hash SHA-256** da senha (nunca o texto puro).
7. O sistema cria a conta com perfil `cliente`, registra o acesso no histórico e devolve um
   **token de sessão** (gravado no banco apenas como hash).
8. O sistema tenta enviar a cópia do cadastro para o Supabase; se der certo, marca
   *na nuvem*; se falhar, coloca o cadastro na **fila de reenvio**.
9. O sistema redireciona o usuário para a **área do cliente** (`dashboard.html`).

**Fluxos alternativos**

- **4a. Dados inválidos:** o sistema mostra a mensagem exata do erro e mantém o formulário preenchido.
- **5a. E-mail já cadastrado:** o sistema responde “Este e-mail já tem cadastro. Use a aba Entrar.”
  e sugere fazer login.
- **5b. E-mail da equipe:** se o e-mail pertence à lista de administradores (`admin-accounts.js`),
  o sistema explica que a conta já existe e orienta a usar a aba *Entrar*.
- **8a. Sem internet:** o cadastro continua salvo no banco do site e entra na fila; o servidor
  tenta de novo sozinho a cada 3 minutos, com espera crescente.

---

## UC02 — Entrar no sistema (login)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário, Supervisor e Administrador |
| **Objetivo** | Abrir uma sessão autenticada |
| **Pré-condições** | Conta cadastrada |
| **Pós-condições** | Sessão válida por 7 dias; histórico de acesso gravado |
| **Requisitos** | RF02, RNF02, RNF06 |

**Fluxo principal**

1. O usuário clica em **Login** no menu (a caixinha de login abre em qualquer página do site)
   ou acessa `login.html`.
2. O sistema mostra as abas **Entrar** e **Criar conta**.
3. O usuário informa e-mail e senha.
4. O sistema procura o e-mail (aceitando os apelidos cadastrados da equipe), monta o hash da
   senha com o sal da conta e compara com o hash gravado.
5. Sendo igual, o sistema cria o token de sessão, registra o acesso (`logins`) e devolve
   **perfil + permissões** do usuário.
6. O sistema decide o destino: **painel** (`admin.html`) para supervisor/administrador e
   **área do cliente** (`dashboard.html`) para cliente. No menu, a pílula **Admin** fecha em
   ouro para a equipe.

**Fluxos alternativos**

- **4a. Senha errada:** o sistema registra a falha no histórico e mostra “E-mail ou senha inválidos.”
- **4b. Mais de 12 tentativas no mesmo e-mail em 10 minutos:** o sistema responde **429** e
  bloqueia temporariamente (proteção contra força bruta). `RNF06`
- **6a. Cliente tentando abrir o painel:** o sistema mostra a tela “Sua conta é de cliente” e
  não libera nenhuma rota do painel (**403**). `RN03`

---

## UC03 — Agendar um corte pelo WhatsApp

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Ator secundário** | WhatsApp |
| **Objetivo** | Marcar o atendimento sem depender de telefone |
| **Pré-condições** | Nenhuma |
| **Pós-condições** | Conversa aberta no WhatsApp com a mensagem já preenchida |
| **Requisitos** | RF03 |

**Fluxo principal**

1. O cliente navega por **Serviços** ou pela página inicial e toca em **Agendar**.
2. O sistema monta o link `https://wa.me/…` com a mensagem padrão (serviço de interesse) e
   abre em nova aba.
3. No simulador (`ia-tryon.html`), o botão **Agendar esse corte** envia a mensagem já com o
   corte recomendado e o volume escolhido.

**Fluxos alternativos**

- **1a. Contato pela página Contato:** o formulário monta a mensagem com nome, assunto e texto
  digitado e abre o WhatsApp do mesmo jeito.

---

## UC04 — Simular o corte com inteligência artificial (visagismo digital)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Atores secundários** | Câmera / face-api.js, WhatsApp |
| **Objetivo** | Ver a recomendação de corte antes de sentar na cadeira |
| **Pré-condições** | Permissão de câmera (ou envio de foto) |
| **Pós-condições** | Card “Combinação encontrada” preenchido e botão de agendamento pronto |
| **Requisitos** | RF04, RNF04 |

**Fluxo principal**

1. O cliente abre **Experimente com IA** (`ia-tryon.html`).
2. Escolhe **enviar foto** (arrastar/clicar) ou **Usar câmera**.
3. Com a câmera, o sistema pede permissão, abre o vídeo e desenha a moldura de detecção.
4. O `ia-camera.js` executa o **face-api.js** sobre o quadro, obtém os pontos do rosto
   (*landmarks*) e calcula: **formato do rosto**, simetria e proporção da testa.
5. O sistema publica a leitura na página (evento `relo:analise`) — nada fica só no console.
6. O cliente escolhe o **estilo** (Executive Contour, Mid Fade, Buzz Cut ou Corte Style Relo)
   e o **volume** (1 a 4).
7. O `ia-tryon.js` cruza formato + estilo + volume, marca o estilo escolhido, preenche o card
   **“Combinação encontrada”** (corte, tipo, análise facial) e monta o link do WhatsApp com
   “Olá! Usei o simulador… quero agendar o corte X (volume Y).”
8. O chat **Relo IA** registra a escolha na conversa e responde dúvidas na sequência.

**Fluxos alternativos**

- **2a. Cliente sem foto:** o sistema recomenda mesmo assim e avisa que, com a câmera, a
  sugestão fica mais precisa.
- **3a. Câmera negada/indisponível:** o sistema explica e mantém o envio de arquivo.
- **6a. Troca de foto:** os eventos `relo:nova-foto` limpam o card, o estilo marcado e a
  análise anterior (o resultado velho não fica na tela).
- **7a. Cliente pede preço no chat:** o chat responde em texto, sem depender de nenhum serviço externo.

---

## UC05 — Conversar com a Relo IA (chat de atendimento)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Objetivo** | Tirar dúvidas sobre corte, preço, barba, cachos e agendamento |
| **Pré-condições** | Página do simulador aberta |
| **Requisitos** | RF05 |

**Fluxo principal**

1. O cliente escreve a dúvida na caixinha do chat.
2. O sistema normaliza a pergunta (minúsculas, sem acento) e procura a intenção por palavras-chave:
   preço, degradê, barba, cachos, entradas, manutenção, agendamento, produtos.
3. O sistema responde com um texto variado sobre o assunto (banco de respostas local, sem chave
   de API) e sugere o próximo passo (ver o card do simulador ou agendar).
4. As mensagens do chat são limitadas em tamanho e formatadas com quebra de linha para caber no balão.

**Fluxos alternativos**

- **2a. Assunto desconhecido:** o sistema devolve uma resposta genérica e oferece o WhatsApp da barbearia.

---

## UC06 — Avaliar o atendimento (feedback)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Objetivo** | Registrar a avaliação do barbeiro |
| **Pré-condições** | Nenhuma |
| **Requisitos** | RF06 |

**Passos**

1. O cliente abre **Feedback**, escolhe o barbeiro e as estrelas.
2. O sistema valida a escolha e envia o registro.
3. O sistema confirma apenas quando o envio realmente deu certo (sem “sucesso” falso).

---

## UC07 — Consultar a área do cliente

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Usuário (cliente) |
| **Pré-condições** | Sessão ativa |
| **Requisitos** | RF07 |

**Passos**

1. O cliente entra e o sistema redireciona para `dashboard.html`.
2. Sem sessão, o sistema devolve o visitante para a página inicial (guarda de sessão).
3. A página mostra nome, e-mail, **perfil (Usuário)**, data do último acesso, total de acessos e
   onde o cadastro está guardado (servidor ou navegador).
4. O cartão do painel aparece **bloqueado** com a explicação de que a área é da equipe.

---

## UC08 — Acompanhar o painel (dashboard) — Supervisor e Administrador

| Campo | Descrição |
| --- | --- |
| **Atores principais** | Supervisor, Administrador |
| **Objetivo** | Enxergar o negócio em números |
| **Pré-condições** | Sessão com perfil de equipe |
| **Requisitos** | RF08 |

**Passos**

1. A equipe entra e o sistema abre o painel com a aba **Visão Geral**.
2. O sistema carrega `/api/admin/metricas` (uma chamada só) e desenha:
   cartões de KPI (clientes, acessos 24h, retorno em 30 dias, valor em estoque, despesas do mês,
   status da nuvem), faixa **“Hoje na barbearia”**, gráfico de área (14 dias), barras de acessos,
   rosca de origem, feed de atividade e a lista “precisa de atenção”.
3. Cada cartão de KPI é clicável e leva para a aba do assunto.
4. Para o **Supervisor**, o sistema mostra a faixa dourada explicando o alcance do perfil e
   esconde tudo que ele não pode fazer.

**Fluxos alternativos**

- **1a. Sem sessão:** abre a caixinha de login.
- **1b. Cliente tentando entrar:** tela “Sua conta é de cliente” (o servidor também responde 403).

---

## UC09 — Consultar e filtrar clientes

| Campo | Descrição |
| --- | --- |
| **Atores** | Supervisor, Administrador |
| **Requisitos** | RF09, RNF03 |

**Passos**

1. A equipe abre **Banco de Clientes**.
2. O sistema lista nome, e-mail, **perfil** (selo por nível), origem do cadastro, data de criação,
   último acesso, total de acessos e situação na nuvem.
3. A equipe pesquisa por nome/e-mail/ID, filtra por perfil, por situação da nuvem e ordena por
   qualquer coluna; a paginação é de 10 linhas.
4. O contador mostra “N de M contas”.
5. Clicando em **Ficha**, o sistema abre o modal com os dados completos e o **histórico de acessos**
   daquela pessoa (`GET /api/admin/usuarios/:id`).

**Fluxos alternativos**

- **2a. Banco vazio:** o sistema explica que a lista se preenche sozinha quando alguém se cadastrar.

---

## UC10 — Exportar a lista de clientes (CSV)

| Campo | Descrição |
| --- | --- |
| **Atores** | Supervisor, Administrador |
| **Requisitos** | RF10 |

**Passos**

1. A equipe aplica os filtros desejados e clica em **⇩ Exportar CSV**.
2. O sistema exporta **exatamente o que está filtrado**, com cabeçalho em português e separador
   `;` (abre direto no Excel em pt-BR), incluindo a situação de cada cadastro na nuvem.
3. O arquivo é baixado com data no nome (`relo-clientes-AAAA-MM-DD.csv`).

---

## UC11 — Gerenciar o estoque

| Campo | Descrição |
| --- | --- |
| **Atores** | Supervisor (opera), Administrador (também exclui) |
| **Requisitos** | RF11, RN04 |

**Passos**

1. A equipe abre **Controle de Estoque**.
2. O sistema lista produto, categoria, quantidade, estoque mínimo, preço e total, com alerta
   visual para os itens **abaixo do mínimo**.
3. Para incluir, clica em **+ Novo Produto**, preenche nome, categoria, quantidade, mínimo e preço.
4. Para movimentar, clica em **Entrada/Saída**, informa o tipo e a quantidade: o sistema grava o
   histórico (antes → depois) com o responsável e a observação.
5. Todos os dados ficam no **banco do servidor**, então admin e supervisor veem o mesmo número.

**Fluxos alternativos**

- **4a. Saída maior que o disponível:** o sistema recusa e explica.
- **6a. Excluir produto:** botão só aparece para o administrador; pelo servidor, o supervisor
  recebe **403** (`estoque.excluir`).

---

## UC12 — Gerenciar a manutenção

| Campo | Descrição |
| --- | --- |
| **Atores** | Supervisor, Administrador |
| **Requisitos** | RF12 |

**Passos**

1. A equipe abre **Manutenção** e vê as ordens com item, descrição, responsável, custo e status.
2. Clica em **+ Registrar Manutenção**, informa equipamento, descrição, responsável, custo e status.
3. Clicando no selo de status, o sistema avança o ciclo **Pendente → Em Andamento → Concluído**.
4. A ordem concluída sai da contagem de “manutenções abertas” do painel.

---

## UC13 — Gerenciar as despesas

| Campo | Descrição |
| --- | --- |
| **Atores** | Supervisor, Administrador |
| **Requisitos** | RF13 |

**Passos**

1. A equipe abre **Despesas** e vê descrição, categoria, valor, situação (paga/em aberto) e data.
2. Clica em **+ Adicionar Despesa**, escolhe a categoria (lista pronta ou texto livre) e o valor.
3. Clicando no selo de pagamento, o sistema alterna **em aberto ↔ paga**.
4. O total do mês e o que está pendente aparecem no painel e na faixa “Hoje na barbearia”.

---

## UC14 — Configurar o banco de dados na nuvem (Supabase)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Administrador |
| **Ator secundário** | Supabase |
| **Objetivo** | Ligar/desligar a cópia dos cadastros para a nuvem |
| **Requisitos** | RF14, RNF05 |

**Passos**

1. O administrador abre a aba **Banco de Dados**.
2. O sistema mostra o estado do banco local, o estado da nuvem, os contadores (enviados, na fila,
   falhas) e a fila com o erro de cada cadastro.
3. O administrador cola **o bloco inteiro** copiado do painel do Supabase (URL, chave, rótulos).
4. O sistema extrai URL, chave e nome da tabela sozinho, aceitando as chaves *anon*,
   *publishable* e *JWT* — e avisando se a chave for `service_role` (acesso total).
5. O sistema grava a configuração **no servidor** (`data/supabase-config.json`, fora do Git) e
   **nunca devolve a chave inteira** para o navegador (só máscara).
6. O administrador clica em **Testar conexão** e depois em **Reenviar fila**, se houver pendências.

**Fluxos alternativos**

- **3a. URL de outro projeto:** se o `.env` fixa o projeto, o sistema responde **409** e não desvia
  o espelho.
- **3b. Bloco sem URL/chave:** o sistema responde **400** dizendo exatamente o que faltou.

---

## UC15 — Definir o perfil de acesso de alguém

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Administrador |
| **Objetivo** | Promover/rebaixar um usuário na hierarquia |
| **Pré-condições** | Sessão de administrador |
| **Pós-condições** | Novo perfil gravado; sessões da conta encerradas |
| **Requisitos** | RF15, RN01, RN02 |

**Passos**

1. O administrador abre **Banco de Clientes**, clica em **Ficha** na pessoa desejada.
2. O sistema mostra o bloco **Perfil de acesso** com as opções válidas
   (*Tornar supervisor*, *Tornar administrador*, *Voltar para cliente*).
3. O administrador escolhe uma opção e confirma no modal.
4. O sistema chama `POST /api/admin/usuarios/:id/perfil`, grava o novo perfil com autor e data.
5. O sistema **derruba as sessões** daquela conta: a pessoa entra de novo já com o novo poder.
6. A lista de clientes passa a mostrar o novo selo (ouro/azul/verde).

**Fluxos alternativos**

- **3a. Tentar mudar o próprio perfil:** o sistema recusa (“Você não pode mudar o seu próprio perfil.”).
- **3b. Rebaixar conta da equipe (semente):** o sistema recusa e explica que a conta é protegida.
- **3c. Supervisor tentando a mesma tela:** sem a permissão `equipe.gerenciar`, o botão nem
  aparece e a API responde **403**.

---

## UC16 — Criar conta para a equipe (supervisor/administrador)

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Administrador |
| **Requisitos** | RF16, RN03 |

**Passos**

1. O administrador clica em **+ Novo Cliente**.
2. O sistema mostra, além de nome/e-mail/senha, o campo **Perfil de acesso**
   (Usuário, Supervisor ou Administrador) — campo que só existe para quem gerencia a equipe.
3. O administrador escolhe *Supervisor* e salva.
4. O sistema cria a conta já com o perfil escolhido e confirma no aviso: “Conta de Supervisor
   criada — já pode entrar no painel.”

**Fluxos alternativos**

- **3a. Supervisor tentando criar administrador:** a API responde **403** mesmo que o pedido
  seja enviado por fora do painel.

---

## UC17 — Sair do sistema

| Campo | Descrição |
| --- | --- |
| **Atores** | Todos |
| **Requisitos** | RF02 |

**Passos**

1. O usuário clica em **Sair** (no menu do site ou no painel) e confirma.
2. O sistema apaga a sessão (token) do banco e limpa a sessão do navegador.
3. O sistema volta para a página inicial.

---

## UC18 — Recuperar cadastros que não subiram para a nuvem

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Administrador (automático também pelo sistema) |
| **Requisitos** | RF17, RNF07 |

**Passos**

1. O administrador abre **Banco de Dados** e vê a fila com o erro de cada cadastro.
2. Clica em **Reenviar fila**; o sistema tenta enviar item por item e atualiza os contadores.
3. Sem ninguém clicar, o servidor também tenta sozinho **a cada 3 minutos** (espera crescente por
   item) e, no site sem servidor, o próprio navegador reenvia na visita seguinte.

---

## UC19 — Excluir o cadastro de um cliente *(exclusivo do Administrador)*

| Campo | Descrição |
| --- | --- |
| **Ator principal** | Administrador |
| **Atores secundários** | Supabase (recebe a remoção) |
| **Pré-condição** | Estar logado como Administrador e ter aberto a ficha de um cliente |
| **Pós-condição** | O cadastro sai do banco, as sessões dele são encerradas e a fila de envio é limpa |
| **Requisitos** | RF18, RN03, RN05, RNF02 |
| **Permissão** | `clientes.excluir` (só o nível 3) |

**Passos**

1. O administrador abre **Banco de Clientes**, clica em **Ver** na ficha do cliente e depois em
   **Excluir cadastro**.
2. O sistema pede a confirmação, avisando que a exclusão é definitiva e que o cliente perde o acesso.
3. O administrador confirma; o sistema apaga o registro, **derruba as sessões** abertas daquele
   cliente e retira o e-mail da fila de envio pendente.
4. A lista é atualizada e o aviso confirma: “Cadastro removido.”

**Regras aplicadas**

- **RN05 — conta da equipe não se exclui:** contas criadas na semente (administradores e
  supervisores do projeto) são protegidas; a API responde **400** com a orientação “rebaixe o perfil
  se precisar”, para ninguém apagar a própria equipe por engano.
- **RN06 — LGPD:** o cliente pode pedir a remoção dos dados; como o sistema guarda apenas
  nome, e-mail, telefone e histórico de atendimento, a exclusão resolve o pedido sem sobra em
  outra tabela (a fila de sincronização também é limpa).

**Fluxos alternativos**

- **1a. Supervisor tentando excluir:** a permissão é do nível 3; a tela não mostra o botão **e** a
  API responde **403** se o pedido for enviado por fora do painel.
- **3a. Falha ao avisar a nuvem:** se o Supabase estiver fora do ar, a exclusão local continua
  valendo e o item entra na fila de reenvio (mesmo tratamento do UC18).

---

## Regras de negócio

| Código | Regra | Onde aparece |
| --- | --- | --- |
| RN01 | Cliente não abre nenhuma função do painel — a rota responde **403** e a tela não mostra o link. | UC08 a UC19 |
| RN02 | O supervisor **opera** (estoque, manutenção, despesas, cadastro e edição de clientes), mas não administra. | UC09 a UC13 |
| RN03 | Só o administrador exclui cadastros, configura a nuvem e define o perfil de alguém. | UC14, UC15, UC19 |
| RN04 | Após 12 tentativas de login erradas em 10 minutos, o e-mail é bloqueado temporariamente (**429**). | UC02 |
| RN05 | Conta criada na semente (equipe do projeto) não pode ser excluída — a API responde **400** e orienta a rebaixar o perfil. | UC19 |
| RN06 | LGPD: a exclusão do cadastro apaga os dados pessoais que o sistema guarda (nome, e-mail, telefone e histórico) e encerra as sessões do titular. | UC19 |

---

## Requisitos do sistema

### Funcionais

| Código | Requisito | Caso de uso | Situação |
| --- | --- | --- | --- |
| RF01 | Cadastrar cliente com senha protegida por hash | UC01 | ✔ implementado |
| RF02 | Autenticar, manter sessão de 7 dias e sair | UC02, UC17 | ✔ |
| RF03 | Agendar pelo WhatsApp com mensagem pronta | UC03 | ✔ |
| RF04 | Simular corte por visagismo com leitura facial local | UC04 | ✔ |
| RF05 | Chat de atendimento (Relo IA) sem serviço externo | UC05 | ✔ |
| RF06 | Registrar avaliação do barbeiro | UC06 | ✔ |
| RF07 | Área do cliente com dados e histórico | UC07 | ✔ |
| RF08 | Painel com KPIs, gráficos e resumo do dia | UC08 | ✔ |
| RF09 | Listar/pesquisar/filtrar/paginar clientes e ver ficha | UC09 | ✔ |
| RF10 | Exportar clientes filtrados em CSV | UC10 | ✔ |
| RF11 | Controlar estoque com mínimo e histórico | UC11 | ✔ |
| RF12 | Controlar manutenção com ciclo de status | UC12 | ✔ |
| RF13 | Controlar despesas por categoria e situação | UC13 | ✔ |
| RF14 | Configurar e espelhar cadastros no Supabase | UC14 | ✔ |
| RF15 | Definir perfil (Usuário/Supervisor/Administrador) | UC15 | ✔ |
| RF16 | Criar conta de equipe direto no painel | UC16 | ✔ |
| RF17 | Fila de reenvio com nova tentativa automática | UC18 | ✔ |
| RF18 | Excluir o cadastro de um cliente (LGPD), protegendo as contas da equipe | UC19 | ✔ |

### Não funcionais

| Código | Requisito | Como foi atendido |
| --- | --- | --- |
| RNF01 | Funcionar sem instalar dependências | Servidor em **Node puro** (`http`, `fs`, `path`, `crypto`) |
| RNF02 | Senha nunca em texto puro | SHA-256 com sal por conta, no navegador e no servidor |
| RNF03 | Resposta em até 1 s nas telas do painel | Uma chamada de métricas e gráficos desenhados em SVG no próprio JS |
| RNF04 | Funcionar com internet fraca/instável | IA do simulador 100% local; fila de reenvio para a nuvem |
| RNF05 | Não expor segredos ao navegador | Chaves só no servidor (`data/`, `.env`), mascaradas na API; `.env`/`data` bloqueados (404) |
| RNF06 | Resistir a força bruta básica | 12 tentativas por e-mail a cada 10 minutos → 429 |
| RNF07 | Não perder cadastro | Banco local primeiro, nuvem depois, com fila persistente |
| RNF08 | Acessível e responsivo | Layout responsivo, foco visível, `aria-*`, contraste, `prefers-reduced-motion` |
| RNF09 | Rastreável | Histórico de acessos, autor/data na troca de perfil, logs no console do servidor |

---

## Rastreabilidade: caso de uso → tela → rota da API

| Caso de uso | Tela | Principal rota/arquivo |
| --- | --- | --- |
| UC01, UC02 | `signup.html`, `login.html`, caixinha de login | `POST /api/auth/registrar`, `POST /api/auth/login` |
| UC03 | `servicos.html`, `contato.html`, `ia-tryon.html` | link `wa.me` montado no cliente |
| UC04, UC05 | `ia-tryon.html`, `face-recognition.html` | `ia-camera.js`, `ia-tryon.js`, `chat-ia.js` |
| UC06 | `feedback.html` | `feedback.js` |
| UC07 | `dashboard.html` | `GET /api/auth/eu` |
| UC08 | `admin.html` (Visão Geral) | `GET /api/admin/metricas` |
| UC09, UC10 | `admin.html` (Banco de Clientes) | `GET /api/admin/usuarios`, `GET /api/admin/usuarios/:id` |
| UC11 | `admin.html` (Estoque) | `GET/POST /api/admin/estoque`, `POST /api/admin/estoque/mov` |
| UC12 | `admin.html` (Manutenção) | `GET/POST /api/admin/manutencao` |
| UC13 | `admin.html` (Despesas) | `GET/POST /api/admin/despesas` |
| UC14, UC18 | `admin.html` (Banco de Dados) | `GET/POST /api/admin/supabase`, `…/teste`, `…/reenviar` |
| UC15, UC16 | `admin.html` (ficha e novo cadastro) | `POST /api/admin/usuarios`, `POST /api/admin/usuarios/:id/perfil` |
| UC19 | `admin.html` (ficha do cliente) | `DELETE /api/admin/usuarios/:id` |
| UC17 | qualquer página | `POST /api/auth/sair` |

> As telas e o diagrama estão em `TCC/diagrama-caso-de-uso.html` (página A4, pronta para
> imprimir/exportar em PDF).
