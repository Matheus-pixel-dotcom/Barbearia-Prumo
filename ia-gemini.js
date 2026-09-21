/*
 * ia-gemini.js — ponte entre o site e o Nano Banana (Gemini Image).
 *
 * Este arquivo roda no navegador e NÃO conhece a chave de API: ele só chama as
 * rotas /api/ia/* do server.js, que é quem guarda a chave (GEMINI_API_KEY).
 *
 * Se o servidor não estiver no ar, ou se a chave ainda não foi configurada,
 * nada quebra: o site avisa que está em "modo demonstrativo" e continua
 * funcionando exatamente como antes.
 *
 * Páginas atendidas:
 *   ia-tryon.html          → simulação de corte na foto + religa os botões de estilo
 *   face-recognition.html  → prévia do corte recomendado após capturar o rosto
 */
(function () {
  'use strict';

  var VERSAO = '1.0';
  var estado = { carregado: false, ativo: false, modelo: null, erro: null };
  var gerando = false;
  var ultimaImagem = null;

  /* ---------------------------------------------------------------- */
  /* Cliente da API                                                    */
  /* ---------------------------------------------------------------- */

  function api(caminho, opcoes) {
    return fetch(caminho, opcoes)
      .then(function (resposta) {
        return resposta.json().catch(function () {
          return { ok: false, erro: 'Resposta inválida do servidor (HTTP ' + resposta.status + ').' };
        });
      })
      .then(function (corpo) {
        if (!respostaOk(corpo)) throw new Error(corpo.erro || 'Falha na IA.');
        return corpo;
      });
  }

  function respostaOk(corpo) {
    return Boolean(corpo && corpo.ok);
  }

  function post(caminho, dados) {
    return api(caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados || {})
    });
  }

  var ReloIA = {
    versao: VERSAO,

    // GET /api/ia/status — descobre se o Nano Banana está ligado
    status: function (forcar) {
      if (estado.carregado && !forcar) return Promise.resolve(estado);
      return api('/api/ia/status', { method: 'GET' })
        .then(function (corpo) {
          estado = { carregado: true, ativo: Boolean(corpo.ativo), modelo: corpo.modelo, erro: null };
          return estado;
        })
        .catch(function (erro) {
          // Servidor fora do ar (site aberto direto do arquivo, GitHub Pages...).
          estado = {
            carregado: true,
            ativo: false,
            modelo: null,
            erro: erro.message || 'Servidor da IA indisponível.'
          };
          return estado;
        });
    },

    // Gera a foto do cliente com o corte escolhido
    simular: function (parametros) {
      return post('/api/ia/simular', parametros);
    },

    // Relo IA por texto (chat)
    chat: function (mensagem, historico, contexto) {
      return post('/api/ia/chat', { mensagem: mensagem, historico: historico, contexto: contexto });
    },

    // Análise facial por visão computacional
    analisar: function (fotoBase64) {
      return post('/api/ia/analisar', { fotoBase64: fotoBase64 });
    }
  };

  window.ReloIA = ReloIA;

  /* ---------------------------------------------------------------- */
  /* Utilidades de interface                                           */
  /* ---------------------------------------------------------------- */

  function $(id) {
    return document.getElementById(id);
  }

  function mostrar(el, visivel) {
    if (!el) return;
    el.classList.toggle('hidden', !visivel);
  }

  // Lê o volume marcado nos botões (quem marca é o chat-ia.js).
  function volumeAtual() {
    var ativoEl = document.querySelector('.volume-btn.is-active');
    return ativoEl ? Number(ativoEl.getAttribute('data-volume')) || 2 : 2;
  }

  function formatoDeRosto() {
    var analise = window.currentAnalysis;
    return analise && analise.shapeName ? analise.shapeName : null;
  }

  function aviso(texto, tipo) {
    var caixa = $('ia-aviso');
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.className = 'ia-aviso ' + (tipo || 'info');
    mostrar(caixa, Boolean(texto));
  }

  function seloStatus(st) {
    var selo = $('ia-status-selo');
    if (!selo) return;
    if (st.ativo) {
      selo.className = 'ia-selo ia-selo-on';
      selo.innerHTML = '<span class="ia-selo-dot"></span> Nano Banana ativo · ' + (st.modelo || 'Gemini');
      selo.title = 'Gerando imagens reais com a IA do Google (Nano Banana).';
    } else {
      selo.className = 'ia-selo ia-selo-off';
      selo.innerHTML = '<span class="ia-selo-dot"></span> IA em modo demonstrativo';
      selo.title = st.erro
        ? 'Servidor da IA indisponível: ' + st.erro
        : 'Configure GEMINI_API_KEY no .env para gerar imagens reais (veja NANO_BANANA.md).';
    }
  }

  function carregando(ligado, mensagem) {
    gerando = ligado;
    var overlay = $('ia-overlay');
    var rotulo = overlay ? overlay.querySelector('strong') : null;
    if (rotulo && mensagem) rotulo.textContent = mensagem;
    mostrar(overlay, ligado);

    document.querySelectorAll('[data-style-option]').forEach(function (botao) {
      botao.disabled = ligado;
    });
    var gerar = $('gerar-simulacao');
    if (gerar) gerar.disabled = ligado;
    document.body.style.cursor = ligado ? 'progress' : '';
  }

  /* ---------------------------------------------------------------- */
  /* ia-tryon.html — simulação de corte na foto                        */
  /* ---------------------------------------------------------------- */

  function fotoAtual() {
    var foto = $('user-photo');
    if (foto && foto.src && foto.src.startsWith('data:image')) return foto.src;
    return null;
  }

  function exibirResultado(resultado, estilo, tipo) {
    ultimaImagem = resultado.imagem;

    var img = $('resultado-img');
    var antes = $('resultado-antes');
    var fotoOriginal = fotoAtual() || '';
    if (img) {
      img.src = resultado.imagem.dataUrl;
      img.alt = 'Simulação gerada por IA do corte ' + (estilo || 'escolhido');
      mostrar(img, true);
    }
    if (antes) antes.src = fotoOriginal;

    // Comparação lado a lado "antes / depois".
    var compAntes = $('comparador-antes');
    var compDepois = $('comparador-depois');
    if (compAntes) compAntes.src = fotoOriginal;
    if (compDepois) compDepois.src = resultado.imagem.dataUrl;

    mostrar($('resultado-card'), true);

    var legenda = $('resultado-legenda');
    if (legenda) {
      legenda.textContent =
        (estilo || 'Corte') +
        ' · volume ' + volumeAtual() +
        ' · gerado por ' + (resultado.modelo || 'Nano Banana');
    }

    // Card final já existente na página (estava sem função — agora preenche).
    var finalCard = $('final-card');
    if (finalCard) {
      var nome = $('res-nome');
      var tipoEl = $('res-tipo');
      if (nome) nome.textContent = estilo || 'o estilo escolhido';
      if (tipoEl) tipoEl.textContent = tipo || 'personalizado';

      var comentario = $('res-comentario');
      if (comentario) {
        comentario.textContent = resultado.comentario || '';
        mostrar(comentario, Boolean(resultado.comentario));
      }

      var analiseEl = $('analysis-text');
      var caixaAnalise = $('analysis-details');
      if (analiseEl && window.currentAnalysis) {
        var a = window.currentAnalysis;
        analiseEl.textContent =
          'rosto ' + (a.shapeName || 'não identificado') +
          ', simetria ' + (a.symmetry || '-') +
          ', confiança ' + (a.confidence || '-') + '%';
        if (caixaAnalise) caixaAnalise.style.display = 'block';
      }

      // O botão de agendar já vai com o corte escolhido na mensagem do WhatsApp.
      var cta = $('result-cta');
      if (cta) {
        var mensagem =
          'Olá! Usei o simulador de IA do Style Relo Barber e quero agendar o corte ' +
          (estilo || 'sugerido') +
          ' (volume ' + volumeAtual() + '). Vi a prévia gerada pela IA e gostei do resultado.';
        cta.href = 'https://wa.me/5541996484980?text=' + encodeURIComponent(mensagem);
      }

      mostrar(finalCard, true);
      if (typeof finalCard.scrollIntoView === 'function') {
        finalCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    aviso(
      'Imagem gerada por inteligência artificial (Nano Banana). É uma simulação ilustrativa: o resultado real depende do seu cabelo e do barbeiro.',
      'sucesso'
    );
  }

  function gerar(estilo, tipo) {
    if (gerando) return;

    var foto = fotoAtual();
    if (!foto) {
      aviso('Primeiro envie uma foto ou use a câmera — sem foto a IA não tem o que simular.', 'erro');
      return;
    }

    if (!estado.ativo) {
      aviso(
        'A IA ainda não está ligada neste servidor. Crie sua chave grátis em https://aistudio.google.com/apikey, cole no arquivo .env e reinicie o servidor (npm run serve). Passo a passo em NANO_BANANA.md.',
        'erro'
      );
      return;
    }

    document.querySelectorAll('[data-style-option]').forEach(function (botao) {
      var ehEste = botao.getAttribute('data-style-name') === estilo;
      botao.classList.toggle('is-active', ehEste);
    });

    carregando(true, 'Nano Banana está simulando o corte...');
    aviso('', 'info');

    ReloIA.simular({
      fotoBase64: foto,
      estilo: estilo,
      tipo: tipo,
      volume: volumeAtual(),
      rosto: formatoDeRosto(),
      proporcao: '3:4'
    })
      .then(function (resultado) {
        exibirResultado(resultado, estilo, tipo);
      })
      .catch(function (erro) {
        aviso('Não deu para gerar a simulação: ' + erro.message, 'erro');
      })
      .finally(function () {
        carregando(false);
      });
  }

  function baixarImagem() {
    if (!ultimaImagem || !ultimaImagem.dataUrl) return;
    var extensao = /png/i.test(ultimaImagem.mimeType) ? 'png' : 'jpg';
    var link = document.createElement('a');
    link.href = ultimaImagem.dataUrl;
    link.download = 'simulacao-style-relo.' + extensao;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function ligarTryOn() {
    if (!$('drop-area')) return;

    var botoes = document.querySelectorAll('.style-option');
    botoes.forEach(function (botao) {
      botao.setAttribute('data-style-option', '');
      botao.addEventListener('click', function () {
        gerar(
          botao.getAttribute('data-style-name'),
          botao.getAttribute('data-style-type')
        );
      });
    });

    var gerarBtn = $('gerar-simulacao');
    if (gerarBtn) {
      gerarBtn.addEventListener('click', function () {
        var marcado = document.querySelector('[data-style-option].is-active');
        gerar(
          marcado ? marcado.getAttribute('data-style-name') : 'Corte Style Relo',
          marcado ? marcado.getAttribute('data-style-type') : 'Assinatura da casa'
        );
      });
    }

    var baixar = $('baixar-simulacao');
    if (baixar) baixar.addEventListener('click', baixarImagem);

    // Alternar antes/depois segurando o botão (ou clicando, no celular).
    var alternar = $('alternar-antes');
    if (alternar) {
      var verAntes = false;
      var aplicar = function () {
        mostrar($('resultado-antes'), verAntes);
        mostrar($('resultado-img'), !verAntes);
        alternar.textContent = verAntes ? 'Ver depois (IA)' : 'Ver antes (foto original)';
      };
      alternar.addEventListener('click', function () {
        verAntes = !verAntes;
        aplicar();
      });
      aplicar();
    }

    // Ao trocar de foto, esconde o resultado antigo.
    var reset = $('reset-btn');
    if (reset) {
      reset.addEventListener('click', function () {
        ultimaImagem = null;
        mostrar($('resultado-card'), false);
        aviso('', 'info');
        document.querySelectorAll('[data-style-option]').forEach(function (b) {
          b.classList.remove('is-active');
        });
      });
    }

    ReloIA.status().then(seloStatus);
  }

  /* ---------------------------------------------------------------- */
  /* face-recognition.html — prévia do corte após capturar             */
  /* ---------------------------------------------------------------- */

  function ligarReconhecimento() {
    if (!$('capture-btn') || !$('recommendations-list')) return;

    var foto = null;

    // Guarda a foto capturada para poder gerar a prévia.
    document.addEventListener('rostoCapturado', function (evento) {
      foto = evento.detail && evento.detail.foto ? evento.detail.foto : null;
    });

    document.addEventListener('click', function (evento) {
      var item = evento.target.closest ? evento.target.closest('.recommendation-item') : null;
      if (!item) return;
      var nome = item.querySelector('.recommendation-title');
      var tipo = item.querySelector('.recommendation-desc');
      if (nome) gerarPrevia(nome.textContent.trim(), tipo ? tipo.textContent.trim() : '');
    });

    function gerarPrevia(estilo, tipo) {
      if (!foto) {
        avisoFace('Capture o rosto primeiro para gerar a prévia com IA.', 'erro');
        return;
      }
      if (!estado.ativo) {
        avisoFace('IA em modo demonstrativo: configure GEMINI_API_KEY no .env para gerar a prévia real.', 'erro');
        return;
      }

      avisoFace('Nano Banana está gerando a prévia do corte...', 'info');
      var painel = $('previa-ia');
      mostrar(painel, true);

      ReloIA.simular({
        fotoBase64: foto,
        estilo: estilo,
        tipo: tipo,
        volume: 2,
        rosto: (window.currentAnalysis && window.currentAnalysis.shapeName) || null,
        proporcao: '3:4'
      })
        .then(function (resultado) {
          var img = $('previa-img');
          if (img) {
            img.src = resultado.imagem.dataUrl;
            img.alt = 'Prévia gerada por IA do corte ' + estilo;
            mostrar(img, true);
          }
          avisoFace('Prévia de "' + estilo + '" gerada por IA — simulação ilustrativa.', 'sucesso');
        })
        .catch(function (erro) {
          avisoFace('Não deu para gerar a prévia: ' + erro.message, 'erro');
        });
    }

    function avisoFace(texto, tipo) {
      var caixa = $('previa-aviso');
      if (!caixa) return;
      caixa.textContent = texto;
      caixa.className = 'ia-aviso ' + (tipo || 'info');
      mostrar(caixa, Boolean(texto));
    }

    ReloIA.status().then(function (st) {
      var selo = $('ia-status-selo');
      if (selo) seloStatus(st);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ligarTryOn();
    ligarReconhecimento();
  });
})();
