/*
 * nano-banana.js — integração com o Nano Banana (Gemini Image) do Google.
 *
 * "Nano Banana" é o apelido dos modelos de geração/edição de imagem do Gemini.
 * Este módulo roda SOMENTE no servidor (Node), então a chave de API nunca vai
 * para o navegador do cliente.
 *
 * Uso:
 *   const nanoBanana = require('./nano-banana');
 *   const imagem = await nanoBanana.gerarSimulacaoDeCorte({ fotoBase64, estilo, volume });
 *
 * Sem chave configurada (GEMINI_API_KEY) nada quebra: `ativo()` devolve false e
 * o site continua funcionando no modo demonstrativo de antes.
 *
 * Nenhuma dependência externa — usa apenas o fetch nativo do Node 18+.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Obs.: lidos por função (e não como constantes) porque o .env é carregado mais
// abaixo — se fossem constantes, o valor do arquivo nunca seria aplicado.

// Permite apontar para um proxy/espelho da API (útil em testes e em redes
// corporativas). O padrão é o endpoint oficial do Google.
function endpointBase() {
  return String(
    process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta/models'
  ).replace(/\/+$/, '');
}

function timeoutMs() {
  const valor = Number(process.env.GEMINI_TIMEOUT_MS || 90000);
  return Number.isFinite(valor) && valor > 1000 ? valor : 90000;
}

/* ------------------------------------------------------------------ */
/* Configuração (.env opcional)                                        */
/* ------------------------------------------------------------------ */

// Lê um .env simples da raiz do projeto sem precisar de dotenv.
// Linhas com # são comentários; aceita KEY=valor e KEY="valor".
function carregarEnv(arquivo) {
  const caminho = path.join(__dirname, arquivo || '.env');
  if (!fs.existsSync(caminho)) return;
  try {
    const linhas = fs.readFileSync(caminho, 'utf8').split(/\r?\n/);
    linhas.forEach((linha) => {
      const texto = linha.trim();
      if (!texto || texto.startsWith('#')) return;
      const igual = texto.indexOf('=');
      if (igual < 1) return;
      const chave = texto.slice(0, igual).trim();
      let valor = texto.slice(igual + 1).trim();
      if (/^(".*"|'.*')$/s.test(valor)) valor = valor.slice(1, -1);
      // O ambiente real sempre ganha do arquivo (útil em produção/Heroku).
      if (process.env[chave] === undefined) process.env[chave] = valor;
    });
  } catch (erro) {
    console.warn('[nano-banana] Não consegui ler o .env:', erro.message);
  }
}

carregarEnv(process.env.ENV_FILE || '.env');

function chaveApi() {
  return String(
    process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY || process.env.GOOGLE_AI_KEY || ''
  ).trim();
}

/*
 * Cadeia de modelos: o Google renomeou os modelos algumas vezes
 * (gemini-2.5-flash-image → gemini-3.1-flash-image, com/sem "-preview").
 * Tentamos em ordem até um responder, para o TCC não quebrar por nome antigo.
 */
function modelosDeImagem() {
  const forcado = String(process.env.NANO_BANANA_MODEL || '').trim();
  if (forcado) return [forcado];
  return [
    'gemini-3.1-flash-image-preview',
    'gemini-3.1-flash-image',
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'gemini-3-pro-image-preview'
  ];
}

function modeloDeTexto() {
  return String(process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash').trim();
}

function ativo() {
  return Boolean(chaveApi());
}

function statusPublico() {
  // Nada de chave aqui: só se a IA está ligada e qual modelo vai ser usado.
  return {
    ok: true,
    ativo: ativo(),
    servico: 'Nano Banana (Gemini Image)',
    modelo: ativo() ? modelosDeImagem()[0] : null,
    modeloChat: ativo() ? modeloDeTexto() : null
  };
}

/* ------------------------------------------------------------------ */
/* Chamada HTTP                                                        */
/* ------------------------------------------------------------------ */

/*
 * Erros que NÃO adianta repetir com outro modelo (chave errada, cota, bloqueio
 * de segurança). Repetir só queima tempo e crédito da API.
 */
const STATUS_TERMINAIS = new Set([
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION'
]);

class ErroNanoBanana extends Error {
  constructor(mensagem, codigo, detalhes, opcoes = {}) {
    super(mensagem);
    this.name = 'ErroNanoBanana';
    this.codigo = codigo || 500;
    this.detalhes = detalhes || null;
    // `terminal` = pare a cadeia de fallback; `tentavel` = vale tentar outro modelo.
    this.terminal = Boolean(opcoes.terminal);
    this.tentavel = !this.terminal;
  }
}

function erroTerminal(codigo, statusGoogle, mensagem) {
  if ([401, 403, 429].includes(codigo)) return true;
  if (STATUS_TERMINAIS.has(statusGoogle)) return true;
  // O Google responde 400/INVALID_ARGUMENT tanto para chave inválida quanto para
  // um parâmetro que aquele modelo não aceita. Só o primeiro caso é terminal.
  if (codigo === 400 && /api key|chave|not valid|inválid|invalid|permission|billing/i.test(mensagem)) {
    return true;
  }
  return false;
}

async function chamarGemini(modelo, corpo) {
  if (!ativo()) {
    throw new ErroNanoBanana(
      'IA não configurada: defina GEMINI_API_KEY no arquivo .env (veja NANO_BANANA.md).',
      503,
      null,
      { terminal: true }
    );
  }

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs());

  try {
    const resposta = await fetch(`${endpointBase()}/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': chaveApi()
      },
      body: JSON.stringify(corpo),
      signal: controlador.signal
    });

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch (erro) {
      dados = null;
    }

    if (!resposta.ok) {
      const mensagem =
        (dados && (dados.error?.message || dados.message)) ||
        `Falha na API do Gemini (HTTP ${resposta.status}).`;
      const statusGoogle = dados?.error?.status || null;
      throw new ErroNanoBanana(mensagem, resposta.status, statusGoogle, {
        terminal: erroTerminal(resposta.status, statusGoogle, mensagem)
      });
    }

    // Bloqueio de segurança do próprio Google (conteúdo impróprio, etc.)
    const bloqueio = dados?.promptFeedback?.blockReason;
    if (bloqueio) {
      throw new ErroNanoBanana(
        'A imagem foi bloqueada pelo filtro de segurança do Google (' + bloqueio + ').',
        400,
        bloqueio,
        { terminal: true }
      );
    }

    const candidato = dados?.candidates?.[0];
    const motivo = candidato?.finishReason;
    if (motivo && motivo !== 'STOP' && motivo !== 'MAX_TOKENS') {
      throw new ErroNanoBanana(`A geração terminou antes da hora (${motivo}).`, 400, motivo);
    }

    return { dados, partes: candidato?.content?.parts || [] };
  } catch (erro) {
    if (erro instanceof ErroNanoBanana) throw erro;
    if (erro.name === 'AbortError') {
      throw new ErroNanoBanana('Tempo esgotado aguardando a IA. Tente novamente.', 504);
    }
    throw new ErroNanoBanana('Não foi possível falar com a IA: ' + erro.message, 502);
  } finally {
    clearTimeout(timer);
  }
}

/* Tenta a mesma chamada em vários modelos, até algum funcionar. */
async function comFallbackDeModelo(construirCorpo, modelos) {
  const lista = modelos && modelos.length ? modelos : modelosDeImagem();
  let ultimoErro = null;

  for (const modelo of lista) {
    try {
      const resultado = await chamarGemini(modelo, construirCorpo(modelo));
      return { ...resultado, modelo };
    } catch (erro) {
      ultimoErro = erro;
      // Chave inválida, cota esgotada ou bloqueio de segurança: insistir em
      // outro modelo só gasta tempo e crédito.
      if (erro.terminal) break;
      console.warn(`[nano-banana] Modelo ${modelo} falhou (${erro.codigo}): ${erro.message}`);
    }
  }

  throw ultimoErro || new ErroNanoBanana('Nenhum modelo de imagem respondeu.', 502);
}

/* ------------------------------------------------------------------ */
/* Utilidades de imagem                                                */
/* ------------------------------------------------------------------ */

// Assinaturas em base64 dos formatos aceitos pelo Gemini.
// Serve para recusar lixo cedo (com 400) e para corrigir o mimeType declarado.
const ASSINATURAS = [
  { mime: 'image/jpeg', prefixos: ['/9j/'] },
  { mime: 'image/png', prefixos: ['iVBORw0KGgo', 'iVBORw'] },
  { mime: 'image/webp', prefixos: ['UklGR'] },
  { mime: 'image/gif', prefixos: ['R0lGO', 'R0lGOD'] },
  { mime: 'image/heic', prefixos: ['AAAAIGZ0eXB', 'AAAAHGZ0eXB'] },
  { mime: 'image/bmp', prefixos: ['Qk'] }
];

function mimePorAssinatura(base64) {
  const cabeca = base64.slice(0, 16);
  const achado = ASSINATURAS.find((formato) =>
    formato.prefixos.some((prefixo) => cabeca.startsWith(prefixo))
  );
  return achado ? achado.mime : null;
}

// Aceita data URL ("data:image/jpeg;base64,...") ou base64 puro.
// Devolve null quando não é uma imagem reconhecível.
function normalizarImagem(entrada) {
  const bruto = String(entrada || '').trim();
  if (!bruto) return null;

  const combinacao = bruto.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  const declarado = combinacao?.[1] || '';
  const dados = combinacao ? combinacao[3] : bruto;
  const limpo = dados.replace(/\s/g, '');

  if (!/^[A-Za-z0-9+/=]+$/.test(limpo)) return null;

  // ~12 MB de base64 ≈ 9 MB de imagem — mais que suficiente para um retrato.
  if (limpo.length > 16_000_000) return null;

  // Uma imagem de verdade nunca tem menos que isso em base64 (rejeita "oi",
  // textos soltos e campos vazios antes de gastar uma chamada na API).
  if (limpo.length < 64) return null;

  const real = mimePorAssinatura(limpo);
  if (!real) return null;

  // O navegador às vezes declara "image/jpeg" para um PNG; vale o que o arquivo é.
  return { mimeType: real, declarado: declarado || real, data: limpo };
}

function extrairImagem(partes) {
  for (const parte of partes) {
    const inline = parte.inlineData || parte.inline_data;
    if (inline?.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        base64: inline.data,
        dataUrl: `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`
      };
    }
  }
  return null;
}

function extrairTexto(partes) {
  return partes
    .map((parte) => parte.text || '')
    .join('\n')
    .trim();
}

// As proporções aceitas mudam por modelo; estas são as mais compatíveis.
const PROPORCOES_OK = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
function normalizarProporcao(valor) {
  const candidato = String(valor || '').trim();
  return PROPORCOES_OK.includes(candidato) ? candidato : '3:4';
}

/* ------------------------------------------------------------------ */
/* Prompts do negócio (barbearia)                                      */
/* ------------------------------------------------------------------ */

const VOLUMES = {
  1: 'muito baixo, cabelo curto no topo e laterais bem rentes',
  2: 'médio, topo com 3 a 5 cm e laterais em degradê',
  3: 'alto, topo cheio com franja com corpo e laterais controladas',
  4: 'muito alto, volume máximo no topo, estilo pompadour ou cachos soltos'
};

const ESTILOS = {
  'Executive Contour':
    'corte executive contour: acabamento polido, social e elegante, laterais aparadas na tesoura e topo alinhado para o lado',
  'Mid Fade Moderno':
    'corte mid fade moderno: degradê médio nas laterais, topo texturizado com movimento',
  'Buzz Cut com Degradê':
    'corte buzz cut com degradê: topo raspado bem curto e uniforme, laterais em degradê com contorno limpo',
  'Topo Texturizado':
    'corte com topo texturizado: fios desfiados com volume, laterais em degradê médio',
  'Pompadour Texturizado':
    'corte pompadour texturizado: topo alto penteado para trás com volume e textura, laterais em degradê',
  'Curly Top':
    'corte curly top: cachos soltos e volumosos no topo, laterais em degradê baixo respeitando o volume natural',
  'Corte Style Relo':
    'corte Style Relo da Style Relo Barber: degradê bem marcado nas laterais, topo com textura e finalização com brilho natural'
};

function descricaoEstilo(estilo) {
  return (
    ESTILOS[String(estilo || '').trim()] ||
    `corte masculino chamado "${String(estilo || 'personalizado').trim()}", com acabamento profissional de barbearia`
  );
}

function promptDeSimulacao({ estilo, tipo, volume, rosto, observacao }) {
  const partes = [
    'Edite esta foto criando uma simulação realista de corte de cabelo masculino.',
    `Aplique exatamente este estilo: ${descricaoEstilo(estilo)}.`,
    `Volume no topo: ${VOLUMES[Number(volume)] || VOLUMES[2]}.`
  ];

  if (tipo) partes.push(`Perfil do corte: ${tipo}.`);
  if (rosto) partes.push(`Formato de rosto detectado: ${rosto} — respeite essa proporção.`);
  if (observacao) partes.push(`Pedido extra do cliente: ${observacao}.`);

  partes.push(
    'Regras obrigatórias: mantenha o rosto, a identidade, a cor da pele, os olhos, o nariz, a boca, a barba, as orelhas, o corpo, a roupa, o fundo e a iluminação exatamente iguais aos da foto original.',
    'Altere apenas o cabelo. O resultado precisa parecer uma fotografia real feita na mesma sessão, sem efeito de desenho, sem distorções e sem artefatos.',
    'Não adicione texto, marca d\'água, logotipo, legendas nem molduras na imagem.'
  );

  return partes.join(' ');
}

const PERSONA_CHAT = [
  'Você é a Relo IA, consultora de visagismo da Style Relo Barber, uma barbearia em Curitiba (PR).',
  'Responde sempre em português do Brasil, com tom de amigo entendido de barbearia: simpático, direto e bem-humorado, no máximo 4 frases.',
  'Seja conversacional: varie o jeito de responder, NUNCA repita a mesma frase de uma resposta anterior da conversa, e quando fizer sentido termine com uma pergunta curta que puxe o próximo assunto (ex.: "quer ver com mais ou menos volume?").',
  'Use o contexto do cliente quando existir: se souber o tipo de cabelo, a densidade, o volume natural ou o formato do rosto dele, cite isso na resposta para ela parecer feita sob medida.',
  'Você ajuda o cliente a escolher corte, volume, barba e estilo conforme o formato do rosto e o tipo de cabelo.',
  'Preços de referência: Combo Style Relo (corte + barba + consultoria) R$ 90; Corte Style Relo R$ 45; pacote Dia do Noivo R$ 250.',
  'Agendamento pelo WhatsApp: https://wa.me/5541996484980.',
  'Quando fizer sentido, sugira o simulador de IA da página para o cliente ver o corte antes de agendar.',
  'Nunca invente preços, horários ou serviços diferentes desses.',
  'Não use markdown nem listas com asteriscos: texto corrido, pode usar HTML simples como <strong> e <a href="..."> quando útil.'
].join(' ');

/* ------------------------------------------------------------------ */
/* API pública do módulo                                               */
/* ------------------------------------------------------------------ */

/*
 * Gera a simulação do corte a partir da foto do cliente.
 * Retorna { modelo, imagem: { mimeType, base64, dataUrl }, comentario }.
 */
async function gerarSimulacaoDeCorte(opcoes = {}) {
  const foto = normalizarImagem(opcoes.fotoBase64 || opcoes.foto);
  if (!foto) {
    throw new ErroNanoBanana('Envie uma foto válida (JPEG ou PNG) para simular o corte.', 400);
  }

  const proporcao = normalizarProporcao(opcoes.proporcao);
  const prompt = promptDeSimulacao(opcoes);

  const resultado = await comFallbackDeModelo((modelo) => {
    const corpo = {
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: foto.mimeType, data: foto.data } }, { text: prompt }]
        }
      ]
    };

    // Modelos 3.x aceitam TEXT+IMAGE e o imageConfig; o 2.5 aceita só IMAGE.
    if (modelo.startsWith('gemini-2.5')) {
      corpo.generationConfig = { responseModalities: ['IMAGE'] };
    } else {
      corpo.generationConfig = {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: proporcao }
      };
    }
    return corpo;
  });

  const imagem = extrairImagem(resultado.partes);
  if (!imagem) {
    throw new ErroNanoBanana(
      'A IA respondeu sem imagem. Tente outra foto com o rosto bem visível.',
      502,
      extrairTexto(resultado.partes).slice(0, 300)
    );
  }

  return {
    ok: true,
    modelo: resultado.modelo,
    imagem,
    comentario: extrairTexto(resultado.partes).slice(0, 600)
  };
}

/*
 * Chat da Relo IA com um modelo de texto real.
 * `historico` = [{ papel: 'user'|'model', texto }] (opcional).
 */
async function conversar({ mensagem, historico = [], contexto = '' } = {}) {
  const texto = String(mensagem || '').trim().slice(0, 2000);
  if (!texto) throw new ErroNanoBanana('Escreva uma mensagem para a Relo IA.', 400);

  const systema = [PERSONA_CHAT, contexto && `Contexto atual do cliente: ${contexto}`]
    .filter(Boolean)
    .join('\n');

  const conteudos = historico
    .filter((turno) => turno && turno.texto)
    .slice(-8)
    .map((turno) => ({
      role: turno.papel === 'model' ? 'model' : 'user',
      parts: [{ text: String(turno.texto).slice(0, 2000) }]
    }));

  conteudos.push({ role: 'user', parts: [{ text: texto }] });

  const resultado = await chamarGemini(modeloDeTexto(), {
    systemInstruction: { parts: [{ text: systema }] },
    contents: conteudos,
    generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
  });

  const resposta = extrairTexto(resultado.partes);
  if (!resposta) throw new ErroNanoBanana('A IA não devolveu resposta. Tente de novo.', 502);

  return { ok: true, modelo: modeloDeTexto(), resposta };
}

/*
 * Análise de rosto por visão computacional (complementa o face-api.js).
 * Pede um JSON estruturado para o Gemini ler formato de rosto, simetria etc.
 */
async function analisarRosto({ fotoBase64 } = {}) {
  const foto = normalizarImagem(fotoBase64);
  if (!foto) throw new ErroNanoBanana('Envie uma foto válida para análise facial.', 400);

  const prompt = [
    'Analise esta foto de rosto para recomendação de corte de cabelo em barbearia.',
    'Responda SOMENTE com um JSON válido, sem markdown e sem texto fora do JSON, neste formato:',
    '{"formatoRosto":"Oval|Redondo|Quadrado|Alongado|Triangular|Diamante","simetria":"0 a 100","proporcaoFronte":"0 a 100","tipoCabelo":"liso|ondulado|cacheado|crespo","densidade":"baixa|media|alta","barba":"sem barba|por fazer|aparada|cheia","recomendacoes":[{"nome":"","tipo":"","motivo":""}],"analise":"frase curta explicando o que valoriza esse rosto"}',
    'Indique no máximo 3 recomendações de corte.'
  ].join('\n');

  const resultado = await comFallbackDeModelo(
    () => ({
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: foto.mimeType, data: foto.data } }, { text: prompt }]
        }
      ],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
    }),
    [modeloDeTexto(), 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
  );

  const bruto = extrairTexto(resultado.partes);
  const limpo = bruto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    const json = JSON.parse(limpo);
    return { ok: true, modelo: resultado.modelo, analise: json };
  } catch (erro) {
    throw new ErroNanoBanana('A IA devolveu uma análise em formato inesperado. Tente outra foto.', 502, bruto.slice(0, 300));
  }
}

module.exports = {
  ativo,
  statusPublico,
  gerarSimulacaoDeCorte,
  conversar,
  analisarRosto,
  // Validação barata para o servidor conferir a foto ANTES de gastar cota.
  fotoValida: (entrada) => Boolean(normalizarImagem(entrada)),
  ErroNanoBanana,
  // expostos para testes/depuração
  _interno: { normalizarImagem, promptDeSimulacao, carregarEnv, modelosDeImagem }
};
