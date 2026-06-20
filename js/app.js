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
};

function labelTipo(tipo) {
  return TIPO_LABEL[tipo] || 'Série';
}

// Tipos que têm "progresso de episódios" (série e minidrama têm; filme não)
function temEpisodios(tipo) {
  return tipo === 'serie' || tipo === 'minidrama';
}

let estado = {
  titulos: [],
  filtroStatus: 'todos',
  filtroGenero: '',
  filtroTipo: '',
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
    alternarGeneroRapido(chip.dataset.genero);
  });
  document.getElementById('manual-generos').addEventListener('input', sincronizarChipsGenero);

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
  const jaExiste = estado.titulos.some((t) => t.tmdbId === r.tmdbId);

  const card = document.createElement('div');
  card.className = 'card-titulo';
  card.innerHTML = `
    <div class="card-poster-wrap">
      ${r.poster
        ? `<img src="${r.poster}" alt="" loading="lazy" />`
        : `<div class="card-poster-placeholder">${escapeHtml(r.titulo)}</div>`}
      <button class="card-descobrir-acao" ${jaExiste ? 'disabled' : ''} title="${jaExiste ? 'Já está na sua lista' : 'Adicionar à minha lista'}">
        ${jaExiste ? '✓' : '+'}
      </button>
    </div>
    <div class="card-info">
      <div class="titulo">${escapeHtml(r.titulo)}</div>
      <div class="ano">${r.ano || ''}${r.ano ? ' · ' : ''}${labelTipo(r.tipo)}</div>
    </div>
  `;

  const btnAcao = card.querySelector('.card-descobrir-acao');
  if (!jaExiste) {
    btnAcao.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnAcao.disabled = true;
      await importarDeTmdb(r.tmdbId, r.tipo);
      btnAcao.textContent = '✓';
      btnAcao.title = 'Já está na sua lista';
    });
  }

  return card;
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
        <div class="progresso-texto">${t.ano || 'Ano desconhecido'} · ${labelTipo(t.tipo)}${t.plataforma ? ' · ' + escapeHtml(t.plataforma) : ''}</div>
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
  document.getElementById('campo-plataforma').classList.toggle('oculto', tipo !== 'minidrama');

  const labelEpisodios = document.querySelector('#campo-episodios span');
  if (labelEpisodios) {
    labelEpisodios.textContent = tipo === 'minidrama' ? 'Nº de episódios (curtos)' : 'Nº de episódios';
  }
}

function listaGenerosAtual() {
  return document.getElementById('manual-generos').value
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

function definirListaGeneros(lista) {
  document.getElementById('manual-generos').value = lista.join(', ');
}

function alternarGeneroRapido(genero) {
  const atuais = listaGenerosAtual();
  const idx = atuais.findIndex((g) => g.toLowerCase() === genero.toLowerCase());
  if (idx >= 0) {
    atuais.splice(idx, 1);
  } else {
    atuais.push(genero);
  }
  definirListaGeneros(atuais);
  sincronizarChipsGenero();
}

function sincronizarChipsGenero() {
  const atuais = listaGenerosAtual().map((g) => g.toLowerCase());
  document.querySelectorAll('.chip-genero-rapido').forEach((chip) => {
    const ativo = atuais.includes(chip.dataset.genero.toLowerCase());
    chip.classList.toggle('selecionado', ativo);
  });
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
  definirListaGeneros(u.generos || []);
  sincronizarChipsGenero();
  document.getElementById('manual-plataforma').value = u.plataforma || '';
  document.getElementById('manual-ano').value = u.ano || '';
  document.getElementById('manual-status').value = u.status || 'quero_assistir';

  // Título, título original, sinopse e poster ficam em branco de propósito —
  // são específicos de cada obra e não devem ser herdados.
  document.getElementById('manual-titulo').focus();

  mostrarToast('Dados repetidos. Só falta o título!');
}

// ===================== CADASTRO MANUAL =====================

function abrirModalManual(tituloExistente = null) {
  const form = document.getElementById('form-manual');
  form.reset();

  document.querySelector('#modal-manual .modal-titulo').textContent =
    tituloExistente ? 'Editar título' : 'Cadastrar título';

  document.getElementById('manual-id').value = tituloExistente ? tituloExistente.id : '';
  document.getElementById('manual-tipo').value = tituloExistente ? tituloExistente.tipo : 'serie';
  document.getElementById('manual-titulo').value = tituloExistente ? tituloExistente.titulo : '';
  document.getElementById('manual-titulo-original').value = tituloExistente ? (tituloExistente.tituloOriginal || '') : '';
  document.getElementById('manual-ano').value = tituloExistente ? (tituloExistente.ano || '') : '';
  document.getElementById('manual-episodios').value = tituloExistente ? (tituloExistente.totalEpisodios || '') : '';
  document.getElementById('manual-generos').value = tituloExistente ? (tituloExistente.generos || []).join(', ') : '';
  document.getElementById('manual-plataforma').value = tituloExistente ? (tituloExistente.plataforma || '') : '';
  document.getElementById('manual-sinopse').value = tituloExistente ? (tituloExistente.sinopse || '') : '';
  document.getElementById('manual-poster').value = tituloExistente ? (tituloExistente.poster || '') : '';
  document.getElementById('manual-status').value = tituloExistente ? tituloExistente.status : 'quero_assistir';

  atualizarCamposFormularioPorTipo(document.getElementById('manual-tipo').value);
  sincronizarChipsGenero();

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
  const generos = document.getElementById('manual-generos').value
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

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
  registro.plataforma = tipo === 'minidrama' ? document.getElementById('manual-plataforma').value.trim() : '';
  registro.sinopse = document.getElementById('manual-sinopse').value.trim();
  registro.poster = document.getElementById('manual-poster').value.trim() || null;
  registro.status = document.getElementById('manual-status').value;

  await window.DoramaDB.salvarTitulo(registro);
  await carregarTitulos();
  popularFiltroGeneros();
  renderizarLista();

  // Guarda os dados "reutilizáveis" (tipo, gêneros, plataforma, ano, status)
  // para o atalho de "Repetir dados do último cadastro" — só em cadastros
  // novos, pois editar um título existente não reflete a intenção de
  // "cadastrar mais um parecido".
  if (!idExistente) {
    ultimoCadastroManual = {
      tipo: registro.tipo,
      generos: registro.generos,
      plataforma: registro.plataforma,
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
