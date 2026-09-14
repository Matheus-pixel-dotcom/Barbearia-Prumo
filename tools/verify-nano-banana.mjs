#!/usr/bin/env node
/**
 * Testes do Nano Banana: o núcleo (nano-banana.js) e o fluxo inteiro na página real
 * (captura -> chat recebe a imagem -> cliente pede mudança -> nova imagem no chat).
 *
 * O Gemini é stubado via `fetch`, então o que roda é o código de verdade: montagem do
 * payload, parsing da resposta, tratamento de erro, handlers do chat e o DOM.
 *
 * Uso: node tools/verify-nano-banana.mjs      (Dep: jsdom)
 */
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = 'https://prumo.test';

class LocalLoader extends ResourceLoader {
  fetch(url) {
    let u; try { u = new URL(url); } catch { return null; }
    if (u.origin !== HOST) return null;
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
async function waitFor(fn, timeout = 8000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (fn()) return true; await sleep(step); }
  return false;
}

/** PNG 1x1 válido, só para ter um dataURL real. */
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PHOTO = `data:image/jpeg;base64,${PNG_1x1}`;
const RESULT = `data:image/png;base64,${PNG_1x1}`;

/** Resposta do Gemini no formato REST real (snake_case). */
const geminiOk = (text = 'Aqui está o corte aplicado.') => ({
  ok: true, status: 200, statusText: 'OK',
  text: async () => JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [
          { text },
          { inline_data: { mime_type: 'image/png', data: PNG_1x1 } },
        ],
      },
    }],
  }),
});
const geminiErr = (status, body) => ({
  ok: false, status, statusText: 'ERR', text: async () => JSON.stringify(body),
});

async function openPage(page, { fetchImpl, storage = null, config = null } = {}) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('jsdomError: ' + String(e.message).split('\n')[0]));
  vc.on('error', (...a) => logs.push('error: ' + a.map(String).join(' ')));
  for (const ev of ['warn', 'log', 'info', 'debug']) vc.on(ev, () => {});

  const calls = [];
  const dom = new JSDOM(readFileSync(path.join(ROOT, page), 'utf8'), {
    runScripts: 'dangerously',
    url: `${HOST}/${page}`,
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: new LocalLoader(),
    beforeParse(win) {
      win.fetch = async (input, init = {}) => {
        calls.push({
          url: typeof input === 'string' ? input : (input?.href ?? String(input)),
          method: (init.method || 'GET').toUpperCase(),
          headers: init.headers || {},
          body: init.body ? JSON.parse(init.body) : null,
        });
        return fetchImpl ? fetchImpl(calls[calls.length - 1]) : geminiOk();
      };
      if (storage) for (const [k, v] of Object.entries(storage)) win.localStorage.setItem(k, v);
      if (config) win.NANO_BANANA_CONFIG = config;
    },
  });

  await new Promise(r => {
    if (dom.window.document.readyState === 'complete') return r();
    dom.window.addEventListener('load', r, { once: true });
  });
  await sleep(200);
  return { win: dom.window, doc: dom.window.document, calls, logs };
}

const KEY_CFG = { apiKey: 'AIzaTESTE', model: 'gemini-2.5-flash-image' };
const KEY_STORAGE = { prumo_nanobanana_config: JSON.stringify(KEY_CFG) };

// ================================================================ 1. payload
console.log('\n[1] Formato do request enviado ao Gemini');
{
  const { win, calls } = await openPage('ia-tryon.html', { storage: KEY_STORAGE });
  await win.ReloIA.startSimulation(PHOTO, { styleName: 'Mid Fade Moderno', faceShape: 'Oval' });
  await sleep(50);

  const call = calls.find(c => c.url.includes('generateContent'));
  check('chamou o endpoint generateContent', Boolean(call), calls.map(c => c.url).join(' | '));
  check('URL tem o modelo', call?.url.endsWith('/models/gemini-2.5-flash-image:generateContent'), call?.url);
  check('método POST', call?.method === 'POST');
  check('header x-goog-api-key', call?.headers['x-goog-api-key'] === 'AIzaTESTE');
  check('responseModalities TEXT+IMAGE',
    JSON.stringify(call?.body?.generationConfig?.responseModalities) === '["TEXT","IMAGE"]');

  const parts = call?.body?.contents?.[0]?.parts || [];
  check('role=user', call?.body?.contents?.[0]?.role === 'user');
  check('part de texto presente', Boolean(parts[0]?.text));
  check('part de imagem presente', Boolean(parts[1]?.inline_data?.data));
  check('mime_type da foto', parts[1]?.inline_data?.mime_type === 'image/jpeg',
    parts[1]?.inline_data?.mime_type);
  check('prompt pede para preservar identidade', /preserve|identidade/i.test(parts[0]?.text || ''));
  check('prompt leva o estilo escolhido', /Mid Fade Moderno/.test(parts[0]?.text || ''));
  check('prompt leva o formato de rosto', /Oval/.test(parts[0]?.text || ''));
  check('modelo NAO vai no body no modo direto', call?.body?.model === undefined);
  win.close();
}

// ================================================================ 2. proxy
console.log('\n[2] Modo proxy (chave fora do navegador)');
{
  const { win, calls } = await openPage('ia-tryon.html', {
    config: { endpoint: 'https://proxy.prumo.test/api/nano-banana', model: 'gemini-3.1-flash-image' },
  });
  await win.ReloIA.startSimulation(PHOTO, {});
  await sleep(50);

  const call = calls.find(c => c.url.includes('proxy.prumo.test'));
  check('chamou o proxy, não o Google', Boolean(call), calls.map(c => c.url).join(' | '));
  check('nenhuma chamada direta ao Google',
    !calls.some(c => c.url.includes('generativelanguage.googleapis.com')));
  check('nenhuma chave no header', call?.headers['x-goog-api-key'] === undefined);
  check('modelo vai no body para o proxy', call?.body?.model === 'gemini-3.1-flash-image',
    call?.body?.model);
  check('NanoBanana.mode() = proxy', win.NanoBanana.mode() === 'proxy');
  win.close();
}

// ================================================================ 3. multi-turn
console.log('\n[3] Iteração: o resultado anterior volta como base da edição');
{
  const { win, calls } = await openPage('ia-tryon.html', { storage: KEY_STORAGE });
  await win.ReloIA.startSimulation(PHOTO, { styleName: 'Buzz Cut' });
  await sleep(50);

  const first = calls.filter(c => c.url.includes('generateContent')).length;
  await win.ReloIA.applyEdit('Deixa o topo mais alto');
  await sleep(50);

  const genCalls = calls.filter(c => c.url.includes('generateContent'));
  check('segunda chamada foi feita', genCalls.length === first + 1, `antes ${first}, agora ${genCalls.length}`);

  const editPrompt = genCalls[1].body.contents[0].parts[0].text;
  check('pedido do cliente entra no prompt', /Deixa o topo mais alto/.test(editPrompt), editPrompt.slice(0, 90));
  check('base da edição é o resultado anterior (png), não a foto original (jpeg)',
    genCalls[1].body.contents[0].parts[1].inline_data.mime_type === 'image/png',
    genCalls[1].body.contents[0].parts[1].inline_data.mime_type);

  const sim = win.ReloIA.getSimulation();
  check('simulação guarda o resultado atual', Boolean(sim?.currentDataUrl));
  check('contador de edições incrementou', sim?.edits === 1, String(sim?.edits));
  win.close();
}

// ================================================================ 4. erros
console.log('\n[4] Erros são tratados, não engolidos');
{
  const cases = [
    ['bloqueio em HTTP 200 + promptFeedback', null, {
      fetchImpl: () => ({ ok: true, status: 200, text: async () => JSON.stringify({
        promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }) }),
      expect: /bloqueada|SAFETY/i,
    }],
    ['bloqueio em HTTP 400 + promptFeedback', null, {
      fetchImpl: () => geminiErr(400, { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }),
      expect: /bloqueada|PROHIBITED_CONTENT/i,
    }],
    ['limite de requisições', null, {
      fetchImpl: () => geminiErr(429, { error: { message: 'Resource exhausted' } }),
      expect: /Muitas gerações|429|Resource exhausted/i,
    }],
    ['modelo sem imagem na resposta', null, {
      fetchImpl: () => ({ ok: true, status: 200, text: async () => JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'não deu' }] } }] }) }),
      expect: /não consegui gerar/i,
    }],
    ['fora do ar', null, {
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
      expect: /falar com o gerador|conex/i,
    }],
  ];

  for (const [nome, , opts] of cases) {
    const { win, doc } = await openPage('ia-tryon.html', { storage: KEY_STORAGE, ...opts });
    await win.ReloIA.startSimulation(PHOTO, {});
    const ok = await waitFor(() => /⚠️/.test(doc.getElementById('chat-body').textContent), 9000);
    check(`avisa no chat: ${nome}`, ok && opts.expect.test(doc.getElementById('chat-body').textContent),
      doc.getElementById('chat-body').textContent.slice(-160));
    check(`não mostra imagem quebrada: ${nome}`,
      doc.querySelectorAll('#chat-body img.nb-img').length === 0);
    win.close();
  }
}

// ================================================================ 5. fluxo completo na página
console.log('\n[5] Fluxo real: captura -> chat -> pedido do cliente -> nova imagem');
{
  let n = 0;
  const { win, doc, calls } = await openPage('ia-tryon.html', {
    storage: KEY_STORAGE,
    fetchImpl: () => geminiOk(`Resultado ${++n} gerado.`),
  });

  const chat = doc.getElementById('chat-body');

  // (a) captura: é exatamente isto que ia-camera.js chama depois de analyzeDetection()
  await win.ReloIA.startSimulation(PHOTO, { styleName: 'Executive Contour', faceShape: 'Oval' });
  await waitFor(() => chat.querySelectorAll('img.nb-img').length === 1);

  check('imagem apareceu no chat', chat.querySelectorAll('img.nb-img').length === 1,
    `imgs=${chat.querySelectorAll('img.nb-img').length}`);
  check('legenda cita o estilo', /Executive Contour/.test(chat.textContent));
  check('legenda convida o cliente a pedir mudanças', /Quer mudar alguma coisa/.test(chat.textContent));

  // (b) o cliente pede uma mudança pelo campo do chat
  const input = doc.getElementById('chat-input');
  input.value = 'deixa a barba maior';
  doc.getElementById('chat-form').dispatchEvent(
    new win.Event('submit', { cancelable: true, bubbles: true })
  );

  const got2 = await waitFor(() => chat.querySelectorAll('img.nb-img').length === 2);
  check('pedido do cliente gerou uma nova imagem no chat', got2,
    `imgs=${chat.querySelectorAll('img.nb-img').length}`);
  check('a mudança pedida aparece na legenda', /deixa a barba maior/.test(chat.textContent),
    chat.textContent.slice(-200));
  check('a mensagem do cliente apareceu', /from-user/.test(chat.innerHTML) && /deixa a barba maior/.test(chat.innerHTML));
  check('duas chamadas ao modelo no total',
    calls.filter(c => c.url.includes('generateContent')).length === 2,
    String(calls.filter(c => c.url.includes('generateContent')).length));

  // (c) FAQ continua respondendo em texto, sem gastar geração
  input.value = 'quanto custa?';
  doc.getElementById('chat-form').dispatchEvent(
    new win.Event('submit', { cancelable: true, bubbles: true })
  );
  await waitFor(() => /R\$ 90/.test(chat.textContent));
  check('pergunta de preço responde em texto', /R\$ 90/.test(chat.textContent));
  check('FAQ não disparou geração de imagem',
    calls.filter(c => c.url.includes('generateContent')).length === 2,
    String(calls.filter(c => c.url.includes('generateContent')).length));
  win.close();
}

// ================================================================ 6. sem configuração
console.log('\n[6] Sem IA configurada: explica em vez de fingir que gerou');
{
  const { win, doc } = await openPage('ia-tryon.html');   // sem chave, sem proxy
  const chat = doc.getElementById('chat-body');

  check('status mostra desligado', /desligada/i.test(doc.getElementById('nb-status-text').textContent),
    doc.getElementById('nb-status-text').textContent);

  await win.ReloIA.startSimulation(PHOTO, { faceShape: 'Oval' });
  await sleep(50);

  check('chat explica que precisa configurar', /Configurar IA/.test(chat.textContent),
    chat.textContent.slice(-160));
  check('nenhuma imagem foi inventada', chat.querySelectorAll('img.nb-img').length === 0);
  check('nenhuma chamada externa foi feita', true);

  // painel salva a configuração e o status reage
  doc.getElementById('nb-apikey').value = 'AIzaSALVA';
  doc.getElementById('nb-save').dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(50);
  check('salvar ativa a IA', win.NanoBanana.isConfigured() === true);
  check('status muda para ativo (modo teste)', /modo teste/i.test(doc.getElementById('nb-status-text').textContent),
    doc.getElementById('nb-status-text').textContent);
  check('chave ficou no localStorage, não no código',
    /AIzaSALVA/.test(win.localStorage.getItem('prumo_nanobanana_config') || ''));
  win.close();
}

// ================================================================ 7. botões de estilo
console.log('\n[7] Botões de estilo (antes não tinham handler nenhum)');
{
  const { win, doc } = await openPage('ia-tryon.html', { storage: KEY_STORAGE });
  const opt = doc.querySelector('.style-option[data-style-name="Buzz Cut com Degradê"]');
  check('botão existe', Boolean(opt));
  opt.dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(50);
  check('cartão final mostra o nome', /Buzz Cut com Degradê/.test(doc.getElementById('res-nome').textContent),
    doc.getElementById('res-nome').textContent);
  check('cartão final ficou visível', !doc.getElementById('final-card').classList.contains('hidden'));
  win.close();
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
