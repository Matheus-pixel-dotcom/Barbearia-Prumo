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
console.log('\n[A] login.html — credencial inexistente (antes: botão preso em "Entrando..." para sempre)');
{
  const { win, doc } = await openPage('login.html');   // sem backend: ReloAuth cai no modo local
  await waitFor(() => win.ReloAuth && win.ReloAuth.modo !== null);

  setValue(doc, 'email', 'nao-existe@prumo.com');
  setValue(doc, 'password', 'senha123');
  submit(doc, 'loginForm');

  const recovered = await waitFor(() => shown(doc, 'errorMessage'), 15000);
  check('mostra mensagem de erro (não trava)', recovered, textOf(doc, 'errorMessage'));
  check('não mostra sucesso falso', !shown(doc, 'successMessage'));
  check('botão reabilitado', doc.getElementById('submitBtn').disabled === false);
  check('ReloAuth caiu no modo local sem backend', win.ReloAuth.modo === 'local', win.ReloAuth.modo);
  win.close();
}

// ---------------------------------------------------------------- B
console.log('\n[B] ReloAuth — cadastro e login de verdade no modo local');
{
  const { win } = await openPage('login.html');
  await waitFor(() => win.ReloAuth && win.ReloAuth.modo !== null);

  const email = 'maria' + Date.now() + '@prumo.com';
  // assinatura real: cadastrar(nome, email, senha) — argumentos posicionais
  const cadastro = await win.ReloAuth.cadastrar('Maria Teste', email, 'senha-segura-1');
  check('cadastro succeeded', cadastro?.ok === true, JSON.stringify(cadastro).slice(0, 120));

  await win.ReloAuth.sair();
  check('sessão encerrada', win.ReloAuth.usuario === null);

  const errado = await win.ReloAuth.entrar(email, 'senha-errada');
  check('senha errada é recusada', errado?.ok === false, JSON.stringify(errado).slice(0, 120));
  check('recusa traz mensagem', Boolean(errado?.erro), String(errado?.erro));

  const certo = await win.ReloAuth.entrar(email, 'senha-segura-1');
  check('senha certa entra', certo?.ok === true, JSON.stringify(certo).slice(0, 120));
  check('usuário fica na sessão', win.ReloAuth.usuario?.email === email, win.ReloAuth.usuario?.email);
  check('conta nova NÃO é admin', win.ReloAuth.ehAdmin(win.ReloAuth.usuario) === false);
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
console.log('\n[F] admin.html — sem sessão: painel bloqueado (antes: abria direto na URL)');
{
  const { win, doc } = await openPage('admin.html');
  await waitFor(() => /Área restrita|administrador/i.test(doc.getElementById('acesso-painel')?.textContent || ''), 8000);

  const painel = doc.getElementById('acesso-painel');
  check('tela de bloqueio aparece', painel && painel.hidden === false);
  check('explica que é área restrita', /Área restrita aos administradores/.test(painel.textContent),
    painel.textContent.slice(0, 90));
  check('layout do painel fica escondido', doc.querySelector('.admin-layout')?.style.display === 'none');
  check('oferece botão de login', /Entrar como administrador/.test(painel.textContent));
  win.close();
}

// ---------------------------------------------------------------- G
console.log('\n[G] admin.html — conta de cliente não abre o painel');
{
  const { win, doc } = await openPage('admin.html');
  await waitFor(() => win.ReloAuth && win.ReloAuth.modo !== null);

  const email = 'cliente' + Date.now() + '@prumo.com';
  await win.ReloAuth.cadastrar('Cliente Comum', email, 'senha-segura-1');
  await win.ReloAuth.entrar(email, 'senha-segura-1');

  // o painel escuta ReloAuth.aoMudar; dar um tempo para o callback rodar
  await waitFor(() => /conta é de cliente/i.test(doc.getElementById('acesso-painel')?.textContent || ''), 8000);

  check('cliente é bloqueado com explicação',
    /não tem permissão de administrador/i.test(doc.getElementById('acesso-painel').textContent),
    doc.getElementById('acesso-painel').textContent.slice(0, 120));
  check('layout continua escondido', doc.querySelector('.admin-layout')?.style.display === 'none');
  win.close();
}

// ---------------------------------------------------------------- H
console.log('\n[H] dashboard.html — sem sessão não mostra os dados da conta');
{
  const { win, doc } = await openPage('dashboard.html');
  await waitFor(() => win.ReloAuth && win.ReloAuth.modo !== null, 8000);
  await sleep(150);

  check('nenhum dado de usuário foi preenchido',
    doc.getElementById('dado-email').textContent === '—',
    doc.getElementById('dado-email').textContent);
  check('saudação genérica, não personalizada',
    !/^Olá, .+!$/.test(doc.getElementById('user-greeting').textContent.trim()),
    doc.getElementById('user-greeting').textContent);
  win.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
