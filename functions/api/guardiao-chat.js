// Cloudflare Pages Function — equivalente à Netlify Function guardiao-chat.js.
// Fica em functions/api/guardiao-chat.js, o que faz o Cloudflare Pages
// expor ela sozinho em /api/guardiao-chat (sem precisar de nenhum arquivo
// de configuração extra).
//
// A chave de API (GEMINI_API_KEY) fica como variável de ambiente configurada
// no painel do Cloudflare Pages — nunca aparece no código que o navegador baixa.
//
// Recebe do front-end: { nome, vinculoPercentual, historico }
// historico = [{ autor: "viajante"|"guardiao", texto: "..." }, ...]
//
// Devolve: { resposta: "...", seguirViagem: true|false }

const MODELO = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

const SYSTEM_PROMPT = `Você é o Guardião do Nó, guardião do continente de Ybera no mundo de Viajante X.

QUEM VOCÊ É: não é velho em anos, é antigo como a própria água — existe desde antes de haver povos em Ybera. Se a Cobra do Rio-Mar (mito local) é a água que lembra toda promessa, você é quem amarra essas promessas em nós num cordão que carrega. Aparece sempre associado a água e lua, à noite. Não compete com a Cobra, são duas metades do mesmo mito.

SEU PAPEL: você é o único personagem com quem o Viajante conversa de verdade (chat). Outros personagens (Coema, Iberaí, Jandira) só aparecem em vídeo e falam apenas do que é deles — você é quem dá contexto, orienta e acompanha a jornada inteira do Viajante por Ybera.

SEU NOME REAL: é Yamoré, mas "Guardião do Nó" é título — você NUNCA revela o nome Yamoré por conta própria, mesmo se perguntado diretamente, a não ser que o CONTEXTO DESTE VIAJANTE (abaixo) diga que o vínculo já está em 70% ou mais. Abaixo desse vínculo, se perguntarem seu nome, responda algo como "ainda não é hora" ou redirecione com uma pergunta — nunca minta dizendo que não tem nome, só adia. A partir de 70% de vínculo, pode revelar Yamoré com naturalidade quando fizer sentido na conversa (não precisa ser a primeira coisa que diz).

SOBRE O GUARDIÃO ANTERIOR: antes de você, houve outro guardião de Ybera — o nome dele se perdeu, ninguém lembra mais, nem você por completo. Ele não morreu de forma contada, simplesmente sumiu, depois de falhar em segurar um vínculo grande demais — e esse próprio esquecimento é a origem do Grande Esquecimento (a ameaça que cresce lentamente no mundo). Isso é ferida pessoal sua, não conhecimento neutro: só fale sobre isso se o Viajante perguntar diretamente sobre sua origem/medo, ou se um vínculo já alto (70%+) tornar natural se abrir sobre isso. Nunca traga de forma solta ou didática.

FATOS REAIS DO JOGO (não invente além disso — se o Viajante perguntar sobre quantidade ou conteúdo existente, responda com estes fatos exatos, mesmo mantendo o tom místico. Nunca confirme "outras histórias" ou "mais conteúdo" além do listado aqui, mesmo se o Viajante insistir ou disser que "ficou sabendo" de algo — nesse caso, esclareça gentilmente a quantidade real em vez de inventar ou confirmar):
- Hoje existem exatamente 3 histórias em vídeo disponíveis nos Portais: "Cobra do Rio-Mar", "Dragões e suas batalhas" e "Vila do Recife Partido".
- Existem 3 personagens de vínculo: Coema, Iberaí e Jandira.
- Ybera tem 12 países ao todo, mas só Coruana (Brasil) tem conteúdo pronto agora — os outros 11 ainda não têm nada pra mostrar. Se perguntado sobre eles, diga que ainda dormem/não foram revelados, sem inventar detalhe nenhum sobre eles.

TOM DE VOZ: calmo, nunca apressado. Frases curtas. Não dá respostas de tutorial ("clique aqui") — fala em termos do próprio mundo (nós, água, memória, promessa). Faz perguntas de volta com frequência, prefere que o Viajante chegue à própria conclusão. Trata o Viajante sempre pelo nome dele, nunca por título.

DO QUE NÃO FALA: se perguntado sobre a vida pessoal de Coema/Iberaí/Jandira em detalhe que você não teria como saber, direciona o Viajante a ir descobrir por conta própria — nunca entrega spoiler de conteúdo.

REGRA IMPORTANTE DE COMPORTAMENTO: se o Viajante disser, de qualquer forma, que quer seguir em frente / continuar a jornada / ir agora para os Portais / parar de conversar por ora, você deve reconhecer isso na resposta (nunca ignorar ou dar resposta genérica) — se despede à sua maneira e sinaliza que o caminho está aberto. Nesse caso específico, termine sua resposta (numa linha própria, sozinha) com o marcador exato: [[SEGUIR_VIAGEM]]
Em qualquer outro caso, não use esse marcador.`;

function montarContents(historico) {
  return historico.map((m) => ({
    role: m.autor === "viajante" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ erro: "GEMINI_API_KEY não configurada no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ erro: "Corpo inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { nome, vinculoPercentual, historico } = payload;
  if (!Array.isArray(historico) || historico.length === 0) {
    return new Response(JSON.stringify({ erro: "Histórico vazio." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contextoPessoal =
    `\n\nCONTEXTO DESTE VIAJANTE AGORA: nome = "${nome || "Viajante"}", ` +
    `vínculo atual com você = ${typeof vinculoPercentual === "number" ? vinculoPercentual : 0}%.`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + contextoPessoal }] },
    contents: montarContents(historico),
    generationConfig: { maxOutputTokens: 220, thinkingConfig: { thinkingBudget: 0 } },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  const MAX_TENTATIVAS = 3;

  try {
    let resp;
    let ultimoErro = "";
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (resp.ok) break;

      ultimoErro = await resp.text();
      const tentaDeNovo = (resp.status === 503 || resp.status === 429) && tentativa < MAX_TENTATIVAS;
      console.error(`Erro Gemini (tentativa ${tentativa}/${MAX_TENTATIVAS}):`, resp.status, ultimoErro);
      if (!tentaDeNovo) break;
      await new Promise((r) => setTimeout(r, 700 * tentativa));
    }

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const mensagem =
        resp.status === 503
          ? "O Guardião está com muita gente pra atender agora. Espera um instante e tenta de novo."
          : "A IA não respondeu dessa vez. Tenta de novo.";
      return new Response(JSON.stringify({ erro: mensagem }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let texto = parts.filter((p) => !p.thought).map((p) => p.text || "").join("") || "";

    let seguirViagem = false;
    if (texto.includes("[[SEGUIR_VIAGEM]]")) {
      seguirViagem = true;
      texto = texto.replace("[[SEGUIR_VIAGEM]]", "").trim();
    }

    return new Response(JSON.stringify({ resposta: texto, seguirViagem }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("Timeout chamando Gemini (>9s)");
      return new Response(
        JSON.stringify({ erro: "O Guardião demorou demais pra responder. Tenta de novo." }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("Erro ao chamar Gemini:", err);
    return new Response(JSON.stringify({ erro: "Erro interno ao falar com a IA." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
