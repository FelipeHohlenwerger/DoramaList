// firebase-config.js — Guarda e inicializa a configuração do projeto Firebase
// do usuário (colada por ele mesmo na tela de configuração inicial).

const CHAVE_CONFIG_FIREBASE = 'folhas_firebase_config';

let appInicializado = null;

function estaConfigurado() {
  return !!localStorage.getItem(CHAVE_CONFIG_FIREBASE);
}

function obterConfigSalva() {
  const bruto = localStorage.getItem(CHAVE_CONFIG_FIREBASE);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch (err) {
    return null;
  }
}

// Aceita o texto colado do console do Firebase, que normalmente vem como:
//   const firebaseConfig = { apiKey: "...", authDomain: "...", ... };
// Extraímos só o objeto (entre chaves) e avaliamos como literal JS, já que é
// o próprio usuário colando a configuração do seu projeto — mesmo nível de
// confiança que digitar uma chave de API em qualquer outro campo do app.
function extrairConfigDoTexto(texto) {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error('Não encontrei um bloco { ... } válido no texto colado.');
  }
  const trecho = texto.slice(inicio, fim + 1);

  let objeto;
  try {
    // eslint-disable-next-line no-new-func
    objeto = new Function('return (' + trecho + ')')();
  } catch (err) {
    throw new Error('Não consegui interpretar a configuração colada. Confira se copiou o bloco inteiro.');
  }

  const camposObrigatorios = ['apiKey', 'authDomain', 'projectId'];
  const faltando = camposObrigatorios.filter((c) => !objeto[c]);
  if (faltando.length > 0) {
    throw new Error('Faltam campos na configuração: ' + faltando.join(', '));
  }

  return objeto;
}

function salvarConfig(config) {
  localStorage.setItem(CHAVE_CONFIG_FIREBASE, JSON.stringify(config));
}

function limparConfig() {
  localStorage.removeItem(CHAVE_CONFIG_FIREBASE);
  appInicializado = null;
}

function inicializar() {
  if (appInicializado) return appInicializado;

  const config = obterConfigSalva();
  if (!config) {
    throw new Error('Nenhuma configuração do Firebase foi salva ainda.');
  }

  if (!window.firebase) {
    throw new Error('SDK do Firebase não carregou. Verifique sua conexão com a internet.');
  }

  appInicializado = window.firebase.initializeApp(config);

  // Ativa cache local (funcionamento offline + sincronização automática ao
  // reconectar). Ignora erro de "múltiplas abas abertas" sem quebrar o app.
  window.firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});

  return appInicializado;
}

window.FolhasFirebase = {
  estaConfigurado,
  obterConfigSalva,
  extrairConfigDoTexto,
  salvarConfig,
  limparConfig,
  inicializar,
};
