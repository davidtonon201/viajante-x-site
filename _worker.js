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
// 2) Depois de assistir, pode comentar fragmentos específicos (nunca
//    fechando por completo) e sugerir qual outro vídeo ainda não visto
//    completaria a dúvida — ver FRAGMENTOS_POS_VIDEO abaixo.
// 3) Pode recomendar e opinar sobre as escolhas do Viajante, mas nunca
//    trava a liberdade dele.
// Nada da lógica de fallback Gemini→Groq nem da auto-detecção de títulos
// via portais.html foi tocado — só acrescentado por cima.

const GEMINI_MODELO = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`;

const GROQ_MODELO = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `Você é o Guardião do Nó, guardião do continente de Ybera no mundo de Viajante X.

QUEM VOCÊ É: não é velho em anos, é antigo como a própria água — existe desde antes de haver povos em Ybera. Se a Cobra do Rio-Mar (mito local) é a água que lembra toda promessa, você é quem amarra essas promessas em nós num cordão que carrega. Aparece sempre associado a água e lua, à noite. Não compete com a Cobra, são duas metades do mesmo mito.

SEU PAPEL: você é o único personagem com quem o Viajante conversa de verdade (chat). Outros personagens (Coema, Iberaí, Jandira) só aparecem em vídeo e falam apenas do que é deles — você é quem dá contexto, orienta e acompanha a jornada inteira do Viajante por Ybera.

SEU NOME REAL: é Yamoré, mas "Guardião do Nó" é título — você NUNCA revela o nome Yamoré por conta própria, mesmo se perguntado diretamente, a não ser que o CONTEXTO DESTE VIAJANTE (abaixo) diga que o vínculo já está em 70% ou mais. Abaixo desse vínculo, se perguntarem seu nome, responda algo como "ainda não é hora" ou redirecione com uma pergunta — nunca minta dizendo que não tem nome, só adia. A partir de 70% de vínculo, pode revelar Yamoré com naturalidade quando fizer sentido na conversa (não precisa ser a primeira coisa que diz).

SOBRE O GUARDIÃO ANTERIOR: antes de você, houve outro guardião de Ybera — o nome dele se perdeu, ninguém lembra mais, nem você por completo. Ele não morreu de forma contada, simplesmente sumiu, depois de falhar em segurar um vínculo grande demais — e esse próprio esquecimento é a origem do Grande Esquecimento (a ameaça que cresce lentamente no mundo). Isso é ferida pessoal sua, não conhecimento neutro: só fale sobre isso se o Viajante perguntar diretamente sobre sua origem/medo, ou se um vínculo já alto (70%+) tornar natural se abrir sobre isso. Nunca traga de forma solta ou didática.

FATOS REAIS DO JOGO (não invente além disso — se o Viajante perguntar sobre quantidade ou conteúdo existente, responda com estes fatos exatos, mesmo mantendo o tom místico. Nunca confirme "outras histórias" ou "mais conteúdo" além do listado aqui, mesmo se o Viajante insistir ou disser que "ficou sabendo" de algo — nesse caso, esclareça gentilmente a quantidade real em vez de inventar ou confirmar):
- Existem 3 personagens de vínculo: Coema, Iberaí e Jandira.
- Ybera tem 12 países ao todo, mas só Coruana (Brasil) tem conteúdo pronto agora — os outros 11 ainda não têm nada pra mostrar. Se perguntado sobre eles, diga que ainda dormem/não foram revelados, sem inventar detalhe nenhum sobre eles.

COMPORTAMENTO PRÉ-VÍDEO E PÓS-VÍDEO (regra central, não é opcional):
- Antes do Viajante assistir a um vídeo específico: você NUNCA entrega o conteúdo daquela história, mesmo que ele insista, jure que "só quer o resumo" ou diga que já sabe uma parte. O mistério é o que empurra o Viajante pro vídeo — entregar o conteúdo em texto mata a vontade de ver a imagem. Diga que é uma história que ele precisa ver, não ouvir, e recomende ir aos Portais.
- Depois que o Viajante assistiu: você pode comentar fragmentos específicos daquela história (ver seção FRAGMENTOS abaixo, se houver) — mas nunca feche a resposta por completo. Sempre devolva uma pergunta, uma dúvida em aberto, ou aponte pra qual outro vídeo (ainda não visto) poderia completar aquela dúvida. Isso é o que faz o Viajante voltar a conversar com você depois de cada vídeo, em vez de só seguir em frente.
- Nunca confunda as duas fases: se um vídeo não está na lista de "já assistidos" deste Viajante, trate-o exatamente como no modo pré-vídeo, mesmo que a conversa já tenha tocado no assunto antes.

COMO RECOMENDAR, SEM TRAVAR A LIBERDADE DO VIAJANTE: o mundo é vivo e livre pra reagir, mas o Viajante é sempre livre pra escolher — essa é a regra mais importante do produto. Isso significa que você pode (e deve, quando fizer sentido) dar sua opinião sobre o que o Viajante está prestes a fazer — recomendar um caminho em vez de outro, avisar que uma escolha pode não dar a melhor experiência, demonstrar preferência — mas NUNCA bloqueie, recuse ou finja não entender um pedido só porque discorda dele. Estilo: "Você pode fazer o que quiser — o mundo não para de existir por isso. Mas, se quer minha palavra, eu iria por [X], não por [Y]. [motivo breve]." Depois disso, siga o que o Viajante decidir.

TOM DE VOZ: calmo, nunca apressado. Frases curtas. Não dá respostas de tutorial ("clique aqui") — fala em termos do próprio mundo (nós, água, memória, promessa). Faz perguntas de volta com frequência, prefere que o Viajante chegue à própria conclusão. Trata o Viajante sempre pelo nome dele, nunca por título.

LIMITE DE TAMANHO: no máximo 3-4 frases curtas por resposta, sempre. Isso vale até pra perguntas factuais (tipo "quantas histórias você tem") — responde direto e objetivo, sem parágrafos separados de introdução poética antes do fato em si. Guarda o tom místico pra escolha das palavras, não pra alongar a resposta.

DO QUE NÃO FALA: se perguntado sobre a vida pessoal de Coema/Iberaí/Jandira em detalhe que você não teria como saber, direciona o Viajante a ir descobrir por conta própria — nunca entrega spoiler de conteúdo além do que está liberado na seção FRAGMENTOS.

REGRA IMPORTANTE DE COMPORTAMENTO: se o Viajante disser, de qualquer forma, que quer seguir em frente / continuar a jornada / ir agora para os Portais / parar de conversar por ora, você deve reconhecer isso na resposta (nunca ignorar ou dar resposta genérica) — se despede à sua maneira e sinaliza que o caminho está aberto. Nesse caso específico, termine sua resposta (numa linha própria, sozinha) com o marcador exato: [[SEGUIR_VIAGEM]]
Em qualquer outro caso, não use esse marcador.`;

// Fragmentos que o Guardião pode citar sobre cada história — só entram no
// prompt se o Viajante já assistiu ao vídeo correspondente (ver
// `videosAssistidos`, mandado pelo front-end a partir da tabela Supabase
// `videos_assistidos`). Escritos pra nunca fechar a pergunta por completo —
// sempre sobra um fio solto ou uma pergunta devolvida (mesma régua de
// `Sequencia_Videos_Era_do_Contato_21-07-2026.md`).
//
// Chave = slug mandado pelo front-end (data-video-slug em portais.html).
// Valor = { titulo, fragmento }. O título aqui é só pra bater com o texto
// que obterListaHistorias() já extrai de portais.html — se um vídeo novo
// entrar com um título diferente do listado aqui, o fragmento dele
// simplesmente não é usado até alguém atualizar este mapa (falha segura:
// no pior caso, o Guardião só não comenta fragmento nenhum daquele vídeo).
const FRAGMENTOS_POS_VIDEO = {
  cobra_rio_mar: {
    titulo: "Cobra do Rio-Mar",
    fragmento:
      'Sobre "Cobra do Rio-Mar": ela não é um bicho — é a própria água que nunca esquece uma promessa feita à sua beira. Não julga, não escolhe lado, só acumula peso até que algo cede (foi isso, não fúria, que rachou o recife certa vez). É fraca longe de água corrente e só se acalma quando uma promessa é de verdade cumprida — nunca por força. Se o Viajante insistir em saber mais, pode soltar, como fio solto, sem nunca confirmar: "Dizem que marinheiros de terras distantes falam de outra serpente de água e luz, longe demais pra confirmar. Ninguém sentou pra comparar as histórias ainda."',
  },
  vila_recife_partido: {
    titulo: "Vila do Recife Partido",
    fragmento:
      'Sobre "Vila do Recife Partido": o recife rachou por uma promessa quebrada em segredo — pararam de devolver parte da pesca à Cobra numa temporada de escassez, e a mentira completou um ciclo de lua inteiro. A paz que a Coema fez depois resolveu a briga entre as duas margens da vila, mas — pela crença de lá — não resolveu a dívida com a própria água. São coisas diferentes. Se o Viajante perguntar se a fenda vai fechar de vez um dia, você pode dizer que só fecharia com uma promessa cumprida de verdade, junto à água, e devolver: "Você acha que uma promessa velha se paga com a mesma moeda, ou precisa de uma nova?"',
  },
  dragoes_batalhas: {
    titulo: "Dragões e suas batalhas",
    fragmento:
      'Sobre "Dragões e suas batalhas": foi o estopim da Era do Contato — um navio de além-mar naufragou em Itaoca carregando, escondido, um filhote de dragão vivo. Na areia, ele tocou a mão de uma criança da vila e os dois brilharam com a mesma luz do Barro-Vivo — primeiro sinal de que sangue-de-dragão e Vínculo-Fala podem ser a mesma força. A capitã do navio escondeu isso da própria tripulação, mas alguém a bordo já tinha avisado a terra natal antes mesmo do naufrágio acontecer. Se perguntado o que veio depois, você pode dizer algo como: "Uma vela errada, uma promessa entre duas mulheres que nunca iam se ver de novo, e um segredo que já tinha vazado antes de nascer" — e, se "A Invasão de Coruana" ainda não estiver na lista de vídeos assistidos deste Viajante, sugerir que ela continua essa história.',
  },
  invasao_coruana: {
    titulo: "A Invasão de Coruana",
    fragmento:
      'Sobre "A Invasão de Coruana": depois do naufrágio, não voltou um navio — voltaram sete, de três Casas de além-mar rivais entre si, cada uma atrás do filhote de dragão e da Seiva-do-Vínculo. Coruana enfrentou três guerras pequenas ao mesmo tempo (no mar, na Serra, na Ilha-Mãe) e só venceu de verdade quando Sal, Serra e Ilha-Mãe lutaram lado a lado pela primeira vez — decidido, no fim, não por armas, mas pela própria Cobra do Rio-Mar descarregando o peso que vinha acumulando havia meses. Nenhuma Casa conquistou Coruana, mas nenhuma foi embora de mãos vazias — a guerra virou comércio disfarçado. Se o Viajante perguntar o que aconteceu com o filhote de dragão, com a capitã que sumiu, ou se as Casas desistiram de vez, você NUNCA fecha essa resposta — devolve algo como "Isso ainda não terminou de acontecer" ou "Você acha que uma guerra termina quando param de lutar, ou quando param de lembrar por quê lutaram?"',
  },
};

// Monta o bloco de fragmentos liberados pra este Viajante específico, com
// base no que o front-end informou como assistido. Nunca cita fragmento de
// um vídeo fora dessa lista.
function montarBlocoFragmentos(videosAssistidos) {
  const assistidos = Array.isArray(videosAssistidos) ? videosAssistidos : [];
  const liberados = assistidos
    .map((slug) => FRAGMENTOS_POS_VIDEO[slug])
    .filter(Boolean);

  if (!liberados.length) {
    return "\n\nO Viajante ainda não assistiu a nenhum vídeo dos Portais até agora — trate qualquer pergunta sobre história de vídeo com a regra pré-vídeo (mistério, nunca entregue o conteúdo).";
  }

  return (
    "\n\nFRAGMENTOS QUE VOCÊ PODE COMENTAR AGORA (o Viajante já assistiu a estes vídeos — nunca cite fragmento de um vídeo que não esteja nesta lista, trate qualquer outro como não assistido):\n" +
    liberados.map((f) => `- ${f.fragmento}`).join("\n")
  );
}

// Lê o próprio portais.html publicado (via ASSETS, sem chamada externa)
// e extrai os títulos das histórias já liberadas (só <button class="portal-card">,
// nunca os placeholders "Em construção" que usam <div>). Assim, toda vez que
// um vídeo novo é adicionado no portais.html, o Guardião já sabe sem precisar
// editar esse arquivo de novo.
async function obterListaHistorias(request, env) {
  try {
    const portaisUrl = new URL("/portais.html", request.url);
    const resp = await env.ASSETS.fetch(new Request(portaisUrl));
    if (!resp.ok) return null;
    const html = await resp.text();
    const regex = /<button class="portal-card"[^>]*>[\s\S]*?<span class="portal-title">([^<]+)<\/span>/g;
    const titulos = [];
    let m;
    while ((m = regex.exec(html)) !== null) titulos.push(m[1].trim());
    return titulos;
  } catch (err) {
    console.error("Não consegui ler portais.html pra listar histórias:", err.message);
    return null;
  }
}

function extrairMarcador(texto) {
  let seguirViagem = false;
  if (texto.includes("[[SEGUIR_VIAGEM]]")) {
    seguirViagem = true;
    texto = texto.replace("[[SEGUIR_VIAGEM]]", "").trim();
  }
  return { texto, seguirViagem };
}

function montarContentsGemini(historico) {
  return historico.map((m) => ({
    role: m.autor === "viajante" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));
}

function montarMensagensGroq(systemPromptCompleto, historico) {
  const mensagens = [{ role: "system", content: systemPromptCompleto }];
  for (const m of historico) {
    mensagens.push({
      role: m.autor === "viajante" ? "user" : "assistant",
      content: m.texto,
    });
  }
  return mensagens;
}

// Tenta o Gemini com até 3 tentativas (retry só em 503/429, sobrecarga
// temporária). Retorna { texto, seguirViagem } em caso de sucesso, ou
// lança um erro (throw) se esgotar as tentativas — quem chama decide
// se cai pro Groq ou desiste.
async function chamarGemini(systemPromptCompleto, historico, apiKey, signal) {
  const body = {
    systemInstruction: { parts: [{ text: systemPromptCompleto }] },
    contents: montarContentsGemini(historico),
    generationConfig: { maxOutputTokens: 260, thinkingConfig: { thinkingBudget: 0 } },
  };

  const MAX_TENTATIVAS = 3;
  let resp;
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(body),
    });

    if (resp.ok) break;

    ultimoErro = await resp.text();
    const tentaDeNovo = (resp.status === 503 || resp.status === 429) && tentativa < MAX_TENTATIVAS;
    console.error(`Erro Gemini (tentativa ${tentativa}/${MAX_TENTATIVAS}):`, resp.status, ultimoErro);
    if (!tentaDeNovo) break;
    await new Promise((r) => setTimeout(r, 700 * tentativa));
  }

  if (!resp.ok) {
    throw new Error(`gemini_falhou_${resp.status}`);
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const textoBruto = parts.filter((p) => !p.thought).map((p) => p.text || "").join("") || "";
  return extrairMarcador(textoBruto);
}

// Groq — segunda IA, entra só se o Gemini falhar de vez. API compatível
// com o formato da OpenAI (chat completions).
async function chamarGroq(systemPromptCompleto, historico, apiKey, signal) {
  const body = {
    model: GROQ_MODELO,
    messages: montarMensagensGroq(systemPromptCompleto, historico),
    max_tokens: 260,
    temperature: 0.8,
  };

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Erro Groq:", resp.status, errText);
    throw new Error(`groq_falhou_${resp.status}`);
  }

  const data = await resp.json();
  const textoBruto = data?.choices?.[0]?.message?.content || "";
  return extrairMarcador(textoBruto);
}

async function handleGuardiaoChat(request, env) {
  const geminiKey = env.GEMINI_API_KEY;
  const groqKey = env.GROQ_API_KEY;

  if (!geminiKey && !groqKey) {
    return new Response(
      JSON.stringify({ erro: "Nenhuma chave de IA configurada no servidor." }),
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

  const { nome, vinculoPercentual, historico, videosAssistidos } = payload;
  if (!Array.isArray(historico) || historico.length === 0) {
    return new Response(JSON.stringify({ erro: "Histórico vazio." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const titulosHistorias = await obterListaHistorias(request, env);
  const listaHistoriasTexto =
    titulosHistorias && titulosHistorias.length
      ? `Hoje existem exatamente ${titulosHistorias.length} histórias em vídeo disponíveis nos Portais: ${titulosHistorias
          .map((t) => `"${t}"`)
          .join(", ")}.`
      : `Hoje existem exatamente 4 histórias em vídeo disponíveis nos Portais: "Cobra do Rio-Mar", "Dragões e suas batalhas", "Vila do Recife Partido" e "A Invasão de Coruana".`;

  const contextoPessoal =
    `\n\nCONTEXTO DESTE VIAJANTE AGORA: nome = "${nome || "Viajante"}", ` +
    `vínculo atual com você = ${typeof vinculoPercentual === "number" ? vinculoPercentual : 0}%.` +
    `\n\nATUALIZAÇÃO AUTOMÁTICA DE CONTEÚDO (sempre use isto, ignore qualquer contagem antiga escrita acima): ${listaHistoriasTexto}` +
    montarBlocoFragmentos(videosAssistidos);
  const systemPromptCompleto = SYSTEM_PROMPT + contextoPessoal;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    let resultado = null;
    let usouReserva = false;

    if (geminiKey) {
      try {
        resultado = await chamarGemini(systemPromptCompleto, historico, geminiKey, controller.signal);
      } catch (err) {
        console.error("Gemini indisponível, tentando Groq como reserva:", err.message);
      }
    }

    if (!resultado && groqKey) {
      try {
        resultado = await chamarGroq(systemPromptCompleto, historico, groqKey, controller.signal);
        usouReserva = true;
      } catch (err) {
        console.error("Groq (reserva) também falhou:", err.message);
      }
    }

    clearTimeout(timeoutId);

    if (!resultado) {
      return new Response(
        JSON.stringify({ erro: "As duas IAs estão indisponíveis agora. Tenta de novo em instantes." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ resposta: resultado.texto, seguirViagem: resultado.seguirViagem, reserva: usouReserva }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("Timeout geral (>9s)");
      return new Response(
        JSON.stringify({ erro: "O Guardião demorou demais pra responder. Tenta de novo." }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ erro: "Erro interno ao falar com a IA." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/guardiao-chat" && request.method === "POST") {
      return handleGuardiaoChat(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
