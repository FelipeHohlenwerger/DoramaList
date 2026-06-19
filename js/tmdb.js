// tmdb.js — Integração com a API do TMDB (The Movie Database)
// Usado para buscar e importar doramas/filmes asiáticos para o catálogo pessoal.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_IMG_BASE_GRANDE = 'https://image.tmdb.org/t/p/w780';

function getApiKey() {
  return localStorage.getItem('tmdb_api_key') || '';
}

function setApiKey(key) {
  localStorage.setItem('tmdb_api_key', key.trim());
}

function temApiKey() {
  return !!getApiKey();
}

async function chamarTmdb(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('SEM_API_KEY');
  }
  const url = new URL(TMDB_BASE + endpoint);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('API_KEY_INVALIDA');
    throw new Error('ERRO_TMDB_' + resp.status);
  }
  return resp.json();
}

// Busca tanto em "tv" quanto em "movie", priorizando produções asiáticas
// (Coreia, Japão, China, Tailândia) mas sem bloquear outros países.
async function buscarTitulos(query) {
  if (!query || query.trim().length < 2) return [];

  const [tvResp, movieResp] = await Promise.all([
    chamarTmdb('/search/tv', { query }).catch(() => ({ results: [] })),
    chamarTmdb('/search/movie', { query }).catch(() => ({ results: [] })),
  ]);

  const tvs = (tvResp.results || []).map((r) => normalizarResultadoBusca(r, 'serie'));
  const filmes = (movieResp.results || []).map((r) => normalizarResultadoBusca(r, 'filme'));

  // Ordena colocando produções de países asiáticos populares primeiro
  const paisesAlvo = ['KR', 'JP', 'CN', 'TH', 'TW', 'HK'];
  const combinados = [...tvs, ...filmes];
  combinados.sort((a, b) => {
    const aAlvo = paisesAlvo.includes(a.paisOrigem) ? 0 : 1;
    const bAlvo = paisesAlvo.includes(b.paisOrigem) ? 0 : 1;
    if (aAlvo !== bAlvo) return aAlvo - bAlvo;
    return (b.popularidade || 0) - (a.popularidade || 0);
  });

  return combinados;
}

function normalizarResultadoBusca(r, tipo) {
  return {
    tmdbId: r.id,
    tipo,
    titulo: tipo === 'serie' ? r.name : r.title,
    tituloOriginal: tipo === 'serie' ? r.original_name : r.original_title,
    poster: r.poster_path ? TMDB_IMG_BASE + r.poster_path : null,
    ano: extrairAno(tipo === 'serie' ? r.first_air_date : r.release_date),
    paisOrigem: (r.origin_country && r.origin_country[0]) || null,
    sinopseResumo: r.overview || '',
    popularidade: r.popularity || 0,
  };
}

function extrairAno(dataStr) {
  if (!dataStr) return null;
  const ano = parseInt(dataStr.slice(0, 4), 10);
  return Number.isNaN(ano) ? null : ano;
}

// Busca detalhes completos para importar (gêneros, sinopse completa, episódios etc.)
async function buscarDetalhes(tmdbId, tipo) {
  const endpoint = tipo === 'serie' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const dados = await chamarTmdb(endpoint);

  return {
    tmdbId: dados.id,
    tipo,
    titulo: tipo === 'serie' ? dados.name : dados.title,
    tituloOriginal: tipo === 'serie' ? dados.original_name : dados.original_title,
    sinopse: dados.overview || '',
    poster: dados.poster_path ? TMDB_IMG_BASE_GRANDE + dados.poster_path : null,
    ano: extrairAno(tipo === 'serie' ? dados.first_air_date : dados.release_date),
    generos: (dados.genres || []).map((g) => g.name),
    totalEpisodios: tipo === 'serie' ? (dados.number_of_episodes || null) : null,
    episodiosVistos: 0,
    status: 'quero_assistir',
    nota: null,
    resenha: '',
    favorito: false,
    origemManual: false,
  };
}

window.DoramaTMDB = {
  getApiKey,
  setApiKey,
  temApiKey,
  buscarTitulos,
  buscarDetalhes,
};
