// Relo IA — consultora de corte + simulação de imagem (Nano Banana).
//
// Fluxo:
//   1. O cliente captura a foto -> ia-camera.js chama window.ReloIA.startSimulation(...).
//   2. Este módulo gera a primeira imagem com o Nano Banana e posta no chat.
//   3. Cada mensagem seguinte do cliente vira uma EDIÇÃO daquela imagem: o resultado
//      anterior volta para o modelo junto com o pedido, e a nova imagem aparece no chat.
//
// O núcleo (nano-banana.js) não conhece o DOM; toda a apresentação fica aqui.
(function () {
  'use strict';

  var VOLUMES = {
    1: {
      nome: 'Baixo',
      desc: 'cabelo curto no topo, laterais bem rentes',
      cortes: ['Buzz Cut com Degradê', 'Executive Contour'],
      dica: 'Manutenção a cada 15 dias e finalização com pomada matte leve.'
    },
    2: {
      nome: 'Médio',
      desc: 'topo com 3 a 5 cm, laterais em degradê',
      cortes: ['Mid Fade Moderno', 'Executive Contour'],
      dica: 'Pomada de fixação média para manter movimento sem pesar.'
    },
    3: {
      nome: 'Alto',
      desc: 'topo cheio, franja com corpo e laterais controladas',
      cortes: ['Mid Fade Moderno', 'Topo Texturizado'],
      dica: 'Use spray de sal marinho + secador para levantar a raiz.'
    },
    4: {
      nome: 'Muito alto',
      desc: 'volume máximo no topo, tipo pompadour ou cachos soltos',
      cortes: ['Pompadour Texturizado', 'Curly Top'],
      dica: 'Leave-in ou creme de definição; evite degradê muito baixo para não achatar o formato.'
    }
  };

  var ROSTOS = {
    'Oval': 'Seu rosto é oval e aceita praticamente qualquer volume. Dá pra ousar sem medo.',
    'Redondo': 'Rosto redondo pede volume no topo e laterais mais baixas — isso alonga o visual.',
    'Quadrado': 'Rosto quadrado tem mandíbula marcada: volume médio e contorno limpo valorizam os traços.',
    'Alongado': 'Rosto alongado fica melhor com volume moderado no topo e um pouco mais de peso nas laterais.'
  };

  var vol = 2;
  var chatBody, chatInput;
  var generating = false;

  /**
   * Estado da simulação atual.
   * photoDataUrl  -> a foto original do cliente (nunca muda)
   * currentDataUrl-> o último resultado gerado (base da próxima edição)
   * analysis      -> { styleName, faceShape }
   * edits         -> quantas alterações o cliente já pediu
   */
  var simulation = null;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function analise() {
    return (typeof window !== 'undefined' && window.currentAnalysis) || null;
  }

  function shapeName() {
    var a = analise();
    return a && a.shapeName ? a.shapeName : null;
  }

  function scrollToEnd() {
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  }

  /** Mensagem de texto. `quem` = 'ia' | 'user'. */
  function add(texto, quem) {
    if (!chatBody) return null;
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (quem === 'user' ? 'from-user' : 'from-ia');
    el.innerHTML = texto;
    chatBody.appendChild(el);
    scrollToEnd();
    return el;
  }

  /** Mensagem com a imagem gerada. */
  function addImage(dataUrl, legenda, quem) {
    if (!chatBody) return null;
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (quem === 'user' ? 'from-user' : 'from-ia');

    if (legenda) {
      var cap = document.createElement('div');
      cap.innerHTML = legenda;
      el.appendChild(cap);
    }

    var img = document.createElement('img');
    img.className = 'nb-img';
    img.src = dataUrl;
    img.alt = 'Simulação de corte gerada pela IA';
    el.appendChild(img);

    chatBody.appendChild(el);
    scrollToEnd();
    return el;
  }

  /** Indicador "gerando…" que fica até a imagem chegar. Retorna a função que remove. */
  function showBusy(texto) {
    if (!chatBody) return function () {};
    var el = document.createElement('div');
    el.className = 'chat-msg from-ia chat-typing';
    el.textContent = texto;
    chatBody.appendChild(el);
    scrollToEnd();
    return function () { el.remove(); };
  }

  function digitando(cb) {
    var done = showBusy('Relo IA está digitando...');
    setTimeout(function () {
      done();
      cb();
    }, 500);
  }

  // ------------------------------------------------------------- recomendação textual

  function recomendacao() {
    var v = VOLUMES[vol];
    var forma = shapeName();
    var txt = '<strong>Volume ' + v.nome.toLowerCase() + '</strong> — ' + v.desc + '.<br>';
    if (forma) {
      txt += (ROSTOS[forma] || '') + '<br>';
      if (forma === 'Redondo' && vol < 2) {
        txt += '⚠️ Com rosto redondo, volume baixo demais tende a arredondar mais o visual. Sugiro subir para médio.<br>';
      }
      if (forma === 'Alongado' && vol > 3) {
        txt += '⚠️ Volume muito alto pode alongar ainda mais o rosto. Médio costuma cair melhor.<br>';
      }
    } else {
      txt += 'Dica: use a câmera ou suba uma foto ali do lado que eu ajusto a recomendação ao formato do seu rosto.<br>';
    }
    txt += 'Cortes que combinam: <strong>' + v.cortes.join('</strong>, <strong>') + '</strong>.<br>';
    txt += '💡 ' + v.dica;
    return txt;
  }

  function responder(msg) {
    var t = msg.toLowerCase();

    if (/(pre[çc]o|valor|quanto custa|custa|tabela)/.test(t)) {
      return 'O Combo Style Relo (corte + barba + consultoria de visagismo) sai por <strong>R$ 90</strong>. Tem a tabela completa em <a href="servicos.html">Serviços</a>.';
    }
    if (/(agendar|hor[áa]rio|marcar|reservar|whats)/.test(t)) {
      return 'Bora! Você agenda direto pelo <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a> ou pela página de <a href="contato.html">Contato</a>.';
    }
    if (/(volume|cheio|alto|baixo|arma[çc][ãa]o|topo)/.test(t)) {
      if (/muito alto|bem alto|m[áa]ximo/.test(t)) setVol(4);
      else if (/alto/.test(t)) setVol(3);
      else if (/baixo|curto|rente/.test(t)) setVol(1);
      else if (/m[ée]dio/.test(t)) setVol(2);
      return recomendacao();
    }
    if (/(rosto|formato|cara|queixo|testa)/.test(t)) {
      var f = shapeName();
      if (!f) return 'Ainda não analisei seu rosto. Clique em <strong>📷 Usar câmera</strong> (ou envie uma foto) e eu leio o formato pra te indicar o corte certo.';
      return 'Seu rosto foi lido como <strong>' + f + '</strong>. ' + (ROSTOS[f] || '') + '<br>' + recomendacao();
    }
    if (/(cacho|crespo|ondulado|frizz)/.test(t)) {
      return 'Cabelo com cacho segura volume naturalmente: peça um <strong>topo texturizado com degradê médio</strong> e finalize com creme de definição. Evite raspar demais as laterais, senão o topo fica desproporcional.';
    }
    if (/(barba|bigode)/.test(t)) {
      return 'A barboterapia inclui navalha, toalha quente e hidratação. Se você escolher volume alto no topo, uma barba mais aparada equilibra o conjunto.';
    }
    if (/(entrada|calv[íi]cie|careca|ralo|fino)/.test(t)) {
      return 'Com entradas ou fio mais fino, o melhor caminho é <strong>volume baixo a médio com degradê</strong>: disfarça a linha do cabelo e dá densidade visual. Buzz Cut com degradê também é uma opção forte.';
    }
    if (/(manuten[çc][ãa]o|quanto tempo|voltar)/.test(t)) {
      return 'Degradês pedem manutenção a cada 15 dias. Cortes com volume médio/alto aguentam de 3 a 4 semanas.';
    }
    if (/(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[ií])/.test(t)) {
      return 'Fala! 👋 Me conta: você quer o cabelo com pouco volume, médio ou bem cheio no topo?';
    }
    if (/(recomend|sugest|indica|qual corte|melhor corte)/.test(t)) {
      return recomendacao();
    }
    return 'Posso te ajudar com: <strong>volume do corte</strong>, formato de rosto, cabelo cacheado, entradas, barba, preços e agendamento. Sobre o que você quer falar?';
  }

  /** Perguntas que merecem resposta em texto mesmo durante a simulação. */
  function isFaq(msg) {
    var t = msg.toLowerCase();
    return /(pre[çc]o|valor|quanto custa|custa|tabela|agendar|hor[áa]rio|marcar|reservar|whats|manuten[çc][ãa]o)/.test(t);
  }

  function setVol(v) {
    vol = v;
    document.querySelectorAll('[data-volume]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-volume')) === vol);
    });
    var label = document.getElementById('volume-label');
    if (label) label.textContent = VOLUMES[vol].nome + ' — ' + VOLUMES[vol].desc;
  }

  // ------------------------------------------------------------- geração de imagem

  function nbApi() {
    return window.NanoBanana || null;
  }

  function analysisForPrompt() {
    // A análise que veio junto com a foto tem prioridade sobre window.currentAnalysis:
    // no fluxo de upload de arquivo não existe detecção facial, e o formato informado
    // por quem chamou não pode ser descartado.
    var a = (simulation && simulation.analysis) || {};
    return {
      styleName: a.styleName || null,
      faceShape: a.faceShape || shapeName(),
      volume: VOLUMES[vol].nome,
    };
  }

  /**
   * Gera a primeira simulação a partir da foto capturada e posta no chat.
   * Chamado por ia-camera.js (e pelo upload de foto).
   */
  async function startSimulation(photoDataUrl, analysis) {
    var api = nbApi();
    if (!api) {
      add('Não consegui carregar o gerador de imagem. Recarregue a página.', 'ia');
      return null;
    }
    if (!api.isConfigured()) {
      add(
        'Sua foto foi analisada ✅ — rosto lido como <strong>' +
        escapeHtml((analysis && analysis.faceShape) || shapeName() || 'não identificado') +
        '</strong>.<br>Para eu <strong>desenhar o corte na sua foto</strong>, clique em ' +
        '<strong>⚙️ Configurar IA</strong> aí em cima e conecte o Nano Banana.',
        'ia'
      );
      return null;
    }

    simulation = {
      photoDataUrl: photoDataUrl,
      currentDataUrl: null,
      analysis: analysis || {},
      edits: 0,
    };

    var done = showBusy('🍌 Desenhando o corte na sua foto…');
    try {
      var result = await api.generate({
        photoDataUrl: photoDataUrl,
        analysis: analysisForPrompt(),
      });
      simulation.currentDataUrl = result.dataUrl;

      done();
      var nome = (analysis && analysis.styleName) || 'o corte sugerido';
      addImage(
        result.dataUrl,
        'Prontinho! Simulei <strong>' + escapeHtml(nome) + '</strong> na sua foto com volume <strong>' +
        escapeHtml(VOLUMES[vol].nome.toLowerCase()) + '</strong>.<br>' +
        'Quer mudar alguma coisa? É só escrever — “deixa mais curto”, “aumenta o volume”, “coloca barba”…'
      );
      if (result.text) add(escapeHtml(result.text), 'ia');
      return result;
    } catch (error) {
      done();
      reportError(error);
      return null;
    }
  }

  /** Edita a simulação atual a partir de um pedido do cliente. */
  async function applyEdit(instruction) {
    var api = nbApi();
    if (!api || !simulation || !simulation.currentDataUrl) return null;

    var done = showBusy('🍌 Aplicando a mudança…');
    generating = true;
    try {
      var result = await api.generate({
        photoDataUrl: simulation.photoDataUrl,
        baseDataUrl: simulation.currentDataUrl,   // <- itera sobre o resultado anterior
        instruction: instruction,
        analysis: analysisForPrompt(),
      });
      simulation.currentDataUrl = result.dataUrl;
      simulation.edits += 1;

      done();
      addImage(
        result.dataUrl,
        'Ajustado: <strong>' + escapeHtml(instruction) + '</strong> ' +
        '(versão ' + (simulation.edits + 1) + '). Quer mais alguma coisa?'
      );
      if (result.text) add(escapeHtml(result.text), 'ia');
      return result;
    } catch (error) {
      done();
      reportError(error);
      return null;
    } finally {
      generating = false;
    }
  }

  function reportError(error) {
    console.error('Nano Banana:', error);
    var kind = error && error.kind;
    var msg;

    if (kind === 'not-configured') {
      msg = 'O gerador de imagem não está conectado. Clique em <strong>⚙️ Configurar IA</strong> para ativar.';
    } else if (kind === 'blocked') {
      msg = 'A imagem foi recusada pelo modelo. ' + escapeHtml(error.message) +
        '<br>Tente uma foto com o rosto inteiro visível, de frente e bem iluminada.';
    } else if (kind === 'rate-limit') {
      msg = 'Muitas gerações em seguida. Espera uns segundos e pede de novo. ' +
        '<br><small>' + escapeHtml(error.message) + '</small>';
    } else if (kind === 'network') {
      msg = 'Não consegui falar com o gerador de imagem — parece falta de conexão. ' +
        '<br><small>' + escapeHtml(error.message) + '</small>';
    } else {
      msg = 'Não consegui gerar a imagem. ' + escapeHtml(error && error.message ? error.message : 'Erro desconhecido.');
    }

    add('⚠️ ' + msg, 'ia');
  }

  // ------------------------------------------------------------- envio

  async function enviar(msg) {
    if (!msg.trim()) return;
    if (generating) {
      add('Calma, ainda estou gerando a imagem anterior. 😉', 'ia');
      return;
    }

    add(escapeHtml(msg), 'user');

    // Com simulação ativa, a mensagem vira pedido de edição — exceto FAQ, que responde em texto.
    if (simulation && simulation.currentDataUrl && nbApi() && nbApi().isConfigured() && !isFaq(msg)) {
      await applyEdit(msg.trim());
      return;
    }

    digitando(function () {
      add(responder(msg), 'ia');
    });
  }

  /** ia-camera.js chama isto depois de configurar window.currentAnalysis. */
  function onConfigChanged() {
    if (window.NanoBananaUI && window.NanoBananaUI.refreshStatus) window.NanoBananaUI.refreshStatus();
  }

  function resetSimulation() {
    simulation = null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    chatBody = document.getElementById('chat-body');
    chatInput = document.getElementById('chat-input');
    if (!chatBody) return;

    document.querySelectorAll('[data-volume]').forEach(function (b) {
      b.addEventListener('click', function () {
        setVol(Number(b.getAttribute('data-volume')));
        digitando(function () {
          add(recomendacao(), 'ia');
        });
      });
    });
    setVol(2);

    var form = document.getElementById('chat-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var value = chatInput.value;
        chatInput.value = '';
        enviar(value);
      });
    }

    document.querySelectorAll('[data-chat-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        enviar(b.getAttribute('data-chat-quick'));
      });
    });

    add('Fala! Sou a <strong>Relo IA</strong>, consultora de corte da Style Relo Barber. Escolha o <strong>volume</strong> que você quer no topo aí em cima, ou me pergunte qualquer coisa sobre o seu corte.', 'ia');

    if (window.NanoBananaUI && window.NanoBananaUI.refreshStatus) window.NanoBananaUI.refreshStatus();
  });

  // API usada pelos outros módulos (ia-camera.js, script.js, nano-banana-ui.js).
  window.ReloIA = {
    startSimulation: startSimulation,
    applyEdit: applyEdit,
    resetSimulation: resetSimulation,
    getSimulation: function () { return simulation; },
    isGenerating: function () { return generating; },
    postMessage: add,
    postImage: addImage,
    setVol: setVol,
    getVol: function () { return vol; },
    onConfigChanged: onConfigChanged,
  };
})();
