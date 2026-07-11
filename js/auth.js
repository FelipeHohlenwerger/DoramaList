// auth.js — Login, cadastro e logout usando Firebase Authentication.

// Traduz os códigos de erro do Firebase para mensagens amigáveis em
// português, já que as mensagens padrão vêm em inglês e são pouco claras
// para quem não é desenvolvedor.
const MENSAGENS_ERRO_AUTH = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Não existe conta com esse e-mail.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar em vez de criar conta.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/missing-password': 'Digite uma senha.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.',
  'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
};

function mensagemDeErro(err) {
  return MENSAGENS_ERRO_AUTH[err.code] || 'Não foi possível completar a ação. Tente novamente.';
}

async function cadastrar(email, senha) {
  try {
    await window.firebase.auth().createUserWithEmailAndPassword(email, senha);
    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, mensagem: mensagemDeErro(err) };
  }
}

async function login(email, senha) {
  try {
    await window.firebase.auth().signInWithEmailAndPassword(email, senha);
    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, mensagem: mensagemDeErro(err) };
  }
}

async function logout() {
  await window.firebase.auth().signOut();
}

// Registra um callback chamado sempre que o estado de login mudar (ao
// carregar a página, após login, após logout). Retorna o usuário atual (ou
// null) — usado para decidir qual tela mostrar.
function aoMudarEstado(callback) {
  window.firebase.auth().onAuthStateChanged(callback);
}

function usuarioAtual() {
  return window.firebase.auth().currentUser;
}

window.FolhasAuth = {
  cadastrar,
  login,
  logout,
  aoMudarEstado,
  usuarioAtual,
};
