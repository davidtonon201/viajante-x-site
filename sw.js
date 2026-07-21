const CACHE_NAME = "viajante-x-v7";

// Só imagens/ícones ficam em cache (mudam pouco).
// HTML, CSS e JS sempre buscam a versão mais nova primeiro,
// pra nunca rodar código velho enquanto o projeto ainda muda rápido.
const ASSETS_IMAGENS = [
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/hero.jpg",
  "./assets/capa-cobra-rio-mar.jpeg",
  "./assets/capa-dragoes.jpeg",
  "./assets/capa-vila-recife-partido.jpeg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_IMAGENS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const isImagem = ASSETS_IMAGENS.some((path) => event.request.url.endsWith(path.replace("./", "")));

  if (isImagem) {
    // Imagens: cache primeiro (rápido, muda pouco).
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  } else {
    // HTML/CSS/JS: sempre busca versão nova primeiro.
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
