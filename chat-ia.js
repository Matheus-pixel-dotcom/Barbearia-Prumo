// Relo IA — consultor de corte por chat (roda 100% no navegador)
// Usa a análise facial (window.currentAnalysis) e o volume escolhido
// para adaptar a recomendação ao rosto da pessoa.

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

  function analise() {
    return (typeof window !== 'undefined' && window.currentAnalysis) || null;
  }

  function shapeName() {
    var a = analise();
    return a && a.shapeName ? a.shapeName : null;
  }

  function add(texto, quem) {
    if (!chatBody) return;
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (quem === 'user' ? 'from-user' : 'from-ia');
    el.innerHTML = texto;
    chatBody.appendChild(el);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function digitando(cb) {
    var el = document.createElement('div');
    el.className = 'chat-msg from-ia chat-typing';
    el.textContent = 'Relo IA está digitando...';
    chatBody.appendChild(el);
    chatBody.scrollTop = chatBody.scrollHeight;
    setTimeout(function () {
      el.remove();
      cb();
    }, 500);
  }

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

  function setVol(v) {
    vol = v;
    document.querySelectorAll('[data-volume]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-volume')) === vol);
    });
    var label = document.getElementById('volume-label');
    if (label) label.textContent = VOLUMES[vol].nome + ' — ' + VOLUMES[vol].desc;
  }

  function enviar(msg) {
    if (!msg.trim()) return;
    add(msg.replace(/</g, '&lt;'), 'user');
    digitando(function () {
      add(responder(msg), 'ia');
    });
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
        enviar(chatInput.value);
        chatInput.value = '';
      });
    }

    document.querySelectorAll('[data-chat-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        enviar(b.getAttribute('data-chat-quick'));
      });
    });

    add('Fala! Sou a <strong>Relo IA</strong>, consultora de corte da Style Relo Barber. Escolha o <strong>volume</strong> que você quer no topo aí em cima, ou me pergunte qualquer coisa sobre o seu corte.', 'ia');
  });
})();
