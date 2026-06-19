// app.js — Lógica principal da interface do Folhas

const STATUS_LABEL = {
  quero_assistir: 'Quero assistir',
  assistindo: 'Assistindo',
  assistido: 'Assistido',
};

let estado = {
  titulos: [],
  filtroStatus: 'todos',
  filtroGenero: '',
  filtroTipo: '',
  ordenacao: 'recente',
  buscaDebounce: null,
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Falha silenciosa: app continua funcionando sem cache offline
    });
  }
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
    document.getElementById('campo-episodios').style.display = e.target.value === 'filme' ? 'none' : '';
  });
  document.getElementById('form-manual').addEventListener('submit', salvarFormManual);

  // Configurações
  document.getElementById('btn-salvar-api-key').addEventListener('click', salvarApiKeyTela);
  document.getElementById('btn-exportar').addEventListener('click', exportarBackup);
  document.getElementById('btn-importar').addEventListener('click', () => {
    document.getElementById('input-importar-arquivo').click();
  });
  document.getElementById('input-importar-arquivo').addEventListener('change', importarBackup);
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
      <div class="meta">${r.tipo === 'serie' ? 'Série' : 'Filme'}${r.ano ? ' · ' + r.ano : ''}</div>
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
      <div class="ano">${titulo.ano || ''}${titulo.ano && titulo.tipo ? ' · ' : ''}${titulo.tipo === 'serie' ? 'Série' : 'Filme'}</div>
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

  const progressoHtml = t.tipo === 'serie'
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
        <div class="progresso-texto">${t.ano || 'Ano desconhecido'} · ${t.tipo === 'serie' ? 'Série' : 'Filme'}</div>
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
      if (titulo.status === 'assistido' && titulo.tipo === 'serie' && titulo.totalEpisodios) {
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
  document.getElementById('manual-sinopse').value = tituloExistente ? (tituloExistente.sinopse || '') : '';
  document.getElementById('manual-poster').value = tituloExistente ? (tituloExistente.poster || '') : '';
  document.getElementById('manual-status').value = tituloExistente ? tituloExistente.status : 'quero_assistir';

  document.getElementById('campo-episodios').style.display =
    document.getElementById('manual-tipo').value === 'filme' ? 'none' : '';

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
  registro.totalEpisodios = tipo === 'serie' ? (parseInt(document.getElementById('manual-episodios').value, 10) || null) : null;
  registro.generos = generos;
  registro.sinopse = document.getElementById('manual-sinopse').value.trim();
  registro.poster = document.getElementById('manual-poster').value.trim() || null;
  registro.status = document.getElementById('manual-status').value;

  await window.DoramaDB.salvarTitulo(registro);
  await carregarTitulos();
  popularFiltroGeneros();
  renderizarLista();
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
