/*
 * Teste de renderização do painel — 'npm run test:render'
 *
 * O teste-painel.js cobre o servidor e as rotas. Este aqui cobre a outra metade:
 * ele monta um DOM falso em Node e faz o admin.js inteiro rodar nele (boot, troca de
 * aba, busca, exportar CSV, salvar produto, despesas). Se alguma função do painel
 * quebrar — um id que mudou, um dado que veio undefined, um innerHTML montado errado —
 * o teste estoura aqui, sem depender de navegador.
 *
 * Dois modos:
 *   node ferramentas/teste-render-admin.js          → 'local', sem servidor (caminho degradado)
 *   node ferramentas/teste-render-admin.js servidor → fala com http://127.0.0.1:8000 (ADMIN_TEST_BASE)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const MODO = process.argv[2] || (process.env.ADMIN_TEST_BASE ? 'servidor' : 'local');
const BASE = process.env.ADMIN_TEST_BASE || 'http://127.0.0.1:8000';
const EMAIL_ADMIN = process.env.ADMIN_TEST_EMAIL || 'professor@gmail.com';
const SENHA_ADMIN = process.env.ADMIN_TEST_SENHA || 'professor2026';

const escreve = (t) => fs.writeSync(1, t + '\n');
console.log = (...a) => escreve(a.map((x) => (typeof x === 'string' ? x : String(x))).join(' '));
console.error = console.log;

class ClassList {
  constructor(el) { this.el = el; }
  add(...c) { c.forEach((x) => this.el._classes.add(x)); }
  remove(...c) { c.forEach((x) => this.el._classes.delete(x)); }
  toggle(c, f) { const at = f === undefined ? !this.el._classes.has(c) : Boolean(f); at ? this.el._classes.add(c) : this.el._classes.delete(c); return at; }
  contains(c) { return this.el._classes.has(c); }
}
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase(); this._classes = new Set(); this._html = '';
    this._text = ''; this._attrs = {}; this._children = []; this.dataset = {}; this.value = '';
    this.style = {}; this.parentNode = null;
    this.checked = false; this.disabled = false; this.listeners = {}; this.scrollTop = 0; this.hidden = false;
    this.classList = new ClassList(this);
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v == null ? '' : v); this._children = []; this._text = ''; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v == null ? '' : v); this._html = ''; }
  get children() { return this._children; }
  appendChild(n) { this._children.push(n); return n; }
  append(...n) { n.forEach((x) => typeof x === 'string' ? this._children.push(new El('#text')) : this._children.push(x)); }
  removeChild(n) { const i = this._children.indexOf(n); if (i >= 0) this._children.splice(i, 1); return n; }
  remove() {}
  // no navegador, form.reset() volta os campos para vazio; aqui limpa os inputs registrados
  reset() { todos.forEach((el) => { if (el._input) { el.value = ''; el.checked = false; } }); }
  setAttribute(k, v) { this._attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { if (k.startsWith('data-')) { const d = this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())]; return d === undefined ? null : d; } return this._attrs[k] === undefined ? null : this._attrs[k]; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return this._attrs[k] !== undefined; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  dispatch(t, ev) { (this.listeners[t] || []).forEach((f) => f.call(this, Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, ev || {}))); }
  click() { this.dispatch('click'); }
  getContext() { const noop = () => {}; return { canvas: this, fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop, setLineDash: noop, save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }) }; }
  getBoundingClientRect() { return { width: 600, height: 200, top: 0, left: 0, right: 600, bottom: 200 }; }
  focus() { this._focado = true; }
  blur() { this._focado = false; }
  scrollIntoView() {}
  querySelector(sel) { return this.querySelectorBase(sel); }
  querySelectorBase(sel) {
    const bate = (n) => {
      if (sel.startsWith('.')) return n._classes.has(sel.slice(1));
      if (sel.startsWith('#')) return n._attrs.id === sel.slice(1);
      if (sel.startsWith('[data-')) { const k = sel.slice(6, -1); return n._attrs[k] !== undefined; }
      return n.tagName === sel.toUpperCase();
    };
    const anda = (n) => { for (const f of n._children) { if (bate(f)) return f; const d = anda(f); if (d) return d; } return null; };
    return anda(this);
  }
  querySelectorAll(sel) {
    const achados = [];
    const bate = (n) => {
      if (sel.startsWith('.')) return n._classes.has(sel.slice(1));
      if (sel.startsWith('[data-')) { const k = sel.slice(6, -1); return n._attrs[k] !== undefined; }
      return n.tagName === sel.toUpperCase();
    };
    const anda = (n) => { for (const f of n._children) { if (bate(f)) achados.push(f); anda(f); } };
    anda(this);
    return achados;
  }
  closest(sel) {
    const bate = (n) => {
      if (sel.startsWith('.')) return n._classes.has(sel.slice(1));
      if (sel.startsWith('[data-')) { const k = sel.slice(6, -1); return n._attrs[k] !== undefined; }
      return n.tagName === sel.toUpperCase();
    };
    let atual = this;
    while (atual) { if (bate(atual)) return atual; atual = atual.parentNode; }
    return null;
  }
}

const todos = new Map();
function criar(tag, id) {
  const e = new El(tag);
  if (['input', 'select', 'textarea', 'form', 'button'].includes(String(tag).toLowerCase())) e._input = String(tag) !== 'form';
  if (id) { e.setAttribute('id', id); todos.set(id, e); }
  return e;
}
const document = {
  _byId: todos,
  createElement: (t) => criar(t),
  createDocumentFragment: () => new El('#fragment'),
  getElementById: (i) => todos.get(i) || criar('div', i),
  querySelector: (s) => document.body.querySelector(s),
  querySelectorAll: (s) => document.body.querySelectorAll(s),
  addEventListener: (t, f) => { (document._l = document._l || {}); (document._l[t] = document._l[t] || []).push(f); },
  visibilityState: 'visible',
  documentElement: new El('html'),
  title: '',
};
document.body = new El('body');
document.body.parentNode = null;
for (const id of ['layout', 'sidebar', 'btn-menu', 'btn-menu-fechar', 'main', 'relot',
  'pill-banco', 'pill-sync', 'pill-atualizado', 'btn-atualizar',
  'stat-clients', 'stat-logins', 'stat-produtos-valor', 'stat-expenses', 'stat-sync', 'stat-alertas',
  'chart-cadastros', 'chart-acessos', 'chart-origens',
  'atividade-list', 'alertas-list', 'produtos-alerta',
  'clients-table-body', 'products-table-body', 'maintenance-table-body', 'expenses-table-body',
  'clientes-contagem', 'sync-estado', 'sync-fila', 'sync-fila-total', 'nav-badge-sync', 'nav-badge-alertas',
  'ficha-corpo', 'toast-stack', 'aba-ia-resposta', 'busca-clientes', 'filtro-status', 'filtro-origem',
  'filtro-cidade', 'filtro-campo', 'filtro-valor', 'btn-exportar-csv', 'btn-reenviar-fila']) {
  criar('div', id);
}
['prod-name', 'prod-category', 'prod-qty', 'prod-min', 'prod-price', 'prod-desc', 'prod-id',
 'exp-desc', 'exp-cat', 'exp-value', 'exp-pago', 'exp-date', 'maint-item', 'maint-desc', 'maint-valor',
 'sup-url', 'sup-key', 'sup-table', 'sup-ativo', 'sync-token', 'login-email', 'login-password',
 'aba-ia-prompt', 'page-title', 'page-sub'].forEach((i) => criar('input', i));
['product-form', 'expense-form', 'maintenance-form', 'manut-form', 'cliente-form', 'sup-form'].forEach((f) => criar('form', f));
['mov-tipo', 'mov-qtd', 'mov-obs', 'mov-id', 'maint-resp', 'cliente-nome', 'cliente-email', 'cliente-senha'].forEach((i) => criar('input', i));
['btn-novo-produto', 'btn-nova-despesa', 'btn-nova-manut', 'btn-salvar-sup', 'btn-testar-sync'].forEach((b) => criar('button', b));
for (const aba of ['dashboard', 'clients', 'products', 'maintenance', 'expenses', 'banco', 'ia']) {
  const p = criar('div', 'tab-' + aba);
  p.classList.add('section-panel');
  document.body.appendChild(p);
  const link = criar('a');
  link.classList.add('nav-link');
  link.dataset.tab = aba;
  document.body.appendChild(link);
}

global.document = document;
global.window = global;
global.localStorage = {
  _s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
const storageExtra = {
  _s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
global.sessionStorage = storageExtra;
global.location = { pathname: '/admin.html', href: BASE + '/admin.html', search: '', hash: '', origin: BASE, protocol: 'http:', host: '127.0.0.1:8000' };
global.history = { pushState() {}, replaceState() {}, back() {} };
global.scrollTo = () => {};
global.ReloAdmin = undefined;

const setTimeoutNativo = global.setTimeout;

const timerFalso = { unref() { return this; }, ref() { return this; }, hasRef() { return false; }, refresh() { return this; } };
global.setTimeout = function (f, ms, ...resto) {
  if (typeof f === 'function' && Number(ms) > 1000) return timerFalso; // não deixa o painel segurar o processo
  return setTimeoutNativo(f, ms, ...resto);
};
global.setInterval = () => 0;
global.clearInterval = () => {};
const setNativo = setTimeoutNativo;
let relogioFake = 0;
global.requestAnimationFrame = (f) => { setNativo(() => { relogioFake += 100; try { f(performance.now() + relogioFake); } catch (e) {} }, 0); return 0; };
global.cancelAnimationFrame = () => {};
global.URL = Object.assign(global.URL || {}, { createObjectURL: () => 'blob:fake', revokeObjectURL() {} });
global.Blob = class { constructor(p) { this.parts = p; } };
try { Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() }, share: undefined }, configurable: true, writable: true }); } catch (e) { /* Node pode travar o getter; o painel só usa clipboard */ }
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.Image = class {};
global.alert = () => {};

const fetchOriginal = globalThis.fetch;
if (MODO === 'servidor') {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (/^supabase|\.supabase\.co/.test(u)) throw new Error('sem rede no teste');
    const absoluto = /^https?:/i.test(u) ? u : BASE + (u.startsWith('/') ? '' : '/') + u;
    const o = Object.assign({}, opts);
    if (/\/api\/admin\//.test(absoluto) && o.headers && /RELO_TOKEN/.test(String(o.headers.Authorization || ''))) {
      o.headers = Object.assign({}, o.headers, { Authorization: 'Bearer ' + global.__tokenAdmin });
    }
    return fetchOriginal(absoluto, o);
  };
} else {
  globalThis.fetch = async () => { throw new Error('rede desligada no teste local'); };
}

require(path.join(RAIZ, 'sync-supabase.js'));
// carrega o admin.js exatamente como o navegador faria e dispara o DOMContentLoaded
for (const arquivo of ['auth-hash.js', 'admin-accounts.js', 'auth-core.js', 'sync-supabase.js', 'login-modal.js', 'admin.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), { filename: arquivo });
}

let csv = '';
const BlobReal = global.Blob;
global.Blob = class extends BlobReal { constructor(parts, o) { super(parts, o); csv = String((parts || []).join('')); } };

let falhas = 0;
let total = 0;
function conferir(rotulo, condicao, extra) {
  total += 1;
  if (condicao) {
    escreve(' ✓ ' + rotulo);
  } else {
    falhas += 1;
    escreve(' ✗ ' + rotulo + (extra ? '  →  ' + String(extra).slice(0, 200) : ''));
  }
}

const espera = (ms) => new Promise((r) => setTimeoutNativo(r, ms));

(async () => {
  if (MODO === 'servidor') {
    const resposta = await fetchOriginal(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_ADMIN, senha: SENHA_ADMIN })
    });
    const sessao = await resposta.json();
    if (!sessao || !sessao.token) {
      escreve('✖ não conseguiu entrar como admin em ' + BASE + ' (o servidor está de pé?): ' + JSON.stringify(sessao).slice(0, 160));
      process.exit(1);
    }
    global.__tokenAdmin = sessao.token;
    localStorage.setItem('relo_sessao_v2', JSON.stringify({
      token: sessao.token,
      usuario: { email: sessao.email, nome: sessao.nome, perfil: sessao.perfil },
      modo: 'servidor',
      salvoEm: new Date().toISOString()
    }));
  }

  escreve('===== painel admin no modo ' + MODO + ' =====');
  (document._l.DOMContentLoaded || []).forEach((f) => {
    try { f(); } catch (e) { conferir('boot do painel sem exceção', false, e.stack); }
  });
  await espera(MODO === 'servidor' ? 900 : 500);

  const todosOsIds = ['pill-banco', 'pill-sync', 'pill-atualizado', 'stat-clients', 'stat-logins',
    'stat-produtos-valor', 'stat-expenses', 'stat-sync', 'chart-cadastros', 'chart-acessos', 'chart-origens',
    'atividade-list', 'alertas-list', 'clients-table-body', 'products-table-body', 'maintenance-table-body',
    'expenses-table-body', 'sync-estado', 'sync-fila', 'nav-badge-sync', 'nav-badge-alertas', 'acesso-painel'];
  const most = (i) => {
    const el = todos.get(i);
    if (!el) return '(sem elemento)';
    return ((el._html || el._text || '').replace(/\s+/g, ' ').trim().slice(0, 220) || '(vazio)');
  };
  if (process.env.ADMIN_RENDER_DEBUG) todosOsIds.forEach((i) => escreve(' · ' + i.padEnd(23) + '→ ' + most(i)));

  const Admin = global.ReloAdmin;
  conferir('o painel expõe window.ReloAdmin', Admin && typeof Admin.mudarAba === 'function');
  if (!Admin || typeof Admin.mudarAba !== 'function') {
    escreve('\n✖ admin.js não terminou de bootar');
    process.exit(1);
  }

  if (MODO === 'servidor') {
    conferir('KPI de clientes é um número', /^[0-9]+$/.test(most('stat-clients')), most('stat-clients'));
    conferir('KPI de estoque vem do banco do servidor', /R\$/.test(most('stat-produtos-valor')), most('stat-produtos-valor'));
    conferir('KPI de despesas vem do banco do servidor', /R\$/.test(most('stat-expenses')), most('stat-expenses'));
    conferir('tabela de clientes tem linhas', /<tr/.test(most('clients-table-body')), most('clients-table-body'));
    conferir('tabela de estoque tem linhas', /<tr/.test(most('products-table-body')), most('products-table-body'));
    conferir('tabela de despesas tem linhas', /<tr/.test(most('expenses-table-body')), most('expenses-table-body'));
    conferir('tabela de manutenção tem linhas', /<tr/.test(most('maintenance-table-body')), most('maintenance-table-body'));
    conferir('gráfico de cadastros foi desenhado', /<svg/.test(most('chart-cadastros')), most('chart-cadastros'));
    conferir('gráfico de acessos foi desenhado', /<svg/.test(most('chart-acessos')));
    conferir('rosca de origens foi desenhada', /<svg/.test(most('chart-origens')));
    conferir('feed de atividade tem itens', /feed-item/.test(most('atividade-list')), most('atividade-list'));
    conferir('selo do banco aponta o servidor', /servidor/.test(most('pill-banco')), most('pill-banco'));
    conferir('selo da nuvem responde', /nuvem/.test(most('pill-sync')), most('pill-sync'));
    conferir('selo de atualização aparece', /atualizado/.test(most('pill-atualizado')), most('pill-atualizado'));
    conferir('aba do banco mostra o estado do espelho', /ativa|desligad/i.test(most('sync-estado')), most('sync-estado'));

    // cada aba precisa trocar o título sem exceção
    const titulos = [];
    for (const aba of ['clients', 'products', 'maintenance', 'expenses', 'banco', 'ia', 'dashboard']) {
      Admin.mudarAba(aba);
      await espera(120);
      titulos.push(most('page-title'));
    }
    conferir('as 7 abas trocam sem exceção', titulos.filter((t) => t && t !== '(vazio)').length === 7, JSON.stringify(titulos));

    // busca filtra a lista
    document.getElementById('busca-clientes').value = 'a';
    document.getElementById('busca-clientes').dispatch('input');
    await espera(250);
    conferir('a busca mostra a contagem filtrada', /de 2[0-9] contas|contas/.test(most('clientes-contagem')), most('clientes-contagem'));

    // exportar CSV gera arquivo com cabeçalho + linhas
    csv = '';
    document.getElementById('btn-exportar-csv').dispatch('click');
    await espera(200);
    const linhasCsv = csv.split('\r\n').filter(Boolean);
    conferir('CSV exportado com cabeçalho e linhas', linhasCsv.length > 5 && /nome/.test(linhasCsv[0]), linhasCsv.length + ' linha(s)');

    // gravar um produto pelo formulário do painel
    const antes = await (await fetchOriginal(BASE + '/api/admin/estoque', { headers: { Authorization: 'Bearer ' + global.__tokenAdmin } })).json();
    ['prod-name', 'prod-category', 'prod-qty', 'prod-min', 'prod-price', 'prod-id'].forEach((i) => {
      document.getElementById(i).value = '';
    });
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-name').value = 'Pincelo Teste';
    document.getElementById('prod-category').value = 'Ferramentas';
    document.getElementById('prod-qty').value = '2';
    document.getElementById('prod-min').value = '3';
    document.getElementById('prod-price').value = '10';
    document.getElementById('product-form').dispatch('submit');
    await espera(400);
    const depois = await (await fetchOriginal(BASE + '/api/admin/estoque', { headers: { Authorization: 'Bearer ' + global.__tokenAdmin } })).json();
    conferir('salvar produto pelo painel grava no banco', (depois.produtos || []).length === (antes.produtos || []).length + 1, (antes.produtos || []).length + ' → ' + (depois.produtos || []).length);
    conferir('o formulário foi limpo depois de salvar', document.getElementById('prod-name').value === '', JSON.stringify(document.getElementById('prod-name').value));

    // despesa pelo formulário (mesmo caminho, sem modal aberto)
    document.getElementById('exp-desc').value = 'Internet fibra';
    document.getElementById('exp-cat').value = 'Operacional';
    document.getElementById('exp-value').value = '99.9';
    document.getElementById('exp-pago').checked = true;
    document.getElementById('expense-form').dispatch('submit');
    await espera(400);
    const despesasAgora = await (await fetchOriginal(BASE + '/api/admin/despesas', { headers: { Authorization: 'Bearer ' + global.__tokenAdmin } })).json();
    conferir('salvar despesa pelo painel grava no banco', /Internet fibra/.test(JSON.stringify(despesasAgora.despesas || [])), JSON.stringify((despesasAgora.despesas || [])[0]));
    conferir('o formulário de despesa foi limpo', document.getElementById('exp-desc').value === '');

    // limpa o que o teste criou (para não deixar lixo em banco de verdade)
    const apiAdmin = (rota, opcoes) => fetchOriginal(BASE + rota, Object.assign({ headers: { Authorization: 'Bearer ' + global.__tokenAdmin } }, opcoes));
    const criados = (depois.produtos || []).filter((x) => x.nome === 'Pincelo Teste')
      .concat((despesasAgora.despesas || []).filter((x) => x.descricao === 'Internet fibra'));
    for (const lixo of criados) {
      const rota = lixo.nome ? '/api/admin/estoque/' : '/api/admin/despesas/';
      await apiAdmin(rota + encodeURIComponent(lixo.id), { method: 'DELETE' });
    }
    const sobra = await (await apiAdmin('/api/admin/estoque')).json();
    const sobraD = await (await apiAdmin('/api/admin/despesas')).json();
    conferir('o teste não deixa lixo no banco', !(sobra.produtos || []).some((x) => x.nome === 'Pincelo Teste') && !(sobraD.despesas || []).some((x) => x.descricao === 'Internet fibra'));

    // recarregar tudo (é o que o auto-refresh de 1 minuto faz)
    await Admin.carregarTudo();
    await espera(250);
    conferir('carregarTudo() roda de novo sem exceção', true);
  } else {
    const bloqueio = document.getElementById('acesso-painel');
    conferir('sem servidor o painel pede login em vez de quebrar', !!(bloqueio && bloqueio._html), JSON.stringify(bloqueio && bloqueio._html).slice(0, 120));
    conferir('o seletor de aba continua vivo sem backend', (() => { Admin.mudarAba('clients'); return true; })());
  }

  escreve('');
  if (falhas) {
    escreve('✖ ' + falhas + ' de ' + total + ' verificações falharam (modo ' + MODO + ')');
    process.exit(1);
  }
  escreve('✔ ' + total + ' verificações, todas passando (modo ' + MODO + ')');
  process.exit(0);
})().catch((e) => {
  escreve('\n✖ exceção no painel (modo ' + MODO + '): ' + (e && e.stack ? e.stack.split('\n').slice(0, 7).join('\n') : e));
  process.exit(1);
});
