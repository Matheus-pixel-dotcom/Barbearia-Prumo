// Proxy mínimo para o Nano Banana — Cloudflare Worker (sem build, cola e publica).
//
//   npx wrangler deploy
//
// Segredo (nunca vai para o código):
//   npx wrangler secret put GEMINI_API_KEY
//
// Por que isto existe: o site é estático, então qualquer chave colocada no front-end é
// pública. O proxy guarda a chave no servidor e o navegador só vê esta URL.
//
// Contrato com o front-end (nano-banana.js):
//   POST /            body = o payload do generateContent, sem a chave
//   -> devolve a resposta do Gemini como veio, incluindo os erros
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (request.method !== 'POST') {
      return json({ error: { message: 'Use POST.' } }, 405, env);
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: { message: 'GEMINI_API_KEY não configurado no Worker.' } }, 500, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: { message: 'JSON inválido.' } }, 400, env);
    }

    // Trava o modelo: impede que alguém use o seu proxy para chamar outro modelo qualquer.
    const ALLOWED = new Set([
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
    ]);
    const model = ALLOWED.has(payload.model) ? payload.model : 'gemini-2.5-flash-image';
    delete payload.model;

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
      }
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...cors(env) },
    });
  },
};

function cors(env) {
  // Restrinja à origem do seu site em produção.
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  });
}
