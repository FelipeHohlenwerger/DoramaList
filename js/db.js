// db.js — Camada de persistência local usando IndexedDB
// Guarda os doramas/filmes da biblioteca pessoal do usuário.

const DB_NAME = 'doramalist-db';
const DB_VERSION = 1;
const STORE_NAME = 'titulos';

let dbInstance = null;

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('tipo', 'tipo', { unique: false });
        store.createIndex('tmdbId', 'tmdbId', { unique: false });
        store.createIndex('titulo', 'titulo', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    req.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// Estrutura de um "título" salvo na biblioteca pessoal:
// {
//   id: string (uuid interno),
//   tmdbId: number|null,         -> id na API do TMDB, se veio de lá
//   tipo: 'serie' | 'filme',
//   titulo: string,
//   tituloOriginal: string,
//   sinopse: string,
//   poster: string (url ou base64),
//   ano: number|null,
//   generos: string[],           -> categorias/gêneros
//   totalEpisodios: number|null, // só relevante p/ série
//   episodiosVistos: number,     // progresso, só série
//   status: 'quero_assistir' | 'assistindo' | 'assistido',
//   nota: number|null,           // 0-10, só preenchido se assistido
//   resenha: string,
//   favorito: boolean,
//   origemManual: boolean,       // true se cadastrado manualmente (não via TMDB)
//   criadoEm: string (ISO),
//   atualizadoEm: string (ISO)
// }

async function salvarTitulo(titulo) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    titulo.atualizadoEm = new Date().toISOString();
    store.put(titulo);
    tx.oncomplete = () => resolve(titulo);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function excluirTitulo(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function buscarTituloPorId(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarTodosTitulos() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
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

window.DoramaDB = {
  salvarTitulo,
  excluirTitulo,
  buscarTituloPorId,
  listarTodosTitulos,
  existeTmdbId,
  exportarBackupJSON,
  importarBackupJSON,
  gerarId,
};
