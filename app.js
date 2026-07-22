// Registra o service worker (necessário para o PWA funcionar offline e ser instalável)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Falha ao registrar o service worker:", err);
    });
  });
}

// Botão flutuante "Falar com o Guardião" (presente em Portais, Universos,
// Diário, Vínculos): muda de texto se o Viajante já conversou com ele antes
// (marcado via localStorage na primeira vez que abre o chat), pra soar como
// "volta quando quiser" em vez de convite de primeira vez sempre.
const fabGuardiao = document.querySelector(".guardiao-fab");
if (fabGuardiao && localStorage.getItem("viajante_falou_com_guardiao") === "true") {
  fabGuardiao.textContent = "🌙 Volte quando quiser — o Guardião te espera";
}

// Tela de onboarding: cria a sessão do viajante e salva o nome no banco de dados.
const formViajante = document.querySelector("#form-viajante");
if (formViajante) {
  formViajante.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nome = new FormData(formViajante).get("nome")?.toString().trim();
    if (!nome) return;
    const botao = document.querySelector("#btn-continuar-onboard");
    if (botao) { botao.disabled = true; botao.textContent = "Um instante..."; }
    const ok = await criarPerfilViajante(nome);
    if (ok) {
      window.location.href = "guardiao.html";
    } else {
      if (botao) { botao.disabled = false; botao.textContent = "Continuar"; }
      alert("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
    }
  });
}

// Botões do menu inferior da tela inicial.
const TELAS = {
  "Portais": "portais.html",
  "Universos": "universos.html",
  "Diário do Viajante": "diario.html",
  "Vínculos": "vinculos.html",
};
document.querySelectorAll(".hit-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const destino = btn.getAttribute("aria-label");
    if (TELAS[destino]) window.location.href = TELAS[destino];
  });
});

// Tela de Diário: busca o nome real salvo no banco de dados.
const saudacao = document.querySelector("#diario-saudacao");
if (saudacao) {
  buscarPerfilAtual().then((perfil) => {
    saudacao.textContent = perfil?.nome
      ? `${perfil.nome}, sua jornada começou.`
      : "Você ainda não iniciou sua jornada — volta pra tela inicial e clica em Iniciar Jornada.";
  });
}

// Tela de Vínculos: busca os percentuais reais salvos no banco de dados.
const listaVinculos = document.querySelector("#lista-vinculos");
if (listaVinculos) {
  buscarVinculosAtuais().then((vinculos) => {
    if (vinculos.length === 0) {
      listaVinculos.innerHTML = '<p class="vinculo-desc">Você ainda não iniciou sua jornada — volta pra tela inicial e clica em Iniciar Jornada.</p>';
      return;
    }
    listaVinculos.innerHTML = vinculos.map((v) => `
      <div class="vinculo-item">
        <div class="vinculo-head">
          <span class="portal-title">${v.personagem}</span>
          <span class="vinculo-pct">${v.percentual}%</span>
        </div>
        <div class="vinculo-bar"><div class="vinculo-fill" style="width:${v.percentual}%"></div></div>
      </div>
    `).join("");
  });
}

// Player de vídeo dos Portais — abre o vídeo (hospedado no YouTube, "não listado")
// num modal por cima da tela, sem sair do app.
function abrirPlayerVideo(videoId, titulo) {
  const overlay = document.createElement("div");
  overlay.className = "video-modal";
  overlay.innerHTML = `
    <div class="video-modal-inner">
      <button class="video-modal-fechar" type="button" aria-label="Fechar">✕</button>
      <iframe
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0"
        title="${titulo}"
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.querySelector(".video-modal-fechar").addEventListener("click", fechar);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) fechar();
  });
  document.addEventListener("keydown", function escFecha(event) {
    if (event.key === "Escape") {
      fechar();
      document.removeEventListener("keydown", escFecha);
    }
  });
}

// Cards de história na tela de Portais. Se o card já tiver um vídeo conectado
// (atributo data-video-id preenchido com o ID do YouTube), abre o player.
// Caso contrário (ainda não hospedado), mostra o aviso de sempre.
document.querySelectorAll("button.portal-card:not(.portal-locked)").forEach((card) => {
  card.addEventListener("click", () => {
    const titulo = card.querySelector(".portal-title")?.textContent;
    const videoId = card.getAttribute("data-video-id");
    const pendente = !videoId || videoId.startsWith("COLOQUE_AQUI_ID");
    if (pendente) {
      alert(`"${titulo}" — o vídeo ainda vai ser conectado quando estiver hospedado.`);
    } else {
      abrirPlayerVideo(videoId, titulo);
    }
  });
});

// Botão de som ambiente do vídeo de fundo da tela do Guardião. Navegadores
// bloqueiam vídeo com som tocando sozinho, então ele sempre começa mudo —
// esse botão deixa o Viajante ativar o som quando quiser.
const videoFundoGuardiao = document.querySelector("#guardiao-video-fundo");
const btnSom = document.querySelector("#btn-som");
if (videoFundoGuardiao && btnSom) {
  btnSom.addEventListener("click", () => {
    videoFundoGuardiao.muted = !videoFundoGuardiao.muted;
    btnSom.textContent = videoFundoGuardiao.muted ? "🔇" : "🔊";
    if (!videoFundoGuardiao.muted) videoFundoGuardiao.play().catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Tela do Guardião do Nó (chat) — ligado na IA de verdade (Gemini), via
// Cloudflare Pages Function (functions/api/guardiao-chat.js). A chave de API
// fica só no servidor; o navegador só fala com nossa própria função.
// ---------------------------------------------------------------------------
const chatGuardiao = document.querySelector("#guardiao-chat");
if (chatGuardiao) {
  const formGuardiao = document.querySelector("#form-guardiao");
  const inputGuardiao = document.querySelector("#input-guardiao");
  const btnMic = document.querySelector("#btn-mic");
  const linkSeguir = document.querySelector(".guardiao-seguir");
  let nomeViajante = "Viajante";
  let vinculoAtual = 0;
  const historico = []; // [{ autor: "viajante"|"guardiao", texto }]

  function adicionarMensagem(texto, autor) {
    const div = document.createElement("div");
    div.className = `msg msg-${autor}`;
    div.textContent = texto;
    chatGuardiao.appendChild(div);
    chatGuardiao.scrollTop = chatGuardiao.scrollHeight;
    return div;
  }

  async function falarComGuardiao() {
    const resp = await fetch("/api/guardiao-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeViajante, vinculoPercentual: vinculoAtual, historico }),
    });
    if (!resp.ok) throw new Error("Falha na resposta do servidor");
    return resp.json();
  }

  async function iniciarConversa() {
    const [perfil, vinculos] = await Promise.all([buscarPerfilAtual(), buscarVinculosAtuais()]);
    if (perfil?.nome) nomeViajante = perfil.nome;
    const vinculoGuardiao = (vinculos || []).find((v) => v.personagem === "Guardião do Nó");
    if (vinculoGuardiao) vinculoAtual = vinculoGuardiao.percentual;

    const abertura =
      `${nomeViajante}. Coema falou de você antes mesmo de eu te ver chegar.\n` +
      `Eu sou o Guardião do Nó — não conto a história de Ybera, eu acompanho o que você faz com ela.\n` +
      `Pode falar comigo por texto, ou por voz, quando quiser.`;
    adicionarMensagem(abertura, "guardiao");
    historico.push({ autor: "guardiao", texto: abertura });
    localStorage.setItem("viajante_falou_com_guardiao", "true");
  }
  iniciarConversa();

  formGuardiao.addEventListener("submit", async (event) => {
    event.preventDefault();
    const texto = inputGuardiao.value.trim();
    if (!texto) return;
    adicionarMensagem(texto, "viajante");
    historico.push({ autor: "viajante", texto });
    inputGuardiao.value = "";

    const pensando = document.createElement("div");
    pensando.className = "msg-pensando";
    pensando.textContent = "o Guardião considera...";
    chatGuardiao.appendChild(pensando);
    chatGuardiao.scrollTop = chatGuardiao.scrollHeight;

    try {
      const { resposta, seguirViagem, erro } = await falarComGuardiao();
      pensando.remove();
      if (erro || !resposta) {
        adicionarMensagem("(a água ficou turva por um instante — tenta de novo)", "guardiao");
        return;
      }
      adicionarMensagem(resposta, "guardiao");
      historico.push({ autor: "guardiao", texto: resposta });
      if (seguirViagem && linkSeguir) {
        linkSeguir.textContent = "seguir viagem →";
        linkSeguir.classList.add("guardiao-seguir-destaque");
        linkSeguir.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      console.error("Erro ao falar com o Guardião:", err);
      pensando.remove();
      adicionarMensagem("(a água ficou turva por um instante — tenta de novo)", "guardiao");
    }
  });

  // Botão de microfone: usa a Web Speech API do navegador (gratuita, roda
  // local) pra transcrever fala em texto direto no campo — o Viajante ainda
  // revisa e manda pelo botão de enviar, igual manda uma mensagem escrita.
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognitionAPI && btnMic) {
    const reconhecimento = new SpeechRecognitionAPI();
    reconhecimento.lang = "pt-BR";
    reconhecimento.interimResults = false;
    let gravando = false;

    btnMic.addEventListener("click", () => {
      if (gravando) {
        reconhecimento.stop();
        return;
      }
      reconhecimento.start();
      gravando = true;
      btnMic.classList.add("gravando");
    });

    reconhecimento.addEventListener("result", (event) => {
      const texto = event.results[0]?.[0]?.transcript;
      if (texto) inputGuardiao.value = texto;
    });

    reconhecimento.addEventListener("end", () => {
      gravando = false;
      btnMic.classList.remove("gravando");
    });

    reconhecimento.addEventListener("error", () => {
      gravando = false;
      btnMic.classList.remove("gravando");
    });
  } else if (btnMic) {
    btnMic.disabled = true;
    btnMic.title = "Seu navegador não suporta ditado por voz";
  }
}
