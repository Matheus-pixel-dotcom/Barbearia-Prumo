#!/usr/bin/env node
/**
 * Teste do supabase-client.js executando o arquivo real num jsdom, com `fetch` stubado.
 *
 * Verifica:
 *   1. a URL montada por cada metodo (o bug era /rest/v1//rest/v1/<tabela>)
 *   2. metodo/headers/Prefer corretos
 *   3. HTTP != 2xx REJEITA com SupabaseRequestError (antes devolvia null/[] em silencio)
 *   4. falha de rede tambem rejeita, em vez de sumir
 *
 * Uso: node tools/verify-supabase-client.mjs     (Dep: jsdom)
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT = readFileSync(path.join(ROOT, 'supabase-client.js'), 'utf8');
const ORIGIN = 'https://jhfwgucoaykbgoyqibdn.supabase.co';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FALHOU ${name}${extra ? '  -> ' + extra : ''}`); }
}

/** Monta uma janela com o cliente real e um fetch controlavel. */
function makeEnv(fetchImpl) {
  const calls = [];
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://prumo.test/admin.html',
    runScripts: 'outside-only',
  });
  dom.window.fetch = (input, init = {}) => {
    calls.push({
      url: typeof input === 'string' ? input : (input?.href ?? String(input)),
      method: (init.method || 'GET').toUpperCase(),
      headers: init.headers || {},
      body: init.body ?? null,
    });
    return fetchImpl(calls[calls.length - 1]);
  };
  dom.window.eval(CLIENT);
  return { win: dom.window, calls };
}

const okResponse = (data = []) => ({
  ok: true, status: 200, statusText: 'OK',
  text: async () => JSON.stringify(data),
});
const errResponse = (status, body) => ({
  ok: false, status, statusText: 'ERR',
  text: async () => JSON.stringify(body),
});

// ---------- 1. URLs montadas por cada metodo ----------
console.log('\n[1] URLs montadas (o bug: /rest/v1 duplicado)');
{
  const { win, calls } = makeEnv(async () => okResponse([]));
  const c = win.supabaseClient;

  await c.getFaceSimulations();
  await c.getAppointments();
  await c.query('profiles', { select: '*' });
  await c.saveFaceSimulation('Executive Contour', 'IA Visagismo', { confidence: 95 });
  await c.saveAppointment('Corte', 'Michel', '2026-09-20T14:00:00Z');
  await c.updateProfile('Fulano', null);

  const expected = [
    ['GET',   `${ORIGIN}/rest/v1/face_simulations`],
    ['GET',   `${ORIGIN}/rest/v1/appointments`],
    ['GET',   `${ORIGIN}/rest/v1/profiles?select=*`],
    ['POST',  `${ORIGIN}/rest/v1/face_simulations`],
    ['POST',  `${ORIGIN}/rest/v1/appointments`],
    ['PATCH', `${ORIGIN}/rest/v1/profiles`],
  ];

  check('quantidade de chamadas', calls.length === 6, `obtido ${calls.length}`);
  expected.forEach(([method, url], i) => {
    const got = calls[i];
    check(`${method} ${url.split('/rest/v1/')[1]}`,
      got && got.method === method && got.url === url,
      got ? `${got.method} ${got.url}` : 'sem chamada');
  });

  check('nenhuma URL com /rest/v1 duplicado',
    calls.every(c => !/\/rest\/v1\/.*\/rest\/v1\//.test(c.url)),
    calls.map(c => c.url).join(' | '));
  check('nenhuma URL com barra dupla',
    calls.every(c => !/[^:]\/\//.test(c.url)));
}

// ---------- 2. Headers e corpo ----------
console.log('\n[2] Headers e corpo');
{
  const { win, calls } = makeEnv(async () => okResponse([{ id: 1 }]));
  await win.supabaseClient.saveFaceSimulation('Buzz Cut', 'IA Visagismo', { confidence: 88 });
  const call = calls[0];

  check('header apikey presente', Boolean(call.headers.apikey));
  check('header Authorization Bearer', /^Bearer .+/.test(call.headers.Authorization || ''));
  check('header Prefer: return=representation', call.headers.Prefer === 'return=representation');
  check('Content-Type json', call.headers['Content-Type'] === 'application/json');

  const body = JSON.parse(call.body);
  check('body style_name', body.style_name === 'Buzz Cut');
  check('body style_type', body.style_type === 'IA Visagismo');
  check('body face_data', body.face_data?.confidence === 88);
}

// ---------- 3. setAuthToken e tolerancia a barra final ----------
console.log('\n[3] Token e normalizacao da origem');
{
  const { win, calls } = makeEnv(async () => okResponse([]));
  const c = new win.SupabaseClient(`${ORIGIN}/rest/v1/`, 'k');   // origem "errada" de proposito
  c.setAuthToken('token-do-usuario');
  await c.query('profiles', { select: '*' });

  check('origem com barra final nao gera caminho duplicado',
    calls[0].url === `${ORIGIN}/rest/v1/profiles?select=*`, calls[0].url);
  check('setAuthToken aplicado no Authorization',
    calls[0].headers.Authorization === 'Bearer token-do-usuario');

  // o construtor normaliza qualquer variante que ja traga o caminho
  const variants = [ORIGIN, `${ORIGIN}/`, `${ORIGIN}/rest/v1`, `${ORIGIN}/rest/v1/`];
  for (const v of variants) {
    const { win: w2, calls: c2 } = makeEnv(async () => okResponse([]));
    await new w2.SupabaseClient(v, 'k').query('profiles', { select: '*' });
    check(`normaliza "${v.replace(ORIGIN, '<origem>')}"`,
      c2[0].url === `${ORIGIN}/rest/v1/profiles?select=*`, c2[0].url);
  }
}

// ---------- 4. Erros nao sao mais engolidos ----------
console.log('\n[4] Erros propagam (antes: return null/[] em silencio)');
{
  const { win } = makeEnv(async () => errResponse(404, {
    code: '42P01', message: 'Could not find the table \'public.face_simulations\'',
  }));

  let err = null;
  let value = 'NAO_REJEITOU';
  try { value = await win.supabaseClient.getFaceSimulations(); }
  catch (e) { err = e; }

  check('getFaceSimulations REJEITA em HTTP 404', err !== null, `resolveu com ${JSON.stringify(value)}`);
  check('erro e SupabaseRequestError', err?.name === 'SupabaseRequestError', err?.name);
  check('erro traz o status', err?.status === 404, String(err?.status));
  check('erro traz o codigo PostgREST', err?.code === '42P01', String(err?.code));
  check('mensagem inclui a tabela', /face_simulations/.test(err?.message || ''), err?.message);

  // escrita
  let werr = null;
  try { await win.supabaseClient.saveAppointment('Corte', 'Michel', '2026-09-20'); }
  catch (e) { werr = e; }
  check('saveAppointment REJEITA em HTTP 404', werr !== null);

  // query
  let qerr = null, qval = 'NAO_REJEITOU';
  try { qval = await win.supabaseClient.query('profiles', { select: '*' }); }
  catch (e) { qerr = e; }
  check('query REJEITA em HTTP 404 (nao devolve [])', qerr !== null, `resolveu com ${JSON.stringify(qval)}`);
}

console.log('\n[5] Falha de rede');
{
  const { win } = makeEnv(async () => { throw new TypeError('Failed to fetch'); });
  let err = null;
  try { await win.supabaseClient.getFaceSimulations(); } catch (e) { err = e; }
  check('rejeita com SupabaseRequestError', err?.name === 'SupabaseRequestError', err?.name);
  check('mensagem menciona rede', /rede/i.test(err?.message || ''), err?.message);
}

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
