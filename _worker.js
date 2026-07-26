// Worker único do projeto (Cloudflare Workers + assets estáticos).
// Serve o site estático normalmente e responde à rota /api/guardiao-chat.
//
// Tenta o Gemini primeiro (com retry pra 503/429). Se mesmo assim falhar,
// cai automaticamente pro Groq (segunda IA de reserva, grátis) — o
// Viajante não percebe a troca, só recebe uma resposta de qualquer jeito.
//
// As chaves de API (GEMINI_API_KEY, GROQ_API_KEY) ficam como Secrets
// configurados no painel do Cloudflare — nunca aparecem nesse código.
//
// Atualizado (25-07-2026) — reprogramação da lógica do Guardião:
// 1) Antes de assistir um vídeo, o Guardião nunca entrega o conteúdo dele —
//    só mistério, redirecionando pro Portal.
