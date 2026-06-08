# Auditoria técnica — Barbearia Prumo

## Problemas encontrados

1. **Página de serviços com nome inconsistente**: os menus apontam para `servicos.html`, mas o repositório contém `serviços.html` com acento. Em ambientes web, isso quebra o link em muitos navegadores/servidores e prejudica SEO.
2. **Página `sobre.html` inexistente**: o menu da página principal aponta para `sobre.html`, mas esse arquivo não existe no repositório.
3. **`style.css` órfão**: existe uma folha global com fontes, navbar glass e animações, mas nenhuma página importa esse arquivo. Os estilos estão espalhados em blocos `<style>` inline.
4. **`tryon.js` órfão e incompatível**: o arquivo espera IDs (`upload-area`, `photo-upload`, `style-grid`, etc.) que não existem em `ia-tryon.html`; também depende de imagens locais em `assets/images/cortes/*`, que não existem.
5. **WhatsApp placeholder**: em `ia-tryon.html`, o botão final aponta para `https://wa.me/SEUNUMERO`, em vez do número usado na página de contato.
6. **Formulário sem destino real**: `contato.html` usa `action="#"`, então o envio não executa agendamento. A melhor saída para site estático é transformar o envio em mensagem direta para WhatsApp.
7. **Experiência mobile incompleta**: os menus principais ficam ocultos em telas pequenas sem botão hamburguer alternativo.
8. **Inconsistência visual**: as páginas usam estilos e estruturas diferentes; há boa base visual, mas falta uma identidade unificada e mais moderna.

## Direção da correção

A refatoração deve consolidar a identidade visual em `style.css`, criar rotas sem acento, remover código morto, conectar o simulador ao WhatsApp correto, adicionar `sobre.html`, melhorar o fluxo mobile e transformar o formulário em uma ação funcional para WhatsApp.

## Revisão visual local

A página inicial refatorada carregou corretamente em `http://localhost:8080/index.html`, com estilos globais aplicados, navegação funcional, imagem principal exibida e chamadas para ação visíveis. O layout apresenta identidade mais moderna, contraste forte, botões consistentes e hierarquia visual mais clara.

A página `servicos.html` carregou corretamente com rota sem acento, tabela de preços organizada em cards e CTAs para agendamento/simulação. A página `ia-tryon.html` carregou com layout modernizado, área de upload visível, opções de estilos conectadas ao script central e navegação ativa correta.

A página `contato.html` carregou com formulário funcional visualmente, botão direto de WhatsApp e campos de serviço/barbeiro. A nova página `sobre.html` também carregou corretamente, eliminando o link quebrado anterior do menu e mantendo a identidade visual unificada.
