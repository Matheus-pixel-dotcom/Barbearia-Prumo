/*
 * Style Relo Barber — servidor do site + API do banco de clientes.
 *
 * Como rodar:
 *   npm run serve           (ou: node server.js)
 *   depois abra http://localhost:8000
 *
 * O que ele faz:
 *   1. Entrega as páginas do site (HTML/CSS/imagens).
 *   2. Guarda o cadastro dos clientes no banco de dados JSON (data/db.json).
 *   3. Libera a aba ADMIN só para os e-mails de administrador (admin-accounts.js).
 *
 * Sem nenhuma dependência externa: usa apenas os módulos nativos do Node.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ReloHash = require('./auth-hash');
const db = require('./db');

const RAIZ = __dirname;
const PORTA = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_LOGIN_ATTEMPTS = 12; // por e-mail, em 10 minutos (proteção simples)

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const tentativas = new Map(); // email -> { total, desde }

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
function json(res, status, corpo, extras) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // Permite que o site publicado em outro endereço (ex.: GitHub Pages) use esta API
    'Access-Control-Allow-Origin': '*'
  }, extras || {}));
  res.end(texto);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (parte) => {
      dados += parte;
      if (dados.length > 1e6) reject(new Error('Corpo muito grande'));
    });
    req.on('end', () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch (erro) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function tokenDaRequisicao(req) {
  const cabecalho = req.headers.authorization || '';
  if (cabecalho.startsWith('Bearer ')) return cabecalho.slice(7).trim();
  return '';
}

function autenticar(req, banco) {
  const token = tokenDaRequisicao(req);
  const sessao = db.acharSessao(banco, token);
  if (!sessao) return null;
  const usuario = banco.usuarios.find((u) => u.id === sessao.usuarioId);
  return usuario ? { usuario, token } : null;
}

function exigeAdmin(req, banco, res) {
  const sessao = autenticar(req, banco);
  if (!sessao) {
    json(res, 401, { ok: false, erro: 'Faça login para continuar.' });
    return null;
  }
  if (sessao.usuario.perfil !== 'admin') {
    json(res, 403, { ok: false, erro: 'Esta área é exclusiva dos administradores.' });
    return null;
  }
  return sessao;
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function excedeuTentativas(email) {
  const registro = tentativas.get(email);
  if (!registro) return false;
  if (Date.now() - registro.desde > 10 * 60 * 1000) {
    tentativas.delete(email);
    return false;
  }
  return registro.total >= MAX_LOGIN_ATTEMPTS;
}

function contarTentativa(email, sucesso) {
  if (sucesso) {
    tentativas.delete(email);
    return;
  }
  const registro = tentativas.get(email) || { total: 0, desde: Date.now() };
  registro.total += 1;
  tentativas.set(email, registro);
}

/* ------------------------------------------------------------------ */
/* Rotas da API                                                        */
/* ------------------------------------------------------------------ */
async function tratarApi(req, res, url) {
  const banco = await db.carregar();
  const criados = db.semearAdmins(banco);
  if (criados > 0) await db.salvar(banco);

  const rota = url.pathname.replace(/\/+$/, '') || '/api';

  // GET /api/health — usado pelo navegador para saber se o banco do servidor está ativo
  if (rota === '/api' || rota === '/api/health') {
    await db.salvar(banco);
    return json(res, 200, {
      ok: true,
      servico: 'Style Relo Barber',
      modo: 'servidor',
      banco: path.relative(RAIZ, db.DB_FILE),
      armazenamento: db.descricaoArmazenamento(),
      usuarios: banco.usuarios.length,
      administradores: banco.usuarios.filter((u) => u.perfil === 'admin').length,
      hora: new Date().toISOString()
    });
  }

  // POST /api/auth/login
  if (rota === '/api/auth/login' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const email = db.normalizarEmail(corpo.email);
    const senha = String(corpo.senha || '');

    if (!validarEmail(email) || !senha) {
      return json(res, 400, { ok: false, erro: 'Informe e-mail e senha válidos.' });
    }
    if (excedeuTentativas(email)) {
      return json(res, 429, { ok: false, erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    }

    const usuario = db.acharUsuario(banco, email);
    const confere =
      usuario && usuario.senhaHash === ReloHash.hashPassword(usuario.salt, senha);

    if (!confere) {
      contarTentativa(email, false);
      db.registrarLogin(banco, { email, sucesso: false, origem: 'servidor' });
      await db.salvar(banco);
      return json(res, 401, { ok: false, erro: 'E-mail ou senha incorretos.' });
    }

    contarTentativa(email, true);
    usuario.ultimoLogin = new Date().toISOString();
    usuario.totalLogins = (usuario.totalLogins || 0) + 1;
    const token = db.criarSessao(banco, usuario);
    db.registrarLogin(banco, {
      email: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil,
      sucesso: true,
      origem: 'servidor'
    });
    await db.salvar(banco);
    return json(res, 200, { ok: true, token, usuario: db.usuarioPublico(usuario) });
  }

  // POST /api/auth/registrar — qualquer e-mail fora da lista de admins vira cliente
  if (rota === '/api/auth/registrar' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const nome = String(corpo.nome || '').trim();
    const email = db.normalizarEmail(corpo.email);
    const senha = String(corpo.senha || '');

    if (nome.length < 2) return json(res, 400, { ok: false, erro: 'Digite seu nome completo.' });
    if (!validarEmail(email)) return json(res, 400, { ok: false, erro: 'E-mail inválido.' });
    if (senha.length < 6) {
      return json(res, 400, { ok: false, erro: 'A senha deve ter no mínimo 6 caracteres.' });
    }
    const existente = db.acharUsuario(banco, email);
    if (existente) {
      return json(res, 409, {
        ok: false,
        erro:
          existente.perfil === 'admin'
            ? 'Este e-mail já é uma conta de administrador. Use a aba Entrar.'
            : 'Este e-mail já tem cadastro. Use a aba Entrar.'
      });
    }

    const salt = ReloHash.saltParaEmail(email);
    const usuario = {
      id: 'cli_' + ReloHash.sha256Hex(email).slice(0, 10),
      nome,
      email,
      aliases: [],
      perfil: 'cliente',
      origem: 'cadastro',
      salt,
      senhaHash: ReloHash.hashPassword(salt, senha),
      criadoEm: new Date().toISOString(),
      ultimoLogin: new Date().toISOString(),
      totalLogins: 1
    };
    banco.usuarios.push(usuario);
    const token = db.criarSessao(banco, usuario);
    db.registrarLogin(banco, {
      email,
      nome,
      perfil: 'cliente',
      sucesso: true,
      origem: 'cadastro'
    });
    await db.salvar(banco);
    return json(res, 201, { ok: true, token, usuario: db.usuarioPublico(usuario) });
  }

  // GET /api/auth/eu — confirma a sessão salva no navegador
  if (rota === '/api/auth/eu' && req.method === 'GET') {
    const sessao = autenticar(req, banco);
    if (!sessao) return json(res, 401, { ok: false, erro: 'Sessão expirada.' });
    return json(res, 200, { ok: true, usuario: db.usuarioPublico(sessao.usuario) });
  }

  // POST /api/auth/sair
  if (rota === '/api/auth/sair' && req.method === 'POST') {
    db.removerSessao(banco, tokenDaRequisicao(req));
    await db.salvar(banco);
    return json(res, 200, { ok: true });
  }

  // GET /api/admin/usuarios — banco de clientes e logins (só admin)
  if (rota === '/api/admin/usuarios' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const usuarios = banco.usuarios
      .slice()
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
      .map(db.usuarioPublico);
    return json(res, 200, {
      ok: true,
      usuarios,
      logins: (banco.logins || []).slice(0, 60),
      totalClientes: usuarios.filter((u) => u.perfil === 'cliente').length,
      totalAdmins: usuarios.filter((u) => u.perfil === 'admin').length
    });
  }

  // GET /api/admin/backup — baixa uma cópia do banco de dados (só admin)
  if ((rota === '/api/admin/backup' || rota === '/api/admin/exportar') && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const copia = db.paraBackup(banco);
    const nomeArquivo = 'banco-clientes-style-relo-' + new Date().toISOString().slice(0, 10) + '.json';
    return json(res, 200, copia, {
      'Content-Disposition': 'attachment; filename="' + nomeArquivo + '"',
      'Access-Control-Expose-Headers': 'Content-Disposition'
    });
  }

  // POST /api/admin/restaurar — restaura um backup baixado antes (só admin)
  if (rota === '/api/admin/restaurar' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    try {
      const resultado = db.aplicarBackup(banco, corpo);
      await db.salvar(banco);
      return json(res, 200, { ok: true, restaurado: resultado });
    } catch (erro) {
      return json(res, 400, { ok: false, erro: erro.message });
    }
  }

  // POST /api/admin/usuarios — admin cadastra um cliente manualmente
  if (rota === '/api/admin/usuarios' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const nome = String(corpo.nome || '').trim();
    const email = db.normalizarEmail(corpo.email);
    const senha = String(corpo.senha || '');
    if (nome.length < 2) return json(res, 400, { ok: false, erro: 'Digite o nome do cliente.' });
    if (!validarEmail(email)) return json(res, 400, { ok: false, erro: 'E-mail inválido.' });
    if (senha.length < 6) {
      return json(res, 400, { ok: false, erro: 'A senha deve ter no mínimo 6 caracteres.' });
    }
    if (db.acharUsuario(banco, email)) {
      return json(res, 409, { ok: false, erro: 'Este e-mail já está cadastrado.' });
    }
    const salt = ReloHash.saltParaEmail(email);
    const usuario = {
      id: 'cli_' + ReloHash.sha256Hex(email).slice(0, 10),
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
    banco.usuarios.push(usuario);
    await db.salvar(banco);
    return json(res, 201, { ok: true, usuario: db.usuarioPublico(usuario) });
  }

  // DELETE /api/admin/usuarios/:id — remove cliente (admins da semente são protegidos)
  const rotaExclusao = rota.match(/^\/api\/admin\/usuarios\/(.+)$/);
  if (rotaExclusao && req.method === 'DELETE') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const alvo = banco.usuarios.find((u) => u.id === decodeURIComponent(rotaExclusao[1]));
    if (!alvo) return json(res, 404, { ok: false, erro: 'Usuário não encontrado.' });
    if (alvo.origem === 'semente') {
      return json(res, 400, { ok: false, erro: 'Contas de administrador não podem ser excluídas.' });
    }
    banco.usuarios = banco.usuarios.filter((u) => u.id !== alvo.id);
    banco.sessoes = banco.sessoes.filter((s) => s.usuarioId !== alvo.id);
    await db.salvar(banco);
    return json(res, 200, { ok: true, removido: db.usuarioPublico(alvo) });
  }

  return json(res, 404, { ok: false, erro: 'Rota da API não encontrada.' });
}

/* ------------------------------------------------------------------ */
/* Arquivos do site                                                    */
/* ------------------------------------------------------------------ */
function servirArquivo(req, res, url) {
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/' || caminho === '') caminho = '/index.html';

  const alvo = path.join(RAIZ, caminho);
  const dentroDoProjeto = alvo.startsWith(RAIZ + path.sep) || alvo === RAIZ;

  // Nunca entregar o banco de dados cru nem arquivos internos
  const protegidos = [path.join(RAIZ, 'data'), path.join(RAIZ, '.git')];
  const ehProtegido = protegidos.some((p) => alvo === p || alvo.startsWith(p + path.sep));

  if (!dentroDoProjeto || ehProtegido) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — Arquivo não encontrado.');
  }

  fs.stat(alvo, (erro, info) => {
    if (erro || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — Arquivo não encontrado.');
    }
    const tipo = TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': tipo,
      'Content-Length': info.size,
      // HTML, CSS e JS nunca ficam em cache (o site muda com frequência);
      // imagens podem ficar guardadas por 1 hora.
      'Cache-Control': /^image\//.test(tipo) ? 'public, max-age=3600' : 'no-cache'
    });
    fs.createReadStream(alvo).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
      });
      return res.end();
    }
    return tratarApi(req, res, url).catch((erro) => {
      console.error('[api] Erro:', erro.message);
      json(res, 500, { ok: false, erro: 'Erro interno do servidor.' });
    });
  }

  return servirArquivo(req, res, url);
});

servidor.listen(PORTA, HOST, async () => {
  let banco;
  try {
    banco = await db.carregar();
    const criados = db.semearAdmins(banco);
    await db.salvar(banco);
    banco.criadosAgora = criados;
  } catch (erro) {
    console.error('[servidor] Falha ao abrir o banco de dados:', erro.message);
    banco = { usuarios: [], criadosAgora: 0 };
  }
  console.log('======================================================');
  console.log('  Style Relo Barber — servidor no ar');
  console.log(`  Site:    http://localhost:${PORTA}/index.html`);
  console.log(`  Admin:   http://localhost:${PORTA}/admin.html`);
  console.log(`  API:     http://localhost:${PORTA}/api/health`);
  console.log(`  Banco:   ${db.descricaoArmazenamento()}`);
  console.log(`  Usuários cadastrados: ${banco.usuarios.length}`);
  if (banco.criadosAgora > 0) {
    console.log(`  ${banco.criadosAgora} conta(s) de administrador criada(s) agora.`);
  }
  console.log('======================================================');
});
