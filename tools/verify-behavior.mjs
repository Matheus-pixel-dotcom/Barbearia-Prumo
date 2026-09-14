#!/usr/bin/env node
/**
 * Testes de COMPORTAMENTO das páginas, executando o HTML e os JS reais no jsdom.
 * O Supabase é mockado injetando window.supabase antes dos scripts rodarem, então o que
 * roda de verdade é o código de submit/tratamento de erro de auth.js, feedback.js e
 * admin.js — não uma reimplementação.
 *
 * Uso: node tools/verify-behavior.mjs    (Dep: jsdom)
 */
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = 'https://prumo.test';

class LocalLoader extends ResourceLoader {
  fetch(url) {
    let u; try { u = new URL(url); } catch { return null; }
    if (u.origin !== HOST) return null;           // CDN bloqueada
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    try { return Promise.resolve(Buffer.from(readFileSync(path.join(ROOT, rel)))); }
    catch (e) { return Promise.reject(e); }
  }
}

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FALHOU ${name}${extra ? '  -> ' + extra : ''}`); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 12000, step = 25) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(step);
  }
  return false;
}

async function openPage(page, { supabaseMock = null, seedStorage = null } = {}) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('jsdomError: ' + String(e.message).split('\n')[0]));
  vc.on('error', (...a) => logs.push('error: ' + a.map(String).join(' ')));
  for (const ev of ['warn', 'log', 'info', 'debug']) vc.on(ev, () => {});

  const dom = new JSDOM(readFileSync(path.join(ROOT, page), 'utf8'), {
    runScripts: 'dangerously',
    url: `${HOST}/${page}`,
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: new LocalLoader(),
    beforeParse(win) {
      win.fetch = async () => ({ ok: true, status: 200, text: async () => '[]', json: async () => [] });
      if (supabaseMock) win.supabase = { createClient: () => supabaseMock };
      if (seedStorage) {
        for (const [k, v] of Object.entries(seedStorage)) win.localStorage.setItem(k, v);
      }
    },
  });

  await new Promise(r => {
    if (dom.window.document.readyState === 'complete') return r();
    dom.window.addEventListener('load', r, { once: true });
  });
  await sleep(150);
  return { win: dom.window, doc: dom.window.document, logs };
}

const setValue = (doc, id, value) => {
  const el = doc.getElementById(id);
  if (el) el.value = value;
  return el;
};
const submit = (doc, formId) =>
  doc.getElementById(formId).dispatchEvent(
    new doc.defaultView.Event('submit', { cancelable: true, bubbles: true })
  );
const shown = (doc, id) => doc.getElementById(id)?.classList.contains('show') ?? false;
const textOf = (doc, id) => doc.getElementById(id)?.textContent ?? '';

// ---------------------------------------------------------------- A
console.log('\n[A] login.html — CDN do Supabase inacessível (antes: botão preso em "Entrando..." para sempre)');
{
  const { win, doc } = await openPage('login.html');   // sem mock, CDN bloqueada
  setValue(doc, 'email', 'cliente@prumo.com');
  setValue(doc, 'password', 'senha123');
  submit(doc, 'loginForm');

  const recovered = await waitFor(() => shown(doc, 'errorMessage'), 15000);
  check('mostra mensagem de erro (não trava)', recovered);
  check('mensagem cita conexão/CDN', /conex|CDN|carreg/i.test(textOf(doc, 'errorMessage')),
    textOf(doc, 'errorMessage'));
  check('botão volta a "Entrar"', doc.getElementById('submitBtn').textContent === 'Entrar',
    doc.getElementById('submitBtn').textContent);
  check('botão reabilitado', doc.getElementById('submitBtn').disabled === false);
  win.close();
}

// ---------------------------------------------------------------- B
console.log('\n[B] login.html — credenciais recusadas');
{
  const mock = {
    auth: {
      signInWithPassword: async () => ({
        data: null,
        error: { message: 'Invalid login credentials' },
      }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
  const { win, doc } = await openPage('login.html', { supabaseMock: mock });
  setValue(doc, 'email', 'cliente@prumo.com');
  setValue(doc, 'password', 'errada');
  submit(doc, 'loginForm');

  const ok = await waitFor(() => shown(doc, 'errorMessage'));
  check('mostra o erro do servidor', ok && /Invalid login credentials/.test(textOf(doc, 'errorMessage')),
    textOf(doc, 'errorMessage'));
  check('não mostra sucesso', !shown(doc, 'successMessage'));
  check('botão reabilitado', doc.getElementById('submitBtn').disabled === false);
  win.close();
}

// ---------------------------------------------------------------- C
console.log('\n[C] feedback.html — insert FALHA (antes: dizia "enviado com sucesso")');
{
  const mock = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => ({
      insert: () => ({
        select: async () => ({ data: null, error: { message: 'permission denied for table feedbacks' } }),
      }),
      select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }),
  };
  const { win, doc } = await openPage('feedback.html', { supabaseMock: mock });
  await waitFor(() => doc.getElementById('barberName'));

  setValue(doc, 'barberName', 'João Silva');   // é um <select>: precisa ser opção real
  setValue(doc, 'comment', 'Atendimento excelente, quero que isto NÃO suma.');
  submit(doc, 'feedbackForm');

  const ok = await waitFor(() => shown(doc, 'errorMessage'));
  check('mostra erro, não sucesso', ok && !shown(doc, 'successMessage'),
    `erro=${shown(doc, 'errorMessage')} sucesso=${shown(doc, 'successMessage')}`);
  check('erro menciona a causa', /permission denied/.test(textOf(doc, 'errorMessage')),
    textOf(doc, 'errorMessage'));
  check('erro diz que nada foi enviado', /nada foi enviado|não foi possível salvar/i.test(textOf(doc, 'errorMessage')));
  check('formulário NÃO foi limpo', doc.getElementById('comment').value.includes('NÃO suma'),
    doc.getElementById('comment').value);
  check('lista não recebeu o item como se tivesse salvo',
    !doc.getElementById('feedbacksList').innerHTML.includes('quero que isto'));
  win.close();
}

// ---------------------------------------------------------------- D
console.log('\n[D] feedback.html — insert OK');
{
  const saved = { id: 99, barber_name: 'Weverton', rating_barber: 5, rating_service: 4, comment: 'Salvou de verdade.' };
  const mock = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => ({
      insert: () => ({ select: async () => ({ data: [saved], error: null }) }),
      select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }),
  };
  const { win, doc } = await openPage('feedback.html', { supabaseMock: mock });
  await waitFor(() => doc.getElementById('barberName'));

  setValue(doc, 'barberName', 'João Silva');
  setValue(doc, 'comment', 'Salvou de verdade.');
  submit(doc, 'feedbackForm');

  const ok = await waitFor(() => shown(doc, 'successMessage'));
  check('mostra sucesso', ok);
  check('não mostra erro', !shown(doc, 'errorMessage'));
  check('avaliação entra na lista', doc.getElementById('feedbacksList').innerHTML.includes('Salvou de verdade.'));
  check('formulário foi limpo', doc.getElementById('comment').value === '');
  win.close();
}

// ---------------------------------------------------------------- E
console.log('\n[E] feedback.html — banco fora do ar (exemplos rotulados, não fingindo ser reais)');
{
  const mock = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'network down' } }) }) }) }),
  };
  const { win, doc } = await openPage('feedback.html', { supabaseMock: mock });
  const ok = await waitFor(() => /exemplos ilustrativos/i.test(doc.getElementById('feedbacksList')?.innerHTML || ''));
  check('avisa que são exemplos ilustrativos', ok,
    (doc.getElementById('feedbacksList')?.innerHTML || '').slice(0, 120));
  win.close();
}

// ---------------------------------------------------------------- F
console.log('\n[F] admin.html — banco responde 404 (antes: inventava "Cliente Exemplo" e contava 1)');
{
  const { win, doc } = await openPage('admin.html');
  await waitFor(() => win.supabaseClient);
  win.supabaseClient.query = async () => {
    throw new win.SupabaseRequestError('GET profiles falhou (HTTP 404): tabela não encontrada',
      { status: 404, code: '42P01', method: 'GET', url: 'https://x/rest/v1/profiles' });
  };
  await win.loadAdminData();
  await sleep(50);

  check('contador fica em "—", não em 1', textOf(doc, 'stat-clients') === '—', textOf(doc, 'stat-clients'));
  check('não inventa "Cliente Exemplo"',
    !doc.getElementById('clients-table-body').innerHTML.includes('Cliente Exemplo'),
    doc.getElementById('clients-table-body').textContent.trim());
  const status = doc.getElementById('clients-status');
  check('caixa de erro visível', status.style.display !== 'none');
  check('caixa de erro traz a mensagem', /404/.test(status.textContent), status.textContent);
  win.close();
}

// ---------------------------------------------------------------- G
console.log('\n[G] admin.html — banco ok mas sem clientes');
{
  const { win, doc } = await openPage('admin.html');
  await waitFor(() => win.supabaseClient);
  win.supabaseClient.query = async () => [];
  await win.loadAdminData();
  await sleep(50);

  check('contador 0', textOf(doc, 'stat-clients') === '0', textOf(doc, 'stat-clients'));
  check('estado vazio honesto', /Nenhum cliente cadastrado/.test(doc.getElementById('clients-table-body').textContent),
    doc.getElementById('clients-table-body').textContent.trim());
  check('caixa de erro escondida', doc.getElementById('clients-status').style.display === 'none');
  win.close();
}

// ---------------------------------------------------------------- H
console.log('\n[H] admin.html — clientes reais + escapeHtml');
{
  const { win, doc } = await openPage('admin.html');
  await waitFor(() => win.supabaseClient);
  win.supabaseClient.query = async () => [
    { id: 'u1', full_name: 'Maria <img src=x onerror=alert(1)>', updated_at: '2026-09-01T10:00:00Z' },
  ];
  await win.loadAdminData();
  await sleep(50);

  const html = doc.getElementById('clients-table-body').innerHTML;
  check('contador 1', textOf(doc, 'stat-clients') === '1');
  check('HTML malicioso é escapado, não injetado', !/<img src=x/i.test(html), html.slice(0, 160));
  win.close();
}

// ---------------------------------------------------------------- I
console.log('\n[I] dashboard.html — guarda de sessão');
{
  const { win, doc } = await openPage('dashboard.html');
  const ok = await waitFor(() => /Sessão necessária/.test(doc.body.innerHTML));
  check('bloqueia quem não está logado', ok, doc.body.textContent.slice(0, 80));
  check('esconde as ações', doc.querySelector('.actions-grid')?.style.display === 'none');
  win.close();
}
{
  const { win, doc } = await openPage('dashboard.html', {
    seedStorage: { user_id: 'u1', user_email: 'maria@prumo.com' },
  });
  check('logado vê a saudação', /Olá, maria!/.test(textOf(doc, 'user-greeting')), textOf(doc, 'user-greeting'));
  check('logado vê as ações', doc.querySelector('.actions-grid')?.style.display !== 'none');
  win.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
