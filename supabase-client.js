// Conexão com o backend (Supabase).
// A chave abaixo é pública por natureza (feita pra ficar no código do site,
// protegida pelas regras de segurança configuradas no banco de dados).
const SUPABASE_URL = "https://devjwbayfaljfdugnadt.supabase.co";
const SUPABASE_KEY = "sb_publishable_585MHqGMwb8hIrjYlDltwg_1kKtMZBS";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Personagens padrão de Coruana — todo viajante novo começa com vínculo 0 nos três.
const PERSONAGENS_INICIAIS = ["Coema", "Iberaí", "Jandira", "Guardião do Nó"];

// Garante que o viajante tem uma sessão (cria uma sessão anônima se ainda não tiver).
async function garantirSessao() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) return session;
  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) {
    console.error("Erro ao criar sessão:", error);
    return null;
  }
  return data.session;
}

// Salva o nome do viajante e cria os vínculos iniciais, se ainda não existirem.
async function criarPerfilViajante(nome) {
  const session = await garantirSessao();
  if (!session) return false;
  const userId = session.user.id;

  await supabaseClient.from("perfis").upsert({ user_id: userId, nome }, { onConflict: "user_id" });

  const { data: vinculosExistentes } = await supabaseClient
    .from("vinculos")
    .select("personagem")
    .eq("user_id", userId);

  const jaExistem = new Set((vinculosExistentes || []).map((v) => v.personagem));
  const faltando = PERSONAGENS_INICIAIS.filter((p) => !jaExistem.has(p));

  if (faltando.length > 0) {
    await supabaseClient.from("vinculos").insert(
      faltando.map((personagem) => ({ user_id: userId, personagem, percentual: 0 }))
    );
  }

  return true;
}

// Busca o perfil do viajante atual (ou null se ele nunca começou a jornada).
async function buscarPerfilAtual() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  const { data } = await supabaseClient
    .from("perfis")
    .select("nome")
    .eq("user_id", session.user.id)
    .maybeSingle();
  return data;
}

// Busca os vínculos do viajante atual.
async function buscarVinculosAtuais() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return [];
  const { data } = await supabaseClient
    .from("vinculos")
    .select("personagem, percentual")
    .eq("user_id", session.user.id);
  return data || [];
}

// ---------------------------------------------------------------------------
// Vídeos assistidos — memória de quais Portais o Viajante já viu do início ao
// fim. Usado pelo Guardião do Nó pra saber quando pode comentar fragmentos de
// uma história (pós-vídeo) em vez de só redirecionar pro vídeo (pré-vídeo).
// Requer a tabela `videos_assistidos` no Supabase — ver
// `01_FUNDACAO/migracao_videos_assistidos.sql`.
// ---------------------------------------------------------------------------

// Marca um vídeo como assistido do início ao fim (chamado quando o player do
// YouTube dispara o evento "ended", nunca antes disso — assistir só uma
// prévia não conta, é intencional: o Guardião só solta fragmento de quem
// realmente viu a história inteira).
async function marcarVideoAssistido(videoSlug) {
  const session = await garantirSessao();
  if (!session) return false;
  const { error } = await supabaseClient
    .from("videos_assistidos")
    .upsert(
      { user_id: session.user.id, video_slug: videoSlug },
      { onConflict: "user_id,video_slug" }
    );
  if (error) {
    console.error("Erro ao marcar vídeo assistido:", error);
    return false;
  }
  return true;
}

// Busca a lista de slugs de vídeo que o Viajante já assistiu por completo.
async function buscarVideosAssistidos() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return [];
  const { data } = await supabaseClient
    .from("videos_assistidos")
    .select("video_slug")
    .eq("user_id", session.user.id);
  return (data || []).map((v) => v.video_slug);
}
