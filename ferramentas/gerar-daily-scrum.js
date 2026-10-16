/**
 * Gera o documento do TCC "Daily Scrum — quem é quem no projeto" (.docx).
 *
 *   npm i docx --no-save          (a dependência é usada só por este script)
 *   node ferramentas/gerar-daily-scrum.js
 *
 * Saída: TCC/Daily-Scrum-TCC.docx
 * O mesmo conteúdo existe em versão para impressão em TCC/daily-scrum.html.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  PageOrientation, convertInchesToTwip
} = require('docx');

const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'TCC', 'Daily-Scrum-TCC.docx');
const fotoAmbiente = path.join(raiz, 'assets', 'cortes', 'ambiente-barbearia.jpg');

const OURO = 'A9741A';
const CINZA = '5B6672';
const LINHA = 'CBD5E1';

/* ---------------------------------------------------------------- helpers */

const titulo = (texto, nivel = HeadingLevel.HEADING_1) =>
  new Paragraph({
    heading: nivel,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text: texto, bold: true, color: OURO, size: nivel === HeadingLevel.HEADING_1 ? 30 : 24 })]
  });

const paragrafo = (texto, opcoes = {}) =>
  new Paragraph({
    spacing: { after: 100 },
    alignment: opcoes.alinhamento || AlignmentType.JUSTIFIED,
    children: marca(texto, opcoes)
  });

/** Converte o mini-markdown do material (**negrito**, *itálico*, `código`) em TextRun. */
function marca(texto, opcoes = {}) {
  const base = { font: 'Calibri', size: opcoes.tamanho || 21, color: opcoes.cor || '101418', bold: !!opcoes.negrito };
  const partes = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let ultimo = 0;
  let achado;
  while ((achado = re.exec(texto)) !== null) {
    if (achado.index > ultimo) partes.push(new TextRun({ ...base, text: texto.slice(ultimo, achado.index) }));
    const bruto = achado[0];
    if (bruto.startsWith('**')) partes.push(new TextRun({ ...base, text: bruto.slice(2, -2), bold: true }));
    else if (bruto.startsWith('`')) partes.push(new TextRun({ ...base, text: bruto.slice(1, -1), font: 'Consolas', size: 19, color: '6B4708' }));
    else partes.push(new TextRun({ ...base, text: bruto.slice(1, -1), italics: true }));
    ultimo = achado.index + bruto.length;
  }
  if (ultimo < texto.length) partes.push(new TextRun({ ...base, text: texto.slice(ultimo) }));
  return partes;
}

const celula = (texto, { largura, cabecalho = false, negrito = false } = {}) =>
  new TableCell({
    width: largura ? { size: largura, type: WidthType.PERCENTAGE } : undefined,
    shading: cabecalho ? { type: ShadingType.CLEAR, fill: 'F3F4F6' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: marca(texto, {
          tamanho: cabecalho ? 18 : 19,
          cor: cabecalho && !negrito ? CINZA : '101418',
          negrito: negrito || cabecalho
        })
      })
    ]
  });

function tabela(cabecalhos, linhas, larguras) {
  const borda = { style: BorderStyle.SINGLE, size: 4, color: LINHA };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: borda, insideVertical: borda },
    rows: [
      new TableRow({
        tableHeader: true,
        children: cabecalhos.map((tituloColuna, i) =>
          celula(tituloColuna, { largura: larguras && larguras[i], cabecalho: true })
        )
      }),
      ...linhas.map((linha) =>
        new TableRow({
          children: linha.map((valor, i) => celula(valor, { largura: larguras && larguras[i] }))
        })
      )
    ]
  });
}

const marcador = (texto) =>
  new Paragraph({
    spacing: { after: 80 },
    bullet: { level: 0 },
    children: marca(texto)
  });

/* --------------------------------------------------------------- conteúdo */

const equipe = [
  ['Matheus Moura', 'Product Owner', 'Marketing e visão do produto',
   'Decidiu o que entrava em cada sprint (preços, pacote Dia do Noivo, hierarquia de acesso) e cuidou do repositório, dos *merges* e da arquitetura: servidor em Node puro, banco JSON e espelho no Supabase.'],
  ['R. Gabriel', 'Scrum Master', 'Segurança e qualidade',
   'Conduziu a daily e o quadro de tarefas, cobrou o "pronto" de cada entrega e ficou com segurança e testes: hash de senha com sal, bloqueio de força bruta, respostas 403 e a suíte que roda no `npm test`.'],
  ['Vitor Camargo Pereira', 'Time de Desenvolvimento', 'Visagista',
   'Trouxe o visagismo para o código: formato de rosto, simetria e volume viraram as regras que o simulador usa para recomendar o corte.'],
  ['Michel Lima', 'Time de Desenvolvimento', 'Barbeiro — especialista do domínio',
   'Validou o catálogo de cortes (degradê, social, tesoura) e os preços, e definiu o que é um corte "bem acabado" — critério de aceite do simulador e das fotos do site.'],
  ['Wevergton Sousa', 'Time de Desenvolvimento', 'Barbeiro — testes com clientes',
   'Levou o sistema para o balcão: testou cadastro e simulador com clientes reais, apontou os atritos de uso e ajudou a escrever as respostas do chat da Relo IA.'],
  ['Marcos Rossa', 'Time de Desenvolvimento', 'Gerente de vendas — estoque',
   'Dono do módulo de produtos: categorias, estoque mínimo e movimentações de entrada/saída; também cuidou do pacote Dia do Noivo e das ofertas.'],
  ['Evelyn Coller', 'Time de Desenvolvimento', 'Designer de corte e interface',
   'Olhar de design sobre a interface: paleta preto e ouro, hierarquia da tipografia, cartões de KPI e painel administrativo — bonito e legível para quem trabalha correndo.'],
  ['Professor orientador', 'Stakeholder (fora do time Scrum)', 'Acompanhamento do TCC',
   'Revisou o escopo, cobrou os artefatos (casos de uso, diagrama e cronograma) e participou da Sprint Review dando o aceite de cada etapa.']
];

const sprints = [
  ['S0', '28/04 a 22/06', 'Fundação do produto', 'Site institucional, preços premium, clube de assinatura, login, feedback e a primeira versão do simulador com reconhecimento facial.', '8'],
  ['S1', '11/08 a 20/08', 'Marca e identidade do sistema', 'Renomeação para Style Relo Barber, chat da Relo IA, painel administrativo inicial, área do cliente e página da equipe.', '5'],
  ['S2', '08/09 a 14/09', 'Banco de clientes e vitrine', 'Foto do Corte Style Relo, banco de clientes, área de administrador, aba Equipe e pacote Dia do Noivo (R$ 250).', '4'],
  ['S3', '15/09 a 17/09', 'Consertar o que a banca veria primeiro', 'Contadores da página inicial (45 min / R$ 45), tipografia dos números e limite de linhas do chat.', '3'],
  ['S4', '18/09 a 28/09', 'Testar IA generativa de imagem (cancelada depois)', 'Nano Banana/Gemini no simulador, estúdio de imagem e gestão de chave no painel. Cancelada na Sprint 7: dependia de serviço pago e não foi validada.', '4'],
  ['S5', '29/09 a 06/10', 'Painel profissional e banco de verdade', 'Painel premium com KPIs e gráficos SVG, estoque/manutenção/despesas no banco do servidor, cadastro do cliente gravando direto no banco e suíte de testes.', '5'],
  ['S6', '07/10 a 15/10', 'Acabamento de experiência', 'Menu igual em todas as páginas, pílula do Admin, faixa "Hoje na barbearia", cartões de KPI clicáveis, chip do admin e configuração do Supabase em "colar e salvar".', '5'],
  ['S7', '16/10 (atual)', 'Fechar o escopo do TCC', 'Retirada da IA de imagem (com o simulador corrigido), hierarquia de acesso Usuário/Supervisor/Administrador e os artefatos do TCC: casos de uso, diagrama e este material de Scrum.', '4']
];

const burndown = [
  ['Sprint', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
  ['Itens em aberto ao fim da sprint', '38', '30', '25', '21', '17', '8', '3', '0'],
  ['Itens entregues na sprint', '8', '5', '4', '3', '4', '5', '5', '4']
];

const cerimonias = [
  ['Sprint Planning', 'Escolha dos cartões da sprint na segunda-feira, com o Product Owner priorizando o que a barbearia precisava.', 'Sprint Backlog com objetivo claro (ex.: "Sprint 5 — painel premium e cadastro no banco").'],
  ['Daily Scrum', '15 minutos por dia no grupo do time (formato assíncrono), com as três perguntas e atualização do quadro.', 'Impedimentos resolvidos no mesmo dia (foto que faltava, chave de API que não funcionou).'],
  ['Sprint Review', 'Demonstração da versão funcionando — pelo navegador e com o servidor de pé — para o professor e a equipe da barbearia.', 'Aceite (ou pedido de ajuste) registrado no ATUALIZACOES.md e nas pull requests.'],
  ['Retrospectiva', 'No fim de cada sprint: o que funcionou, o que atrapalhou e o que muda na próxima.', 'Decisões reais: parar de depender de API paga, criar a suíte de testes e padronizar o menu.']
];

const registroDaily = [
  ['Data', 'Quem', 'Entregou desde a última daily', 'Vai pegar hoje', 'Impedimento'],
  ['__/__/2026', '', '', '', ''],
  ['__/__/2026', '', '', '', ''],
  ['__/__/2026', '', '', '', '']
];

/* ------------------------------------------------------------- documento */

const filhos = [];

filhos.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 40 },
  children: [new TextRun({ text: 'TRABALHO DE CONCLUSÃO DE CURSO · DESENVOLVIMENTO DE SISTEMAS', font: 'Calibri', size: 17, color: CINZA, characterSpacing: 20, bold: true })]
}));
filhos.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 40 },
  children: [new TextRun({ text: 'Daily Scrum — quem é quem no projeto Barbearia Prumo', font: 'Calibri', size: 34, bold: true, color: '101418' })]
}));
filhos.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: 'Papéis do framework Scrum e o papel de cada integrante no sistema Style Relo Barber', font: 'Calibri', size: 20, color: CINZA })]
}));

if (fs.existsSync(fotoAmbiente)) {
  filhos.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new ImageRun({ type: 'jpg', data: fs.readFileSync(fotoAmbiente), transformation: { width: 420, height: 190 } })]
  }));
  filhos.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Figura 1 — O ambiente real da barbearia, onde o sistema é usado (foto do próprio projeto).', font: 'Calibri', size: 17, italics: true, color: CINZA })]
  }));
}

filhos.push(titulo('1. O que é a Daily Scrum (e por que ela está neste projeto)'));
filhos.push(paragrafo('A **Daily Scrum** é a reunião diária de 15 minutos do framework Scrum em que o time inspeciona o progresso rumo ao objetivo da *Sprint* e ajusta o plano do dia. Cada pessoa responde, em pé e olhando para o quadro: *o que fiz ontem*, *o que farei hoje* e *o que está travando o meu trabalho*. No nosso projeto ela aconteceu no formato **assíncrono**: como a equipe se encontrou fora do horário comum, cada integrante publicou a sua daily no grupo do time (e o resultado do dia virou *commit* no GitHub) — o que deixou rastro verificável de quem fez o quê, quando e por quê.'));

filhos.push(titulo('2. Papéis do Scrum no projeto', HeadingLevel.HEADING_2));
filhos.push(tabela(['Papel', 'Quem exerce', 'Responsabilidade'],
  [['Product Owner', 'Matheus Moura', 'Cuida do Product Backlog: o que entra, o que sai e por quê. Fala pela barbearia (visão do cliente, prioridades e o que vai para a banca).'],
   ['Scrum Master', 'R. Gabriel', 'Cuida do processo: organiza as sprints, puxa a daily, tira impedimento do caminho e protege o time de mudança de escopo no meio da sprint.'],
   ['Time de Desenvolvimento', 'Vitor, Michel, Wevergton, Marcos e Evelyn', 'Constrói o incremento: front-end, back-end, banco de dados, testes e conteúdo (visagismo, cortes, preços e fotos).'],
   ['Stakeholder', 'Professor orientador', 'Fora do time Scrum: revisa o escopo, acompanha as entregas e dá o aceite de cada etapa na Sprint Review.']],
  [18, 22, 60]));

filhos.push(titulo('3. Quadro da daily — as três perguntas', HeadingLevel.HEADING_2));
filhos.push(marcador('**O que eu entreguei desde a última daily?** (o cartão que saiu de "Fazendo" para "Feito")'));
filhos.push(marcador('**O que eu vou pegar hoje?** (o próximo cartão do Sprint Backlog)'));
filhos.push(marcador('**Tem algum impedimento?** (falta de foto, dúvida de preço, acesso, teste que falha…)'));

filhos.push(titulo('4. A equipe do projeto e o papel de cada integrante', HeadingLevel.HEADING_2));
filhos.push(tabela(['Integrante', 'Papel no Scrum', 'Papel no projeto', 'O que fez no sistema'], equipe, [16, 16, 20, 48]));

filhos.push(titulo('5. As sprints do projeto', HeadingLevel.HEADING_2));
filhos.push(paragrafo('Cada sprint abaixo corresponde a entregas reais publicadas no repositório do projeto e registradas em `ATUALIZACOES.md`.'));
filhos.push(tabela(['Sprint', 'Período', 'Objetivo da sprint', 'Incremento entregue', 'Itens'], sprints, [8, 14, 20, 50, 8]));

filhos.push(titulo('6. Burndown do Product Backlog', HeadingLevel.HEADING_2));
filhos.push(tabela(burndown[0], burndown.slice(1), [34, 8, 8, 8, 8, 8, 8, 8, 8]));
filhos.push(new Paragraph({
  spacing: { before: 80, after: 160 },
  children: [new TextRun({ text: 'Figura 2 — Burndown do projeto: 38 itens priorizados no Product Backlog, 8 sprints e 34 entregas publicadas (contagem a partir do histórico do repositório e do ATUALIZACOES.md). Fonte: elaborado pelos autores (2026).', font: 'Calibri', size: 17, italics: true, color: CINZA })]
}));

filhos.push(titulo('7. Cerimônias como aconteceram no projeto', HeadingLevel.HEADING_2));
filhos.push(tabela(['Cerimônia', 'Como foi no projeto', 'Resultado prático'], cerimonias, [18, 44, 38]));

filhos.push(titulo('8. Definition of Done (o que cada cartão precisa para entrar em "Feito")', HeadingLevel.HEADING_2));
filhos.push(marcador('Funciona nas duas situações: **com servidor** (`npm run serve`) e **sem servidor** (site aberto pelo arquivo).'));
filhos.push(marcador('Passou pelo `npm test` (banco, rotas, segurança e hierarquia de acesso) sem falhar.'));
filhos.push(marcador('Respeita a hierarquia: cada rota nova tem a permissão declarada em `permissoes.js` e coberta por teste.'));
filhos.push(marcador('Funciona no celular e no computador, com texto em português e erro que explica o motivo.'));
filhos.push(marcador('Está documentado (`README.md` ou `ATUALIZACOES.md`) e publicado no GitHub.'));

filhos.push(titulo('9. Modelo de registro da daily (para usar no projeto)', HeadingLevel.HEADING_2));
filhos.push(tabela(registroDaily[0], registroDaily.slice(1), [12, 18, 26, 26, 18]));

filhos.push(new Paragraph({
  spacing: { before: 260 },
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: OURO } },
  children: [new TextRun({ text: 'Barbearia Prumo · Style Relo Barber — TCC 2026 · Apêndice C (Daily Scrum)', font: 'Calibri', size: 17, color: CINZA })]
}));

const documento = new Document({
  creator: 'Equipe Barbearia Prumo',
  title: 'Daily Scrum — quem é quem no projeto',
  description: 'Material de apoio do TCC: papéis do Scrum e o papel de cada integrante no sistema Style Relo Barber.',
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(0.7), bottom: convertInchesToTwip(0.7), left: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8) },
        size: { orientation: PageOrientation.PORTRAIT }
      }
    },
    children: filhos
  }]
});

Packer.toBuffer(documento).then((buffer) => {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
  console.log('✔ gerado ' + path.relative(raiz, destino) + ' (' + (buffer.length / 1024).toFixed(1) + ' KB)');
});
