// Exemplo de configuração do Nano Banana.
//
// Copie para `nano-banana.config.js` (esse nome está no .gitignore, então a sua chave
// NÃO vai para o repositório) e inclua o script na página ANTES do nano-banana.js:
//
//   <script src="nano-banana.config.js"></script>
//   <script src="nano-banana.js" defer></script>
//
// ── MODO 1 — PROXY (use este em produção) ─────────────────────────────────────
// O navegador chama o seu proxy; a chave fica no servidor. Nenhuma chave no front-end.
// Implementação pronta em tools/gemini-proxy/.
window.NANO_BANANA_CONFIG = {
  endpoint: 'https://seu-proxy.exemplo.com/api/nano-banana',
  model: 'gemini-2.5-flash-image',
  aspectRatio: '3:4',
};

// ── MODO 2 — CHAVE DIRETA (SÓ para desenvolvimento) ───────────────────────────
// AVISO: tudo o que está num site estático é público. Quem abrir o DevTools lê a
// chave e pode gastar a sua cota. Nunca use isto em produção.
// Prefira o painel ⚙️ Configurar IA na página, que guarda em localStorage e não
// aparece no git.
//
// window.NANO_BANANA_CONFIG = {
//   apiKey: 'AIza...sua-chave-do-ai-studio...',
//   model: 'gemini-2.5-flash-image',
//   aspectRatio: '3:4',
// };
