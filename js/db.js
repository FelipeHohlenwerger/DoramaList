// db.js — Camada de persistência usando Firestore (Firebase).
// Mantém a MESMA API pública (window.DoramaDB) que existia com IndexedDB,
// para que o restante do app (app.js) não precise mudar. Os dados agora
// ficam em: users/{uid}/titulos/{id} — escopados por usuário logado.

function colecaoTitulos() {
  const usuario = window.FolhasAuth.usuarioAtual();
  if (!usuario) {
    throw new Error('Nenhum usuário logado — isso não deveria acontecer aqui.');
  }
  return window.firebase.firestore()
    .collection('users')
    .doc(usuario.uid)
    .collection('titulos');
}

// Estrutura de um "título" salvo na biblioteca pessoal — igual à versão
// anterior (IndexedDB), sem mudança de formato:
// {
//   id, tmdbId, tipo, titulo, tituloOriginal, sinopse, poster, ano,
//   generos, subgeneros, ondeSaiu, audio, pais, elenco,
//   totalEpisodios, episodiosVistos, status, nota, resenha, favorito,
//   origemManual, criadoEm, atualizadoEm
// }

async function salvarTitulo(titulo) {
  titulo.atualizadoEm = new Date().toISOString();
  await colecaoTitulos().doc(titulo.id).set(titulo);
  return titulo;
}

async function excluirTitulo(id) {
  await colecaoTitulos().doc(id).delete();
  return true;
}

async function buscarTituloPorId(id) {
  const snap = await colecaoTitulos().doc(id).get();
  return snap.exists ? snap.data() : null;
}

async function listarTodosTitulos() {
  const snap = await colecaoTitulos().get();
  return snap.docs.map((d) => d.data());
}

async function existeTmdbId(tmdbId) {
  const todos = await listarTodosTitulos();
  return todos.find((t) => t.tmdbId === tmdbId) || null;
}

async function exportarBackupJSON() {
  const todos = await listarTodosTitulos();
  const payload = {
    app: 'doramalist',
    versao: 1,
    exportadoEm: new Date().toISOString(),
    titulos: todos,
  };
  return JSON.stringify(payload, null, 2);
}

async function importarBackupJSON(jsonTexto, modo = 'mesclar') {
  const payload = JSON.parse(jsonTexto);
  if (!payload || !Array.isArray(payload.titulos)) {
    throw new Error('Arquivo de backup inválido.');
  }

  if (modo === 'substituir') {
    const todos = await listarTodosTitulos();
    for (const t of todos) {
      await excluirTitulo(t.id);
    }
  }

  let importados = 0;
  for (const titulo of payload.titulos) {
    await salvarTitulo(titulo);
    importados++;
  }
  return importados;
}

function gerarId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// Escuta mudanças em tempo real na coleção do usuário — dispara o callback
// toda vez que algo muda, seja localmente ou sincronizado de outro
// dispositivo. É isso que faz uma alteração no PC aparecer no celular sem
// precisar reabrir o app manualmente (se ambos estiverem com internet).
// Retorna uma função para cancelar a escuta, se necessário.
function escutarMudancas(callback) {
  return colecaoTitulos().onSnapshot(
    (snap) => callback(snap.docs.map((d) => d.data())),
    () => {
      // Erro de rede/permissão na escuta: ignora silenciosamente — o app
      // continua funcionando com os dados já carregados localmente.
    }
  );
}

window.DoramaDB = {
  salvarTitulo,
  excluirTitulo,
  buscarTituloPorId,
  listarTodosTitulos,
  existeTmdbId,
  exportarBackupJSON,
  importarBackupJSON,
  gerarId,
  escutarMudancas,
};
