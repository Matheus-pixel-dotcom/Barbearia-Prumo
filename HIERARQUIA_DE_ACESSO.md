# Hierarquia de acesso — Style Relo Barber

Documento da **Etapa 5**: como o sistema separa **Administrador**, **Supervisor** e
**Usuário (cliente)**, o que cada um pode fazer e como isso é conferido no servidor.

> A tabela abaixo não é digitada à mão: ela sai de `permissoes.js` com
> `npm run matriz`. Se alguém mudar uma permissão no código, rode de novo e cole
> aqui — documento e sistema nunca ficam diferentes.

## Os três perfis

| Nível | Perfil | Chave no banco | Quem é | O que faz |
| :---: | --- | --- | --- | --- |
| 1 | **Usuário** (cliente) | `cliente` | quem corta o cabelo | usa o site: agenda no WhatsApp, usa o simulador de visagismo, avalia os barbeiros e vê a própria área em `dashboard.html` |
| 2 | **Supervisor** | `supervisor` | equipe da barbearia (barbeiro, gerente de vendas, recepção) | abre o painel, acompanha os números, vê os clientes e opera **estoque, manutenção e despesas** do dia a dia |
| 3 | **Administrador** | `admin` | dono/gestor e a equipe do TCC | tudo do supervisor **mais** excluir cadastros, configurar a nuvem (Supabase) e definir quem é quem |

Regra que resume a hierarquia: **o supervisor OPERA, o administrador ADMINISTRA.**
Toda ação destrutiva (excluir) ou de configuração (nuvem, permissões) é só do admin.

## Matriz de permissões

<!-- gerado por: node ferramentas/matriz-permissoes.js -->

| Ação no sistema | Usuário (cliente) | Supervisor | Administrador |
| --- | :---: | :---: | :---: |
| Abrir o painel da barbearia | — | ✔ | ✔ |
| Ver a lista de clientes e o histórico de acessos | — | ✔ | ✔ |
| Exportar a lista de clientes em CSV | — | ✔ | ✔ |
| Cadastrar um cliente pelo painel | — | ✔ | ✔ |
| Excluir o cadastro de um cliente | — | — | ✔ |
| Criar contas da equipe e mudar o perfil de um usuário | — | — | ✔ |
| Ver o estoque | — | ✔ | ✔ |
| Lançar entrada, saída e preço no estoque | — | ✔ | ✔ |
| Excluir um produto do estoque | — | — | ✔ |
| Ver a manutenção | — | ✔ | ✔ |
| Abrir, atualizar e concluir ordens de manutenção | — | ✔ | ✔ |
| Excluir uma ordem de manutenção | — | — | ✔ |
| Ver as despesas | — | ✔ | ✔ |
| Lançar e quitar despesas | — | ✔ | ✔ |
| Excluir uma despesa | — | — | ✔ |
| Ver o status do banco de dados e da nuvem (Supabase) | — | ✔ | ✔ |
| Configurar a nuvem (URL, tabela e chave) | — | — | ✔ |
| Reenviar a fila de cadastros para a nuvem | — | — | ✔ |

## Como a permissão é aplicada (defesa em duas camadas)

1. **No servidor — é o que manda.** Toda rota `/api/admin/*` passa por
   `exigePermissao(req, banco, res, 'ação')` (`server.js`). Sem a permissão, a resposta é
   **403** com a explicação em português, por exemplo:
   `"O perfil Supervisor não pode reenviar a fila de cadastros para a nuvem. Fale com um administrador."`
   Nem token válido de supervisor passa: o perfil é relido do **banco** a cada pedido.
2. **No navegador — só para a tela ficar honesta.** `admin.js` lê a mesma matriz
   (`permissoes.js`), marca os elementos com `data-perm="ação"` e **esconde** o que o
   perfil não alcança (o botão *Excluir*, o formulário da nuvem, a aba de permissões).
   Esconder botão não é segurança — é conforto; quem tenta pela API leva 403 de qualquer forma.

Além da permissão, cada rota confere **hierarquia** quando o assunto é perfil de alguém
(`db.definirPerfil`): ninguém muda o próprio perfil, conta da equipe criada pela semente não
pode ser rebaixada nem excluída, e trocar o perfil **derruba as sessões abertas** daquela
conta (a pessoa entra de novo já com o poder novo).

## Quem já nasce com cada perfil

A fonte da verdade é `admin-accounts.js`: cada conta traz o campo `perfil` e o arquivo guarda
apenas `sal + hash` — nunca a senha.

| Perfil na semente | Quantas contas | Quem |
| --- | --- | --- |
| **Administrador** (nível 3) | 6 | R. Gabriel, Evelyn Coller, Matheus Moura, Marcos Rossa, Professor e Victor Camargo Pereira |
| **Supervisor** (nível 2) | 2 | Wevergton Sousa e Michel Lima (barbeiros da equipe: entram no painel para operar, sem os poderes de administrador) |

> **Como o perfil da semente chega ao banco:** no boot (e a cada requisição), `db.semearAdmins()`
> cria quem falta e **alinha o perfil de quem já existe** com o que está em `admin-accounts.js`.
> A exceção é a troca feita **pelo painel**: ela marca a conta com `perfilManual` e passa a valer
> sobre a semente — assim ninguém perde uma promoção decidida dentro do sistema.

- **Novos supervisores pelo painel:** o admin abre **Banco de Clientes** → botão **Ficha** de
  qualquer pessoa → em **Perfil de acesso**, clica em **Tornar supervisor**; a conta passa a abrir
  o painel na hora (e recebe o selo azul *Supervisor* na lista).
- **Conta nova já como supervisor:** **+ Novo Cliente** → campo **Perfil de acesso** →
  *Supervisor* (esse campo só aparece para o administrador).
- **Demonstração pronta:** `npm run demo` cria a vitrine **e** uma conta de supervisor
  (`supervisor@exemplo.com` / `Senha123!`) para mostrar a hierarquia funcionando na banca.

## Rotas e o que cada uma exige

| Rota | Permissão exigida |
| --- | --- |
| `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/registrar`, `GET /api/auth/eu`, `POST /api/auth/sair` | aberta / sessão |
| `GET /api/admin/metricas` | `painel.ver` |
| `GET /api/admin/usuarios`, `GET /api/admin/usuarios/:id` | `clientes.ver` |
| `POST /api/admin/usuarios` | `clientes.criar` (com `perfil` só para quem tem `equipe.gerenciar`) |
| `DELETE /api/admin/usuarios/:id` | `clientes.excluir` |
| `POST /api/admin/usuarios/:id/perfil` | `equipe.gerenciar` |
| `GET /api/admin/estoque` | `estoque.ver` |
| `POST /api/admin/estoque`, `POST /api/admin/estoque/mov` | `estoque.editar` |
| `DELETE /api/admin/estoque/:id` | `estoque.excluir` |
| `GET /api/admin/manutencao` | `manutencao.ver` |
| `POST /api/admin/manutencao` | `manutencao.editar` |
| `DELETE /api/admin/manutencao/:id` | `manutencao.excluir` |
| `GET /api/admin/despesas` | `despesas.ver` |
| `POST /api/admin/despesas` | `despesas.editar` |
| `DELETE /api/admin/despesas/:id` | `despesas.excluir` |
| `GET /api/admin/supabase`, `POST /api/admin/supabase/teste` | `nuvem.ver` |
| `POST /api/admin/supabase` | `nuvem.configurar` |
| `POST /api/admin/supabase/reenviar` | `nuvem.reenviar` |

## Onde isso aparece na tela

- **Painel (`admin.html`)** — quem não é administrador vê uma faixa dourada no topo
  explicando o próprio perfil; os itens proibidos simplesmente não aparecem.
- **Cabeçalho do painel** — o chip do usuário mostra o nome, o e-mail e o **perfil**
  (`Administrador`, `Supervisor`).
- **Banco de Clientes** — coluna *Perfil* com selo próprio para cada nível
  (ouro = Administrador, azul = Supervisor, verde = Cliente).
- **Menu do site** — a pílula **Admin** fecha em ouro para admin **e** supervisor (os dois
  entram no painel); para o cliente ela abre a caixinha de login com o aviso de que a área
  é da equipe.
- **Área do cliente (`dashboard.html`)** — mostra o perfil real e só libera o atalho do
  painel para a equipe.

## Arquivos envolvidos

| Arquivo | Papel |
| --- | --- |
| `permissoes.js` | a matriz (fonte única da verdade, roda no servidor e no navegador) |
| `db.js` | `usuarioPublico()` (perfil, rótulo e permissões) e `definirPerfil()` (troca de perfil) |
| `server.js` | `exigeAdmin()` / `exigePermissao()` em toda rota `/api/admin/*` |
| `auth-core.js` | `ehAdmin`, `ehSupervisor`, `ehEquipe`, `pode(acao)`, `definirPerfil` (modo local e servidor) |
| `admin.js` / `admin.html` | `data-perm` nos botões, faixa do perfil, ficha com troca de perfil |
| `login-modal.js` / `dashboard.html` | roteiam a equipe para o painel e o cliente para a área dele |
| `ferramentas/teste-hierarquia.js` | 65 verificações rota por rota (o que pode e o que NÃO pode) |
| `ferramentas/matriz-permissoes.js` | gera a tabela acima direto do código |

## Como testar

```bash
npm run test:acessos     # 65 verificações da hierarquia (sobe um servidor descartável)
npm test                 # suíte completa (banco, rotas, segurança + hierarquia)
npm run matriz           # imprime a matriz de permissões atualizada
npm run demo             # vitrine + conta de supervisor para demonstrar
```

Exemplo do que o `test:acessos` cobra (trecho real da saída):

```
 ✓ cliente leva 403 em /api/admin/metricas
 ✓ admin promove cliente a supervisor
 ✓ token antigo pede login de novo (401)
 ✓ supervisor NÃO pode configurar a nuvem (403)
 ✓ supervisor NÃO pode excluir cliente (403)
 ✓ supervisor dá baixa no estoque
 ✓ admin exclui produto
```
