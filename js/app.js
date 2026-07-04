// app.js — Lógica principal da interface do Folhas

const STATUS_LABEL = {
  quero_assistir: 'Quero assistir',
  assistindo: 'Assistindo',
  assistido: 'Assistido',
};

const TIPO_LABEL = {
  serie: 'Série',
  filme: 'Filme',
  minidrama: 'Minidrama',
  minisserie: 'Minissérie',
  dorama: 'Dorama',
  cdrama: 'C-Drama',
  kdrama: 'K-Drama',
  lakorn: 'Lakorn',
};

function labelTipo(tipo) {
  return TIPO_LABEL[tipo] || 'Série';
}

// Todos os tipos têm progresso de episódios, exceto Filme.
function temEpisodios(tipo) {
  return tipo !== 'filme';
}

const AUDIO_LABEL = {
  dublado: 'Dublado',
  legendado: 'Apenas legendado',
  dublado_legendado: 'Dublado & Legendado',
};

// Lista de subgêneros comuns em doramas/minidramas, usada nos chips rápidos
// do formulário de cadastro (com busca, já que a lista é grande).
const SUBGENEROS = [
  'Heroína', 'Amor Doce', 'CEO/Milionário', 'Carinho Doce', 'Identidade Secreta',
  'Herdeiro', 'Vingança', 'Comédia Leve', 'Jornada da Mulher', 'Ásia Antiga',
  'Amor após Casamento', 'Família', 'Realista', 'Redenção', 'Libertação',
  'Viagem no Tempo', 'Mal-entendido', 'Amor Secreto', 'Bebê Fofo', 'Reencontro',
  'Meia-idade', 'Casamento Rápido', 'Superpoder', 'Diferença de Idade',
  'Relação Contratual', 'Tensão Amorosa', 'Poderoso', 'Cultivo Imortal',
  'Anos 80', 'Amor Doloroso', 'Conflito Familiar', 'Amor à Primeira Vista',
  'Engano', 'Sofrido', 'Destino', 'Amor Triangular', 'Amor Forçado', 'Amante',
  'Grávida em Fuga', 'A Herdeira Falsa', 'Sistema', 'Reencontrar',
  'Amor Proibido', 'Harém', 'Máfia', 'República da China', 'Príncipe Consorte',
  'Imperador', 'Substituto', 'Médico Milagroso', 'General', 'Final Trágico',
  'Queda da Família', 'Apocalipse', 'Reencarnação', 'Renascimento',
  'Transmigração', 'Inimigos para Amantes', 'Amigos para Amantes',
  'Namoro Falso', 'Amor lento', 'Proximidade Forçada', 'Grumpy x Sunshine',
  'Os opostos se atraem', 'Almas gêmeas/destino', 'Segunda Chances',
];

// Lista de plataformas comuns de distribuição, usada nos chips rápidos
// do campo "Onde saiu".
const PLATAFORMAS_COMUNS = [
  'Telegram', 'Netflix', 'Amazon', 'YouTube', 'TikTok', 'BonusTV', 'Mololo',
  'FreeReels', 'SuaNovela', 'SuperCine.TV', 'FordBrowser', 'PineDrama',
];

let estado = {
  titulos: [],
  filtroStatus: 'todos',
  filtroGenero: '',
  filtroTipo: '',
  filtroElenco: null,
  ordenacao: 'recente',
  buscaDebounce: null,
  abaAtiva: 'biblioteca',
  descobrir: {
    pagina: 1,
    totalPaginas: 1,
    carregando: false,
  },
};

// ===================== INICIALIZAÇÃO =====================

document.addEventListener('DOMContentLoaded', async () => {
  registrarServiceWorker();
  await carregarTitulos();
  popularFiltroGeneros();
  renderizarLista();
  prepararEventos();
  carregarApiKeyNaTela();
});

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then((registro) => {
    // Se já existe um worker esperando (nova versão pronta), ativa e recarrega.
    if (registro.waiting) {
      registro.waiting.postMessage('SKIP_WAITING');
    }

    registro.addEventListener('updatefound', () => {
      const novoWorker = registro.installing;
      novoWorker.addEventListener('statechange', () => {
        if (novoWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nova versão instalada: ativa imediatamente.
          novoWorker.postMessage('SKIP_WAITING');
        }
      });
    });
  }).catch(() => {
    // Falha silenciosa: app continua funcionando sem cache offline
  });

  // Quando o novo worker assume o controle, recarrega a página uma única vez
  // para garantir que o HTML/CSS/JS novos sejam usados.
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    window.location.reload();
  });
}

async function carregarTitulos() {
  estado.titulos = await window.DoramaDB.listarTodosTitulos();
}

// ===================== EVENTOS GERAIS =====================

function prepararEventos() {
  // Busca TMDB
  const campoBusca = document.getElementById('campo-busca');
  const btnLimpar = document.getElementById('btn-limpar-busca');

  campoBusca.addEventListener('input', () => {
    const valor = campoBusca.value.trim();
    btnLimpar.classList.toggle('oculto', valor.length === 0);
    clearTimeout(estado.buscaDebounce);
    if (valor.length < 2) {
      document.getElementById('resultados-busca').classList.add('oculto');
      return;
    }
    estado.buscaDebounce = setTimeout(() => executarBuscaTmdb(valor), 450);
  });

  btnLimpar.addEventListener('click', () => {
    campoBusca.value = '';
    btnLimpar.classList.add('oculto');
    document.getElementById('resultados-busca').classList.add('oculto');
    campoBusca.focus();
  });

  // Filtros de status (chips)
  document.getElementById('filtros-status').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-status');
    if (!chip) return;
    document.querySelectorAll('.chip-status').forEach((c) => c.classList.remove('ativo'));
    chip.classList.add('ativo');
    estado.filtroStatus = chip.dataset.status;
    renderizarLista();
  });

  document.getElementById('filtro-genero').addEventListener('change', (e) => {
    estado.filtroGenero = e.target.value;
    renderizarLista();
  });

  document.getElementById('filtro-tipo').addEventListener('change', (e) => {
    estado.filtroTipo = e.target.value;
    renderizarLista();
  });

  document.getElementById('filtro-ordenacao').addEventListener('change', (e) => {
    estado.ordenacao = e.target.value;
    renderizarLista();
  });

  // Abas principais (Minha lista / Descobrir)
  document.getElementById('abas-principais').addEventListener('click', (e) => {
    const aba = e.target.closest('.aba');
    if (!aba) return;
    trocarAba(aba.dataset.aba);
  });

  // Filtros da aba Descobrir
  document.getElementById('descobrir-pais').addEventListener('change', () => carregarDescobrir(true));
  document.getElementById('descobrir-tipo').addEventListener('change', () => carregarDescobrir(true));
  document.getElementById('descobrir-ordenacao').addEventListener('change', () => carregarDescobrir(true));
  document.getElementById('btn-carregar-mais').addEventListener('click', () => carregarDescobrir(false));

  // Botões de abrir modais
  document.getElementById('btn-add-manual').addEventListener('click', () => abrirModalManual());
  document.getElementById('btn-config').addEventListener('click', () => abrirModal('modal-config'));

  // Fechar modais (qualquer botão com data-fechar, ou clique fora do card)
  document.querySelectorAll('[data-fechar]').forEach((el) => {
    el.addEventListener('click', () => fecharModal(el.dataset.fechar));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fecharModal(overlay.id);
    });
  });

  // Form de cadastro manual
  document.getElementById('manual-tipo').addEventListener('change', (e) => {
    atualizarCamposFormularioPorTipo(e.target.value);
  });
  document.getElementById('form-manual').addEventListener('submit', salvarFormManual);

  // Chips de gênero rápido: clicar adiciona/remove do campo de texto
  document.getElementById('generos-rapidos').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-genero-rapido');
    if (!chip) return;
    gerGeneros.alternar(chip.dataset.valor);
  });
  document.getElementById('manual-generos').addEventListener('input', () => gerGeneros.sincronizar());

  // Chips de "onde saiu"
  document.getElementById('onde-saiu-rapidos').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-genero-rapido');
    if (!chip) return;
    gerOndeSaiu.alternar(chip.dataset.valor);
  });
  document.getElementById('manual-onde-saiu').addEventListener('input', () => gerOndeSaiu.sincronizar());

  // Chips de subgênero (lista renderizada dinamicamente, com busca)
  document.getElementById('subgeneros-rapidos').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-genero-rapido');
    if (!chip) return;
    gerSubgeneros.alternar(chip.dataset.valor);
  });
  document.getElementById('manual-subgeneros').addEventListener('input', () => gerSubgeneros.sincronizar());
  document.getElementById('busca-subgeneros').addEventListener('input', (e) => {
    renderizarChipsSubgeneros(e.target.value);
  });

  // Elenco: adicionar por Enter ou pelo botão
  document.getElementById('btn-add-elenco').addEventListener('click', adicionarAtorDoInput);
  document.getElementById('manual-elenco-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      adicionarAtorDoInput();
    }
  });
  document.getElementById('elenco-chips').addEventListener('click', (e) => {
    const btnRemover = e.target.closest('[data-remover-ator]');
    if (!btnRemover) return;
    removerAtor(btnRemover.dataset.removerAtor);
  });

  // Limpar filtro de elenco ativo
  document.getElementById('btn-limpar-filtro-elenco').addEventListener('click', () => {
    estado.filtroElenco = null;
    document.getElementById('filtro-elenco-ativo').classList.add('oculto');
    renderizarLista();
  });

  // Buscar imagem do poster: abre busca de imagens do Google numa nova aba
  document.getElementById('btn-buscar-poster').addEventListener('click', () => {
    const titulo = document.getElementById('manual-titulo').value.trim();
    if (!titulo) {
      mostrarToast('Digite o título antes de buscar a imagem.');
      return;
    }
    const query = encodeURIComponent(`${titulo} poster`);
    window.open(`https://www.google.com/search?q=${query}&tbm=isch`, '_blank');
  });

  // Duplicar último cadastro
  document.getElementById('btn-duplicar-ultimo').addEventListener('click', duplicarUltimoCadastro);

  // Configurações
  document.getElementById('btn-salvar-api-key').addEventListener('click', salvarApiKeyTela);
  document.getElementById('btn-exportar').addEventListener('click', exportarBackup);
  document.getElementById('btn-importar').addEventListener('click', () => {
    document.getElementById('input-importar-arquivo').click();
  });
  document.getElementById('input-importar-arquivo').addEventListener('change', importarBackup);
  document.getElementById('btn-verificar-atualizacao').addEventListener('click', verificarAtualizacao);
}

// ===================== BUSCA TMDB =====================

async function executarBuscaTmdb(query) {
  const container = document.getElementById('resultados-busca');

  if (!window.DoramaTMDB.temApiKey()) {
    container.classList.remove('oculto');
    container.innerHTML = `<div class="resultado-aviso">
      Configure sua chave da API do TMDB em <strong>Configurações</strong> (⚙) para buscar títulos online.
      Você ainda pode cadastrar manualmente com o botão "+ Cadastrar".
    </div>`;
    return;
  }

  container.classList.remove('oculto');
  container.innerHTML = `<div class="resultado-vazio">Buscando...</div>`;

  try {
    const resultados = await window.DoramaTMDB.buscarTitulos(query);
    if (resultados.length === 0) {
      container.innerHTML = `<div class="resultado-vazio">Nenhum título encontrado. Tente outro nome ou cadastre manualmente.</div>`;
      return;
    }
    container.innerHTML = '';
    resultados.slice(0, 20).forEach((r) => container.appendChild(criarItemResultado(r)));
  } catch (err) {
    if (err.message === 'API_KEY_INVALIDA') {
      container.innerHTML = `<div class="resultado-aviso">Sua chave da API parece inválida. Verifique em Configurações.</div>`;
    } else {
      container.innerHTML = `<div class="resultado-aviso">Não foi possível buscar agora. Verifique sua conexão.</div>`;
    }
  }
}

function criarItemResultado(r) {
  const div = document.createElement('div');
  div.className = 'resultado-item';

  const jaExiste = estado.titulos.some((t) => t.tmdbId === r.tmdbId);

  div.innerHTML = `
    ${r.poster
      ? `<img class="resultado-poster" src="${r.poster}" alt="" />`
      : `<div class="resultado-poster"></div>`}
    <div class="resultado-info">
      <div class="nome">${escapeHtml(r.titulo)}</div>
      <div class="meta">${labelTipo(r.tipo)}${r.ano ? ' · ' + r.ano : ''}</div>
    </div>
    <button class="resultado-acao" ${jaExiste ? 'disabled' : ''}>${jaExiste ? 'Na lista' : 'Adicionar'}</button>
  `;

  if (!jaExiste) {
    div.querySelector('.resultado-acao').addEventListener('click', (e) => {
      e.stopPropagation();
      importarDeTmdb(r.tmdbId, r.tipo);
    });
    div.style.cursor = 'pointer';
  }

  return div;
}

async function importarDeTmdb(tmdbId, tipo) {
  try {
    const detalhes = await window.DoramaTMDB.buscarDetalhes(tmdbId, tipo);
    const agora = new Date().toISOString();
    const novoTitulo = {
      id: window.DoramaDB.gerarId(),
      ...detalhes,
      criadoEm: agora,
    };
    await window.DoramaDB.salvarTitulo(novoTitulo);
    await carregarTitulos();
    popularFiltroGeneros();
    renderizarLista();
    mostrarToast(`"${novoTitulo.titulo}" adicionado à sua lista`);

    document.getElementById('campo-busca').value = '';
    document.getElementById('btn-limpar-busca').classList.add('oculto');
    document.getElementById('resultados-busca').classList.add('oculto');
  } catch (err) {
    mostrarToast('Não foi possível importar este título agora.');
  }
}

// ===================== ABA: DESCOBRIR =====================

function trocarAba(aba) {
  estado.abaAtiva = aba;

  document.querySelectorAll('.aba').forEach((el) => {
    el.classList.toggle('ativo', el.dataset.aba === aba);
  });

  const ehBiblioteca = aba === 'biblioteca';
  document.getElementById('filtros-status').classList.toggle('oculto', !ehBiblioteca);
  document.getElementById('lista-principal').classList.toggle('oculto', !ehBiblioteca);
  document.getElementById('estado-vazio').classList.toggle('oculto', true); // recalculado abaixo se preciso

  // filtros-secundarios é compartilhado visualmente mas com conteúdo diferente por aba;
  // o de "Minha lista" já existe acima do main, o de "Descobrir" está dentro da section.
  const filtrosBiblioteca = document.querySelectorAll('.filtros-secundarios')[0];
  filtrosBiblioteca.classList.toggle('oculto', !ehBiblioteca);

  document.getElementById('secao-descobrir').classList.toggle('oculto', ehBiblioteca);

  if (ehBiblioteca) {
    renderizarLista();
  } else if (document.getElementById('grid-descobrir').children.length === 0) {
    carregarDescobrir(true);
  }
}

async function carregarDescobrir(reiniciar) {
  if (estado.descobrir.carregando) return;

  if (!window.DoramaTMDB.temApiKey()) {
    document.getElementById('descobrir-aviso-key').classList.remove('oculto');
    document.getElementById('descobrir-aviso-key').innerHTML =
      'Configure sua chave da API do TMDB em <strong>Configurações</strong> (⚙) para descobrir títulos.';
    document.getElementById('grid-descobrir').innerHTML = '';
    document.getElementById('btn-carregar-mais').classList.add('oculto');
    return;
  }
  document.getElementById('descobrir-aviso-key').classList.add('oculto');

  if (reiniciar) {
    estado.descobrir.pagina = 1;
    document.getElementById('grid-descobrir').innerHTML = '';
  }

  const pais = document.getElementById('descobrir-pais').value;
  const tipo = document.getElementById('descobrir-tipo').value;
  const ordenarPor = document.getElementById('descobrir-ordenacao').value;

  estado.descobrir.carregando = true;
  document.getElementById('descobrir-carregando').classList.remove('oculto');
  document.getElementById('btn-carregar-mais').classList.add('oculto');

  try {
    const { resultados, paginaAtual, totalPaginas } = await window.DoramaTMDB.descobrirTitulos({
      tipo,
      pais,
      pagina: estado.descobrir.pagina,
      ordenarPor,
    });

    estado.descobrir.totalPaginas = totalPaginas;

    const grid = document.getElementById('grid-descobrir');
    if (resultados.length === 0 && paginaAtual === 1) {
      grid.innerHTML = '<div class="resultado-vazio">Nenhum título encontrado com esses filtros.</div>';
    } else {
      resultados.forEach((r) => grid.appendChild(criarCardDescobrir(r)));
    }

    if (paginaAtual < totalPaginas) {
      document.getElementById('btn-carregar-mais').classList.remove('oculto');
      estado.descobrir.pagina = paginaAtual + 1;
    }
  } catch (err) {
    document.getElementById('descobrir-aviso-key').classList.remove('oculto');
    document.getElementById('descobrir-aviso-key').textContent =
      err.message === 'API_KEY_INVALIDA'
        ? 'Sua chave da API parece inválida. Verifique em Configurações.'
        : 'Não foi possível carregar agora. Verifique sua conexão.';
  } finally {
    estado.descobrir.carregando = false;
    document.getElementById('descobrir-carregando').classList.add('oculto');
  }
}

function criarCardDescobrir(r) {
  const existente = estado.titulos.find((t) => t.tmdbId === r.tmdbId);

  const card = document.createElement('div');
  card.className = 'card-titulo';
  card.innerHTML = `
    <div class="card-poster-wrap">
      ${r.poster
        ? `<img src="${r.poster}" alt="" loading="lazy" />`
        : `<div class="card-poster-placeholder">${escapeHtml(r.titulo)}</div>`}
      <button class="card-descobrir-acao" ${existente ? 'disabled' : ''} title="${existente ? 'Já está na sua lista' : 'Adicionar à minha lista'}">
        ${existente ? '✓' : '+'}
      </button>
    </div>
    <div class="card-info">
      <div class="titulo">${escapeHtml(r.titulo)}</div>
      <div class="ano">${r.ano || ''}${r.ano ? ' · ' : ''}${labelTipo(r.tipo)}</div>
    </div>
  `;

  const btnAcao = card.querySelector('.card-descobrir-acao');
  if (!existente) {
    btnAcao.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnAcao.disabled = true;
      await importarDeTmdb(r.tmdbId, r.tipo);
      btnAcao.textContent = '✓';
      btnAcao.title = 'Já está na sua lista';
    });
  }

  // Clicar em qualquer outra parte do card abre a prévia (ou os detalhes
  // completos, se o título já tiver sido adicionado à biblioteca).
  card.addEventListener('click', () => {
    const atual = estado.titulos.find((t) => t.tmdbId === r.tmdbId);
    if (atual) {
      abrirModalDetalhes(atual.id);
    } else {
      abrirPreviewDescobrir(r);
    }
  });

  return card;
}

// Prévia de um título ainda não adicionado à biblioteca: busca os detalhes
// completos no TMDB (sinopse, gêneros, elenco) e mostra num modal com um
// botão para adicionar — reaproveita o mesmo modal de detalhes.
async function abrirPreviewDescobrir(r) {
  const container = document.getElementById('detalhes-conteudo');
  container.innerHTML = '<p class="detalhes-sinopse">Carregando informações...</p>';
  abrirModal('modal-detalhes');

  try {
    const detalhes = await window.DoramaTMDB.buscarDetalhes(r.tmdbId, r.tipo);
    container.innerHTML = renderizarPreviewHtml(detalhes);
    document.getElementById('preview-btn-adicionar').addEventListener('click', async () => {
      await importarDeTmdb(r.tmdbId, r.tipo);
      fecharModal('modal-detalhes');
    });
  } catch (err) {
    container.innerHTML = '<p class="detalhes-sinopse">Não foi possível carregar as informações agora. Verifique sua conexão.</p>';
  }
}

function renderizarPreviewHtml(t) {
  const generosHtml = (t.generos || [])
    .map((g) => `<span class="tag-genero">${escapeHtml(g)}</span>`)
    .join('');

  const elencoHtml = (t.elenco || []).length
    ? `
      <div class="detalhes-bloco">
        <div class="detalhes-bloco-titulo">Elenco principal</div>
        <div class="detalhes-generos">
          ${(t.elenco || []).map((nome) => `<span class="tag-genero">${escapeHtml(nome)}</span>`).join('')}
        </div>
      </div>
    `
    : '';

  return `
    <div class="detalhes-topo">
      ${t.poster
        ? `<img class="detalhes-poster" src="${t.poster}" alt="" />`
        : `<div class="detalhes-poster card-poster-placeholder">${escapeHtml(t.titulo)}</div>`}
      <div class="detalhes-cabecalho">
        <h2>${escapeHtml(t.titulo)}</h2>
        ${t.tituloOriginal ? `<div class="original">${escapeHtml(t.tituloOriginal)}</div>` : ''}
        <div class="progresso-texto">${t.ano || 'Ano desconhecido'} · ${labelTipo(t.tipo)}${t.pais ? ' · ' + escapeHtml(t.pais) : ''}</div>
        ${t.avaliacaoTmdb ? `<div class="progresso-texto">★ ${t.avaliacaoTmdb.toFixed(1)} no TMDB</div>` : ''}
        <div class="detalhes-generos">${generosHtml}</div>
      </div>
    </div>

    ${t.sinopse ? `<p class="detalhes-sinopse">${escapeHtml(t.sinopse)}</p>` : '<p class="detalhes-sinopse">Sinopse não disponível.</p>'}

    ${elencoHtml}

    <div class="modal-acoes">
      <button type="button" class="btn-primario" id="preview-btn-adicionar" style="width:100%">+ Adicionar à minha lista</button>
    </div>
  `;
}

function filtrarPorAtor(nome) {
  estado.filtroElenco = nome;
  document.getElementById('filtro-elenco-nome').textContent = nome;
  document.getElementById('filtro-elenco-ativo').classList.remove('oculto');
  fecharModal('modal-detalhes');
  if (estado.abaAtiva !== 'biblioteca') {
    trocarAba('biblioteca');
  } else {
    renderizarLista();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================== RENDERIZAÇÃO DA LISTA =====================

function popularFiltroGeneros() {
  const select = document.getElementById('filtro-genero');
  const generosUnicos = new Set();
  estado.titulos.forEach((t) => (t.generos || []).forEach((g) => generosUnicos.add(g)));

  const valorAtual = select.value;
  select.innerHTML = '<option value="">Todas as categorias</option>';
  Array.from(generosUnicos).sort().forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });
  select.value = valorAtual;

  popularSugestoesAtores();
}

function obterTitulosFiltrados() {
  let lista = [...estado.titulos];

  if (estado.filtroStatus !== 'todos') {
    lista = lista.filter((t) => t.status === estado.filtroStatus);
  }
  if (estado.filtroGenero) {
    lista = lista.filter((t) => (t.generos || []).includes(estado.filtroGenero));
  }
  if (estado.filtroTipo) {
    lista = lista.filter((t) => t.tipo === estado.filtroTipo);
  }
  if (estado.filtroElenco) {
    const alvo = estado.filtroElenco.toLowerCase();
    lista = lista.filter((t) => (t.elenco || []).some((n) => n.toLowerCase() === alvo));
  }

  switch (estado.ordenacao) {
    case 'alfabetica':
      lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
      break;
    case 'nota':
      lista.sort((a, b) => (b.nota || -1) - (a.nota || -1));
      break;
    case 'ano':
      lista.sort((a, b) => (b.ano || 0) - (a.ano || 0));
      break;
    default: // recente
      lista.sort((a, b) => new Date(b.atualizadoEm || b.criadoEm) - new Date(a.atualizadoEm || a.criadoEm));
  }

  return lista;
}

function renderizarLista() {
  const container = document.getElementById('lista-principal');
  const vazio = document.getElementById('estado-vazio');
  const lista = obterTitulosFiltrados();

  if (lista.length === 0) {
    container.innerHTML = '';
    vazio.classList.remove('oculto');
    return;
  }
  vazio.classList.add('oculto');

  container.innerHTML = '';
  lista.forEach((titulo) => container.appendChild(criarCardTitulo(titulo)));
}

function criarCardTitulo(titulo) {
  const card = document.createElement('div');
  card.className = 'card-titulo';
  card.innerHTML = `
    <div class="card-poster-wrap">
      ${titulo.poster
        ? `<img src="${titulo.poster}" alt="" loading="lazy" />`
        : `<div class="card-poster-placeholder">${escapeHtml(titulo.titulo)}</div>`}
      <span class="card-status-tag tag-${titulo.status}">${STATUS_LABEL[titulo.status]}</span>
      ${titulo.nota ? `<span class="card-nota">★ ${titulo.nota}</span>` : ''}
    </div>
    <div class="card-info">
      <div class="titulo">${escapeHtml(titulo.titulo)}</div>
      <div class="ano">${titulo.ano || ''}${titulo.ano && titulo.tipo ? ' · ' : ''}${labelTipo(titulo.tipo)}</div>
    </div>
  `;
  card.addEventListener('click', () => abrirModalDetalhes(titulo.id));
  return card;
}

// ===================== MODAL DE DETALHES =====================

async function abrirModalDetalhes(id) {
  const titulo = await window.DoramaDB.buscarTituloPorId(id);
  if (!titulo) return;

  const container = document.getElementById('detalhes-conteudo');
  container.innerHTML = renderizarDetalhesHtml(titulo);
  abrirModal('modal-detalhes');
  prepararEventosDetalhes(titulo);
}

function renderizarDetalhesHtml(t) {
  const generosHtml = (t.generos || [])
    .map((g) => `<span class="tag-genero">${escapeHtml(g)}</span>`)
    .join('');

  const subgenerosHtml = (t.subgeneros || []).length
    ? `
      <div class="detalhes-bloco">
        <div class="detalhes-bloco-titulo">Subgêneros</div>
        <div class="detalhes-generos">${(t.subgeneros || []).map((s) => `<span class="tag-genero">${escapeHtml(s)}</span>`).join('')}</div>
      </div>
    `
    : '';

  const ondeSaiuHtml = (t.ondeSaiu || []).length
    ? `
      <div class="detalhes-bloco">
        <div class="detalhes-bloco-titulo">Onde saiu</div>
        <div class="detalhes-generos">${(t.ondeSaiu || []).map((s) => `<span class="tag-genero">${escapeHtml(s)}</span>`).join('')}</div>
      </div>
    `
    : '';

  const infoExtra = [
    t.pais ? escapeHtml(t.pais) : '',
    t.audio ? (AUDIO_LABEL[t.audio] || '') : '',
  ].filter(Boolean).join(' · ');

  const elencoHtml = (t.elenco || []).length
    ? `
      <div class="detalhes-bloco">
        <div class="detalhes-bloco-titulo">Elenco principal</div>
        <div class="detalhes-generos">
          ${(t.elenco || []).map((nome) => `<button type="button" class="elenco-ator-clicavel" data-ator="${escapeHtml(nome)}">${escapeHtml(nome)}</button>`).join('')}
        </div>
      </div>
    `
    : '';

  const progressoHtml = temEpisodios(t.tipo)
    ? `
      <div class="detalhes-bloco">
        <div class="detalhes-bloco-titulo">Progresso</div>
        <div class="progresso-episodios">
          <input type="number" id="det-episodios" min="0" max="${t.totalEpisodios || 9999}" value="${t.episodiosVistos || 0}" />
          <span class="progresso-texto">de ${t.totalEpisodios ? t.totalEpisodios + ' episódios' : 'episódios (total desconhecido)'}</span>
        </div>
        <div class="barra-progresso">
          <div class="barra-progresso-fill" style="width: ${calcularPercentual(t)}%"></div>
        </div>
      </div>
    `
    : '';

  const estrelas = Array.from({ length: 5 }, (_, i) => {
    const valor = (i + 1) * 2; // permite notas 2,4,6,8,10 com clique simples; meio-ponto via duplo
    const ativa = (t.nota || 0) >= valor ? 'ativa' : '';
    return `<span class="estrela ${ativa}" data-valor="${valor}">★</span>`;
  }).join('');

  return `
    <div class="detalhes-topo">
      ${t.poster
        ? `<img class="detalhes-poster" src="${t.poster}" alt="" />`
        : `<div class="detalhes-poster card-poster-placeholder">${escapeHtml(t.titulo)}</div>`}
      <div class="detalhes-cabecalho">
        <h2>${escapeHtml(t.titulo)}</h2>
        ${t.tituloOriginal ? `<div class="original">${escapeHtml(t.tituloOriginal)}</div>` : ''}
        <div class="progresso-texto">${t.ano || 'Ano desconhecido'} · ${labelTipo(t.tipo)}</div>
        ${infoExtra ? `<div class="progresso-texto">${infoExtra}</div>` : ''}
        <div class="detalhes-generos">${generosHtml}</div>
      </div>
    </div>

    ${t.sinopse ? `<p class="detalhes-sinopse">${escapeHtml(t.sinopse)}</p>` : ''}

    <div class="detalhes-bloco">
      <div class="detalhes-bloco-titulo">Status</div>
      <div class="status-opcoes">
        ${Object.entries(STATUS_LABEL).map(([valor, label]) => `
          <button class="status-opcao ${t.status === valor ? 'ativo' : ''}" data-status="${valor}">${label}</button>
        `).join('')}
      </div>
    </div>

    ${progressoHtml}
    ${subgenerosHtml}
    ${ondeSaiuHtml}
    ${elencoHtml}

    <div class="detalhes-bloco">
      <div class="detalhes-bloco-titulo">Sua avaliação</div>
      <div class="avaliacao-estrelas" id="det-estrelas">${estrelas}</div>
    </div>

    <div class="detalhes-bloco">
      <div class="detalhes-bloco-titulo">Resenha pessoal</div>
      <textarea class="resenha-texto" id="det-resenha" placeholder="O que achou? (opcional)">${escapeHtml(t.resenha || '')}</textarea>
    </div>

    <div class="detalhes-acoes-finais">
      <button class="btn-favorito ${t.favorito ? 'ativo' : ''}" id="det-favorito" title="Favoritar">${t.favorito ? '♥' : '♡'}</button>
      <button class="btn-secundario" id="det-editar" style="flex:1">Editar dados</button>
      <button class="btn-perigo" id="det-excluir">Excluir</button>
    </div>
  `;
}

function calcularPercentual(t) {
  if (!t.totalEpisodios) return 0;
  return Math.min(100, Math.round(((t.episodiosVistos || 0) / t.totalEpisodios) * 100));
}

function prepararEventosDetalhes(titulo) {
  const container = document.getElementById('detalhes-conteudo');

  // Trocar status
  container.querySelectorAll('.status-opcao').forEach((btn) => {
    btn.addEventListener('click', async () => {
      titulo.status = btn.dataset.status;
      if (titulo.status === 'assistido' && temEpisodios(titulo.tipo) && titulo.totalEpisodios) {
        titulo.episodiosVistos = titulo.totalEpisodios;
      }
      await window.DoramaDB.salvarTitulo(titulo);
      await refrescarApósEdicao(titulo);
    });
  });

  // Progresso de episódios
  const inputEpisodios = document.getElementById('det-episodios');
  if (inputEpisodios) {
    inputEpisodios.addEventListener('change', async () => {
      let valor = parseInt(inputEpisodios.value, 10) || 0;
      if (titulo.totalEpisodios) valor = Math.min(valor, titulo.totalEpisodios);
      titulo.episodiosVistos = Math.max(0, valor);
      if (titulo.totalEpisodios && titulo.episodiosVistos >= titulo.totalEpisodios) {
        titulo.status = 'assistido';
      } else if (titulo.episodiosVistos > 0 && titulo.status === 'quero_assistir') {
        titulo.status = 'assistindo';
      }
      await window.DoramaDB.salvarTitulo(titulo);
      await refrescarApósEdicao(titulo);
    });
  }

  // Estrelas de avaliação
  container.querySelectorAll('#det-estrelas .estrela').forEach((estrela) => {
    estrela.addEventListener('click', async () => {
      const valor = parseInt(estrela.dataset.valor, 10);
      titulo.nota = titulo.nota === valor ? null : valor;
      await window.DoramaDB.salvarTitulo(titulo);
      await refrescarApósEdicao(titulo);
    });
  });

  // Resenha (salva ao perder foco)
  document.getElementById('det-resenha').addEventListener('blur', async (e) => {
    titulo.resenha = e.target.value;
    await window.DoramaDB.salvarTitulo(titulo);
    estado.titulos = await window.DoramaDB.listarTodosTitulos();
  });

  // Favorito
  document.getElementById('det-favorito').addEventListener('click', async () => {
    titulo.favorito = !titulo.favorito;
    await window.DoramaDB.salvarTitulo(titulo);
    await refrescarApósEdicao(titulo);
  });

  // Elenco: clicar num ator filtra a biblioteca por ele
  container.querySelectorAll('.elenco-ator-clicavel').forEach((btn) => {
    btn.addEventListener('click', () => filtrarPorAtor(btn.dataset.ator));
  });

  // Editar dados (reaproveita modal manual)
  document.getElementById('det-editar').addEventListener('click', () => {
    fecharModal('modal-detalhes');
    abrirModalManual(titulo);
  });

  // Excluir
  document.getElementById('det-excluir').addEventListener('click', async () => {
    const confirmar = confirm(`Remover "${titulo.titulo}" da sua lista? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;
    await window.DoramaDB.excluirTitulo(titulo.id);
    await carregarTitulos();
    popularFiltroGeneros();
    renderizarLista();
    fecharModal('modal-detalhes');
    mostrarToast('Título removido.');
  });
}

async function refrescarApósEdicao(tituloAtualizado) {
  estado.titulos = await window.DoramaDB.listarTodosTitulos();
  document.getElementById('detalhes-conteudo').innerHTML = renderizarDetalhesHtml(tituloAtualizado);
  prepararEventosDetalhes(tituloAtualizado);
  renderizarLista();
}

function atualizarCamposFormularioPorTipo(tipo) {
  document.getElementById('campo-episodios').style.display = temEpisodios(tipo) ? '' : 'none';

  const labelEpisodios = document.querySelector('#campo-episodios span');
  if (labelEpisodios) {
    labelEpisodios.textContent = tipo === 'minidrama' ? 'Nº de episódios (curtos)' : 'Nº de episódios';
  }
}

// ===================== GERENCIADOR GENÉRICO DE CHIPS =====================
// Reutilizado para Gêneros, Subgêneros e "Onde saiu" — cada um é um campo de
// texto (valores separados por vírgula) com chips clicáveis que alternam
// (adicionam/removem) o respectivo valor no campo.

function criarGerenciadorChips(inputId, chipsSeletor) {
  function obterLista() {
    return document.getElementById(inputId).value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function definirLista(lista) {
    document.getElementById(inputId).value = lista.join(', ');
  }

  function alternar(valor) {
    const atuais = obterLista();
    const idx = atuais.findIndex((v) => v.toLowerCase() === valor.toLowerCase());
    if (idx >= 0) {
      atuais.splice(idx, 1);
    } else {
      atuais.push(valor);
    }
    definirLista(atuais);
    sincronizar();
  }

  function sincronizar() {
    const atuais = obterLista().map((v) => v.toLowerCase());
    document.querySelectorAll(chipsSeletor).forEach((chip) => {
      const ativo = atuais.includes(chip.dataset.valor.toLowerCase());
      chip.classList.toggle('selecionado', ativo);
    });
  }

  return { obterLista, definirLista, alternar, sincronizar };
}

const gerGeneros = criarGerenciadorChips('manual-generos', '#generos-rapidos .chip-genero-rapido');
const gerOndeSaiu = criarGerenciadorChips('manual-onde-saiu', '#onde-saiu-rapidos .chip-genero-rapido');
const gerSubgeneros = criarGerenciadorChips('manual-subgeneros', '#subgeneros-rapidos .chip-genero-rapido');

function renderizarChipsSubgeneros(filtro = '') {
  const container = document.getElementById('subgeneros-rapidos');
  const filtroLower = filtro.trim().toLowerCase();
  const visiveis = filtroLower
    ? SUBGENEROS.filter((s) => s.toLowerCase().includes(filtroLower))
    : SUBGENEROS;

  container.innerHTML = visiveis
    .map((s) => `<button type="button" class="chip-genero-rapido" data-valor="${escapeHtml(s)}">+ ${escapeHtml(s)}</button>`)
    .join('');

  gerSubgeneros.sincronizar();
}

// Guarda o último título cadastrado manualmente (sessão atual) para permitir
// duplicar tipo/plataforma/gêneros rapidamente ao cadastrar vários títulos
// da mesma origem em sequência (ex.: vários minidramas do ReelShort).
let ultimoCadastroManual = null;

function duplicarUltimoCadastro() {
  if (!ultimoCadastroManual) return;
  const u = ultimoCadastroManual;

  document.getElementById('manual-tipo').value = u.tipo;
  atualizarCamposFormularioPorTipo(u.tipo);
  gerGeneros.definirLista(u.generos || []);
  gerGeneros.sincronizar();
  gerSubgeneros.definirLista(u.subgeneros || []);
  renderizarChipsSubgeneros(document.getElementById('busca-subgeneros').value);
  gerOndeSaiu.definirLista(u.ondeSaiu || []);
  gerOndeSaiu.sincronizar();
  document.getElementById('manual-audio').value = u.audio || '';
  document.getElementById('manual-pais').value = u.pais || '';
  document.getElementById('manual-ano').value = u.ano || '';
  document.getElementById('manual-status').value = u.status || 'quero_assistir';

  // Título, título original, sinopse, poster e elenco ficam em branco de
  // propósito — são específicos de cada obra e não devem ser herdados.
  document.getElementById('manual-titulo').focus();

  mostrarToast('Dados repetidos. Só falta o título!');
}

// ===================== ELENCO (formulário) =====================

// Lista de atores do título sendo cadastrado/editado no momento (estado local
// do formulário, sincronizado com o campo oculto ao salvar).
let elencoAtualForm = [];

function renderizarChipsElenco() {
  const container = document.getElementById('elenco-chips');
  container.innerHTML = elencoAtualForm
    .map((nome) => `
      <span class="elenco-chip">
        ${escapeHtml(nome)}
        <button type="button" data-remover-ator="${escapeHtml(nome)}" aria-label="Remover">×</button>
      </span>
    `)
    .join('');
}

function adicionarAtorDoInput() {
  const input = document.getElementById('manual-elenco-input');
  const nome = input.value.trim();
  if (!nome) return;
  if (!elencoAtualForm.some((n) => n.toLowerCase() === nome.toLowerCase())) {
    elencoAtualForm.push(nome);
    renderizarChipsElenco();
  }
  input.value = '';
  input.focus();
}

function removerAtor(nome) {
  elencoAtualForm = elencoAtualForm.filter((n) => n !== nome);
  renderizarChipsElenco();
}

// Popula o <datalist> com nomes de atores já usados em qualquer título da
// biblioteca, para sugerir consistência de grafia ao digitar.
function popularSugestoesAtores() {
  const nomes = new Set();
  estado.titulos.forEach((t) => (t.elenco || []).forEach((n) => nomes.add(n)));
  const datalist = document.getElementById('lista-atores-sugestoes');
  datalist.innerHTML = Array.from(nomes).sort()
    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
    .join('');
}

// ===================== CADASTRO MANUAL =====================

function abrirModalManual(tituloExistente = null) {
  const form = document.getElementById('form-manual');
  form.reset();

  document.querySelector('#modal-manual .modal-titulo').textContent =
    tituloExistente ? 'Editar título' : 'Cadastrar título';

  // Migração de dados antigos: títulos salvos antes desta versão tinham um
  // campo único "plataforma" (texto livre, só p/ minidrama). Se existir e
  // "ondeSaiu" ainda não tiver sido definido, aproveitamos o valor antigo.
  let ondeSaiuInicial = tituloExistente ? (tituloExistente.ondeSaiu || []) : [];
  if (tituloExistente && ondeSaiuInicial.length === 0 && tituloExistente.plataforma) {
    ondeSaiuInicial = [tituloExistente.plataforma];
  }

  document.getElementById('manual-id').value = tituloExistente ? tituloExistente.id : '';
  document.getElementById('manual-tipo').value = tituloExistente ? tituloExistente.tipo : 'serie';
  document.getElementById('manual-titulo').value = tituloExistente ? tituloExistente.titulo : '';
  document.getElementById('manual-titulo-original').value = tituloExistente ? (tituloExistente.tituloOriginal || '') : '';
  document.getElementById('manual-ano').value = tituloExistente ? (tituloExistente.ano || '') : '';
  document.getElementById('manual-episodios').value = tituloExistente ? (tituloExistente.totalEpisodios || '') : '';
  document.getElementById('manual-pais').value = tituloExistente ? (tituloExistente.pais || '') : '';
  document.getElementById('manual-audio').value = tituloExistente ? (tituloExistente.audio || '') : '';
  document.getElementById('manual-sinopse').value = tituloExistente ? (tituloExistente.sinopse || '') : '';
  document.getElementById('manual-poster').value = tituloExistente ? (tituloExistente.poster || '') : '';
  document.getElementById('manual-status').value = tituloExistente ? tituloExistente.status : 'quero_assistir';

  gerGeneros.definirLista(tituloExistente ? (tituloExistente.generos || []) : []);
  gerSubgeneros.definirLista(tituloExistente ? (tituloExistente.subgeneros || []) : []);
  gerOndeSaiu.definirLista(ondeSaiuInicial);

  elencoAtualForm = tituloExistente ? [...(tituloExistente.elenco || [])] : [];
  renderizarChipsElenco();
  document.getElementById('manual-elenco-input').value = '';

  document.getElementById('busca-subgeneros').value = '';
  renderizarChipsSubgeneros('');
  gerGeneros.sincronizar();
  gerOndeSaiu.sincronizar();

  atualizarCamposFormularioPorTipo(document.getElementById('manual-tipo').value);

  // "Repetir dados do último cadastro" só faz sentido em cadastro novo
  // (não em edição) e só se já houver algo pra repetir nesta sessão.
  document.getElementById('btn-duplicar-ultimo').classList.toggle(
    'oculto',
    !!tituloExistente || !ultimoCadastroManual
  );

  abrirModal('modal-manual');
}

async function salvarFormManual(e) {
  e.preventDefault();

  const idExistente = document.getElementById('manual-id').value;
  const tipo = document.getElementById('manual-tipo').value;
  const generos = gerGeneros.obterLista();
  const subgeneros = gerSubgeneros.obterLista();
  const ondeSaiu = gerOndeSaiu.obterLista();

  let registro;
  if (idExistente) {
    registro = await window.DoramaDB.buscarTituloPorId(idExistente);
  } else {
    registro = {
      id: window.DoramaDB.gerarId(),
      tmdbId: null,
      origemManual: true,
      episodiosVistos: 0,
      favorito: false,
      resenha: '',
      nota: null,
      criadoEm: new Date().toISOString(),
    };
  }

  registro.tipo = tipo;
  registro.titulo = document.getElementById('manual-titulo').value.trim();
  registro.tituloOriginal = document.getElementById('manual-titulo-original').value.trim();
  registro.ano = parseInt(document.getElementById('manual-ano').value, 10) || null;
  registro.totalEpisodios = temEpisodios(tipo) ? (parseInt(document.getElementById('manual-episodios').value, 10) || null) : null;
  registro.generos = generos;
  registro.subgeneros = subgeneros;
  registro.ondeSaiu = ondeSaiu;
  registro.plataforma = ''; // campo antigo, mantido só para não quebrar backups anteriores
  registro.audio = document.getElementById('manual-audio').value;
  registro.pais = document.getElementById('manual-pais').value.trim();
  registro.elenco = [...elencoAtualForm];
  registro.sinopse = document.getElementById('manual-sinopse').value.trim();
  registro.poster = document.getElementById('manual-poster').value.trim() || null;
  registro.status = document.getElementById('manual-status').value;

  await window.DoramaDB.salvarTitulo(registro);
  await carregarTitulos();
  popularFiltroGeneros();
  renderizarLista();

  // Guarda os dados "reutilizáveis" para o atalho de "Repetir dados do
  // último cadastro" — só em cadastros novos.
  if (!idExistente) {
    ultimoCadastroManual = {
      tipo: registro.tipo,
      generos: registro.generos,
      subgeneros: registro.subgeneros,
      ondeSaiu: registro.ondeSaiu,
      audio: registro.audio,
      pais: registro.pais,
      ano: registro.ano,
      status: registro.status,
    };
  }

  fecharModal('modal-manual');
  mostrarToast(idExistente ? 'Alterações salvas.' : `"${registro.titulo}" cadastrado.`);
}

// ===================== CONFIGURAÇÕES =====================

function carregarApiKeyNaTela() {
  const key = window.DoramaTMDB.getApiKey();
  if (key) {
    document.getElementById('config-api-key').value = key;
    document.getElementById('status-api-key').textContent = 'Chave configurada ✓';
  }
}

function salvarApiKeyTela() {
  const valor = document.getElementById('config-api-key').value.trim();
  if (!valor) {
    document.getElementById('status-api-key').textContent = 'Digite uma chave válida.';
    return;
  }
  window.DoramaTMDB.setApiKey(valor);
  document.getElementById('status-api-key').textContent = 'Chave salva com sucesso ✓';
}

async function exportarBackup() {
  try {
    const json = await window.DoramaDB.exportarBackupJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `folhas-backup-${dataStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById('status-backup').textContent = 'Backup exportado ✓';
  } catch (err) {
    document.getElementById('status-backup').textContent = 'Erro ao exportar backup.';
  }
}

async function importarBackup(e) {
  const arquivo = e.target.files[0];
  if (!arquivo) return;

  const modoSubstituir = confirm(
    'Importar este backup vai ADICIONAR os títulos ao que você já tem.\n\n' +
    'Clique OK para mesclar (recomendado), ou Cancelar e tente novamente se quiser substituir tudo.'
  );

  try {
    const texto = await arquivo.text();
    const quantidade = await window.DoramaDB.importarBackupJSON(texto, modoSubstituir ? 'mesclar' : 'mesclar');
    await carregarTitulos();
    popularFiltroGeneros();
    renderizarLista();
    document.getElementById('status-backup').textContent = `${quantidade} título(s) importado(s) ✓`;
    mostrarToast('Backup importado com sucesso.');
  } catch (err) {
    document.getElementById('status-backup').textContent = 'Arquivo inválido ou corrompido.';
  } finally {
    e.target.value = '';
  }
}

async function verificarAtualizacao() {
  const status = document.getElementById('status-atualizacao');
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Atualização automática não suportada neste navegador.';
    return;
  }
  status.textContent = 'Verificando...';
  try {
    const registro = await navigator.serviceWorker.getRegistration();
    if (!registro) {
      window.location.reload(true);
      return;
    }
    await registro.update();
    if (registro.waiting) {
      registro.waiting.postMessage('SKIP_WAITING');
      status.textContent = 'Atualização encontrada, recarregando...';
    } else {
      status.textContent = 'Você já está na versão mais recente ✓';
      setTimeout(() => window.location.reload(true), 600);
    }
  } catch (err) {
    status.textContent = 'Não foi possível verificar agora.';
  }
}

// ===================== UTILITÁRIOS =====================

function abrirModal(id) {
  document.getElementById(id).classList.remove('oculto');
  document.body.style.overflow = 'hidden';
}

function fecharModal(id) {
  document.getElementById(id).classList.add('oculto');
  document.body.style.overflow = '';
}

function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.remove('oculto');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('oculto'), 2600);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
