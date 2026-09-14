// Nano Banana — geração e edição de imagem para o simulador de visagismo.
//
// "Nano Banana" é o apelido do modelo de imagem do Gemini. Endpoint usado:
//   POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent
//   header  x-goog-api-key: <chave>
//   body    { contents:[{role,parts:[{text},{inline_data:{mime_type,data}}]}],
//             generationConfig:{ responseModalities:["TEXT","IMAGE"] } }
//   resposta candidates[0].content.parts[] -> {text} ou {inline_data:{mime_type,data}}
//
// ── SEGURANÇA DA CHAVE ────────────────────────────────────────────────────────
// Este é um site estático: não existe backend. Qualquer chave colocada aqui vai para o
// navegador e pode ser lida por quem abrir o DevTools. Por isso o módulo aceita DOIS
// modos, nessa ordem de preferência:
//
//   1. PROXY (produção) — defina `endpoint`. O navegador chama o SEU proxy, que guarda a
//      chave no servidor. Nenhuma chave sai daqui. Veja tools/gemini-proxy/README.md.
//   2. CHAVE DIRETA (só desenvolvimento) — defina `apiKey`. Funciona, mas a chave fica
//      exposta e qualquer um pode usá-la na sua conta. O módulo avisa na tela.
//
// Nada é commitado: a configuração vem de window.NANO_BANANA_CONFIG (arquivo
// nano-banana.config.js, ignorado pelo git) ou do localStorage, preenchido pelo painel
// de configuração da página.
(function () {
  'use strict';

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1/models';
  const DEFAULT_MODEL = 'gemini-2.5-flash-image';   // "Nano Banana"
  // Alternativas nos docs oficiais, se quiser trocar em NANO_BANANA_CONFIG.model:
  //   gemini-3.1-flash-image      -> Nano Banana 2 (estável, atual)
  //   gemini-3.1-flash-lite-image -> Nano Banana 2 Lite (mais barato/rápido)
  //   gemini-3-pro-image          -> Nano Banana Pro (melhor qualidade)
  const STORAGE_KEY = 'prumo_nanobanana_config';
  const RETRY_STATUS = new Set([429, 500, 502, 503]);
  const MAX_ATTEMPTS = 3;

  class NanoBananaError extends Error {
    constructor(message, kind, details = {}) {
      super(message);
      this.name = 'NanoBananaError';
      this.kind = kind;   // 'not-configured' | 'blocked' | 'rate-limit' | 'http' | 'network' | 'no-image' | 'bad-response'
      Object.assign(this, details);
    }
  }

  // ---------------------------------------------------------------- configuração

  function readStoredConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Junta window.NANO_BANANA_CONFIG (arquivo local) com o que o usuário salvou na página. */
  function resolveConfig() {
    const fromWindow = (typeof window !== 'undefined' && window.NANO_BANANA_CONFIG) || {};
    const fromStorage = readStoredConfig() || {};
    // o que o usuário digitou na página tem prioridade; vazio não sobrescreve
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
    return { ...clean(fromWindow), ...clean(fromStorage) };
  }

  function getConfig() {
    const cfg = resolveConfig();
    return {
      endpoint: cfg.endpoint || null,
      apiKey: cfg.apiKey || null,
      model: cfg.model || DEFAULT_MODEL,
      aspectRatio: cfg.aspectRatio || '3:4',
    };
  }

  /** 'proxy' | 'apiKey' | 'none' */
  function mode() {
    const c = getConfig();
    if (c.endpoint) return 'proxy';
    if (c.apiKey) return 'apiKey';
    return 'none';
  }

  function isConfigured() {
    return mode() !== 'none';
  }

  function saveConfig(patch) {
    const current = readStoredConfig() || {};
    const next = { ...current, ...patch };
    for (const k of Object.keys(next)) {
      if (next[k] === '' || next[k] == null) delete next[k];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---------------------------------------------------------------- utilidades

  /** 'data:image/jpeg;base64,XXXX' -> { mimeType, data } ; também aceita base64 puro. */
  function splitDataUrl(input) {
    if (typeof input !== 'string' || !input) {
      throw new NanoBananaError('Imagem vazia.', 'bad-response');
    }
    const m = input.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) return { mimeType: m[1], data: m[2] };
    return { mimeType: 'image/jpeg', data: input.replace(/^base64,/, '') };
  }

  function toDataUrl(mimeType, base64) {
    return `data:${mimeType || 'image/png'};base64,${base64}`;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /** Prompt-base: troca só o cabelo, preserva identidade e cenário. */
  function buildPrompt(instruction, opts = {}) {
    const style = opts.styleName ? `Estilo pedido: ${opts.styleName}.` : '';
    const shape = opts.faceShape ? `Formato de rosto detectado: ${opts.faceShape}.` : '';
    const volume = opts.volume ? `Volume no topo: ${opts.volume}.` : '';
    return [
      'Edite a foto anexada aplicando APENAS o novo corte de cabelo na pessoa.',
      style, shape, volume,
      instruction ? `Ajuste solicitado pelo cliente: ${instruction}` : '',
      'Regras obrigatórias:',
      '- Preserve exatamente a identidade, o rosto, a pele, os olhos e a expressão da pessoa.',
      '- Mantenha o fundo, a iluminação e o enquadramento originais.',
      '- Não altere roupas, acessórios nem a barba, a menos que o cliente tenha pedido.',
      '- Resultado fotorrealista, com o cabelo bem recortado junto ao contorno da cabeça.',
      `- Proporção da imagem ${opts.aspectRatio || '3:4'}, retrato.`,
    ].filter(Boolean).join('\n');
  }

  // ---------------------------------------------------------------- chamada

  async function callGenerate({ parts, model }) {
    const cfg = getConfig();
    const useProxy = Boolean(cfg.endpoint);

    const url = useProxy ? cfg.endpoint : `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
    const headers = { 'Content-Type': 'application/json' };
    if (!useProxy) headers['x-goog-api-key'] = cfg.apiKey;

    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };
    // No modo direto o modelo vai na URL. Via proxy não há URL por modelo, então ele
    // segue no corpo — o proxy valida contra uma lista e usa esse valor.
    if (useProxy) payload.model = model;

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response;
      try {
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      } catch (networkError) {
        throw new NanoBananaError(
          `Não foi possível falar com o gerador de imagem: ${networkError.message}`,
          'network', { cause: String(networkError), url }
        );
      }

      const raw = await response.text();
      let body = null;
      if (raw) { try { body = JSON.parse(raw); } catch { body = { raw }; } }

      if (response.ok) return { body, url };

      // Bloqueio de segurança pode vir em HTTP 200 (tratado em extractResult) ou junto
      // com um status de erro. Nos dois casos o motivo importa mais que o código.
      if (body?.promptFeedback?.blockReason) {
        throw new NanoBananaError(
          `A imagem foi bloqueada (${body.promptFeedback.blockReason}). Tente outra foto, com o rosto todo visível e boa iluminação.`,
          'blocked',
          { status: response.status, blockReason: body.promptFeedback.blockReason, url, body }
        );
      }

      const detail = body?.error?.message || response.statusText || 'sem detalhe';
      lastError = new NanoBananaError(
        `O gerador de imagem respondeu ${response.status}: ${detail}`,
        response.status === 429 ? 'rate-limit' : 'http',
        { status: response.status, url, body }
      );

      if (RETRY_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(600 * attempt * attempt);   // backoff 600ms, 2.4s
        continue;
      }
      throw lastError;
    }
    throw lastError || new NanoBananaError('Falha desconhecida ao gerar imagem.', 'http');
  }

  /** Extrai { dataUrl, text } da resposta do Gemini, tolerando snake_case e camelCase. */
  function extractResult(body) {
    const promptFeedback = body?.promptFeedback;
    if (promptFeedback?.blockReason) {
      throw new NanoBananaError(
        `A imagem foi bloqueada (${promptFeedback.blockReason}). Tente outra foto, com o rosto todo visível e boa iluminação.`,
        'blocked', { blockReason: promptFeedback.blockReason, body }
      );
    }

    const candidate = body?.candidates?.[0];
    if (!candidate) {
      throw new NanoBananaError('A resposta não trouxe nenhum resultado.', 'bad-response', { body });
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      throw new NanoBananaError(
        `A geração terminou antes da hora (${candidate.finishReason}).`,
        'blocked', { finishReason: candidate.finishReason, body }
      );
    }

    let dataUrl = null;
    const texts = [];
    for (const part of candidate.content?.parts || []) {
      const inline = part.inline_data || part.inlineData;
      if (inline?.data) {
        dataUrl = toDataUrl(inline.mime_type || inline.mimeType, inline.data);
      } else if (part.text) {
        texts.push(part.text);
      }
    }

    if (!dataUrl) {
      throw new NanoBananaError(
        texts.length
          ? `O modelo respondeu só com texto: ${texts.join(' ').slice(0, 200)}`
          : 'O modelo não devolveu nenhuma imagem.',
        'no-image', { body }
      );
    }

    return { dataUrl, text: texts.join('\n').trim(), model: candidate.modelVersion || null };
  }

  // ---------------------------------------------------------------- API pública

  /**
   * Gera (ou edita) a imagem de try-on.
   * @param {object} o
   * @param {string} o.photoDataUrl  foto original do cliente (obrigatória)
   * @param {string} [o.baseDataUrl] resultado anterior, quando for uma edição
   * @param {string} [o.instruction] o que o cliente quer mudar
   * @param {object} [o.analysis]    { styleName, faceShape, volume }
   * @returns {Promise<{dataUrl:string, text:string, model:string|null}>}
   */
  async function generate(o) {
    if (!isConfigured()) {
      throw new NanoBananaError(
        'O gerador de imagem não está configurado. Abra ⚙️ Configurar IA e informe o proxy (ou, só para testar, uma chave).',
        'not-configured'
      );
    }

    const cfg = getConfig();
    const parts = [];

    const prompt = buildPrompt(o.instruction, {
      styleName: o.analysis?.styleName,
      faceShape: o.analysis?.faceShape,
      volume: o.analysis?.volume,
      aspectRatio: cfg.aspectRatio,
    });
    parts.push({ text: prompt });

    // Numa edição, a base é o resultado anterior; na primeira vez, a foto do cliente.
    const source = o.baseDataUrl || o.photoDataUrl;
    if (!source) {
      throw new NanoBananaError('Nenhuma foto disponível para gerar a simulação.', 'bad-response');
    }
    const { mimeType, data } = splitDataUrl(source);
    parts.push({ inline_data: { mime_type: mimeType, data } });

    const { body } = await callGenerate({ parts, model: cfg.model });
    const result = extractResult(body);
    return { ...result, prompt };
  }

  window.NanoBanana = {
    generate,
    isConfigured,
    mode,
    getConfig,
    saveConfig,
    clearConfig,
    buildPrompt,
    DEFAULT_MODEL,
    NanoBananaError,
  };
})();
