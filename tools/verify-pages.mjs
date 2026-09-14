#!/usr/bin/env node
/**
 * Verificacao das paginas do site.
 *
 * Carrega cada HTML real no jsdom, executa os <script> classicos reais (lidos do disco;
 * qualquer outro host e bloqueado, simulando CDN offline) e checa:
 *   1. nenhum SyntaxError / erro nao tratado durante a carga
 *   2. os globals que cada arquivo declara existem (probe via window.eval, que enxerga
 *      tanto propriedades de window quanto bindings lexicais de `const`/`let`)
 *
 * `fetch` e stubado: toda chamada fica registrada em window.__fetchCalls e devolve 200.
 *
 * Uso:  node tools/verify-pages.mjs
 * Dep:  jsdom  (npm i jsdom)
 * Exit code 1 se alguma pagina falhar.
 */
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = 'https://prumo.test';

/** globals top-level de cada arquivo -> prova de que o script executou inteiro */
const GLOBALS_BY_FILE = {
  'script.js':            ['initMobileMenu', 'initContactForm', 'initTryOn', 'buildWhatsappUrl'],
  'auth.js':              ['getSupabaseClient', 'initLoginForm', 'initSignupForm', 'checkAuth', 'logout'],
  'admin.js':             ['switchTab', 'openModal', 'closeModal', 'loadAdminData', 'saveProduct'],
  'feedback.js':          ['getSupabaseClient', 'loadFeedbacks', 'initFeedbackForm', 'initRatingSystem'],
  'face-recognition.js':  ['startCamera', 'stopCamera', 'detectFace', 'analyzeFeatures'],
  'ia-camera.js':         ['startCamera', 'stopCamera', 'captureAndAnalyze', 'loadFaceModels'],
  'supabase-client.js':   ['supabaseClient', 'SupabaseClient'],
  'nano-banana.js':       ['NanoBanana'],
  'nano-banana-ui.js':    ['NanoBananaUI'],
  'chat-ia.js':           ['ReloIA'],
};

const PAGES = [
  'index.html', 'servicos.html', 'sobre.html', 'contato.html',
  'login.html', 'signup.html', 'dashboard.html', 'admin.html',
  'feedback.html', 'face-recognition.html', 'ia-tryon.html',
];

/** So serve arquivos locais do repo; todo o resto (CDN, Supabase) volta vazio. */
class LocalLoader extends ResourceLoader {
  fetch(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.origin !== HOST) return null;
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    try { return Promise.resolve(Buffer.from(readFileSync(path.join(ROOT, rel)))); }
    catch (e) { return Promise.reject(e); }
  }
}

function localScriptsOf(html) {
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map(m => m[1])
    .filter(s => !/^(https?:)?\/\//.test(s));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function installFetchStub(win) {
  win.__fetchCalls = [];
  win.fetch = (input, init = {}) => {
    const url = typeof input === 'string'
      ? input
      : (input?.href ?? input?.url ?? String(input));
    const method = (init.method || 'GET').toUpperCase();
    win.__fetchCalls.push({ url, method, body: init.body ?? null });
    return Promise.resolve({
      ok: true, status: 200, statusText: 'OK',
      json: async () => [], text: async () => '[]',
    });
  };
}

async function loadPage(page) {
  const html = readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.message).split('\n')[0]));
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
  for (const ev of ['warn', 'log', 'info', 'debug']) vc.on(ev, () => {});

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `${HOST}/${page}`,
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: new LocalLoader(),
    beforeParse: installFetchStub,
  });

  await new Promise(r => {
    if (dom.window.document.readyState === 'complete') return r();
    dom.window.addEventListener('load', r, { once: true });
  });
  await sleep(250);           // tempo p/ handlers de DOMContentLoaded + microtasks
  return { dom, errors };
}

async function checkPage(page) {
  const html = readFileSync(path.join(ROOT, page), 'utf8');
  const expected = new Map();
  for (const s of localScriptsOf(html)) {
    for (const g of (GLOBALS_BY_FILE[s] ?? [])) expected.set(g, s);
  }

  const { dom, errors } = await loadPage(page);
  const win = dom.window;

  const missing = [...expected.entries()]
    .filter(([g]) => win.eval(`typeof ${g}`) === 'undefined')
    .map(([g, src]) => `${g}  (de ${src})`);

  const isSyntax = e => /SyntaxError|already been declared/.test(e);
  const isNoise  = e => /Not implemented|Could not load|Could not parse CSS/i.test(e);
  const syntax  = errors.filter(isSyntax);
  const runtime = errors.filter(e => !isSyntax(e) && !isNoise(e));

  const fetchCalls = [...(win.__fetchCalls ?? [])];
  win.close();
  return { page, syntax, runtime, missing, fetchCalls };
}

let failed = 0;
const results = [];
for (const page of PAGES) {
  const r = await checkPage(page);
  results.push(r);
  if (r.syntax.length || r.missing.length || r.runtime.length) failed++;
}

for (const r of results) {
  const bad = r.syntax.length + r.missing.length + r.runtime.length;
  console.log(`${bad ? 'FALHOU' : '  ok  '}  ${r.page}`);
  for (const s of r.syntax)  console.log(`         SyntaxError: ${s}`);
  for (const m of r.missing) console.log(`         global ausente: ${m}`);
  for (const o of r.runtime) console.log(`         runtime: ${o}`);
  for (const f of r.fetchCalls) console.log(`         fetch ${f.method} ${f.url}`);
}

console.log(`\n${results.length - failed}/${results.length} paginas OK`);
process.exit(failed ? 1 : 0);
