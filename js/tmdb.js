// tmdb.js — Integração com a API do TMDB (The Movie Database)
// Usado para buscar e importar doramas/filmes asiáticos para o catálogo pessoal.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_IMG_BASE_GRANDE = 'https://image.tmdb.org/t/p/w780';

// Países/idiomas considerados "dorama" para fins de filtro.
// Séries usam origin_country; filmes (que não retornam origin_country na busca)
// usam original_language como proxy.
const PAISES_ALVO = ['KR', 'JP', 'CN', 'TH', 'TW', 'HK'];
const IDIOMAS_ALVO = ['ko', 'ja', 'zh', 'th'];

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

function ehProducaoAsiatica(r, tipo) {
  // original_language é o critério mais confiável: é fixo por título e reflete
  // o idioma em que a obra foi originalmente roteirizada/falada.
  // origin_country pode listar múltiplos países de exibição/co-produção e
  // gerar falsos positivos (ex.: séries americanas antigas com versão/exibição
  // asiática listada). Por isso exigimos os dois critérios concordando,
  // OU usamos só o idioma quando origin_country vier vazio.
  const idiomaOk = IDIOMAS_ALVO.includes(r.original_language);

  if (tipo === 'serie') {
    const paises = r.origin_country || [];
    const paisOk = paises.some((p) => PAISES_ALVO.includes(p));
    if (paises.length === 0) return idiomaOk;
    // Exige concordância entre país de origem E idioma original.
    // Isso elimina casos como "Friends" (US, en) que às vezes aparecem
    // com country contaminado, e também elimina remakes locais com nomes
    // parecidos mas idioma diferente do original buscado.
    return paisOk && idiomaOk;
  }

  // Filmes não trazem origin_country na busca; usamos só o idioma original.
  return idiomaOk;
}

// Busca tanto em "tv" quanto em "movie", retornando apenas produções
// de origem asiática (Coreia, Japão, China, Taiwan, Hong Kong, Tailândia).
async function buscarTitulos(query) {
  if (!query || query.trim().length < 2) return [];

  const [tvResp, movieResp] = await Promise.all([
    chamarTmdb('/search/tv', { query }).catch(() => ({ results: [] })),
    chamarTmdb('/search/movie', { query }).catch(() => ({ results: [] })),
  ]);

  const tvs = (tvResp.results || [])
    .filter((r) => ehProducaoAsiatica(r, 'serie'))
    .map((r) => normalizarResultadoBusca(r, 'serie'));

  const filmes = (movieResp.results || [])
    .filter((r) => ehProducaoAsiatica(r, 'filme'))
    .map((r) => normalizarResultadoBusca(r, 'filme'));

  const combinados = [...tvs, ...filmes];
  combinados.sort((a, b) => (b.popularidade || 0) - (a.popularidade || 0));

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

// ===================== DESCOBRIR =====================
// Lista doramas populares/recentes direto, sem precisar buscar por nome.
// Usa o endpoint /discover, filtrando por país de origem (séries) ou
// idioma original (filmes), igual à busca.

const MAPA_PAIS_LABEL = {
  KR: 'Coreia do Sul',
  JP: 'Japão',
  CN: 'China',
  TH: 'Tailândia',
  TW: 'Taiwan',
  HK: 'Hong Kong',
};

async function descobrirTitulos({ tipo = 'serie', pais = '', pagina = 1, ordenarPor = 'popularity.desc' } = {}) {
  const endpoint = tipo === 'serie' ? '/discover/tv' : '/discover/movie';
  const params = {
    sort_by: ordenarPor,
    page: pagina,
    'vote_count.gte': 10, // evita títulos obscuros/sem avaliação nenhuma
  };

  if (tipo === 'serie') {
    params.with_origin_country = pais || PAISES_ALVO.join('|');
  } else {
    params.with_original_language = pais
      ? paisParaIdioma(pais)
      : IDIOMAS_ALVO.join('|');
  }

  const resp = await chamarTmdb(endpoint, params);
  const resultados = (resp.results || []).map((r) => normalizarResultadoBusca(r, tipo));
  return {
    resultados,
    paginaAtual: resp.page || 1,
    totalPaginas: resp.total_pages || 1,
  };
}

function paisParaIdioma(pais) {
  const mapa = { KR: 'ko', JP: 'ja', CN: 'zh', TW: 'zh', HK: 'zh', TH: 'th' };
  return mapa[pais] || IDIOMAS_ALVO.join('|');
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
  descobrirTitulos,
  buscarDetalhes,
  MAPA_PAIS_LABEL,
};
