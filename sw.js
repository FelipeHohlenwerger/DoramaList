// sw.js — Service Worker do Folhas
// Estratégia: NETWORK-FIRST para arquivos do app (HTML/CSS/JS) — sempre tenta
// buscar a versão mais nova primeiro, e só usa o cache se estiver offline.
// Isso garante que atualizações do app cheguem ao usuário sem precisar
// desinstalar o PWA. Chamadas à API do TMDB nunca são cacheadas.

const CACHE_NAME = 'folhas-cache-v3';
const ARQUIVOS_ESTATICOS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/tmdb.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar chamadas externas (TMDB, fontes do Google etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // NETWORK-FIRST: busca na rede; só usa cache se a rede falhar (offline).
  event.respondWith(
    fetch(event.request)
      .then((respostaRede) => {
        const copia = respostaRede.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respostaRede;
      })
      .catch(() =>
        caches.match(event.request).then((respostaCache) => {
          if (respostaCache) return respostaCache;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        })
      )
  );
});

// Permite que a página force a troca imediata de versão do Service Worker
// (usado pelo botão "Verificar atualizações" nas Configurações).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
