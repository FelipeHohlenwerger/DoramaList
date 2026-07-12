// tmdb.js — Integração com a API do TMDB (The Movie Database)
// Usado para buscar e importar doramas/filmes asiáticos para o catálogo pessoal.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_IMG_BASE_GRANDE = 'https://image.tmdb.org/t/p/w780';

// Idiomas usados como proxy para país quando filtramos filmes por região
// específica no Descobrir (filmes não retornam origin_country na busca).
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

// Busca tanto em "tv" quanto em "movie", sem restringir por país/idioma —
// o catálogo agora é geral (qualquer filme/série do mundo), não só doramas.
async function buscarTitulos(query) {
  if (!query || query.trim().length < 2) return [];

  const [tvResp, movieResp] = await Promise.all([
    chamarTmdb('/search/tv', { query }).catch(() => ({ results: [] })),
    chamarTmdb('/search/movie', { query }).catch(() => ({ results: [] })),
  ]);

  const tvs = (tvResp.results || []).map((r) => normalizarResultadoBusca(r, 'serie'));
  const filmes = (movieResp.results || []).map((r) => normalizarResultadoBusca(r, 'filme'));

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
  US: 'Estados Unidos',
  GB: 'Reino Unido',
  FR: 'França',
  DE: 'Alemanha',
  IT: 'Itália',
  ES: 'Espanha',
  PT: 'Portugal',
  BR: 'Brasil',
  MX: 'México',
  AR: 'Argentina',
  CO: 'Colômbia',
  CL: 'Chile',
  CA: 'Canadá',
  AU: 'Austrália',
  IN: 'Índia',
  RU: 'Rússia',
  TR: 'Turquia',
  PH: 'Filipinas',
  ID: 'Indonésia',
  VN: 'Vietnã',
  SE: 'Suécia',
  NO: 'Noruega',
  DK: 'Dinamarca',
  NL: 'Holanda',
  PL: 'Polônia',
};

async function descobrirTitulos({ tipo = 'serie', pais = '', pagina = 1, ordenarPor = 'popularity.desc' } = {}) {
  const endpoint = tipo === 'serie' ? '/discover/tv' : '/discover/movie';
  const params = {
    sort_by: ordenarPor,
    page: pagina,
    'vote_count.gte': 10, // evita títulos obscuros/sem avaliação nenhuma
  };

  // Só restringe por país/idioma se um país específico foi escolhido no
  // filtro do Descobrir. Sem escolha, traz de qualquer lugar do mundo — o
  // catálogo agora é geral (filmes/séries orientais e ocidentais).
  if (pais) {
    if (tipo === 'serie') {
      params.with_origin_country = pais;
    } else {
      params.with_original_language = paisParaIdioma(pais);
    }
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

// Busca detalhes completos para importar (gêneros, sinopse completa, episódios
// e país de origem). O elenco NÃO é preenchido automaticamente: o campo "name"
// de atores no TMDB é preenchido por quem cadastrou cada pessoa na base, e
// para atores chineses/taiwaneses/de Hong Kong é comum vir em script original
// (não romanizado), o que fica difícil de ler. Por isso o elenco é sempre
// cadastro manual — veja app.js.
async function buscarDetalhes(tmdbId, tipo) {
  const endpoint = tipo === 'serie' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const dados = await chamarTmdb(endpoint);

  const paisCodigo = dados.origin_country && dados.origin_country[0];
  const pais =
    (paisCodigo && MAPA_PAIS_LABEL[paisCodigo]) ||
    (dados.production_countries && dados.production_countries[0] && dados.production_countries[0].name) ||
    '';

  return {
    tmdbId: dados.id,
    tipo,
    titulo: tipo === 'serie' ? dados.name : dados.title,
    tituloOriginal: tipo === 'serie' ? dados.original_name : dados.original_title,
    sinopse: dados.overview || '',
    poster: dados.poster_path ? TMDB_IMG_BASE_GRANDE + dados.poster_path : null,
    ano: extrairAno(tipo === 'serie' ? dados.first_air_date : dados.release_date),
    generos: (dados.genres || []).map((g) => g.name),
    subgeneros: [],
    totalEpisodios: tipo === 'serie' ? (dados.number_of_episodes || null) : null,
    episodiosVistos: 0,
    elenco: [],
    pais,
    ondeSaiu: [],
    audio: '',
    avaliacaoTmdb: dados.vote_average || null,
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
