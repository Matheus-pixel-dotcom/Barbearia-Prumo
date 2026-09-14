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
 *   - Os e-mails de admin (admin-accounts.js) já vêm cadastrados no banco.
 *   - Qualquer outro e-mail é tratado como CLIENTE e precisa se cadastrar.
 *   - Senha nunca é guardada em texto puro: só o hash SHA-256.
 */
(function (global) {
  'use strict';

  const ReloHash = global.ReloHash;
  const SEMENTE = global.ReloAdminAccounts || { contas: [] };

  const CHAVES = {
    usuarios: 'relo_db_usuarios_v2',
    sessoes: 'relo_db_sessoes_v2',
    logins: 'relo_db_logins_v2',
    sessao: 'relo_sessao_v2',
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
        banco.usuarios.push({
          id: 'adm_' + conta.email.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10),
          nome: conta.nome,
          email: conta.email.toLowerCase(),
          aliases: (conta.aliases || []).map((a) => a.toLowerCase()),
          perfil: 'admin',
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
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        aliases: u.aliases || [],
        perfil: u.perfil === 'admin' ? 'admin' : 'cliente',
        origem: u.origem || 'cadastro',
        criadoEm: u.criadoEm || null,
        ultimoLogin: u.ultimoLogin || null,
        totalLogins: u.totalLogins || 0
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

  /* ------------------------- comunicação com a API ------------------------- */
  // Endereço do servidor do banco de dados.
  // Vazio = mesmo endereço do site. Preenchido em config.js quando o site é
  // hospedado separado do servidor (ex.: GitHub Pages + Render).
  function baseApi() {
    const base = (global.RELO_API_BASE || '').replace(/\/+$/, '');
    return base ? base + '/' : '';
  }

  async function chamarApi(caminho, opcoes) {
    const config = Object.assign({ headers: {} }, opcoes || {});
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});
    if (token) config.headers.Authorization = 'Bearer ' + token;
    const resposta = await fetch(baseApi() + 'api/' + caminho.replace(/^\/+/, ''), config);
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
      const resposta = await fetch(baseApi() + 'api/health', { cache: 'no-store' });
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

  /* ------------------------- área do administrador ------------------------- */
  async function listarUsuarios() {
    await ready();
    if (!ehAdmin(usuario)) return { ok: false, erro: 'Acesso restrito aos administradores.' };

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
    if (!ehAdmin(usuario)) return { ok: false, erro: 'Acesso restrito aos administradores.' };
    const nome = String((dados && dados.nome) || '').trim();
    const email = String((dados && dados.email) || '').trim().toLowerCase();
    const senha = String((dados && dados.senha) || '');
    if (nome.length < 2) return { ok: false, erro: 'Digite o nome do cliente.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, erro: 'E-mail inválido.' };
    if (senha.length < 6) return { ok: false, erro: 'A senha deve ter no mínimo 6 caracteres.' };

    if (modo === 'servidor') {
      const { ok, dados: resposta } = await chamarApi('admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nome, email, senha })
      });
      if (!ok) return { ok: false, erro: resposta.erro || 'Não foi possível cadastrar.' };
      return { ok: true, usuario: resposta.usuario };
    }

    const banco = BancoLocal.abrir();
    if (BancoLocal.achar(banco, email)) return { ok: false, erro: 'Este e-mail já está cadastrado.' };
    const salt = ReloHash.saltParaEmail(email);
    const novo = {
      id: BancoLocal.novoId('cli', email),
      nome,
      email,
      aliases: [],
      perfil: 'cliente',
      origem: 'admin',
      salt,
      senhaHash: ReloHash.hashPassword(salt, senha),
      criadoEm: new Date().toISOString(),
      ultimoLogin: null,
      totalLogins: 0
    };
    banco.usuarios.push(novo);
    BancoLocal.salvar(banco);
    return { ok: true, usuario: BancoLocal.publico(novo) };
  }

  async function removerUsuario(id) {
    await ready();
    if (!ehAdmin(usuario)) return { ok: false, erro: 'Acesso restrito aos administradores.' };

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
      return { ok: false, erro: 'Contas de administrador não podem ser excluídas.' };
    }
    banco.usuarios = banco.usuarios.filter((u) => u.id !== id);
    banco.sessoes = banco.sessoes.filter((s) => s.usuarioId !== id);
    BancoLocal.salvar(banco);
    return { ok: true };
  }

  async function baixarBackup() {
    await ready();
    if (!ehAdmin(usuario)) return { ok: false, erro: 'Acesso restrito aos administradores.' };
    try {
      const resposta = await fetch(baseApi() + 'api/admin/backup', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!resposta.ok) return { ok: false, erro: 'Não foi possível gerar o backup.' };
      const blob = await resposta.blob();
      const nome = 'banco-clientes-style-relo-' + new Date().toISOString().slice(0, 10) + '.json';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { ok: true, nome };
    } catch (erro) {
      return { ok: false, erro: 'Falha ao baixar o backup: ' + erro.message };
    }
  }

  async function restaurarBackup(conteudo) {
    await ready();
    if (!ehAdmin(usuario)) return { ok: false, erro: 'Acesso restrito aos administradores.' };
    const { ok, dados } = await chamarApi('admin/restaurar', {
      method: 'POST',
      body: JSON.stringify(conteudo)
    });
    if (!ok) return { ok: false, erro: dados.erro || 'Não foi possível restaurar o backup.' };
    return { ok: true, restaurado: dados.restaurado };
  }

  function ehAdmin(u) {
    return !!u && u.perfil === 'admin';
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
    baixarBackup,
    restaurarBackup,
    removerUsuario,
    ehAdmin,
    aoMudar,
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
    CHAVES,
    get enderecoDaApi() {
      return baseApi() || 'mesmo endereço do site';
    }
  };
})(typeof window !== 'undefined' ? window : this);
