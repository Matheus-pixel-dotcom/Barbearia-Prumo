#!/usr/bin/env node
/**
 * Teste de integração do proxy (tools/gemini-proxy/server.mjs).
 *
 * Sobe um "Gemini falso" local, sobe o proxy apontando para ele e faz requisições HTTP
 * de verdade. Verifica o que importa num proxy de chave:
 *   - a chave chega no upstream e NUNCA volta para o cliente
 *   - a allowlist de modelos funciona
 *   - resposta e erros do upstream passam intactos
 *   - CORS e preflight funcionam
 *   - sem GEMINI_API_KEY o proxy avisa em vez de vazar
 *
 * Uso: node tools/verify-proxy.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER = path.join(ROOT, 'tools/gemini-proxy/server.mjs');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FALHOU ${name}${extra ? '  -> ' + extra : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForPort(port, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz-probe`, { method: 'GET' });
      if (r) return true;
    } catch { /* ainda não subiu */ }
    await sleep(80);
  }
  return false;
}

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// ----------------------------------------------------------- Gemini falso
const upstreamSeen = [];
const fakeGemini = await listen((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    upstreamSeen.push({
      url: req.url,
      method: req.method,
      apiKey: req.headers['x-goog-api-key'] || null,
      body: raw ? JSON.parse(raw) : null,
    });

    // modelos diferentes devolvem respostas diferentes, para provar o roteamento
    if (req.url.includes('gemini-3-pro-image')) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'cota do Pro esgotada' } }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [
          { text: 'ok do upstream' },
          { inline_data: { mime_type: 'image/png', data: 'QUJD' } },
        ] },
      }],
    }));
  });
});

// ----------------------------------------------------------- proxy
function startProxy(env) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  return { child, out: () => out };
}

const proxy = startProxy({
  GEMINI_API_KEY: 'AIza-SECRETA-DO-SERVIDOR',
  PORT: '8791',
  ALLOWED_ORIGIN: 'https://prumo.test',
  GEMINI_UPSTREAM: `http://127.0.0.1:${fakeGemini.port}`,
});
const ok = await waitForPort(8791);
check('proxy subiu', ok, proxy.out());

const BASE = 'http://127.0.0.1:8791';

const payloadFor = (model) => ({
  contents: [{ role: 'user', parts: [{ text: 'aplica o corte' }] }],
  generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  model,
});

console.log('\n[1] Encaminhamento e segredo da chave');
{
  const before = upstreamSeen.length;
  const r = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor('gemini-2.5-flash-image')),
  });
  const text = await r.text();

  check('respondeu 200', r.status === 200, `status ${r.status}`);
  check('resposta do upstream passou intacta', /ok do upstream/.test(text) && /QUJD/.test(text));
  check('chegou uma chamada no upstream', upstreamSeen.length === before + 1);

  const seen = upstreamSeen[upstreamSeen.length - 1];
  check('upstream recebeu a chave do SERVIDOR', seen.apiKey === 'AIza-SECRETA-DO-SERVIDOR', seen.apiKey);
  check('URL do upstream tem o modelo pedido',
    seen.url === '/gemini-2.5-flash-image:generateContent', seen.url);
  check('campo model foi removido antes de encaminhar', seen.body.model === undefined);
  check('contents chegaram intactos',
    seen.body.contents[0].parts[0].text === 'aplica o corte');

  check('a chave NAO aparece na resposta', !text.includes('AIza-SECRETA'));
  check('CORS devolve a origem configurada',
    r.headers.get('access-control-allow-origin') === 'https://prumo.test',
    r.headers.get('access-control-allow-origin'));
}

console.log('\n[2] Allowlist de modelos');
{
  await fetch(BASE + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor('gemini-3-pro-image')),
  });
  const seen = upstreamSeen[upstreamSeen.length - 1];
  check('modelo permitido é roteado', seen.url === '/gemini-3-pro-image:generateContent', seen.url);

  const before = upstreamSeen.length;
  await fetch(BASE + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor('algum-modelo-que-nao-devia')),
  });
  const fallback = upstreamSeen[upstreamSeen.length - 1];
  check('modelo fora da lista cai no default',
    upstreamSeen.length === before + 1 && fallback.url === '/gemini-2.5-flash-image:generateContent',
    fallback.url);
}

console.log('\n[3] Erros do upstream passam intactos');
{
  const r = await fetch(BASE + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor('gemini-3-pro-image')),   // o fake responde 429
  });
  const text = await r.text();
  check('status 429 repassado', r.status === 429, `status ${r.status}`);
  check('mensagem repassada', /cota do Pro esgotada/.test(text), text);
}

console.log('\n[4] Entradas inválidas');
{
  const r405 = await fetch(BASE + '/', { method: 'GET' });
  check('GET devolve 405', r405.status === 405, `status ${r405.status}`);

  const r404 = await fetch(BASE + '/outra-rota', { method: 'POST' });
  check('rota desconhecida devolve 404', r404.status === 404, `status ${r404.status}`);

  const rPreflight = await fetch(BASE + '/', { method: 'OPTIONS' });
  check('preflight OPTIONS devolve 204', rPreflight.status === 204, `status ${rPreflight.status}`);
  check('preflight traz Access-Control-Allow-Methods',
    /POST/.test(rPreflight.headers.get('access-control-allow-methods') || ''));

  const rBad = await fetch(BASE + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'isso nao é json',
  });
  check('JSON inválido devolve 400', rBad.status === 400, `status ${rBad.status}`);
}

proxy.child.kill();

console.log('\n[5] Sem GEMINI_API_KEY: avisa, não vaza');
{
  const noKey = startProxy({
    GEMINI_API_KEY: '', PORT: '8792',
    GEMINI_UPSTREAM: `http://127.0.0.1:${fakeGemini.port}`,
  });
  const up = await waitForPort(8792);
  check('proxy sobe mesmo sem chave', up, noKey.out());

  const before = upstreamSeen.length;
  const r = await fetch('http://127.0.0.1:8792/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor('gemini-2.5-flash-image')),
  });
  const text = await r.text();
  check('devolve 500 explicando', r.status === 500 && /GEMINI_API_KEY/.test(text), `status ${r.status}: ${text.slice(0, 80)}`);
  check('nada foi encaminhado ao upstream', upstreamSeen.length === before);
  noKey.child.kill();
}

fakeGemini.srv.close();

// ----------------------------------------------------------- ponta a ponta
console.log('\n[6] Ponta a ponta: página real -> HTTP real -> proxy -> imagem no chat');
{
  const { JSDOM, VirtualConsole, ResourceLoader } = await import('jsdom');
  const { readFileSync } = await import('node:fs');

  // upstream dedicado, para isolar as chamadas deste trecho
  const fakeGemini2Seen = [];
  const fakeGemini2 = await listen((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      fakeGemini2Seen.push({ url: req.url, apiKey: req.headers['x-goog-api-key'] || null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [
          { text: 'corte aplicado' },
          { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } },
        ] } }],
      }));
    });
  });

  const HOST = 'https://prumo.test';
  class LocalLoader extends ResourceLoader {
    fetch(url) {
      let u; try { u = new URL(url); } catch { return null; }
      if (u.origin !== HOST) return null;      // CDN bloqueada; o proxy é chamado à parte
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      try { return Promise.resolve(Buffer.from(readFileSync(path.join(ROOT, rel)))); }
      catch (e) { return Promise.reject(e); }
    }
  }

  const proxy2 = startProxy({
    GEMINI_API_KEY: 'AIza-SECRETA-DO-SERVIDOR',
    PORT: '8793',
    ALLOWED_ORIGIN: HOST,
    GEMINI_UPSTREAM: `http://127.0.0.1:${fakeGemini2.port}`,
  });
  await waitForPort(8793);

  const vc = new VirtualConsole();
  for (const ev of ['jsdomError', 'error', 'warn', 'log', 'info', 'debug']) vc.on(ev, () => {});

  const dom = new JSDOM(readFileSync(path.join(ROOT, 'ia-tryon.html'), 'utf8'), {
    runScripts: 'dangerously',
    url: `${HOST}/ia-tryon.html`,
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: new LocalLoader(),
    // fetch NÃO é stubado aqui: emprestamos o fetch real do Node para a página falar
    // com o proxy de verdade, por HTTP de verdade.
    beforeParse(win) {
      win.fetch = fetch;
      win.NANO_BANANA_CONFIG = { endpoint: 'http://127.0.0.1:8793/', model: 'gemini-2.5-flash-image' };
    },
  });

  await new Promise(r => {
    if (dom.window.document.readyState === 'complete') return r();
    dom.window.addEventListener('load', r, { once: true });
  });
  await sleep(200);

  const win = dom.window;
  const doc = win.document;
  const chat = doc.getElementById('chat-body');

  check('modo proxy ativo', win.NanoBanana.mode() === 'proxy');
  check('nenhuma chave no navegador', win.NanoBanana.getConfig().apiKey === null,
    String(win.NanoBanana.getConfig().apiKey));

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await win.ReloIA.startSimulation(`data:image/jpeg;base64,${PNG}`, {
    styleName: 'Executive Contour', faceShape: 'Oval',
  });

  const got = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      if (chat.querySelectorAll('img.nb-img').length >= 1) return true;
      await sleep(50);
    }
    return false;
  })();

  check('imagem gerada apareceu no chat', got, chat.textContent.slice(-160));
  check('nenhum erro no chat', !/⚠️/.test(chat.textContent), chat.textContent.slice(-160));
  check('o upstream recebeu a chamada via proxy',
    fakeGemini2Seen.length >= 1 && fakeGemini2Seen[0].apiKey === 'AIza-SECRETA-DO-SERVIDOR');

  win.close();
  proxy2.child.kill();
  fakeGemini2.srv.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
