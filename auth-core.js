/*
 * ReloAuth — coração do sistema de login do Style Relo Barber.
 *
 * Funciona em dois modos, de forma transparente:
 *
 *   1. MODO SERVIDOR ("servidor"): quando o site é aberto com "npm run serve",
 *      o cadastro é gravado no banco de dados do servidor (data/db.json) e fica
 *      compartilhado entre todos os aparelhos. É o modo recomendado.
 *
 *   2. MODO LOCAL ("local"): quando a página é aberta direto pelo arquivo
 *      (file:// ou hospedagem estática sem servidor), o mesmo banco roda dentro
 *      do navegador usando localStorage. Nada quebra, só não é compartilhado.
 *
 * Regras do projeto:
 *   - Os e-mails da equipe (admin-accounts.js) já vêm cadastrados no banco.
 *   - Qualquer outro e-mail é tratado como CLIENTE e precisa se cadastrar.
 *   - Senha nunca é guardada em texto puro: só o hash SHA-256.
 *
 * HIERARQUIA DE ACESSO (a tabela vive em permissoes.js, a mesma que o servidor usa):
 *   cliente (Usuário) usa o site · supervisor abre o painel e opera o dia a dia ·
 *   admin (Administrador) faz tudo, inclusive excluir e configurar.
 */
(function (global) {
  'use strict';

  const ReloHash = global.ReloHash;
  const SEMENTE = global.ReloAdminAccounts || { contas: [] };
  const Permissoes =
    global.ReloPermissoes ||
    (typeof require === 'function'
      ? require('./permissoes')
      : {
          // rede de segurança: se permissoes.js não carregar, ninguém além do
          // admin entra no painel (nega por padrão em vez de liberar)
          normalizar: (p) => (p === 'admin' ? 'admin' : p === 'supervisor' ? 'supervisor' : 'cliente'),
          nivel: (p) => (p === 'admin' ? 3 : p === 'supervisor' ? 2 : 1),
          rotulo: (p) => (p === 'admin' ? 'Administrador' : p === 'supervisor' ? 'Supervisor' : 'Usuário'),
          pode: (p, a) => p === 'admin' && a !== 'nao-existe',
          mapa: () => ({}),
          podePainel: (p) => p === 'admin',
          acoes: () => [],
          existe: (p) => ['cliente', 'supervisor', 'admin'].includes(p),
          descrever: () => 'executar esta ação',
          perfis: () => []
        });

  const CHAVES = {
    usuarios: 'relo_db_usuarios_v2',
    sessoes: 'relo_db_sessoes_v2',
    logins: 'relo_db_logins_v2',
    sessao: 'relo_sessao_v2',
    sync: 'relo_db_sync_v1',
    visitou: 'relo_login_mostrado'
  };

  let modo = null; // 'servidor' | 'local'
  let usuario = null; // usuário logado
  let token = null; // token da sessão ativa
  const ouvintes = new Set();

  /* ------------------------- armazenamento ------------------------- */
  const memoria = {};
  function ls(chave, valor) {
    try {
      if (valor === undefined) return global.localStorage.getItem(chave);
      if (valor === null) global.localStorage.removeItem(chave);
      else global.localStorage.setItem(chave, valor);
    } catch (erro) {
      if (valor === undefined) return memoria[chave] || null;
      if (valor === null) delete memoria[chave];
      else memoria[chave] = valor;
    }
    return null;
  }

  function lerJson(chave, padrao) {
    try {
      const bruto = ls(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (erro) {
      return padrao;
    }
  }

  function gravarJson(chave, dados) {
    ls(chave, JSON.stringify(dados));
  }

  /* ------------------------- modo local (banco no navegador) ------------------------- */
  const BancoLocal = {
    abrir() {
      const banco = {
        usuarios: lerJson(CHAVES.usuarios, []),
        sessoes: lerJson(CHAVES.sessoes, []),
        logins: lerJson(CHAVES.logins, [])
      };
      let mudou = false;
      SEMENTE.contas.forEach((conta) => {
        const existe = banco.usuarios.some((u) => u.email === conta.email.toLowerCase());
        if (existe) return;
        const perfilSemente = Permissoes.normalizar(conta.perfil || 'admin');
        banco.usuarios.push({
          id: (perfilSemente === 'admin' ? 'adm_' : 'sup_') +
            conta.email.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10),
          nome: conta.nome,
          email: conta.email.toLowerCase(),
          aliases: (conta.aliases || []).map((a) => a.toLowerCase()),
          perfil: perfilSemente,
          origem: 'semente',
          salt: conta.salt,
          senhaHash: conta.senhaHash,
          criadoEm: new Date().toISOString(),
          ultimoLogin: null,
          totalLogins: 0
        });
        mudou = true;
      });
      if (mudou) this.salvar(banco);
      return banco;
    },
    salvar(banco) {
      gravarJson(CHAVES.usuarios, banco.usuarios);
      gravarJson(CHAVES.sessoes, banco.sessoes.slice(-40));
      gravarJson(CHAVES.logins, banco.logins.slice(0, 300));
    },
    achar(banco, email) {
      const alvo = String(email || '').trim().toLowerCase();
      if (!alvo) return null;
      return (
        banco.usuarios.find((u) => u.email === alvo) ||
        banco.usuarios.find((u) => (u.aliases || []).includes(alvo)) ||
        null
      );
    },
    publico(u) {
      if (!u) return null;
      const sync = u.sync && typeof u.sync === 'object' ? u.sync : null;
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        aliases: u.aliases || [],
        perfil: Permissoes.normalizar(u.perfil),
        perfilRotulo: Permissoes.rotulo(u.perfil),
        perfilNivel: Permissoes.nivel(u.perfil),
        podePainel: Permissoes.podePainel(u.perfil),
        permissoes: Permissoes.mapa(u.perfil),
        origem: u.origem || 'cadastro',
        criadoEm: u.criadoEm || null,
        ultimoLogin: u.ultimoLogin || null,
        totalLogins: u.totalLogins || 0,
        sincronizacao: sync
          ? { estado: sync.estado === 'ok' || sync.estado === 'erro' ? sync.estado : 'pendente', em: sync.em || null, erro: sync.erro || null }
          : { estado: 'pendente', em: null, erro: null }
      };
    },
    novoId(prefixo, email) {
      return prefixo + '_' + ReloHash.sha256Hex(email).slice(0, 10);
    },
    registrarLogin(banco, dados) {
      banco.logins.unshift({
        email: String(dados.email || '').toLowerCase(),
        nome: dados.nome || '',
        perfil: dados.perfil || 'cliente',
        quando: new Date().toISOString(),
        sucesso: dados.sucesso !== false,
        origem: dados.origem || 'local'
      });
      banco.logins = banco.logins.slice(0, 300);
    }
  };


  /* ------------------------- espelho na nuvem (Supabase) -------------------------
   * Com servidor, quem sobe a cópia para o Supabase é o server.js.
   * Sem servidor (site aberto pelo arquivo / hospedagem estática), quem faz isso é o
   * próprio navegador: o cadastro é salvo no banco local e enviado ao Supabase na hora.
   * Se a rede falhar, o cadastro entra numa fila no navegador e é reenviado na próxima
   * visita — assim o cliente nunca fica fora do "nosso banco de dados".
   */
  function filaNuvem() {
    const fila = lerJson(CHAVES.sync, []);
    return Array.isArray(fila) ? fila : [];
  }

  function salvarFilaNuvem(fila) {
    gravarJson(CHAVES.sync, (fila || []).slice(0, 80));
  }

  function entrarNaFila(email, erro) {
    const alvo = String(email || '').toLowerCase();
    if (!alvo) return;
    const fila = filaNuvem().filter((i) => String(i.email || '').toLowerCase() !== alvo);
    fila.unshift({ email: alvo, erro: erro || null, tentativas: 0, desde: new Date().toISOString() });
    salvarFilaNuvem(fila);
  }

  function sairDaFila(email) {
    const alvo = String(email || '').toLowerCase();
    salvarFilaNuvem(filaNuvem().filter((i) => String(i.email || '').toLowerCase() !== alvo));
  }

  function registrarSyncLocal(email, resultado) {
    const banco = BancoLocal.abrir();
    const alvo = BancoLocal.achar(banco, email);
    const info =
      resultado && resultado.ok
        ? { estado: 'ok', em: new Date().toISOString() }
        : { estado: 'erro', em: new Date().toISOString(), erro: (resultado && resultado.erro) || 'falha no envio' };
    if (alvo) {
      alvo.sync = info;
      BancoLocal.salvar(banco);
    }
    if (info.estado === 'ok') sairDaFila(email);
    else entrarNaFila(email, info.erro);
    return info;
  }

  function enviarCadastroParaNuvem(usuario) {
    const Sync = global.ReloSync;
    if (!Sync) {
      registrarSyncLocal(usuario.email, { ok: false, erro: 'módulo sync-supabase.js não carregado' });
      return Promise.resolve({ ok: false });
    }
    let cfg = null;
    try {
      cfg = Sync.configNavegador();
    } catch (erro) {
      registrarSyncLocal(usuario.email, { ok: false, erro: 'configuração do espelho ilegível: ' + erro.message });
      return Promise.resolve({ ok: false });
    }
    if (!cfg.ativo) {
      const banco = BancoLocal.abrir();
      const alvo = BancoLocal.achar(banco, usuario.email);
      if (alvo) {
        alvo.sync = { estado: 'pendente', em: new Date().toISOString(), erro: 'espelhamento desligado' };
        BancoLocal.salvar(banco);
      }
      return Promise.resolve({ ok: false, erro: 'desligado' });
    }
    return Sync.enviar(BancoLocal.publico(usuario), cfg)
      .then((resultado) => {
        registrarSyncLocal(usuario.email, resultado);
        return resultado;
      })
      .catch((erro) => {
        registrarSyncLocal(usuario.email, { ok: false, erro: erro && erro.message });
        return { ok: false };
      });
  }

  async function reenviarFilaNuvem() {
    const fila = filaNuvem();
    if (!fila.length) return { ok: true, processados: 0 };
    const banco = BancoLocal.abrir();
    let processados = 0;
    for (const item of fila) {
      const usuario = BancoLocal.achar(banco, item.email);
      if (!usuario) {
        sairDaFila(item.email);
        continue;
      }
      const resultado = await enviarCadastroParaNuvem(usuario);
      processados += 1;
      void resultado;
    }
    return { ok: true, processados };
  }

  function estadoSincronizacao() {
    const Sync = global.ReloSync;
    let cfg = null;
    try {
      cfg = Sync ? Sync.configNavegador() : null;
    } catch (erro) {
      cfg = null;
    }
    const banco = BancoLocal.abrir();
    const clientes = banco.usuarios.filter((u) => Permissoes.normalizar(u.perfil) === 'cliente');
    const fila = filaNuvem();
    return {
      ok: true,
      modo: 'navegador',
      origem: 'site sem servidor (localStorage + Supabase direto)',
      ativo: Boolean(cfg && cfg.ativo),
      urlMascara: cfg && cfg.url ? String(cfg.url).replace(/^https?:\/\//, '') : null,
      tabela: (cfg && cfg.tabela) || 'clientes',
      chaveMascara: Sync && cfg ? Sync.mascaraChave(cfg.chave) : null,
      bancoLocal: { arquivo: 'localStorage deste navegador', usuarios: banco.usuarios.length, clientes: clientes.length },
      pendentes: fila.length,
      fila: fila.slice(0, 20),
      enviado: clientes.filter((u) => u.sync && u.sync.estado === 'ok').length,
      falha: clientes.filter((u) => u.sync && u.sync.estado === 'erro').length,
      totalClientes: clientes.length,
      clientesSync: clientes.filter((u) => u.sync && u.sync.estado === 'ok').length,
      ultimoErro: fila.length ? fila[0].erro : null,
      ultimoEnvio: null
    };
  }

  /* ------------------------- comunicação com a API ------------------------- */
  async function chamarApi(caminho, opcoes) {
    const config = Object.assign({ headers: {} }, opcoes || {});
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});
    if (token) config.headers.Authorization = 'Bearer ' + token;
    const resposta = await fetch('api/' + caminho.replace(/^\/+/, ''), config);
    let dados = {};
    try {
      dados = await resposta.json();
    } catch (erro) {
      dados = {};
    }
    return { status: resposta.status, ok: resposta.ok, dados };
  }

  /* ------------------------- sessão ------------------------- */
  function avisar() {
    ouvintes.forEach((cb) => {
      try {
        cb(usuario, modo);
      } catch (erro) {
        console.error('[ReloAuth] erro em ouvinte:', erro);
      }
    });
  }

  function guardarSessao(usuarioLogado, novoToken, novoModo) {
    usuario = usuarioLogado;
    token = novoToken || token;
    modo = novoModo || modo;
    gravarJson(CHAVES.sessao, { token, usuario, modo, salvoEm: new Date().toISOString() });
    avisar();
  }

  function limparSessao() {
    usuario = null;
    token = null;
    ls(CHAVES.sessao, null);
    avisar();
  }

  async function ready() {
    if (modo) return modo;

    // 1) Existe servidor com a API do banco de dados?
    try {
      const resposta = await fetch('api/health', { cache: 'no-store' });
      if (resposta.ok) {
        const dados = await resposta.json();
        modo = dados && dados.ok ? 'servidor' : 'local';
      } else {
        modo = 'local';
      }
    } catch (erro) {
      modo = 'local';
    }

    // 2) Reaproveita a sessão salva no navegador
    const salva = lerJson(CHAVES.sessao, null);
    if (salva && salva.token) {
      token = salva.token;
      if (modo === 'servidor') {
        try {
          const { ok, dados } = await chamarApi('auth/eu');
          if (ok && dados.usuario) usuario = dados.usuario;
          else token = null;
        } catch (erro) {
          token = null;
        }
      } else {
        const banco = BancoLocal.abrir();
        const sessao = banco.sessoes.find((s) => s.tokenHash === ReloHash.hashToken(token));
        const dono = sessao && banco.usuarios.find((u) => u.id === sessao.usuarioId);
        if (sessao && dono && new Date(sessao.expiraEm).getTime() > Date.now()) {
          usuario = BancoLocal.publico(dono);
        } else {
          token = null;
        }
      }
      if (!usuario) limparSessao();
    }

    // No modo local, a fila de cadastros que não subiram é reenvitada em segundo plano.
    if (modo === 'local' && filaNuvem().length) {
      global.setTimeout(() => {
        reenviarFilaNuvem().catch(() => {});
      }, 2500);
    }

    avisar();
    return modo;
  }

  /* ------------------------- login / cadastro ------------------------- */
  async function entrar(emailDigitado, senha) {
    await ready();
    const email = String(emailDigitado || '').trim().toLowerCase();
    const senhaTexto = String(senha || '');

    if (!email || !senhaTexto) {
      return { ok: false, erro: 'Preencha o e-mail e a senha.' };
    }

    if (modo === 'servidor') {
      const { ok, status, dados } = await chamarApi('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha: senhaTexto })
      });
      if (!ok) {
        return { ok: false, erro: dados.erro || 'Não foi possível entrar (erro ' + status + ').' };
      }
      guardarSessao(dados.usuario, dados.token, 'servidor');
      return { ok: true, usuario, modo };
    }

    // modo local
    const banco = BancoLocal.abrir();
    const encontrado = BancoLocal.achar(banco, email);
    const confere =
      encontrado && encontrado.senhaHash === ReloHash.hashPassword(encontrado.salt, senhaTexto);

    if (!confere) {
      BancoLocal.registrarLogin(banco, { email, sucesso: false, origem: 'local' });
      BancoLocal.salvar(banco);
      return { ok: false, erro: 'E-mail ou senha incorretos.' };
    }

    encontrado.ultimoLogin = new Date().toISOString();
    encontrado.totalLogins = (encontrado.totalLogins || 0) + 1;
    const novoToken = ReloHash.gerarToken();
    banco.sessoes.push({
      tokenHash: ReloHash.hashToken(novoToken),
      usuarioId: encontrado.id,
      criadoEm: new Date().toISOString(),
      expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    BancoLocal.registrarLogin(banco, {
      email: encontrado.email,
      nome: encontrado.nome,
      perfil: encontrado.perfil,
      sucesso: true,
      origem: 'local'
    });
    BancoLocal.salvar(banco);
    guardarSessao(BancoLocal.publico(encontrado), novoToken, 'local');
    return { ok: true, usuario, modo };
  }

  async function cadastrar(nomeDigitado, emailDigitado, senha) {
    await ready();
    const nome = String(nomeDigitado || '').trim();
    const email = String(emailDigitado || '').trim().toLowerCase();
    const senhaTexto = String(senha || '');

    if (nome.length < 2) return { ok: false, erro: 'Digite seu nome completo.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, erro: 'E-mail inválido.' };
    if (senhaTexto.length < 6) {
      return { ok: false, erro: 'A senha deve ter no mínimo 6 caracteres.' };
    }

    if (modo === 'servidor') {
      const { ok, status, dados } = await chamarApi('auth/registrar', {
        method: 'POST',
        body: JSON.stringify({ nome, email, senha: senhaTexto })
      });
      if (!ok) return { ok: false, erro: dados.erro || 'Não foi possível cadastrar (erro ' + status + ').' };
      guardarSessao(dados.usuario, dados.token, 'servidor');
      return { ok: true, usuario, modo };
    }

    const banco = BancoLocal.abrir();
    const existente = BancoLocal.achar(banco, email);
    if (existente) {
      return {
        ok: false,
        erro:
          existente.perfil === 'admin'
            ? 'Este e-mail já é uma conta de administrador. Use a aba Entrar.'
            : 'Este e-mail já tem cadastro. Use a aba Entrar.'
      };
    }

    const salt = ReloHash.saltParaEmail(email);
    const novo = {
      id: BancoLocal.novoId('cli', email),
      nome,
      email,
      aliases: [],
      perfil: 'cliente',
      origem: 'cadastro',
      salt,
      senhaHash: ReloHash.hashPassword(salt, senhaTexto),
      criadoEm: new Date().toISOString(),
      ultimoLogin: new Date().toISOString(),
      totalLogins: 1
    };
    banco.usuarios.push(novo);
    const novoToken = ReloHash.gerarToken();
    banco.sessoes.push({
      tokenHash: ReloHash.hashToken(novoToken),
      usuarioId: novo.id,
      criadoEm: new Date().toISOString(),
      expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    BancoLocal.registrarLogin(banco, {
      email,
      nome,
      perfil: 'cliente',
      sucesso: true,
      origem: 'cadastro'
    });
    BancoLocal.salvar(banco);
    guardarSessao(BancoLocal.publico(novo), novoToken, 'local');
    // sem servidor, o próprio navegador manda a cópia para o banco na nuvem
    enviarCadastroParaNuvem(novo);
    return { ok: true, usuario, modo };
  }

  async function sair() {
    await ready();
    if (modo === 'servidor' && token) {
      try {
        await chamarApi('auth/sair', { method: 'POST' });
      } catch (erro) {
        /* segue o jogo: a sessão local é limpa de qualquer forma */
      }
    } else if (token) {
      const banco = BancoLocal.abrir();
      const alvo = ReloHash.hashToken(token);
      banco.sessoes = banco.sessoes.filter((s) => s.tokenHash !== alvo);
      BancoLocal.salvar(banco);
    }
    limparSessao();
    return { ok: true };
  }

  /* ------------------------- área da equipe (painel) ------------------------- */
  function recusar(acao) {
    const perfil = usuario ? usuario.perfil : 'cliente';
    return {
      ok: false,
      erro: Permissoes.nivel(perfil) === 1
        ? 'Acesso restrito à equipe da barbearia.'
        : 'O perfil ' + Permissoes.rotulo(perfil) + ' não pode ' + Permissoes.descrever(acao) + '.'
    };
  }

  async function listarUsuarios() {
    await ready();
    if (!pode('clientes.ver')) return recusar('clientes.ver');

    if (modo === 'servidor') {
      const { ok, dados } = await chamarApi('admin/usuarios');
      if (!ok) return { ok: false, erro: dados.erro || 'Não foi possível carregar o banco.' };
      return { ok: true, usuarios: dados.usuarios, logins: dados.logins };
    }

    const banco = BancoLocal.abrir();
    const usuarios = banco.usuarios
      .slice()
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
      .map(BancoLocal.publico);
    return { ok: true, usuarios, logins: banco.logins.slice(0, 60) };
  }

  async function criarCliente(dados) {
    await ready();
    if (!pode('clientes.criar')) return recusar('clientes.criar');
    const nome = String((dados && dados.nome) || '').trim();
    const email = String((dados && dados.email) || '').trim().toLowerCase();
    const senha = String((dados && dados.senha) || '');
    // só quem gerencia a equipe escolhe o perfil; os outros cadastram cliente
    const podeEscolherPerfil = pode('equipe.gerenciar');
    const perfil = podeEscolherPerfil && dados && dados.perfil ? Permissoes.normalizar(dados.perfil) : 'cliente';
    if (dados && dados.perfil !== undefined && !podeEscolherPerfil) {
      return { ok: false, erro: 'Cadastrar supervisor ou administrador é só para o administrador.' };
    }
    if (nome.length < 2) return { ok: false, erro: 'Digite o nome do cliente.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, erro: 'E-mail inválido.' };
    if (senha.length < 6) return { ok: false, erro: 'A senha deve ter no mínimo 6 caracteres.' };

    if (modo === 'servidor') {
      const { ok, dados: resposta } = await chamarApi('admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nome, email, senha, perfil })
      });
      if (!ok) return { ok: false, erro: resposta.erro || 'Não foi possível cadastrar.' };
      return { ok: true, usuario: resposta.usuario };
    }

    const banco = BancoLocal.abrir();
    if (BancoLocal.achar(banco, email)) return { ok: false, erro: 'Este e-mail já está cadastrado.' };
    const salt = ReloHash.saltParaEmail(email);
    const novo = {
      id: BancoLocal.novoId(perfil === 'cliente' ? 'cli' : perfil === 'admin' ? 'adm' : 'sup', email),
      nome,
      email,
      aliases: [],
      perfil,
      origem: 'painel',
      salt,
      senhaHash: ReloHash.hashPassword(salt, senha),
      criadoEm: new Date().toISOString(),
      ultimoLogin: null,
      totalLogins: 0
    };
    banco.usuarios.push(novo);
    BancoLocal.salvar(banco);
    if (perfil === 'cliente') enviarCadastroParaNuvem(novo);
    return { ok: true, usuario: BancoLocal.publico(novo) };
  }

  async function removerUsuario(id) {
    await ready();
    if (!pode('clientes.excluir')) return recusar('clientes.excluir');

    if (modo === 'servidor') {
      const { ok, dados } = await chamarApi('admin/usuarios/' + encodeURIComponent(id), {
        method: 'DELETE'
      });
      if (!ok) return { ok: false, erro: dados.erro || 'Não foi possível excluir.' };
      return { ok: true };
    }

    const banco = BancoLocal.abrir();
    const alvo = banco.usuarios.find((u) => u.id === id);
    if (!alvo) return { ok: false, erro: 'Usuário não encontrado.' };
    if (alvo.origem === 'semente') {
      return { ok: false, erro: 'Contas da equipe (semente) não podem ser excluídas.' };
    }
    banco.usuarios = banco.usuarios.filter((u) => u.id !== id);
    banco.sessoes = banco.sessoes.filter((s) => s.usuarioId !== id);
    BancoLocal.salvar(banco);
    return { ok: true };
  }

  /* ------------------------- perfis e permissões ------------------------- */
  function ehAdmin(u) {
    return !!u && Permissoes.normalizar(u.perfil) === 'admin';
  }

  function ehSupervisor(u) {
    return !!u && Permissoes.normalizar(u.perfil) === 'supervisor';
  }

  function ehEquipe(u) {
    return !!u && Permissoes.podePainel(u.perfil);
  }

  function pode(acao, u) {
    const alvo = u || usuario;
    if (!alvo) return false;
    return Permissoes.pode(alvo.perfil, acao);
  }

  function rotuloPerfil(u) {
    const alvo = u || usuario;
    return alvo ? Permissoes.rotulo(alvo.perfil) : '';
  }

  /* Troca o perfil de alguém (só admin). É por aqui que um cliente ou um
     barbeiro da equipe vira supervisor. */
  async function definirPerfil(id, perfil) {
    await ready();
    if (!pode('equipe.gerenciar')) return recusar('equipe.gerenciar');
    const novo = Permissoes.normalizar(perfil);
    if (!Permissoes.existe(perfil)) {
      return { ok: false, erro: 'Perfil inválido. Use cliente, supervisor ou admin.' };
    }
    if (usuario && usuario.id === id) {
      return { ok: false, erro: 'Você não pode mudar o seu próprio perfil.' };
    }

    if (modo === 'servidor') {
      const { ok, dados } = await chamarApi('admin/usuarios/' + encodeURIComponent(id) + '/perfil', {
        method: 'POST',
        body: JSON.stringify({ perfil: novo })
      });
      if (!ok) return { ok: false, erro: dados.erro || 'Não foi possível mudar o perfil.' };
      return { ok: true, usuario: dados.usuario };
    }

    const banco = BancoLocal.abrir();
    const alvo = banco.usuarios.find((u) => u.id === id);
    if (!alvo) return { ok: false, erro: 'Usuário não encontrado.' };
    const atual = Permissoes.normalizar(alvo.perfil);
    if (atual === novo) return { ok: false, erro: 'Esta conta já é ' + Permissoes.rotulo(novo) + '.' };
    if (alvo.origem === 'semente' && Permissoes.nivel(novo) < Permissoes.nivel(atual)) {
      return { ok: false, erro: 'Contas da equipe (semente) não podem ser rebaixadas.' };
    }
    alvo.perfil = novo;
    alvo.perfilAlteradoEm = new Date().toISOString();
    alvo.perfilAlteradoPor = (usuario && usuario.email) || null;
    banco.sessoes = banco.sessoes.filter((s) => s.usuarioId !== id);
    BancoLocal.salvar(banco);
    return { ok: true, usuario: BancoLocal.publico(alvo) };
  }

  function aoMudar(cb) {
    ouvintes.add(cb);
    if (modo) cb(usuario, modo);
    return () => ouvintes.delete(cb);
  }

  function jaMostrouLoginNestaAba() {
    try {
      return global.sessionStorage.getItem(CHAVES.visitou) === '1';
    } catch (erro) {
      return false;
    }
  }

  function marcarLoginMostrado() {
    try {
      global.sessionStorage.setItem(CHAVES.visitou, '1');
    } catch (erro) {
      /* ignora */
    }
  }

  global.ReloAuth = {
    ready,
    entrar,
    cadastrar,
    sair,
    listarUsuarios,
    criarCliente,
    removerUsuario,
    definirPerfil,
    ehAdmin,
    ehSupervisor,
    ehEquipe,
    pode,
    rotuloPerfil,
    PERFIS: Permissoes.perfis(),
    aoMudar,
    estadoSincronizacao,
    reenviarFilaNuvem,
    jaMostrouLoginNestaAba,
    marcarLoginMostrado,
    get usuario() {
      return usuario;
    },
    get modo() {
      return modo;
    },
    get token() {
      return token;
    },
    CHAVES
  };
})(typeof window !== 'undefined' ? window : this);
