/*
 * ia-tryon.js — controla a página "Experimente com IA" (ia-tryon.html).
 *
 * O simulador funciona 100% no navegador, sem chave de API e sem chamadas
 * externas: a leitura do rosto vem do face-api (ia-camera.js) e a
 * recomendação de corte é montada aqui em cima do estilo escolhido.
 *
 * Este arquivo existe para consertar dois problemas antigos da página:
 *   1. Os botões de estilo não faziam NADA ao serem clicados (UI morta).
 *   2. O card "Combinação encontrada" (com a análise facial e o botão de
 *      WhatsApp) nunca era exibido, nem depois de capturar a foto.
 */
(function () {
  'use strict';

  var WHATSAPP = 'https://wa.me/5541996484980';

  // Corte sugerido para cada formato de rosto lido pelo face-api.
  var POR_ROSTO = {
    'Oval': 'Executive Contour',
    'Redondo': 'Mid Fade Moderno',
    'Quadrado': 'Buzz Cut com Degradê',
    'Alongado': 'Executive Contour',
    'Triangular': 'Mid Fade Moderno',
    'Diamante': 'Mid Fade Moderno'
  };

  var VOLUMES = { 1: 'baixo', 2: 'médio', 3: 'alto', 4: 'muito alto' };

  function $(id) {
    return document.getElementById(id);
  }

  function mostrar(el, visivel) {
    if (!el) return;
    el.classList.toggle('hidden', !visivel);
  }

  function aviso(texto, tipo) {
    var caixa = $('ia-aviso');
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'ia-aviso ' + (tipo || 'info');
    mostrar(caixa, Boolean(texto));
  }

  function volumeAtual() {
    var ativo = document.querySelector('.volume-btn.is-active');
    return ativo ? Number(ativo.getAttribute('data-volume')) || 2 : 2;
  }

  function estiloMarcado() {
    return document.querySelector('.style-option.is-active');
  }

  function analise() {
    return window.currentAnalysis || null;
  }

  function temFoto() {
    var foto = $('user-photo');
    return Boolean(foto && foto.src && foto.src.indexOf('data:image') === 0);
  }

  function marcarEstilo(nome) {
    document.querySelectorAll('.style-option').forEach(function (botao) {
      botao.classList.toggle('is-active', botao.getAttribute('data-style-name') === nome);
    });
  }

  function descreverAnalise(a) {
    if (!a) return '';
    var partes = [];
    if (a.shapeName) partes.push('rosto ' + a.shapeName);
    if (a.symmetry) partes.push('simetria ' + a.symmetry);
    if (a.foreheadRatio) partes.push('testa ' + a.foreheadRatio);
    if (a.confidence) partes.push('confiança ' + a.confidence + '%');
    return partes.join(', ');
  }

  // Preenche o card final e liga o botão do WhatsApp com o corte escolhido.
  function mostrarResultado(nome, tipo, motivo) {
    if (!nome) return;

    var resNome = $('res-nome');
    var resTipo = $('res-tipo');
    if (resNome) resNome.textContent = nome;
    if (resTipo) resTipo.textContent = tipo || 'personalizado';

    var textoAnalise = $('analysis-text');
    var caixaAnalise = $('analysis-details');
    var descricao = descreverAnalise(analise());
    if (textoAnalise) {
      textoAnalise.textContent = descricao || 'análise ainda não realizada — use a câmera para ler o formato do rosto';
    }
    if (caixaAnalise) caixaAnalise.style.display = descricao ? 'block' : 'none';

    var cta = $('result-cta');
    if (cta) {
      var mensagem =
        'Olá! Usei o simulador do Style Relo Barber e quero agendar o corte ' +
        nome + ' (volume ' + (VOLUMES[volumeAtual()] || 'médio') + ').' +
        (motivo ? ' ' + motivo : '');
      cta.href = WHATSAPP + '?text=' + encodeURIComponent(mensagem);
    }

    var card = $('final-card');
    mostrar(card, true);
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function falarNoChat(html) {
    if (window.ReloChat && typeof window.ReloChat.falar === 'function') {
      window.ReloChat.falar(html);
    }
  }

  function escolherEstilo(botao) {
    var nome = botao.getAttribute('data-style-name');
    var tipo = botao.getAttribute('data-style-type');
    marcarEstilo(nome);

    var a = analise();
    var motivo = a && a.shapeName ? 'Meu rosto foi lido como ' + a.shapeName + '.' : '';
    mostrarResultado(nome, tipo, motivo);

    if (!temFoto()) {
      aviso(
        'Recomendação pronta! Dica: suba uma foto ou use a 📷 câmera para eu ler o formato do seu rosto e ajustar essa sugestão.',
        'info'
      );
    } else {
      aviso('Combinação montada com a sua foto e o volume escolhido. É só agendar quando quiser. ✅', 'sucesso');
    }

    falarNoChat(
      'Anotei seu interesse no <strong>' + nome + '</strong> com volume <strong>' +
      (VOLUMES[volumeAtual()] || 'médio') + '</strong>.' +
      (a && a.shapeName ? ' Para o seu rosto <strong>' + a.shapeName + '</strong>, é uma ótima escolha.' : '') +
      ' O resultado aparece no card <em>Combinação encontrada</em> aqui do lado. 💈'
    );
  }

  // Depois de capturar a foto (ia-camera.js), sugere o corte do formato lido.
  function aplicarAnalise(a) {
    if (!a) return;

    var sugerido = POR_ROSTO[a.shapeName] || 'Corte Style Relo';
    var botao = document.querySelector('.style-option[data-style-name="' + sugerido + '"]');
    var nome = sugerido;
    var tipo = 'personalizado';

    if (botao) {
      nome = botao.getAttribute('data-style-name');
      tipo = botao.getAttribute('data-style-type');
      marcarEstilo(nome);
    }

    mostrarResultado(nome, tipo, 'Rosto lido como ' + (a.shapeName || 'não identificado') + '.');
    aviso('Análise concluída! ' + (a.analysis || 'Veja a sugestão no card abaixo.'), 'sucesso');

    falarNoChat(
      '📊 ' + (a.analysis || 'Analisei sua foto.') +
      '<br>O corte que mais combina com o seu rosto ficou marcado como <strong>' + nome + '</strong>.'
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    var botoes = document.querySelectorAll('.style-option');
    if (!botoes.length) return;

    botoes.forEach(function (botao) {
      botao.addEventListener('click', function () {
        escolherEstilo(botao);
      });
    });

    // Nova foto (upload ou câmera): limpa o resultado anterior.
    window.addEventListener('relo:nova-foto', function () {
      mostrar($('final-card'), false);
      document.querySelectorAll('.style-option').forEach(function (botao) {
        botao.classList.remove('is-active');
      });
      var campoAnalise = $('analysis-text');
      if (campoAnalise) campoAnalise.textContent = '';
      var caixaAnalise = $('analysis-details');
      if (caixaAnalise) caixaAnalise.style.display = 'none';
    });

    // Análise facial pronta (câmera): mostra o resultado na hora.
    window.addEventListener('relo:analise', function (evento) {
      aplicarAnalise(evento.detail || window.currentAnalysis);
    });
  });
})();
