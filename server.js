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
const nanoBanana = require('./nano-banana');
const ReloSync = require('./sync-supabase');

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
function json(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(texto);
}

// As rotas de IA recebem fotos em base64, então precisam de um limite maior.
const LIMITE_CORPO_PADRAO = 1e6; // ~1 MB (login, cadastro, admin)
const LIMITE_CORPO_IA = 16e6; // ~16 MB (imagem codificada)

function lerCorpo(req, limite = LIMITE_CORPO_PADRAO) {
  return new Promise((resolve, reject) => {
    let dados = '';
    let estourou = false;
    req.on('data', (parte) => {
      dados += parte;
      if (dados.length > limite) {
        // Para de acumular e avisa uma única vez (evita estourar a memória).
        if (!estourou) {
          estourou = true;
          reject(new Error('Corpo muito grande'));
        }
        dados = '';
      }
    });
    req.on('end', () => {
      if (estourou) return;
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
/* Proteção de cota da IA (Nano Banana)                                */
/*                                                                     */
/* A API do Google é paga por imagem gerada. Este limite simples evita  */
/* que alguém (ou um loop no navegador) queime o crédito da chave.      */
/* O limite pode ser ajustado ao vivo pelo painel admin.                */
/* ------------------------------------------------------------------ */
const IA_JANELA_MS = 60 * 60 * 1000;
const IA_CONFIG_FILE = path.join(RAIZ, 'data', 'ia-config.json');
const usoIA = new Map(); // ip -> [timestamps]

// Configuração da IA salva pelo painel admin (fica em data/, fora do git).
function lerConfigIa() {
  try {
    return JSON.parse(fs.readFileSync(IA_CONFIG_FILE, 'utf8'));
  } catch (erro) {
    return {};
  }
}
function salvarConfigIa(cfg) {
  try {
    fs.mkdirSync(path.dirname(IA_CONFIG_FILE), { recursive: true });
    fs.writeFileSync(IA_CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (erro) {
    console.warn('[ia] Não consegui salvar a config da IA:', erro.message);
  }
}

// Se a chave/limite foi salva pelo painel (e não existe .env real), aplica.
(function aplicarConfigIa() {
  const cfg = lerConfigIa();
  if (!process.env.GEMINI_API_KEY && cfg.chave) process.env.GEMINI_API_KEY = cfg.chave;
  if (!process.env.IA_LIMITE_POR_HORA && cfg.limitePorHora) {
    process.env.IA_LIMITE_POR_HORA = String(cfg.limitePorHora);
  }
})();

function limiteIaPorHora() {
  const n = Number(process.env.IA_LIMITE_POR_HORA || lerConfigIa().limitePorHora || 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// Nunca devolve a chave inteira para o navegador.
function mascaraChave(chave) {
  if (!chave) return null;
  if (chave.length <= 10) return chave.slice(0, 2) + '••••';
  return chave.slice(0, 6) + '••••••••' + chave.slice(-4);
}

// Total de chamadas de IA na última hora (para o painel admin).
function usoIaUltimaHora() {
  const agora = Date.now();
  let total = 0;
  usoIA.forEach((marcas) => {
    total += marcas.filter((m) => agora - m < IA_JANELA_MS).length;
  });
  return total;
}

function ipDaRequisicao(req) {
  const encaminhado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return encaminhado || req.socket?.remoteAddress || 'desconhecido';
}

function conferirCotaIA(req, res, custo = 1) {
  const agora = Date.now();
  const limite = limiteIaPorHora();
  const ip = ipDaRequisicao(req);
  const historico = (usoIA.get(ip) || []).filter((marca) => agora - marca < IA_JANELA_MS);

  if (historico.length + custo > limite) {
    usoIA.set(ip, historico);
    json(res, 429, {
      ok: false,
      erro: `Limite de ${limite} gerações por hora atingido. Aguarde um pouco e tente de novo.`
    });
    return false;
  }

  historico.push(agora);
  usoIA.set(ip, historico);
  return true;
}

function exigirIaAtiva(req, res) {
  if (!nanoBanana.ativo()) {
    json(res, 503, {
      ok: false,
      ativo: false,
      erro:
        'IA ainda não configurada neste servidor. Crie uma chave em https://aistudio.google.com/apikey e coloque GEMINI_API_KEY no arquivo .env (instruções em NANO_BANANA.md).'
    });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Espelho do cadastro no Supabase ("nosso banco de dados" na nuvem)   */
/*                                                                     */
/* O cadastro SEMPRE entra no banco do site (data/db.json) primeiro —   */
/* assim o painel admin mostra o cliente na hora. Depois, em segundo    */
/* plano, uma cópia sobe para o Supabase. Se a internet/café estiver    */
/* fora do ar, o cadastro vai para uma fila e o servidor tenta de novo  */
/* sozinho; nada de perder cliente.                                      */
/* ------------------------------------------------------------------ */
const SUPABASE_CONFIG_FILE = path.join(RAIZ, 'data', 'supabase-config.json');

function lerConfigSupabase() {
  try {
    return JSON.parse(fs.readFileSync(SUPABASE_CONFIG_FILE, 'utf8'));
  } catch (erro) {
    return {};
  }
}

function salvarConfigSupabase(cfg) {
  try {
    fs.mkdirSync(path.dirname(SUPABASE_CONFIG_FILE), { recursive: true });
    fs.writeFileSync(SUPABASE_CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  } catch (erro) {
    console.warn('[sync] Não consegui salvar a config do Supabase:', erro.message);
  }
}

// Prioridade: variáveis de ambiente (.env) > arquivo salvo pelo painel > padrões do projeto.
function configSupabase() {
  const arquivo = lerConfigSupabase();
  const url = process.env.SUPABASE_URL || arquivo.url || ReloSync.PADROES.url;
  const chave = process.env.SUPABASE_ANON_KEY || arquivo.chave || ReloSync.PADROES.chave;
  const tabela = process.env.SUPABASE_TABELA || arquivo.tabela || ReloSync.PADROES.tabela;
  const liga = process.env.SUPABASE_ATIVO
    ? process.env.SUPABASE_ATIVO !== '0' && process.env.SUPABASE_ATIVO.toLowerCase() !== 'false'
    : arquivo.ativo !== false;
  return {
    ativo: Boolean(liga && url && chave),
    url: String(url || '').trim().replace(/\/+$/, ''),
    chave: String(chave || '').trim(),
    tabela: String(tabela || 'clientes').replace(/[^a-zA-Z0-9_]/g, '') || 'clientes',
    origem: process.env.SUPABASE_URL ? '.env' : arquivo.url || arquivo.chave ? 'painel admin' : 'padrão do projeto'
  };
}

function statusSupabasePublico(cfg) {
  const banco = db.carregar();
  const resumo = db.resumoSync(banco);
  return {
    ok: true,
    ativo: cfg.ativo,
    urlMascara: cfg.url ? cfg.url.replace(/^https?:\/\//, '') : null,
    tabela: cfg.tabela,
    chaveMascara: ReloSync.mascaraChave(cfg.chave),
    origem: cfg.origem,
    bancoLocal: {
      arquivo: path.relative(RAIZ, db.DB_FILE),
      usuarios: banco.usuarios.length,
      clientes: banco.usuarios.filter((u) => u.perfil !== 'admin').length
    },
    ...resumo
  };
}

let espelhando = false;

// A linha no Supabase não pode virar um retrato velho do cliente: se nunca subiu
// ou se já passou de um dia, o login reenvia (ultimoLogin e totalLogins atualizam).
const REESPELHO_DEPOIS_MS = 24 * 60 * 60 * 1000;

function precisaEspelhar(usuario) {
  const sync = usuario && usuario.sync;
  if (!sync || sync.estado !== 'ok') return true;
  const em = sync.em ? new Date(sync.em).getTime() : 0;
  return !em || Date.now() - em > REESPELHO_DEPOIS_MS;
}

// Disparado depois que a resposta do cadastro já saiu: nunca atrasa o cliente.
function espelharCliente(usuario) {
  const cfg = configSupabase();
  if (!cfg.ativo) {
    return db.transacionar((banco) => {
      db.marcarSync(banco, usuario.email, 'pendente', {
        erro: 'espelhamento desligado (ative no painel ou no .env)'
      });
    });
  }
  return ReloSync.enviar(db.usuarioPublico(usuario), cfg)
    .then((resultado) =>
      db.transacionar((banco) =>
        db.registrarEnvioSync(banco, Object.assign({}, resultado, { tabela: cfg.tabela }), usuario.email)
      )
    )
    .catch((erro) => console.warn('[sync] erro ao espelhar cadastro:', erro.message));
}

// Retenta a fila de cadastros que não subiram (rede fora, tabela sem policy...).
async function processarFilaSync(motivo, forcar) {
  if (espelhando) return { processados: 0, ignorado: true };
  espelhando = true;
  try {
    const banco = db.carregar();
    const pendentes = db.pendentesSync(banco, forcar ? 20 : 4, forcar);
    if (!pendentes.length) return { processados: 0, motivo: motivo || null };
    const cfg = configSupabase();
    const resultados = [];
    for (const item of pendentes) {
      const usuario = db.acharUsuario(banco, item.email);
      if (!usuario) {
        resultados.push({ email: item.email, ok: true }); // saiu do banco: tira da fila
        continue;
      }
      if (!cfg.ativo) {
        resultados.push({ email: item.email, ok: false, erro: 'espelhamento desligado' });
        continue;
      }
      const envio = await ReloSync.enviar(db.usuarioPublico(usuario), cfg);
      resultados.push(
        Object.assign({ email: item.email }, envio, {
          ok: envio.ok,
          erro: envio.ok ? null : envio.erro,
          tabela: cfg.tabela
        })
      );
    }
    await db.transacionar((atual) => {
      resultados.forEach((r) => db.atualizarFilaSync(atual, r.email, r));
    });
    return { processados: resultados.length, motivo: motivo || null };
  } catch (erro) {
    console.warn('[sync] falha no reenvio automático:', erro.message);
    return { processados: 0, erro: erro.message };
  } finally {
    espelhando = false;
  }
}

const FILA_SYNC_INTERVALO_MS = 3 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Rotas da API                                                        */
/* ------------------------------------------------------------------ */
async function tratarApi(req, res, url) {
  const banco = db.carregar();
  const criados = db.semearAdmins(banco);
  if (criados > 0) db.salvar(banco);

  const rota = url.pathname.replace(/\/+$/, '') || '/api';

  // GET /api/health — usado pelo navegador para saber se o banco do servidor está ativo
  if (rota === '/api' || rota === '/api/health') {
    db.salvar(banco);
    const cfg = configSupabase();
    return json(res, 200, {
      ok: true,
      servico: 'Style Relo Barber',
      modo: 'servidor',
      banco: path.relative(RAIZ, db.DB_FILE),
      usuarios: banco.usuarios.length,
      administradores: banco.usuarios.filter((u) => u.perfil === 'admin').length,
      espelho: { ativo: cfg.ativo, tabela: cfg.tabela, pendentes: db.resumoSync(banco).pendentes },
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
      db.salvar(banco);
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
    db.salvar(banco);
    if (usuario.perfil !== 'admin' && configSupabase().ativo && precisaEspelhar(usuario)) {
      espelharCliente(usuario); // mantém a nuvem com o último acesso em dia
    }
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
    db.salvar(banco);
    // Em seguida (sem atrasar o cliente) o cadastro sobe para o Supabase.
    espelharCliente(usuario);
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
    db.salvar(banco);
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
    db.salvar(banco);
    espelharCliente(usuario);
    return json(res, 201, { ok: true, usuario: db.usuarioPublico(usuario) });
  }

  // GET /api/admin/usuarios/:id — ficha do cliente (dados + acessos dele)
  const rotaFicha = rota.match(/^\/api\/admin\/usuarios\/([^/]+)$/);
  if (rotaFicha && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const alvo = banco.usuarios.find((u) => u.id === decodeURIComponent(rotaFicha[1]));
    if (!alvo) return json(res, 404, { ok: false, erro: 'Usuário não encontrado.' });
    const acessos = (banco.logins || []).filter((l) => db.normalizarEmail(l.email) === db.normalizarEmail(alvo.email));
    return json(res, 200, {
      ok: true,
      usuario: db.usuarioPublico(alvo),
      acessos: acessos.slice(0, 40),
      totalAcessos: acessos.length,
      falhas: acessos.filter((l) => l.sucesso === false).length
    });
  }

  // DELETE /api/admin/usuarios/:id — remove cliente (admins da semente são protegidos)
  if (rotaFicha && req.method === 'DELETE') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const alvo = banco.usuarios.find((u) => u.id === decodeURIComponent(rotaFicha[1]));
    if (!alvo) return json(res, 404, { ok: false, erro: 'Usuário não encontrado.' });
    if (alvo.origem === 'semente') {
      return json(res, 400, { ok: false, erro: 'Contas de administrador não podem ser excluídas.' });
    }
    banco.usuarios = banco.usuarios.filter((u) => u.id !== alvo.id);
    banco.sessoes = banco.sessoes.filter((s) => s.usuarioId !== alvo.id);
    if (banco.sync && banco.sync.fila) {
      banco.sync.fila = banco.sync.fila.filter((i) => db.normalizarEmail(i.email) !== alvo.email);
    }
    db.salvar(banco);
    return json(res, 200, { ok: true, removido: db.usuarioPublico(alvo) });
  }

  // GET /api/admin/metricas — KPIs e séries do painel (tudo calculado no servidor)
  if (rota === '/api/admin/metricas' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const cfg = configSupabase();
    const metricas = db.calcularMetricas(banco);
    metricas.modo = 'servidor';
    metricas.espelho = { ativo: cfg.ativo, urlMascara: cfg.url.replace(/^https?:\/\//, ''), tabela: cfg.tabela };
    return json(res, 200, metricas);
  }

  /* ---------------------------------------------------------------- */
  /* Banco compartilhado do painel: estoque, manutenção e despesas.   */
  /* Antes ficavam no localStorage do navegador do admin (cada        */
  /* computador via uma coisa diferente); agora vivem em data/db.json. */
  /* ---------------------------------------------------------------- */

  // GET /api/admin/estoque
  if (rota === '/api/admin/estoque' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const produtos = (banco.produtos || []).map(db.produtoPublico);
    return json(res, 200, {
      ok: true,
      produtos,
      totalUnidades: produtos.reduce((soma, p) => soma + p.quantidade, 0),
      valorTotal: produtos.reduce((soma, p) => soma + p.quantidade * p.preco, 0)
    });
  }

  // POST /api/admin/estoque — cria (sem id) ou atualiza (com id) um produto
  if (rota === '/api/admin/estoque' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const nome = String(corpo.nome || '').trim();
    if (nome.length < 2) return json(res, 400, { ok: false, erro: 'Informe o nome do produto.' });
    const quantidade = Number(corpo.quantidade);
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      return json(res, 400, { ok: false, erro: 'Quantidade inválida.' });
    }
    return db
      .transacionar((atual) => {
        const preco = Math.max(0, Number(corpo.preco || 0));
        const minimo = Math.max(0, Math.round(Number(corpo.minimo || 0)));
        const categoria = String(corpo.categoria || '').trim().slice(0, 60);
        let produto = corpo.id
          ? (atual.produtos || []).find((p) => p.id === String(corpo.id))
          : null;
        if (produto) {
          produto.nome = nome;
          produto.categoria = categoria;
          produto.preco = preco;
          produto.minimo = minimo;
          produto.quantidade = Math.round(quantidade);
          produto.atualizadoEm = new Date().toISOString();
        } else {
          produto = {
            id: db.novoId('prod'),
            nome,
            categoria,
            preco,
            minimo,
            quantidade: Math.round(quantidade),
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            movimentos: []
          };
          atual.produtos = (atual.produtos || []).concat([produto]);
        }
        return db.produtoPublico(produto);
      })
      .then((produto) => json(res, 201, { ok: true, produto }));
  }

  // POST /api/admin/estoque/mov — entrada (+) ou saída (-) de itens
  if (rota === '/api/admin/estoque/mov' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const delta = Number(corpo.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return json(res, 400, { ok: false, erro: 'Informe quanto entrar ou sair (ex.: 1 ou -2).' });
    }
    return db
      .transacionar((atual) => {
        const produto = (atual.produtos || []).find((p) => p.id === String(corpo.id));
        if (!produto) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 });
        db.ajustarProduto(atual, produto, delta, corpo.observacao);
        return db.produtoPublico(produto);
      })
      .then((produto) => json(res, 200, { ok: true, produto }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  // DELETE /api/admin/estoque/:id
  const rotaProduto = rota.match(/^\/api\/admin\/estoque\/([^/]+)$/);
  if (rotaProduto && req.method === 'DELETE') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    return db
      .transacionar((atual) => {
        const antes = (atual.produtos || []).length;
        atual.produtos = (atual.produtos || []).filter((p) => p.id !== decodeURIComponent(rotaProduto[1]));
        if (atual.produtos.length === antes) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 });
        return { removidos: antes - atual.produtos.length };
      })
      .then(() => json(res, 200, { ok: true }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  // GET /api/admin/manutencao
  if (rota === '/api/admin/manutencao' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    return json(res, 200, { ok: true, manutencoes: (banco.manutencoes || []).slice().reverse() });
  }

  // POST /api/admin/manutencao — registra ou muda o status
  if (rota === '/api/admin/manutencao' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    return db
      .transacionar((atual) => {
        const existentes = atual.manutencoes || [];
        if (corpo.id) {
          const alvo = existentes.find((m) => m.id === String(corpo.id));
          if (!alvo) throw Object.assign(new Error('Ordem não encontrada.'), { status: 404 });
          if (corpo.status) alvo.status = String(corpo.status).slice(0, 24);
          if (corpo.descricao !== undefined) alvo.descricao = String(corpo.descricao).slice(0, 300);
          alvo.atualizadoEm = new Date().toISOString();
          return alvo;
        }
        const item = String(corpo.item || '').trim();
        if (item.length < 2) throw Object.assign(new Error('Informe o equipamento.'), { status: 400 });
        const nova = {
          id: db.novoId('man'),
          item: item.slice(0, 120),
          descricao: String(corpo.descricao || '').trim().slice(0, 300),
          status: ['Pendente', 'Em Andamento', 'Concluído'].includes(corpo.status) ? corpo.status : 'Pendente',
          responsavel: String(corpo.responsavel || '').trim().slice(0, 80),
          valor: Number.isFinite(Number(corpo.valor)) ? Math.max(0, Number(corpo.valor)) : null,
          criadoEm: new Date().toISOString()
        };
        atual.manutencoes = existentes.concat([nova]);
        return nova;
      })
      .then((manutencao) => json(res, 201, { ok: true, manutencao }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  // DELETE /api/admin/manutencao/:id
  const rotaManutencao = rota.match(/^\/api\/admin\/manutencao\/([^/]+)$/);
  if (rotaManutencao && req.method === 'DELETE') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    return db
      .transacionar((atual) => {
        const antes = (atual.manutencoes || []).length;
        atual.manutencoes = (atual.manutencoes || []).filter((m) => m.id !== decodeURIComponent(rotaManutencao[1]));
        if (atual.manutencoes.length === antes) throw Object.assign(new Error('Ordem não encontrada.'), { status: 404 });
        return true;
      })
      .then(() => json(res, 200, { ok: true }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  // GET /api/admin/despesas
  if (rota === '/api/admin/despesas' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const despesas = (banco.despesas || []).slice().reverse();
    const mesAtual = new Date().toISOString().slice(0, 7);
    return json(res, 200, {
      ok: true,
      despesas,
      totalMes: despesas
        .filter((d) => String(d.criadoEm || d.data || '').slice(0, 7) === mesAtual)
        .reduce((soma, d) => soma + Number(d.valor || 0), 0),
      totalGeral: despesas.reduce((soma, d) => soma + Number(d.valor || 0), 0)
    });
  }

  // POST /api/admin/despesas
  if (rota === '/api/admin/despesas' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const descricao = String(corpo.descricao || '').trim();
    const valor = Number(corpo.valor);
    if (descricao.length < 2) return json(res, 400, { ok: false, erro: 'Descreva a despesa.' });
    if (!Number.isFinite(valor) || valor < 0) return json(res, 400, { ok: false, erro: 'Valor inválido.' });
    return db
      .transacionar((atual) => {
        const nova = {
          id: db.novoId('desp'),
          descricao: descricao.slice(0, 160),
          categoria: String(corpo.categoria || 'Operacional').trim().slice(0, 60) || 'Operacional',
          valor: Math.round(valor * 100) / 100,
          pago: Boolean(corpo.pago),
          criadoEm: new Date().toISOString()
        };
        atual.despesas = (atual.despesas || []).concat([nova]);
        return nova;
      })
      .then((despesa) => json(res, 201, { ok: true, despesa }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  // DELETE /api/admin/despesas/:id
  const rotaDespesa = rota.match(/^\/api\/admin\/despesas\/([^/]+)$/);
  if (rotaDespesa && req.method === 'DELETE') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    return db
      .transacionar((atual) => {
        const antes = (atual.despesas || []).length;
        atual.despesas = (atual.despesas || []).filter((d) => d.id !== decodeURIComponent(rotaDespesa[1]));
        if (atual.despesas.length === antes) throw Object.assign(new Error('Despesa não encontrada.'), { status: 404 });
        return true;
      })
      .then(() => json(res, 200, { ok: true }))
      .catch((erro) => json(res, erro.status || 500, { ok: false, erro: erro.message }));
  }

  /* ---------------------------------------------------------------- */
  /* Banco na nuvem (Supabase) — status, configuração e reenvio        */
  /* ---------------------------------------------------------------- */

  // GET /api/admin/supabase — nunca devolve a chave inteira
  if (rota === '/api/admin/supabase' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    return json(res, 200, statusSupabasePublico(configSupabase()));
  }

  // POST /api/admin/supabase — salva chave/url/tabela/liga-desliga
  if (rota === '/api/admin/supabase' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const cfg = lerConfigSupabase();
    if (corpo.url !== undefined) cfg.url = String(corpo.url || '').trim().replace(/\/+$/, '');
    if (corpo.tabela !== undefined) cfg.tabela = String(corpo.tabela || 'clientes').trim();
    if (corpo.ativo !== undefined) cfg.ativo = Boolean(corpo.ativo);
    if (corpo.chave) cfg.chave = String(corpo.chave).trim(); // em branco = mantém a atual
    if (process.env.SUPABASE_URL && cfg.url && cfg.url !== process.env.SUPABASE_URL) {
      return json(res, 409, {
        ok: false,
        erro: 'A URL vem do arquivo .env do servidor (SUPABASE_URL). Edite o .env para apontar para outro projeto.'
      });
    }
    salvarConfigSupabase(cfg);
    const atual = configSupabase();
    const teste = atual.ativo ? await ReloSync.testar(atual) : { ok: false, erro: 'espelhamento desligado' };
    return json(res, 200, Object.assign(statusSupabasePublico(atual), { teste }));
  }

  // POST /api/admin/supabase/teste — confere conexão e a tabela
  if (rota === '/api/admin/supabase/teste' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const atual = configSupabase();
    if (!atual.ativo) {
      return json(res, 200, { ok: true, teste: { ok: false, erro: 'Espelhamento desligado.' } });
    }
    const teste = await ReloSync.testar(atual);
    return json(res, 200, { ok: true, teste });
  }

  // POST /api/admin/supabase/reenviar — tenta de novo os cadastros parados na fila
  if (rota === '/api/admin/supabase/reenviar' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const resultado = await processarFilaSync('painel', true);
    return json(res, 200, Object.assign({ ok: true }, resultado, statusSupabasePublico(configSupabase())));
  }

  /* ---------------------------------------------------------------- */
  /* Admin da IA — o painel configura o Nano Banana sem tocar em arquivo */
  /* ---------------------------------------------------------------- */

  // GET /api/admin/ia — status, limite e uso (só admin; nunca devolve a chave)
  if (rota === '/api/admin/ia' && req.method === 'GET') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const status = nanoBanana.statusPublico();
    return json(res, 200, {
      ok: true,
      ativo: status.ativo,
      modelo: status.modelo,
      modeloChat: status.modeloChat,
      chaveConfigurada: Boolean(process.env.GEMINI_API_KEY),
      chaveMascara: mascaraChave(process.env.GEMINI_API_KEY),
      limitePorHora: limiteIaPorHora(),
      usoUltimaHora: usoIaUltimaHora()
    });
  }

  // POST /api/admin/ia — salva chave e/ou limite (só admin; grava em data/)
  if (rota === '/api/admin/ia' && req.method === 'POST') {
    const sessao = exigeAdmin(req, banco, res);
    if (!sessao) return undefined;
    const corpo = await lerCorpo(req);
    const cfg = lerConfigIa();

    if (corpo.chave !== undefined) {
      const chave = String(corpo.chave || '').trim();
      if (chave) {
        process.env.GEMINI_API_KEY = chave;
        cfg.chave = chave;
      }
    }
    if (corpo.limitePorHora !== undefined) {
      const n = Number(corpo.limitePorHora);
      if (Number.isFinite(n) && n > 0 && n <= 500) {
        process.env.IA_LIMITE_POR_HORA = String(n);
        cfg.limitePorHora = n;
      }
    }
    salvarConfigIa(cfg);

    const status = nanoBanana.statusPublico();
    return json(res, 200, {
      ok: true,
      ativo: status.ativo,
      modelo: status.modelo,
      chaveConfigurada: Boolean(process.env.GEMINI_API_KEY),
      chaveMascara: mascaraChave(process.env.GEMINI_API_KEY),
      limitePorHora: limiteIaPorHora(),
      usoUltimaHora: usoIaUltimaHora()
    });
  }

  /* ---------------------------------------------------------------- */
  /* Rotas da IA — Nano Banana (Gemini Image)                          */
  /* A chave fica só aqui no servidor; o navegador nunca vê.           */
  /* ---------------------------------------------------------------- */

  // GET /api/ia/status — o front usa isso para saber se a IA está ligada
  if (rota === '/api/ia/status' && req.method === 'GET') {
    return json(res, 200, nanoBanana.statusPublico());
  }

  // POST /api/ia/simular — gera a foto do cliente com o corte escolhido
  if (rota === '/api/ia/simular' && req.method === 'POST') {
    if (!exigirIaAtiva(req, res)) return undefined;

    const corpo = await lerCorpo(req, LIMITE_CORPO_IA);
    // Valida ANTES de gastar cota: pedido inválido não pode queimar crédito.
    if (!corpo.fotoBase64) {
      return json(res, 400, { ok: false, erro: 'Envie uma foto para simular o corte.' });
    }
    if (!nanoBanana.fotoValida(corpo.fotoBase64)) {
      return json(res, 400, {
        ok: false,
        erro: 'Envie uma foto válida (JPEG, PNG, WEBP, GIF ou HEIC) de até ~10 MB.'
      });
    }
    if (!conferirCotaIA(req, res, 1)) return undefined;

    const resultado = await nanoBanana.gerarSimulacaoDeCorte({
      fotoBase64: corpo.fotoBase64,
      estilo: corpo.estilo,
      tipo: corpo.tipo,
      volume: corpo.volume,
      rosto: corpo.rosto,
      observacao: corpo.observacao,
      proporcao: corpo.proporcao
    });

    db.salvar(banco);
    return json(res, 200, resultado);  }

  // POST /api/ia/analisar — leitura do rosto (formato, simetria, tipo de cabelo)
  if (rota === '/api/ia/analisar' && req.method === 'POST') {
    if (!exigirIaAtiva(req, res)) return undefined;

    const corpo = await lerCorpo(req, LIMITE_CORPO_IA);
    if (!corpo.fotoBase64) {
      return json(res, 400, { ok: false, erro: 'Envie uma foto para análise facial.' });
    }
    if (!nanoBanana.fotoValida(corpo.fotoBase64)) {
      return json(res, 400, {
        ok: false,
        erro: 'Envie uma foto válida (JPEG, PNG, WEBP, GIF ou HEIC) de até ~10 MB.'
      });
    }
    if (!conferirCotaIA(req, res, 1)) return undefined;

    return json(res, 200, await nanoBanana.analisarRosto({ fotoBase64: corpo.fotoBase64 }));
  }

  // POST /api/ia/chat — Relo IA conversando com um modelo real
  if (rota === '/api/ia/chat' && req.method === 'POST') {
    if (!exigirIaAtiva(req, res)) return undefined;

    const corpo = await lerCorpo(req);
    const mensagem = String(corpo.mensagem || '').trim();
    if (!mensagem) {
      return json(res, 400, { ok: false, erro: 'Escreva uma mensagem para a Relo IA.' });
    }
    if (!conferirCotaIA(req, res, 1)) return undefined;

    return json(res, 200, await nanoBanana.conversar({
      mensagem,
      historico: Array.isArray(corpo.historico) ? corpo.historico : [],
      contexto: corpo.contexto
    }));
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

  // Arquivos de ambiente guardam a chave da IA (GEMINI_API_KEY): ninguém pode
  // baixá-los pelo navegador. O .env.example é permitido (não tem segredo).
  const nome = path.basename(alvo);
  const ehArquivoDeAmbiente =
    nome === '.env' ||
    (/^\.env\./i.test(nome) && !/^\.env\.example$/i.test(nome)) ||
    /\.pem$|\.key$|\.p12$|\.jks$/i.test(nome);

  if (!dentroDoProjeto || ehProtegido || ehArquivoDeAmbiente) {
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
      // Erros da IA já vêm com código e mensagem próprios (chave inválida, cota, bloqueio...).
      if (erro instanceof nanoBanana.ErroNanoBanana) {
        console.warn(`[ia] ${erro.codigo}: ${erro.message}`);
        return json(res, erro.codigo, {
          ok: false,
          erro: erro.message,
          detalhes: erro.detalhes || undefined
        });
      }
      if (erro.message === 'Corpo muito grande') {
        return json(res, 413, {
          ok: false,
          erro: 'Arquivo muito grande. Envie uma foto de até ~10 MB.'
        });
      }
      console.error('[api] Erro:', erro.message);
      json(res, 500, { ok: false, erro: 'Erro interno do servidor.' });
    });
  }

  return servirArquivo(req, res, url);
});

servidor.listen(PORTA, HOST, () => {
  const banco = db.carregar();
  const criados = db.semearAdmins(banco);
  db.salvar(banco);
  const cfg = configSupabase();
  const fila = db.resumoSync(banco);
  console.log('======================================================');
  console.log('  Style Relo Barber — servidor no ar');
  console.log(`  Site:    http://localhost:${PORTA}/index.html`);
  console.log(`  Admin:   http://localhost:${PORTA}/admin.html`);
  console.log(`  API:     http://localhost:${PORTA}/api/health`);
  console.log(`  Banco:   ${db.DB_FILE}`);
  console.log(`  Usuários cadastrados: ${banco.usuarios.length}`);
  if (banco.produtos.length || banco.manutencoes.length || banco.despesas.length) {
    console.log(
      `  Operação: ${banco.produtos.length} produto(s), ${banco.manutencoes.length} manutenção(ões), ${banco.despesas.length} despesa(s) no banco do servidor`
    );
  }
  if (cfg.ativo) {
    console.log(`  Nuvem:   Supabase ativo → tabela "${cfg.tabela}" (${cfg.url.replace(/^https?:\/\//, '')})`);
    if (fila.pendentes) console.log(`           ${fila.pendentes} cadastro(s) na fila para reenviar`);
  } else {
    console.log('  Nuvem:   espelhamento no Supabase DESLIGADO (cadastro fica só no data/db.json)');
    console.log('           Para ligar: SUPABASE_URL / SUPABASE_ANON_KEY no .env ou no painel admin.');
  }
  if (criados > 0) console.log(`  ${criados} conta(s) de administrador criada(s) agora.`);
  if (nanoBanana.ativo()) {
    console.log(`  IA:      Nano Banana ATIVO (${nanoBanana.statusPublico().modelo})`);
    console.log(`           Limite: ${limiteIaPorHora()} gerações/hora por visitante`);
  } else {
    console.log('  IA:      Nano Banana em modo demonstrativo (sem GEMINI_API_KEY)');
    console.log('           Para ligar: copie .env.example para .env e cole sua chave.');
  }
  console.log('======================================================');

  // Cron do espelho: se um cadastro não subiu (site fora do ar, tabela travada),
  // o servidor tenta de novo sozinho a cada 3 minutos, com espera crescente.
  const cron = setInterval(() => {
    processarFilaSync('cron').then((r) => {
      if (r && r.processados) console.log(`[sync] reenviei ${r.processados} cadastro(s) para o Supabase`);
    });
  }, FILA_SYNC_INTERVALO_MS);
  if (cron.unref) cron.unref();
  if (fila.pendentes) setTimeout(() => processarFilaSync('boot'), 1500).unref?.();
});
