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

  /* ---------------------------------------------------------------- */
  /* Fluxo automático: foto nova → lê o rosto → escolhe o corte → gera  */
  /* É o "resultado na hora" pra quando o cliente chega na barbearia.   */
  /* ---------------------------------------------------------------- */

  // Estima o volume NATURAL do cabelo da pessoa a partir do tipo de fio.
  function volumeNaturalDe(tipo, densidade) {
    var base = { liso: 1, ondulado: 2, cacheado: 3, crespo: 4 }[tipo] || 2;
    if (densidade === 'alta') base += 1;
    if (densidade === 'baixa') base -= 1;
    return Math.min(4, Math.max(1, base));
  }

  var NOME_VOLUME = { 1: 'baixo', 2: 'médio', 3: 'alto', 4: 'muito alto' };

  function falarNoChat(html) {
    if (window.ReloChat && window.ReloChat.falar) window.ReloChat.falar(html);
  }

  function destacarEstilo(nome) {
    document.querySelectorAll('[data-style-option]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-style-name') === nome);
    });
  }

  // Escolhe o corte que mais combina com o rosto lido.
  function corteSugerido(analise) {
    if (analise.recomendacoes && analise.recomendacoes.length) {
      var r = analise.recomendacoes[0];
      return { nome: r.nome, tipo: r.tipo || '', motivo: r.motivo || '' };
    }
    // Sem recomendação da IA: tabela local por formato de rosto.
    var porRosto = {
      'Oval': 'Executive Contour',
      'Redondo': 'Mid Fade Moderno',
      'Quadrado': 'Buzz Cut com Degradê',
      'Alongado': 'Executive Contour',
      'Triangular': 'Mid Fade Moderno',
      'Diamante': 'Mid Fade Moderno'
    };
    return { nome: porRosto[analise.shapeName] || 'Corte Style Relo', tipo: '', motivo: '' };
  }

  function fluxoAutomatico(foto) {
    if (!foto || gerando) return;

    // Só roda com a IA ligada; no modo demonstrativo deixa o fluxo manual.
    if (!estado.ativo) return;

    carregando(true, 'Relo IA lendo seu rosto e seu cabelo...');
    aviso('Analisando seu rosto para escolher o corte que mais combina...', 'info');

    ReloIA.analisar(foto)
      .then(function (resultado) {
        var a = resultado.analise || {};
        var volNat = volumeNaturalDe(a.tipoCabelo, a.densidade);

        // Guarda a leitura para o chat e para a simulação.
        window.currentAnalysis = Object.assign({}, window.currentAnalysis, {
          shapeName: a.formatoRosto || (window.currentAnalysis || {}).shapeName,
          tipoCabelo: a.tipoCabelo || null,
          densidade: a.densidade || null,
          barba: a.barba || null,
          volumeNatural: NOME_VOLUME[volNat],
          recomendacoes: a.recomendacoes || []
        });

        // Ajusta o controle de volume pro volume natural do cabelo dele.
        if (window.ReloChat && window.ReloChat.setVol) window.ReloChat.setVol(volNat);

        var corte = corteSugerido(window.currentAnalysis);

        // Anuncia no chat: formato do rosto + cabelo + volume lido + corte.
        var pedacos = [];
        if (a.formatoRosto) pedacos.push('rosto <strong>' + a.formatoRosto + '</strong>');
        if (a.tipoCabelo) {
          pedacos.push(
            'cabelo <strong>' + a.tipoCabelo + '</strong>' +
            ' (densidade ' + (a.densidade || 'média') + ')'
          );
        }
        pedacos.push('volume natural do seu cabelo: <strong>' + NOME_VOLUME[volNat] + '</strong>');

        falarNoChat(
          '📊 Li sua foto! ' + pedacos.join(', ') + '.<br>' +
          'O corte que mais combina com você é o <strong>' + corte.nome + '</strong>' +
          (corte.motivo ? ' — ' + corte.motivo : '') +
          '. Já estou gerando a prévia na hora! 👇'
        );

        destacarEstilo(corte.nome);

        // Gera a prévia imediatamente, sem o cliente precisar clicar.
        return ReloIA.simular({
          fotoBase64: foto,
          estilo: corte.nome,
          tipo: corte.tipo,
          volume: volNat,
          rosto: window.currentAnalysis.shapeName,
          proporcao: '3:4'
        }).then(function (sim) {
          exibirResultado(sim, corte.nome, corte.tipo);
        });
      })
      .catch(function (erro) {
        aviso(
          'Não consegui fazer a análise automática: ' + erro.message +
          ' Sem problema — escolha um estilo ao lado que eu gero a prévia.',
          'erro'
        );
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

    // Fluxo automático: chegou foto nova → lê o rosto e gera o corte na hora.
    window.addEventListener('relo:foto', function (evento) {
      var foto = evento.detail && evento.detail.foto;
      if (foto) fluxoAutomatico(foto);
    });

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
