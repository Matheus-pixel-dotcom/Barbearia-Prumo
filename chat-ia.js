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
  var MAX_CHARS = 300;

  function analise() {
    return (typeof window !== 'undefined' && window.currentAnalysis) || null;
  }

  function shapeName() {
    var a = analise();
    return a && a.shapeName ? a.shapeName : null;
  }

  /* ---------------------------------------------------------------- */
  /* Variação de falas — a Relo IA não repete a mesma frase duas vezes  */
  /* seguidas: cada assunto tem um leque de jeitos de responder.        */
  /* ---------------------------------------------------------------- */
  var ultimaVariante = {};
  function variar(chave, opcoes) {
    var n = Math.floor(Math.random() * opcoes.length);
    if (opcoes.length > 1 && n === ultimaVariante[chave]) {
      n = (n + 1) % opcoes.length;
    }
    ultimaVariante[chave] = n;
    return opcoes[n];
  }

  // O que a IA leu do cabelo da pessoa (análise do Nano Banana).
  function cabeloDele() {
    var a = analise();
    if (!a || !a.tipoCabelo) return null;
    return {
      tipo: a.tipoCabelo,
      densidade: a.densidade,
      volumeNatural: a.volumeNatural,
      barba: a.barba
    };
  }

  function fraseCabelo() {
    var c = cabeloDele();
    if (!c) return '';
    return ' (Lembrete: li aqui que o cabelo dele é ' + c.tipo +
      ', densidade ' + (c.densidade || 'média') +
      ', volume natural ' + (c.volumeNatural || 'médio') + '.)';
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
      return variar('preco', [
        'O Combo Style Relo (corte + barba + consultoria de visagismo) sai por <strong>R$ 90</strong> e o Corte Style Relo por <strong>R$ 45</strong>. Para casamento temos o pacote <strong>Dia do Noivo por R$ 250</strong>. Tabela completa em <a href="servicos.html">Serviços</a>.',
        'Valores rápidos: <strong>R$ 45</strong> no Corte Style Relo, <strong>R$ 90</strong> no combo com barba e visagismo, e <strong>R$ 250</strong> no Dia do Noivo. Quer que eu te ajude a escolher o corte antes de agendar?',
        'Temos três carros-chefe: Corte Style Relo (<strong>R$ 45</strong>), Combo com barba (<strong>R$ 90</strong>) e Dia do Noivo (<strong>R$ 250</strong>). Me diz o estilo que você curte que eu te digo qual encaixa!'
      ]);
    }
    if (/(agendar|hor[áa]rio de atendimento|marcar|reservar|whats)/.test(t)) {
      return variar('agendar', [
        'Bora! Você agenda direto pelo <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a> ou pela página de <a href="contato.html">Contato</a>.',
        'Fechado! É só chamar no <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a> que a gente encaixa você. Se quiser, já chega mostrando a prévia do corte que a IA gerou. 😎',
        'Agendamento rapidinho pelo <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a>. Dica: manda junto a simulação que você fizer aqui — o barbeiro já chega sabendo o que você quer.'
      ]);
    }
    if (/(volume|cheio|alto|baixo|arma[çc][ãa]o|topo)/.test(t)) {
      if (/muito alto|bem alto|m[áa]ximo/.test(t)) setVol(4);
      else if (/alto/.test(t)) setVol(3);
      else if (/baixo|curto|rente/.test(t)) setVol(1);
      else if (/m[ée]dio/.test(t)) setVol(2);
      return variar('vol-intro', [
        'Boa escolha! Olha só como fica: <br>',
        'Anotado! Te explico esse volume: <br>',
        'Esse volume muda bastante o visual, vê: <br>'
      ]) + recomendacao();
    }
    if (/(meu cabelo|minha foto|o que voc[eê] viu|leu meu rosto|analis)/.test(t)) {
      var c = cabeloDele();
      var f0 = shapeName();
      if (!c && !f0) {
        return variar('sem-analise', [
          'Ainda não analisei seu rosto. Clique em <strong>📷 Usar câmera</strong> (ou envie uma foto) que eu leio formato do rosto, tipo de cabelo e volume — e já te mostro o corte na hora.',
          'Manda uma foto ali do lado! Assim eu consigo ler seu cabelo e seu rosto e te dar uma recomendação certeira.'
        ]);
      }
      var pedacos = [];
      if (c) {
        pedacos.push('seu cabelo é <strong>' + c.tipo + '</strong>, com densidade <strong>' + (c.densidade || 'média') + '</strong> e volume natural <strong>' + (c.volumeNatural || 'médio') + '</strong>');
      }
      if (f0) pedacos.push('seu rosto é <strong>' + f0 + '</strong>');
      return variar('leitura', [
        'Te conto o que eu vi: ' + pedacos.join(' e ') + '. Com isso, o corte que mais combina com você está na prévia ao lado. Quer que eu ajuste o volume?',
        'Pela minha leitura, ' + pedacos.join(', ') + '. É um perfil que segura muito bem degradê com topo texturizado. Me pergunta qualquer coisa!'
      ]);
    }
    if (/(rosto|formato|cara|queixo|testa)/.test(t)) {
      var f = shapeName();
      if (!f) return variar('sem-rosto', [
        'Ainda não analisei seu rosto. Clique em <strong>📷 Usar câmera</strong> (ou envie uma foto) e eu leio o formato pra te indicar o corte certo.',
        'Sobe uma foto ali que eu leio o formato do seu rosto em segundos e já te devolvo o corte ideal.'
      ]);
      return 'Seu rosto foi lido como <strong>' + f + '</strong>. ' + (ROSTOS[f] || '') + '<br>' + recomendacao();
    }
    if (/(cacho|crespo|ondulado|frizz)/.test(t)) {
      return variar('cacho', [
        'Cabelo com cacho segura volume naturalmente: peça um <strong>topo texturizado com degradê médio</strong> e finalize com creme de definição. Evite raspar demais as laterais, senão o topo fica desproporcional.',
        'Cacheado é puro estilo! O segredo é <strong>respeitar o volume natural</strong>: topo com definição, laterais em degradê sem subir demais. Creme de definição finaliza sem pesar.',
        'Para cachos, eu fujo de laterais raspadas ao extremo: elas achatam o conjunto. Um <strong>Curly Top</strong> ou topo texturizado valoriza muito mais o desenho do cacho.'
      ]);
    }
    if (/(noivo|casamento|noiva|casando|boda)/.test(t)) {
      return variar('noivo', [
        'Para o grande dia tem o pacote <strong>Dia do Noivo — R$ 250</strong>: corte personalizado, barboterapia com navalha, sobrancelha, hidratação e finalização, com horário reservado. Veja em <a href="servicos.html#dia-do-noivo">Serviços</a> ou agende no <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a>.',
        'Casando? Então é pacote <strong>Dia do Noivo (R$ 250)</strong>: você chega com horário reservado e sai pronto pra foto — corte, barba na navalha, sobrancelha e hidratação. Parabéns pela coragem! 😄'
      ]);
    }
    if (/(barba|bigode)/.test(t)) {
      return variar('barba', [
        'A barboterapia inclui navalha, toalha quente e hidratação. Se você escolher volume alto no topo, uma barba mais aparada equilibra o conjunto.',
        'Barba bem desenhada muda o jogo: aqui ela vai com navalha, toalha quente e hidratação. E combina demais com degradê marcado.',
        'Se o topo for volumoso, eu apararia a barba pra equilibrar as proporções do rosto. Topo baixo? Aí uma barba mais cheia compensa.'
      ]);
    }
    if (/(entrada|calv[íi]cie|careca|ralo|fino)/.test(t)) {
      return variar('entrada', [
        'Com entradas ou fio mais fino, o melhor caminho é <strong>volume baixo a médio com degradê</strong>: disfarça a linha do cabelo e dá densidade visual. Buzz Cut com degradê também é uma opção forte.',
        'Fio fino pede estratégia: laterais em degradê e topo sem exagero criam ilusão de densidade. Evite topetes longos — eles denunciam a entrada.',
        'Entradas não são vilãs! Um <strong>Buzz Cut com degradê</strong> assume o estilo com atitude, ou volume médio disfarça a linha frontal. Qual vibe é a sua?'
      ]);
    }
    if (/(manuten[çc][ãa]o|quanto tempo|voltar)/.test(t)) {
      return variar('manut', [
        'Degradês pedem manutenção a cada 15 dias. Cortes com volume médio/alto aguentam de 3 a 4 semanas.',
        'Regra de bolso: degradê baixo = retorno em 15 dias; topo texturizado = até 4 semanas tranquilas.',
        'Depende do corte: quanto mais raspada a lateral, mais cedo você volta. Volume no topo segura mais tempo.'
      ]);
    }
    if (/(produto|pomada|shampoo|creme)/.test(t)) {
      return variar('produto', [
        'Aqui na casa a finalização é séria: pomada matte pra efeito seco, pomada de brilho pra visual clássico e spray de sal marinho pra textura. O <strong>Marcos</strong>, da nossa equipe, cuida da linha de produtos — pergunta pra ele qual combina com seu fio!',
        'Produto certo muda o corte de "ok" pra "uau". Pra brilho: pomada clássica. Pra seco: matte. Pra cacho: creme de definição. O Marcos te mostra tudo na visita.'
      ]);
    }
    if (/(onde fica|endere[çc]o|localiza[çc][ãa]o|chegar)/.test(t)) {
      return variar('onde', [
        'Tô na página de <a href="contato.html">Contato</a> com endereço e WhatsApp. Qualquer coisa, é só chamar que a gente te recebe com café e navalha afiada. ☕',
        'Nosso endereço e contatos estão em <a href="contato.html">Contato</a>. Chega mais!'
      ]);
    }
    if (/(pagamento|pix|cart[ãa]o|dinheiro)/.test(t)) {
      return variar('pag', [
        'A parte do pagamento você resolve na cadeira, sem estresse 😄 — e o importante é sair bonito. Qualquer detalhe, o <a href="https://wa.me/5541996484980" target="_blank" rel="noopener">WhatsApp</a> responde na hora.',
        'Sobre formas de pagamento, o balcão te atende melhor — mas te adianto que o investimento vale cada centavo. 😎'
      ]);
    }
    if (/(obrigad|valeu|show|top|massa|perfeito)/.test(t)) {
      return variar('obg', [
        'Tamo junto! 👊 Qualquer dúvida sobre o corte, é só chamar.',
        'Por nada! Agora é só agendar e chegar estiloso. 😄',
        'Fechou! Se quiser, gero outra prévia com um volume diferente pra você comparar.',
        'Nação! 💈 Bora marcar aquele horário pra finalizar?'
      ]);
    }
    if (/(tchau|ate mais|flw|falou|ate logo)/.test(t)) {
      return variar('tchau', [
        'Até a próxima! Lembra: cabelo bom é cabelo com plano. 😄',
        'Falou! Te espero na cadeira — e se mudar de ideia sobre o corte, a prévia tá aqui.'
      ]);
    }
    if (/(quem [ée] voc[eê]|seu nome|o que voc[eê] [ée]|voc[eê] [ée] humano|rob[oô])/.test(t)) {
      return variar('quem', [
        'Sou a <strong>Relo IA</strong>, a consultora digital da Style Relo Barber. Leio seu rosto, entendo seu cabelo e sugiro o corte — o talento com a tesoura é dos nossos barbeiros. 😄',
        'Relo IA, prazer! Sou a inteligência artificial da casa: analiso formato de rosto e volume de cabelo pra você chegar na barbearia já sabendo o que combina.'
      ]);
    }
    if (/(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[ií])/.test(t)) {
      return variar('oi', [
        'Fala! 👋 Me conta: você quer o cabelo com pouco volume, médio ou bem cheio no topo?',
        'Opa, bem-vindo! 😄 Suba uma foto ou me diga o volume que você curte que eu te guio.',
        'Salve! 👊 Hoje a gente resolve seu corte: me diz um estilo ou pergunta o que quiser.'
      ]);
    }
    if (/(recomend|sugest|indica|qual corte|melhor corte)/.test(t)) {
      return recomendacao();
    }
    return variar('padrao', [
      'Posso te ajudar com: <strong>volume do corte</strong>, formato de rosto, cabelo cacheado, entradas, barba, preços e agendamento. Sobre o que você quer falar?',
      'Manda ver: me pergunta sobre <strong>seu cabelo</strong>, estilos, volume, barba ou preços. Se subir uma foto, eu personalizo tudo.',
      'Sou boa em: ler seu rosto, sugerir volume, explicar cortes e passar preços. Escolhe um assunto! 😄'
    ]);
  }

  function setVol(v) {
    vol = v;
    document.querySelectorAll('[data-volume]').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-volume')) === vol);
    });
    var label = document.getElementById('volume-label');
    if (label) label.textContent = VOLUMES[vol].nome + ' — ' + VOLUMES[vol].desc;
  }

  /* ---------------------------------------------------------------- */
  /* Relo IA com modelo real (Nano Banana / Gemini) + fallback local    */
  /* ---------------------------------------------------------------- */

  var historico = []; // [{ papel: 'user'|'model', texto }]

  // Deixa passar só formatação simples; qualquer outra tag vira texto puro.
  // A resposta vem de um modelo de IA, então não pode entrar HTML cru na página.
  function sanitizar(html) {
    var texto = String(html || '');
    // Links: só http/https, sem javascript: nem data:
    texto = texto.replace(/<a\s+([^>]*)>/gi, function (inteiro, atributos) {
      var href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(atributos);
      var url = href ? (href[2] || href[3] || '') : '';
      if (!/^https?:\/\//i.test(url.trim())) return '';
      return '<a href="' + url.trim() + '" target="_blank" rel="noopener noreferrer">';
    });
    texto = texto.replace(/<\/a>/gi, '</a>');
    texto = texto.replace(/<(\/?)(strong|em|b|i|br)\s*\/?>/gi, '<$1$2>');
    texto = texto.replace(/<[^>]+>/g, function (tag) {
      return /^<\/?(strong|em|b|i|br|a)\b/i.test(tag) ? tag : '';
    });
    return texto;
  }

  function lembrar(papel, texto) {
    historico.push({ papel: papel, texto: texto });
    if (historico.length > 8) historico.splice(0, historico.length - 8);
  }

  function contextoAtual() {
    var v = VOLUMES[vol];
    var forma = shapeName();
    var c = cabeloDele();
    var pedacos = [
      'volume escolhido no simulador: ' + v.nome.toLowerCase() + ' (' + v.desc + ')'
    ];
    if (c) {
      pedacos.push(
        'cabelo atual do cliente lido pela IA: tipo ' + c.tipo +
        ', densidade ' + (c.densidade || 'média') +
        ', volume natural ' + (c.volumeNatural || 'médio') +
        (c.barba ? ', barba ' + c.barba : '')
      );
    } else {
      pedacos.push('cabelo do cliente ainda não lido pela IA');
    }
    pedacos.push(forma ? 'formato de rosto lido: ' + forma : 'rosto ainda não analisado');
    pedacos.push('página: simulador de visagismo do site da barbearia');
    return pedacos.join('; ');
  }

  function enviar(msg) {
    msg = String(msg || '').trim().slice(0, MAX_CHARS);
    if (!msg) return;
    add(msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), 'user');
    lembrar('user', msg);

    digitando(function () {
      var iaDisponivel = window.ReloIA && window.ReloIA.status;

      if (!iaDisponivel) {
        var respostaLocal = responder(msg);
        lembrar('model', respostaLocal.replace(/<[^>]+>/g, ''));
        add(respostaLocal, 'ia');
        return;
      }

      window.ReloIA.status()
        .then(function (st) {
          if (!st.ativo) throw new Error('modo demonstrativo');
          return window.ReloIA.chat(msg, historico.slice(0, -1), contextoAtual());
        })
        .then(function (resultado) {
          var resposta = sanitizar(resultado.resposta);
          lembrar('model', resposta.replace(/<[^>]+>/g, ''));
          add(resposta, 'ia');
        })
        .catch(function () {
          // Sem chave, sem servidor ou erro da API: responde com as regras locais,
          // exatamente como o site sempre fez. O chat nunca fica mudo.
          var fallback = responder(msg);
          lembrar('model', fallback.replace(/<[^>]+>/g, ''));
          add(fallback, 'ia');
        });
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

    // Gancho para outros módulos (ia-gemini.js) falarem no chat:
    // ex.: o fluxo automático anuncia a leitura do rosto e o corte sugerido.
    window.ReloChat = {
      falar: function (html) { add(String(html || ''), 'ia'); },
      setVol: setVol,
      volumeAtual: function () { return vol; }
    };
  });
})();
