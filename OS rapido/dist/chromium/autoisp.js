// Roda no site do AutoISP (https://autoisp.eteccnet.com.br).
// Lê o "Atenuação Rx ONU" (sinal da fibra), o status da ONU (LOS / Sem energia) e o nome do assinante
// da tela aberta e guarda em chrome.storage.local ("autoisp") para o O.S. Rápido usar ao gerar a O.S.
// Também mostra, aqui mesmo, o pedaço do checklist referente ao sinal.
(function () {
  "use strict";
  if (window !== window.top) return;

  const LABEL = /^\s*Atenuação Rx ONU\s*:?(?:\s+[^\n]{0,40})?\s*$/i; // rótulo, com ou sem o valor no mesmo elemento
  const DBM = /(-?\d+(?:[.,]\d+)?)\s*dBm/i;

  // Região (cartão) da ONU: sobe a partir do rótulo "Atenuação Rx ONU" até achar o bloco com os campos da ONU
  function cartaoOnu() {
    const rotulos = [...document.querySelectorAll("*")].filter(
      (e) => e.children.length <= 1 && LABEL.test(e.textContent || "") && e.getClientRects().length
    );
    for (const el of rotulos) {
      let p = el.parentElement, primeiro = null;
      for (let up = 0; p && up < 5; up++, p = p.parentElement) {
        const t = p.innerText || "";
        if (!/Atenuação Rx ONU/i.test(t)) continue;
        primeiro = primeiro || { el, p, up };
        if (/Alarmes|Dist[âa]ncia|OLT/i.test(t)) return { el, p, up }; // o cartão com os campos da ONU
      }
      if (primeiro) return primeiro;
    }
    return null;
  }

  // Sinal: pega o primeiro "xx dBm" depois do rótulo, mas só se vier ANTES do rótulo
  // da linha seguinte (evita pegar o valor da OLT quando a ONU está sem leitura).
  function readSinal() {
    const rotulos = [...document.querySelectorAll("*")].filter(
      (e) => e.children.length <= 1 && LABEL.test(e.textContent || "") && e.getClientRects().length
    );
    for (const el of rotulos) {
      let p = el.parentElement;
      for (let up = 0; p && up < 5; up++, p = p.parentElement) {
        const txt = p.innerText || "";
        const i = txt.search(/Atenuação Rx ONU/i);
        if (i < 0) continue;
        const resto = txt.slice(i + "Atenuação Rx ONU".length);
        const m = resto.match(DBM);
        if (!m) continue;
        const entre = resto.slice(0, m.index);
        if (/Atenuação|Distância|Alarmes|OLT/i.test(entre)) return ""; // valor não é desta linha
        return m[1].replace(",", ".") + " dBm";
      }
    }
    return "";
  }

  // Status da ONU: "Sem energia" (Dying Gasp / power off) ou "LOS" (perda de sinal).
  // "Sem energia" tem prioridade: a ONU sem energia costuma terminar em LOS depois.
  const RE_ENERGIA = /dying\s*gasp|power\s*(?:off|fail)|sem\s+energia|falta\s+de\s+energia|queda\s+de\s+energia/i;
  const RE_LOS_SIGLA = /\bLOS\b/;                       // maiúsculo, para não confundir com a palavra "los"
  const RE_LOS_TEXTO = /loss\s+of\s+signal|perda\s+de\s+sinal/i;
  const RE_LOS = { test: (t) => RE_LOS_SIGLA.test(t) || RE_LOS_TEXTO.test(t) };
  const ROTULO_ESTADO = /^\s*(Alarmes?|Status(?:\s+da\s+ONU)?|Estado(?:\s+da\s+ONU)?|Motivo(?:\s+da\s+[úu]ltima)?(?:\s+(?:queda|desconex[aã]o))?|[ÚU]ltimo\s+evento)\s*:?/i;

  // Textos que ficam junto dos rótulos de estado/alarme (rótulo e valor no mesmo elemento,
  // na mesma linha do pai, ou o valor no elemento vizinho)
  function trechosDeEstado() {
    const trechos = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length > 1 || !el.getClientRects().length) continue;
      const t = (el.textContent || "").trim();
      if (!t || t.length > 80 || !ROTULO_ESTADO.test(t)) continue;
      let txt = t;
      const p = el.parentElement;
      if (p) {
        const pt = (p.innerText || "").trim();
        if (pt.length <= 200) txt = pt;
        if (pt.length <= t.length + 2 && p.nextElementSibling) txt += " " + (p.nextElementSibling.innerText || "").trim().slice(0, 80);
      }
      trechos.push(txt);
    }
    return trechos.join(" | ");
  }
  const classificar = (t) => (RE_ENERGIA.test(t) ? "Sem energia" : RE_LOS.test(t) ? "LOS" : "");

  // 1) o VALOR da própria linha "Atenuação Rx ONU": quando não há leitura, o AutoISP mostra ali
  //    "LOS" ou "Sem Energia" no lugar do dBm
  function valorLinhaOnu() {
    const rotulos = [...document.querySelectorAll("*")].filter(
      (e) => e.children.length <= 1 && LABEL.test(e.textContent || "") && e.getClientRects().length
    );
    for (const el of rotulos) {
      let p = el.parentElement;
      for (let up = 0; p && up < 3; up++, p = p.parentElement) {
        const linhas = (p.innerText || "").split(/[\r\n\t]+/).map((l) => l.trim()).filter(Boolean);
        const i = linhas.findIndex((l) => LABEL.test(l));
        if (i < 0) continue;
        const mesmaLinha = (linhas[i].replace(/^\s*Atenuação Rx ONU\s*:?\s*/i, "") || "").trim();
        if (mesmaLinha) return mesmaLinha;
        if (linhas[i + 1] && !/^(Atenuação|Dist[âa]ncia|Alarmes|OLT)/i.test(linhas[i + 1])) return linhas[i + 1];
      }
    }
    return "";
  }
  function readStatus() {
    // ordem: valor da linha da ONU -> campos de alarme/estado -> texto do cartão da ONU (plano B)
    const s = classificar(valorLinhaOnu()) || classificar(trechosDeEstado());
    if (s) return s;
    const c = cartaoOnu();
    return c ? classificar(c.p.innerText || "") : "";
  }

  // Nome: linha logo abaixo de "Assinante ID: ..." no cartão do topo
  function readNome() {
    const el = [...document.querySelectorAll("*")].find(
      (e) => e.children.length <= 1 && /^\s*Assinante ID:/i.test(e.textContent || "") && e.getClientRects().length
    );
    if (!el) return "";
    let p = el;
    for (let up = 0; p && up < 4; up++, p = p.parentElement) {
      const linhas = (p.innerText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const i = linhas.findIndex((l) => /^Assinante ID:/i.test(l));
      if (i >= 0 && linhas[i + 1] && !/:\s*\d*$/.test(linhas[i + 1])) return linhas[i + 1];
    }
    return "";
  }

  // ---------- checklist (parte do sinal) ----------
  const ck = EteccCK.criar({ id: "etecc-checklist-autoisp", posKey: "etecc_ck_pos_autoisp" });
  let tema = "claro";
  function mostrarChecklist(sinal, status, nome) {
    // só aparece nas telas de cliente (com o cartão da ONU ou o nome do assinante), não no login etc.
    if (!sinal && !status && !nome && !cartaoOnu()) { ck.render(document, null, tema); return; }
    const tem = !!(sinal || status);
    const valor = status ? (sinal ? `${status} · ${sinal}` : status) : sinal;
    ck.render(document, [
      { t: "Sinal", ok: tem, v: tem ? valor : "não achei na tela" },
      { t: "Cliente", ok: !!nome, v: nome || "não achei na tela" },
    ], tema);
  }

  function tick() {
    try {
      const sinal = readSinal();
      const status = readStatus();
      const nome = readNome();
      chrome.storage.local.get(["ckCor"], (s) => { tema = (s && s.ckCor) || "claro"; });
      mostrarChecklist(sinal, status, nome);
      if (!sinal && !status) return;
      // regrava a cada leitura para manter o horário atualizado (valor vale "agora")
      chrome.storage.local.set({ autoisp: { sinal, status, nome, t: Date.now() } });
    } catch (e) { /* extensão recarregada ou página ainda montando */ }
  }
  setInterval(tick, 2000);
  tick();
})();
