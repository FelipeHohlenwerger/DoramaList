// sw.js — Service Worker do Folhas
// Cacheia os arquivos estáticos do app para funcionar offline.
// Chamadas à API do TMDB NÃO são cacheadas (precisam de rede para buscar títulos novos).

const CACHE_NAME = 'folhas-cache-v1';
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

  event.respondWith(
    caches.match(event.request).then((respostaCache) => {
      if (respostaCache) return respostaCache;

      return fetch(event.request)
        .then((respostaRede) => {
          // Cacheia novas requisições de mesma origem para uso offline futuro
          const copia = respostaRede.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return respostaRede;
        })
        .catch(() => {
          // Sem rede e sem cache: se for navegação de página, devolve o index
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
