#!/usr/bin/env node
/**
 * Proxy do Nano Banana em Node puro (sem dependências).
 *
 *   GEMINI_API_KEY=AIza... node tools/gemini-proxy/server.mjs
 *
 * Variáveis:
 *   GEMINI_API_KEY   obrigatória. Nunca vai para o navegador.
 *   PORT             opcional, default 8787
 *   ALLOWED_ORIGIN   opcional, default "*". Em produção coloque a origem do site.
 *   GEMINI_UPSTREAM  opcional. Só para testar contra um servidor falso.
 *
 * Por que existe: o site é estático, então qualquer chave no front-end é pública.
 * Aqui a chave fica no processo do servidor e o navegador só vê esta URL.
 *
 * Contrato com nano-banana.js:
 *   POST /   body = payload do generateContent + campo "model"
 *   -> resposta do Gemini como veio, inclusive os erros
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY || '';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const UPSTREAM = process.env.GEMINI_UPSTREAM || 'https://generativelanguage.googleapis.com/v1/models';

// Trava o modelo: impede que alguém use o seu proxy para chamar outro modelo qualquer.
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
]);
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const MAX_BODY_BYTES = 25 * 1024 * 1024;   // foto em base64

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corpo da requisição grande demais.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (!['/', '/api/nano-banana'].includes(req.url)) {
    return sendJson(res, 404, { error: { message: 'Rota não encontrada.' } });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: { message: 'Use POST.' } });
  }
  if (!API_KEY) {
    return sendJson(res, 500, {
      error: { message: 'GEMINI_API_KEY não está definida no servidor. Rode: GEMINI_API_KEY=... node server.mjs' },
    });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJson(res, error.status || 400, { error: { message: error.message } });
  }

  const model = ALLOWED_MODELS.has(payload.model) ? payload.model : DEFAULT_MODEL;
  delete payload.model;

  const target = `${UPSTREAM}/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(text);
  } catch (error) {
    // Falha de rede até o Google: devolve algo que o front-end reconhece como 'network'.
    sendJson(res, 502, { error: { message: `Falha ao falar com o Gemini: ${error.message}` } });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy do Nano Banana em http://0.0.0.0:${PORT}`);
  console.log(`  chave configurada: ${API_KEY ? 'sim' : 'NÃO — as chamadas vão falhar com 500'}`);
  console.log(`  origem permitida:  ${ORIGIN}`);
  console.log(`  upstream:          ${UPSTREAM}`);
});
