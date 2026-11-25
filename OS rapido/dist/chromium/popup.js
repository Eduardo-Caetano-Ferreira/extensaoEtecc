const $ = (id) => document.getElementById(id);
const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
const SITE_URL = "https://etecc-os.vercel.app/";
const { norm, soAlfa, ehTodas, bairrosDe } = RotaLib; // lógica da escala em rota-lib.js (compartilhada com o checklist)

// armazenamento (cai para localStorage se abrir fora da extensão, só para testes)
const store = {
  get: (keys) => new Promise((res) => {
    if (hasChrome) return chrome.storage.local.get(keys, res);
    res(Object.fromEntries([].concat(keys).map((k) => [k, JSON.parse(localStorage.getItem("x_" + k) || "null")])));
  }),
  set: (obj) => new Promise((res) => {
    if (hasChrome) return chrome.storage.local.set(obj, res);
    for (const k in obj) localStorage.setItem("x_" + k, JSON.stringify(obj[k]));
    res();
  }),
};

// ---------- abas ----------
let viewAnterior = "os"; // para a engrenagem voltar de onde saiu
function mostrar(view) {
  if (view !== "config") viewAnterior = view;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  for (const v of ["os", "rota", "config"]) $("view-" + v).classList.toggle("hide", v !== view);
  $("engrenagem").classList.toggle("on", view === "config");
  if (view !== "config") store.set({ viewAtual: view });
  if (view === "rota") $("busca").focus();
  if (view === "config") carregarAtalho();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => mostrar(b.dataset.view)));
$("engrenagem").addEventListener("click", () => mostrar($("view-config").classList.contains("hide") ? "config" : viewAnterior));

// ---------- configurações: atalho de teclado e aba inicial ----------
// O atalho (Alt+Shift+O por padrão) é o comando nativo "_execute_action" do manifest: abre este popup.
// Os navegadores não deixam a extensão trocar a própria tecla; a troca é feita na página de atalhos deles.
function carregarAtalho() {
  const el = $("atalhoTxt");
  if (!hasChrome || !chrome.commands || !chrome.commands.getAll) { el.textContent = "Alt+Shift+O"; return; }
  chrome.commands.getAll((cmds) => {
    const c = (cmds || []).find((x) => x.name === "_execute_action");
    el.textContent = c && c.shortcut ? c.shortcut : "não definido";
  });
}
function paginaDeAtalhos() {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return null; // no Firefox: about:addons > engrenagem > Gerenciar atalhos
  const esq = /Edg\//.test(ua) ? "edge" : /OPR\//.test(ua) ? "opera" : (navigator.brave ? "brave" : /Vivaldi/.test(ua) ? "vivaldi" : "chrome");
  return `${esq}://extensions/shortcuts`;
}
$("editarAtalho").addEventListener("click", () => {
  const dica = $("atalhoDica");
  const url = paginaDeAtalhos();
  try {
    if (hasChrome && chrome.commands && chrome.commands.openShortcutSettings) { chrome.commands.openShortcutSettings(); return; }
    if (!url) throw new Error("firefox");
    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) dica.textContent = `Cole este endereço na barra do navegador: ${url}`;
    });
  } catch (e) {
    dica.textContent = url
      ? `Cole este endereço na barra do navegador: ${url}`
      : "No Firefox: abra about:addons, clique na engrenagem e em “Gerenciar atalhos de extensões”.";
  }
});
let focarGerar = true;
$("abrirEmOS").addEventListener("change", (e) => { focarGerar = e.target.checked; store.set({ abrirEmOS: e.target.checked }); });

// =====================================================================
//  O.S.
// =====================================================================
const nome = $("nome"), estado = $("estado"), status = $("status"), erro = $("erro");
const gerar = $("gerar"), texto = $("texto"), copiar = $("copiar");

nome.addEventListener("input", () => store.set({ atendente: nome.value.trim() }));

function mostrarTexto(t) {
  texto.value = t;
  texto.style.display = "block";
  $("acoesTexto").classList.remove("hide");
}

// Salva automaticamente tudo que for digitado/editado (o popup fecha sozinho ao clicar fora)
texto.addEventListener("input", () => store.set({ ultimaOS: texto.value }));

// Limpar o texto atual, com confirmação
$("limpar").addEventListener("click", () => {
  $("acoesTexto").classList.add("hide");
  $("confirma").classList.remove("hide");
});
$("naoLimpar").addEventListener("click", () => {
  $("confirma").classList.add("hide");
  $("acoesTexto").classList.remove("hide");
});
$("simLimpar").addEventListener("click", () => {
  texto.value = "";
  texto.style.display = "none";
  $("confirma").classList.add("hide");
  $("acoesTexto").classList.add("hide");
  status.textContent = "";
  store.set({ ultimaOS: "" });
});
async function copiarTexto() {
  try { await navigator.clipboard.writeText(texto.value); }
  catch (e) { texto.select(); document.execCommand("copy"); }
  copiar.textContent = "Copiado ✓";
  setTimeout(() => (copiar.textContent = "Copiar"), 1600);
}
copiar.addEventListener("click", copiarTexto);

let port = null;
async function conectar() {
  if (!hasChrome || !chrome.tabs) { gerar.disabled = true; return; }
  // callback (em vez de promessa) para funcionar igual em Chrome, Edge, Opera, Brave, Vivaldi e Firefox
  const [tab] = await new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t || [])));
  if (!tab || !/^https:\/\/sac\.eteccnet\.com\.br\//.test(tab.url || "")) {
    estado.textContent = "Abra a aba do MK para gerar a O.S.";
    gerar.disabled = true;
    return;
  }
  port = chrome.tabs.connect(tab.id, { frameId: 0, name: "gerar" });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (port) {
      port = null;
      gerar.disabled = true;
      erro.textContent = "Sem conexão com a página. Recarregue a aba do MK (F5).";
    }
  });
  port.onMessage.addListener((m) => {
    if (m.type === "estado") {
      const s = m.payload;
      estado.textContent = !s.aberto ? "Nenhum atendimento aberto." : (s.sess ? "Histórico de conexão já visto ✓" : "");
      enderecoCliente = (s.aberto && s.endereco) || "";
      renderRota();
    } else if (m.type === "status") {
      status.textContent = m.payload;
    } else if (m.type === "result") {
      gerar.disabled = false;
      status.textContent = /^Sinal/.test(status.textContent) ? "Pronto · copiado ✓ · " + status.textContent : "Pronto · copiado ✓";
      mostrarTexto(m.payload);
      store.set({ ultimaOS: m.payload });
      copiarTexto();
    } else if (m.type === "error") {
      gerar.disabled = false;
      status.textContent = "";
      erro.textContent = m.payload;
    }
  });
  port.postMessage({ type: "estado" });
  // atalho do teclado: abrir o popup e já deixar o botão selecionado (Enter gera a O.S.)
  if (focarGerar && !$("view-os").classList.contains("hide")) gerar.focus();
}
gerar.addEventListener("click", () => {
  if (!port) return;
  erro.textContent = "";
  status.textContent = "Iniciando…";
  gerar.disabled = true;
  // sinal lido na aba do AutoISP (se houver); o mk-main confere o nome e a validade
  store.get(["autoisp"]).then((s) => {
    port.postMessage({ type: "gerar", atendente: nome.value.trim(), autoisp: s.autoisp || null });
  });
});

// ---------- cor do checklist (aplicada na tela do MK em ~2 s) ----------
const CORES = [
  { id: "claro", nome: "Claro", bg: "#ffffff", acc: "#16a34a" },
  { id: "escuro", nome: "Escuro", bg: "#0f172a", acc: "#4ade80" },
  { id: "verde", nome: "Verde", bg: "#f0fdf4", acc: "#16a34a" },
  { id: "azul", nome: "Azul", bg: "#eff6ff", acc: "#2563eb" },
  { id: "vermelho", nome: "Vermelho", bg: "#fef2f2", acc: "#e8192e" },
  { id: "roxo", nome: "Roxo", bg: "#faf5ff", acc: "#9333ea" },
  { id: "rosa", nome: "Rosa", bg: "#fdf2f8", acc: "#db2777" },
];
// A cor escolhida também pinta o próprio popup (variáveis CSS do popup.html)
const TEMAS_POPUP = {
  claro:    { acc: "#0f766e", bg: "#ffffff", soft: "#f9fafb", line: "#e5e7eb", txt: "#1f2937", mut: "#6b7280", in: "#ffffff", tab: "#f3f4f6", scheme: "light" },
  escuro:   { acc: "#4ade80", bg: "#0f172a", soft: "#1e293b", line: "#334155", txt: "#e2e8f0", mut: "#94a3b8", in: "#1e293b", tab: "#1e293b", scheme: "dark" },
  verde:    { acc: "#16a34a", bg: "#f0fdf4", soft: "#dcfce7", line: "#bbf7d0", txt: "#14532d", mut: "#4d7c5a", in: "#ffffff", tab: "#dcfce7", scheme: "light" },
  azul:     { acc: "#2563eb", bg: "#eff6ff", soft: "#dbeafe", line: "#bfdbfe", txt: "#1e3a8a", mut: "#6b8fc9", in: "#ffffff", tab: "#dbeafe", scheme: "light" },
  vermelho: { acc: "#e8192e", bg: "#fef2f2", soft: "#fee2e2", line: "#fecaca", txt: "#7f1d1d", mut: "#c07a80", in: "#ffffff", tab: "#fee2e2", scheme: "light" },
  roxo:     { acc: "#9333ea", bg: "#faf5ff", soft: "#f3e8ff", line: "#e9d5ff", txt: "#581c87", mut: "#9b7ab8", in: "#ffffff", tab: "#f3e8ff", scheme: "light" },
  rosa:     { acc: "#db2777", bg: "#fdf2f8", soft: "#fce7f3", line: "#fbcfe8", txt: "#831843", mut: "#c0749a", in: "#ffffff", tab: "#fce7f3", scheme: "light" },
};
function aplicarTemaPopup(id) {
  const t = TEMAS_POPUP[id] || TEMAS_POPUP.claro;
  const st = document.documentElement.style;
  for (const k of ["acc", "bg", "soft", "line", "txt", "mut", "in", "tab"]) st.setProperty("--" + k, t[k]);
  st.colorScheme = t.scheme;
}
function desenharCores(atual) {
  aplicarTemaPopup(atual);
  $("swatches").innerHTML = CORES.map((c) =>
    `<button class="sw ${c.id === atual ? "on" : ""}" data-cor="${c.id}" title="${c.nome}" ` +
    `style="background:linear-gradient(135deg, ${c.bg} 50%, ${c.acc} 50%)"></button>`).join("");
}
$("swatches").addEventListener("click", (ev) => {
  const b = ev.target.closest && ev.target.closest("[data-cor]");
  if (!b) return;
  store.set({ ckCor: b.dataset.cor });
  desenharCores(b.dataset.cor);
});

// =====================================================================
//  ROTA
// =====================================================================
let rota = null;            // { moto: [...], car: [...], at: timestamp }
let offline = false;        // true quando não deu para consultar o site agora
let aliases = {};           // escolhas do usuário: "cidade|bairro do cliente" -> bairro da escala
let enderecoCliente = "";   // vem do atendimento aberto no MK
let mostrarTodos = false;   // true = ignora o endereço e mostra a escala completa
const busca = $("busca"), rotaInfo = $("rotaInfo"), resultados = $("resultados");

const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function carregarRota() {
  if (!rota) rotaInfo.textContent = "Carregando a escala…";
  try {
    rota = await RotaLib.carregarEscala();
    store.set({ rota, rotaBuscadaEm: Date.now() });
    offline = false;
  } catch (e) {
    offline = true;
  }
  renderRota();
}

function dataEscala(at) {
  const d = new Date(at), h = new Date();
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mesmoDia = d.toDateString() === h.toDateString();
  return { mesmoDia, txt: mesmoDia ? `hoje às ${hora}` : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${hora}` };
}

function cartao(t, destaque) {
  const bairros = bairrosDe(t);
  let reg;
  if (ehTodas(t)) reg = "Todas as regiões";
  else if (destaque && destaque.length) reg = destaque.map((b) => `<mark>${escH(b)}</mark>`).join(" · ") + (bairros.length > destaque.length ? ` <span class="muted">+${bairros.length - destaque.length}</span>` : "");
  else reg = escH(bairros.length > 4 ? bairros.slice(0, 4).join(" · ") + ` · +${bairros.length - 4}` : bairros.join(" · "));
  const obs = t.obs ? `<span class="obs ${/noturno/i.test(t.obs) ? "" : "n"}">${escH(t.obs)}</span>` : "";
  return `<div class="tec"><div class="l1"><b>${escH(t.name)}</b><span class="pill ${t.tipo.toLowerCase()}">${t.tipo}</span><span class="cidade">${escH(t.city || "")}</span></div>` +
    `<div class="reg">${reg}</div>${obs ? `<div>${obs}</div>` : ""}</div>`;
}

// cartão do técnico com TODAS as regiões dele; cada bairro é um botão (escolher como vizinho)
function cartaoCidade(t, clicavel) {
  const obs = t.obs ? `<span class="obs ${/noturno/i.test(t.obs) ? "" : "n"}">${escH(t.obs)}</span>` : "";
  const reg = ehTodas(t)
    ? "Todas as regiões"
    : bairrosDe(t).map((b) => clicavel
      ? `<button class="chip" data-acao="vizinho" data-b="${escH(b)}">${escH(b)}</button>`
      : `<span class="chip">${escH(b)}</span>`).join("");
  return `<div class="tec"><div class="l1"><b>${escH(t.name)}</b><span class="pill ${t.tipo.toLowerCase()}">${t.tipo}</span>${obs}</div>` +
    `<div class="${ehTodas(t) ? "reg" : "chips"}">${reg}</div></div>`;
}

// ---- filtro pelo endereço do cadastro (ex.: "Rua X número 970 CASA Nova Itanhaém - Itanhaém") ----
function htmlPorEndereco(end) {
  const r = RotaLib.resolver(end, rota, aliases);
  let cab = `<div class="end"><div class="muted">Endereço do cliente</div><div>${escH(end)}</div>`;
  const bc = r.bairroCliente ? `<b>${escH(r.bairroCliente)}</b>` : "bairro não identificado";
  if (r.modo === "exato") cab += `<div class="muted">Bairro na escala: <b>${escH(r.bairroEscala)}</b> · ${escH(r.cidade)}`;
  else if (r.modo === "vizinho") cab += `<div class="muted">${bc} não está na escala · vizinho escolhido: <b>${escH(r.bairroEscala)}</b> · <button class="link" data-acao="desfazer">desfazer</button>`;
  else if (r.modo === "cidade") cab += `<div class="aviso">${bc} não está na escala (${escH(r.cidade)}).`;
  else cab += `<div class="aviso">A cidade do endereço (${escH(r.cidade || "?")}) não está na escala.`;
  cab += ` · <button class="link" data-acao="todos">ver escala completa</button></div>`;

  cab += `</div>`;

  // bairro fora da escala: mostra os técnicos da cidade (moto e carro) com as regiões de cada um.
  // Clicar num bairro o define como vizinho; a escolha fica salva para os próximos atendimentos.
  if (r.modo === "cidade") {
    let html = cab + (r.chave ? `<div class="muted" style="margin:2px 0 0">Clique no bairro vizinho para o técnico valer para este endereço.</div>` : "");
    for (const tipo of ["Moto", "Carro"]) {
      const lista = r.doCidade.filter((t) => t.tipo === tipo);
      if (!lista.length) continue;
      html += `<div class="grupo">${tipo} · ${escH(r.cidade)}</div>` + lista.map((t) => cartaoCidade(t, !!r.chave)).join("");
    }
    if (!r.doCidade.length) html += `<div class="vazio">Nenhum técnico encontrado para essa cidade.</div>`;
    return html;
  }

  let html = cab;
  if (r.naRegiao.length) html += `<div class="grupo">${r.modo === "vizinho" ? "Atende o bairro vizinho" : "Atende o bairro"}</div>` + r.naRegiao.map((t) => cartao(t, [r.bairroEscala])).join("");
  if (r.cidadeToda.length) html += `<div class="grupo">Atende a cidade toda</div>` + r.cidadeToda.map((t) => cartao(t)).join("");
  if (!r.naRegiao.length && !r.cidadeToda.length) html += `<div class="vazio">Nenhum técnico encontrado para esse endereço.</div>`;
  return html;
}

function renderRota() {
  const todos = RotaLib.todos(rota);
  if (!rota || !todos.length) {
    rotaInfo.textContent = offline ? "Sem conexão com o site e sem escala salva." : "Nenhuma escala encontrada no site.";
    resultados.innerHTML = `<div class="vazio">Atualize a escala no site de O.S. (Atualizar Rota).</div>`;
    return;
  }
  const d = dataEscala(rota.at);
  rotaInfo.innerHTML = `Escala ${d.txt} · ${(rota.moto || []).length} moto · ${(rota.car || []).length} carro` +
    (d.mesmoDia ? "" : ` <span class="aviso">· não é de hoje</span>`) +
    (offline ? ` <span class="aviso">· sem conexão, usando a salva</span>` : "");

  const q = norm(busca.value).trim();
  // Sem nada digitado e com um atendimento aberto: filtra pelo endereço do cadastro do cliente
  if (q.length < 2 && enderecoCliente && !mostrarTodos) {
    resultados.innerHTML = htmlPorEndereco(enderecoCliente);
    return;
  }
  if (q.length < 2) {
    const grupo = (nome, lista) => lista.length ? `<div class="grupo">${nome}</div>` + lista.map((t) => cartao(t)).join("") : "";
    resultados.innerHTML = grupo("Moto", todos.filter((t) => t.tipo === "Moto")) + grupo("Carro", todos.filter((t) => t.tipo === "Carro"));
    return;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const casa = (s) => { const n = norm(s); return tokens.every((k) => n.includes(k)); };

  // 1) técnicos que atendem o bairro/região digitado
  const naRegiao = [];
  const cidadesAch = new Set();
  for (const t of todos) {
    if (ehTodas(t)) continue;
    const ach = bairrosDe(t).filter((b) => casa(b));
    if (ach.length) { naRegiao.push({ t, ach }); cidadesAch.add(norm(t.city)); }
  }
  // 2) o texto é o nome de uma cidade? -> todos dessa cidade
  const porCidade = todos.filter((t) => casa(t.city));
  porCidade.forEach((t) => cidadesAch.add(norm(t.city)));
  // 3) técnicos "Todas as regiões" das cidades encontradas
  const cidadeToda = todos.filter((t) => ehTodas(t) && cidadesAch.has(norm(t.city)));

  const jaMostrados = new Set();
  const blocos = [];
  const pega = (lista, titulo) => {
    const itens = lista.filter(({ t }) => !jaMostrados.has(t));
    if (!itens.length) return;
    itens.forEach(({ t }) => jaMostrados.add(t));
    blocos.push(`<div class="grupo">${titulo}</div>` + itens.map(({ t, ach }) => cartao(t, ach)).join(""));
  };
  pega(naRegiao, "Atende a região");
  pega(porCidade.filter((t) => !ehTodas(t)).map((t) => ({ t })), "Na cidade");
  pega(cidadeToda.map((t) => ({ t })), "Atende a cidade toda");
  resultados.innerHTML = blocos.length ? blocos.join("") : `<div class="vazio">Nenhum técnico encontrado para “${escH(busca.value.trim())}”.</div>`;
}

busca.addEventListener("input", renderRota);
function salvarVizinho(bairro) {
  const r = RotaLib.resolver(enderecoCliente, rota, aliases);
  if (!r.chave || !bairro) return;
  aliases = { ...aliases, [r.chave]: bairro };
  store.set({ aliases });
  renderRota();
}
resultados.addEventListener("click", (ev) => {
  const el = ev.target.closest && ev.target.closest("[data-acao]");
  if (!el) return;
  const a = el.getAttribute("data-acao");
  if (a === "todos") { mostrarTodos = true; renderRota(); }
  else if (a === "vizinho") salvarVizinho(el.getAttribute("data-b"));
  else if (a === "usarSel") { const s = $("selVizinho"); if (s && s.value) salvarVizinho(s.value); }
  else if (a === "desfazer") {
    const r = RotaLib.resolver(enderecoCliente, rota, aliases);
    const novo = { ...aliases }; delete novo[r.chave]; aliases = novo;
    store.set({ aliases }); renderRota();
  }
});
$("recarregar").addEventListener("click", carregarRota);
$("abrirSite").addEventListener("click", () => {
  if (hasChrome && chrome.tabs) chrome.tabs.create({ url: SITE_URL });
  else window.open(SITE_URL, "_blank");
});

// ---------- início ----------
(async function init() {
  const s = await store.get(["atendente", "ultimaOS", "rota", "viewAtual", "aliases", "ckCor", "abrirEmOS"]);
  focarGerar = s.abrirEmOS !== false; // padrão: abrir na aba O.S.
  $("abrirEmOS").checked = focarGerar;
  nome.value = s.atendente || "";
  desenharCores(s.ckCor || "claro");
  if (s.ultimaOS) mostrarTexto(s.ultimaOS);
  rota = s.rota || null;
  aliases = s.aliases || {};
  renderRota();
  mostrar(!focarGerar && s.viewAtual === "rota" ? "rota" : "os");
  conectar();
  carregarRota(); // sempre busca a escala atual do site ao abrir
})();
