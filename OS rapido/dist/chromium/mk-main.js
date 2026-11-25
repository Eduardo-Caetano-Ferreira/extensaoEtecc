// Roda no mundo da página (MAIN), só no frame principal do MK.
// 1) Em segundo plano, guarda o que você já viu (aba da prancheta, cadastro...).
// 2) Mostra um checklist discreto no canto da tela.
// 3) Quando o popup pede, monta o texto da O.S.
(function () {
  "use strict";
  if (window !== window.top) return;
  if (window.__etecc_loaded) return;
  window.__etecc_loaded = true;

  const PERIODO_PADRAO = "Horário Comercial";
  const CACHE_MAX_AGE = 20 * 60 * 1000; // dados vistos há mais que isso são lidos de novo
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- utilidades ----------
  function childFrames(win) {
    const out = [];
    for (let i = 0; i < win.frames.length; i++) {
      try { void win.frames[i].document; out.push(win.frames[i]); } catch (e) { /* cross-origin */ }
    }
    return out;
  }
  function allFrames(win, acc = []) {
    acc.push(win);
    childFrames(win).forEach((f) => allFrames(f, acc));
    return acc;
  }
  function byTitle(doc, startsWith) {
    return [...doc.querySelectorAll("button[title]")].find((b) => b.title.startsWith(startsWith));
  }
  // Frame que contém os botões das abas do "Históricos da Conexão"
  function findHistFrame() {
    const frames = allFrames(window.top);
    for (let i = frames.length - 1; i >= 0; i--) {
      try {
        const b = byTitle(frames[i].document, "Relação de atendimentos associados");
        if (b && b.getBoundingClientRect().width > 0) return frames[i];
      } catch (e) {}
    }
    return null;
  }
  function headers(grid) {
    return grid.config.columns.map((c) => (c.header && c.header[0] && c.header[0].text) || "");
  }
  // Procura (nos sub-frames de F) o grid mais novo cujo cabeçalho satisfaz o teste
  function findGrid(F, test) {
    const subs = allFrames(F).slice(1);
    for (let i = subs.length - 1; i >= 0; i--) {
      try {
        const el = subs[i].document.querySelector(".webix_dtable");
        if (el && subs[i].webix) {
          const g = subs[i].webix.$$(el);
          if (g && test(headers(g))) return g;
        }
      } catch (e) {}
    }
    return null;
  }
  async function clickAndRead(F, btnTitle, test) {
    const btn = byTitle(F.document, btnTitle);
    if (!btn) throw new Error("Botão não encontrado: " + btnTitle);
    const before = findGrid(F, test);
    btn.click();
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const g = findGrid(F, test);
      if (g && g !== before) { await sleep(1200); return findGrid(F, test).serialize(); }
    }
    const g = findGrid(F, test);
    if (g) { await sleep(600); return g.serialize(); }
    return [];
  }
  const isSess = (h) => h.includes("Called ID");

  // ---------- datas ----------
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  }
  const p2 = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtDTS = (d) => `${fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

  // ---------- atendimento aberto ----------
  // Frame do atendimento aberto (o que tem as ferramentas "Histórico da conexão" etc.)
  function findAtendFrame() {
    const fr = allFrames(window.top);
    for (let i = fr.length - 1; i >= 0; i--) {
      try {
        const b = byTitle(fr[i].document, "Histórico da conexão");
        if (b && b.getBoundingClientRect().width > 0) return fr[i];
      } catch (e) {}
    }
    return null;
  }
  // Nome no campo "Cliente" (input mais próximo do rótulo)
  function readNomeCliente(doc) {
    const labs = [...doc.querySelectorAll("*")].filter(
      (e) => e.children.length <= 1 && /^\s*Cliente\s*\*?\s*$/.test(e.textContent || "") && e.getBoundingClientRect().width > 0
    );
    const ins = [...doc.querySelectorAll("input")].filter((i) => i.value && i.getBoundingClientRect().width > 0);
    if (!labs.length || !ins.length) return "";
    const lr = labs[0].getBoundingClientRect();
    ins.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return Math.hypot(ra.left - lr.left, ra.top - lr.bottom) - Math.hypot(rb.left - lr.left, rb.top - lr.bottom);
    });
    return ins[0].value.trim();
  }
  function clientKey() {
    const A = findAtendFrame();
    return A ? readNomeCliente(A.document) : "";
  }

  // ---------- memória do que já foi visto (por cliente) ----------
  const CACHE = {};
  function entry(key) { return CACHE[key] || (CACHE[key] = {}); }
  const fresh = (e) => e && Date.now() - e.t < CACHE_MAX_AGE;

  // Roda em segundo plano: guarda cadastro e, quando a aba da prancheta carrega, as sessões
  function observe() {
    try {
      const F = findHistFrame();
      const key = clientKey();
      if (!F || !key) throw new Error("sem histórico aberto");
      const c = entry(key);
      const cad = readCadastro(F);
      if (cad) c.cadastro = cad;
      const g = findGrid(F, isSess);
      if (g && g.count() > 0 && (!c.sess || c.sess.grid !== g)) {
        c.sess = { rows: g.serialize(), t: Date.now(), grid: g };
      }
    } catch (e) {}
    // manda o endereço lido para a ponte descobrir o técnico da região
    try { window.dispatchEvent(new CustomEvent("etecc-endereco", { detail: JSON.stringify(readEndereco()) })); } catch (e) {}
    try { atualizarChecklist(); } catch (e) {}
  }
  setInterval(observe, 1500);

  // ---------- leitura da tela do atendimento ----------
  // "Data cadastro" no cabeçalho do histórico
  function readCadastro(F) {
    const d = F.document;
    const re = /^\d{2}\/\d{2}\/\d{4}$/;
    const labelEl = [...d.querySelectorAll("*")].find(
      (e) => e.children.length <= 1 && /^\s*Data cadastro\s*$/i.test(e.textContent || "")
    );
    const inputs = [...d.querySelectorAll("input")].filter((i) => re.test(i.value));
    if (labelEl && inputs.length) {
      const lr = labelEl.getBoundingClientRect();
      inputs.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.hypot(ra.left - lr.left, ra.top - lr.bottom) - Math.hypot(rb.left - lr.left, rb.top - lr.bottom);
      });
      return inputs[0].value;
    }
    return inputs.length ? inputs[inputs.length - 1].value : "";
  }

  // Telefone de abertura: está no relato do início do atendimento (log aberto ao lado)
  function readTelefone() {
    const A = findAtendFrame();
    if (!A) return "";
    for (const sub of allFrames(A).slice(1)) {
      try {
        if (!/to-do/.test(sub.document.location.pathname)) continue;
        const txt = sub.document.body.innerText || "";
        // o log mostra o mais novo primeiro: a abertura é a última ocorrência
        const i = txt.lastIndexOf("Relato do cliente ou técnico de suporte no local");
        if (i < 0) continue;
        let seg = txt.slice(i + 48);
        const fim = seg.search(/\n\s*(Público|Privado)\s*\n/);
        if (fim > 0) seg = seg.slice(0, fim);
        const tel = extractPhone(seg.slice(0, 600));
        if (tel) return tel;
      } catch (e) {}
    }
    return "";
  }
  // Endereço do cadastro: linha "Endereço do atendimento: ..." do bloco "Principais informações sobre o cliente"
  function readEndereco() {
    const A = findAtendFrame();
    if (!A) return "";
    for (const sub of allFrames(A).slice(1)) {
      try {
        if (!/to-do/.test(sub.document.location.pathname)) continue;
        const txt = sub.document.body.innerText || "";
        const ms = [...txt.matchAll(/Endereço do atendimento:\s*([^\n]+)/g)];
        if (ms.length) return ms[ms.length - 1][1].replace(/\s+/g, " ").trim();
      } catch (e) {}
    }
    return "";
  }
  function extractPhone(s) {
    const cleaned = s.replace(/\+?55[\s-]?(?=\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4})/g, "");
    const m = cleaned.match(/\(?(\d{2})\)?[\s.-]?(\d{4,5})[\s.-]?(\d{4})(?!\d)/);
    if (!m) return "";
    const num = m[2] + m[3];
    return `(${m[1]}) ${num.length === 9 ? num.slice(0, 5) + "-" + num.slice(5) : num.slice(0, 4) + "-" + num.slice(4)}`;
  }

  // Roteador / ONU: vêm das "Tags de classificação deste cliente" do atendimento
  function mapEquip(s) {
    if (!s) return "";
    if (/COMODATO/i.test(s)) return "Comodato";
    if (/COMPRA/i.test(s)) return "Compra";
    if (/SMART/i.test(s)) return "Smart-Pré";
    return "";
  }
  function readEquipamentos() {
    const res = { roteador: "", onu: "", tags: [] };
    const A = findAtendFrame();
    if (!A) return res;
    try {
      const boxes = [...A.document.querySelectorAll(".HTMLGroupBox, textarea")];
      for (const box of boxes) {
        const txt = box.tagName === "TEXTAREA" ? box.value : box.innerText;
        const lines = (txt || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.some((l) => /COMODATO|COMPRA/i.test(l))) continue;
        res.tags = lines;
        // Define pelas palavras COMODATO / COMPRA:
        // 1) linha "ROTEADOR ..." / "ONU ..." vale para o respectivo equipamento;
        // 2) as demais tags com COMODATO/COMPRA (ex.: "KIT GIGA COMODATO") valem para os dois.
        const r = lines.find((l) => /^ROTEADOR/i.test(l) && /COMODATO|COMPRA/i.test(l));
        const o = lines.find((l) => /^ONU/i.test(l) && /COMODATO|COMPRA/i.test(l));
        // "KIT COMPRA" / "KIT COMODATO" tem prioridade: vale para os dois
        const gerais0 = lines.filter((l) => !/^(ROTEADOR|ONU)\b/i.test(l) && /COMODATO|COMPRA/i.test(l));
        const kits = gerais0.filter((l) => /\bKIT\b/i.test(l));
        const gerais = [...new Set((kits.length ? kits : gerais0).map(mapEquip).filter(Boolean))];
        const geral = gerais.length === 1 ? gerais[0] : ""; // se as tags divergirem, não chuta
        res.roteador = (r && mapEquip(r)) || geral;
        res.onu = (o && mapEquip(o)) || geral;
        return res;
      }
    } catch (e) {}
    return res;
  }

  // ---------- técnico da região (calculado pela ponte, mk-bridge.js, com a escala do dia) ----------
  let TECNICO = { ok: false, linha: "" };
  window.addEventListener("etecc-tecnico", (ev) => {
    try { TECNICO = JSON.parse(ev.detail || "{}") || TECNICO; } catch (e) {}
  });

  // ---------- checklist discreto no canto da tela ----------
  function itensChecklist() {
    if (!findAtendFrame()) return null;
    const c = CACHE[clientKey()] || {};
    const equip = readEquipamentos();
    const tel = readTelefone();
    const end = readEndereco();
    const desde = c.cadastro || "";
    const sg = escolherSinal(AUTOISP, clientKey());
    return [
      { t: "Sinal", ok: !!sg.sinal, v: sg.sinal || (sg.aviso || "abra o cliente no AutoISP") },
      { t: "Telefone", ok: !!tel, v: tel || "não achei no log" },
      { t: "Endereço", ok: !!end, v: end || "não achei no log" },
      { t: "Técnico", ok: !!end && TECNICO.ok, v: end ? (TECNICO.linha || "consultando…") : "depende do endereço" },
      {
        t: "Equip.", ok: !!(equip.roteador && equip.onu),
        v: equip.roteador || equip.onu ? `${equip.roteador || "?"} / ${equip.onu || "?"}`
          : (equip.tags.length ? "tags: " + equip.tags.join(", ") : "tags não encontradas"),
      },
      { t: "Desde", ok: !!desde, v: desde || "abra o histórico" },
      { t: "Conexão", ok: fresh(c.sess), v: fresh(c.sess) ? `${c.sess.rows.length} sessões` : "lido ao gerar" },
    ];
  }
  // Cor do checklist (escolhida no popup; chega pela ponte, mk-bridge.js)
  let TEMA = "claro";
  window.addEventListener("etecc-tema", (ev) => {
    try { TEMA = JSON.parse(ev.detail || '"claro"') || "claro"; } catch (e) {}
  });

  // O desenho (caixa, cores, arrastar, minimizar) está em checklist-ui.js, compartilhado com o AutoISP
  const ck = EteccCK.criar({ id: "etecc-checklist", posKey: "etecc_ck_pos" });
  function atualizarChecklist() {
    let doc;
    try { doc = window.top.frames[0].document; if (!doc.body) return; } catch (e) { return; }
    ck.render(doc, itensChecklist(), TEMA);
  }

  // ---------- coleta (usa o que já foi visto; busca só o que faltar) ----------
  async function ensureHistFrame(report) {
    let F = findHistFrame();
    if (F) return F;
    report("Abrindo histórico da conexão…");
    let hb = null;
    for (const f of allFrames(window.top)) {
      try { const b = byTitle(f.document, "Histórico da conexão"); if (b) { hb = b; break; } } catch (e) {}
    }
    if (!hb) throw new Error("Abra primeiro o atendimento do cliente.");
    hb.click();
    for (let i = 0; i < 40 && !F; i++) { await sleep(250); F = findHistFrame(); }
    if (!F) throw new Error("Não consegui abrir o Histórico da conexão.");
    await sleep(800);
    return F;
  }

  async function collect(report) {
    const F = await ensureHistFrame(report);
    const key = clientKey() || "(sem nome)";
    const c = entry(key);
    const equip = readEquipamentos();
    const telefone = readTelefone();
    const clienteDesde = readCadastro(F) || c.cadastro || "";

    // Sessões de conexão (histórico de quedas)
    let sessRows;
    if (fresh(c.sess)) { report("Histórico de conexão: já visto ✔"); sessRows = c.sess.rows; }
    else {
      report("Lendo histórico de conexão…");
      sessRows = await clickAndRead(F, "Últimas 10 sessões", isSess);
      if (sessRows.length) c.sess = { rows: sessRows, t: Date.now(), grid: null };
    }
    const quedas = sessRows
      .map((s) => ({ ini: parseDate(s.start), fim: parseDate(s.stop), motivo: s.stop_info || "" }))
      .filter((s) => s.ini)
      .sort((a, b) => b.ini - a.ini)
      .map((s) => ({ inicio: fmtDTS(s.ini), fim: s.fim ? fmtDTS(s.fim) : "", motivo: s.motivo }));

    return { clienteDesde, telefone, roteador: equip.roteador, onu: equip.onu, quedas };
  }

  // ---------- sinal da fibra (lido no AutoISP pelo autoisp.js) ----------
  const SINAL_MAX_AGE = 30 * 60 * 1000;
  const normNome = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  function mesmoCliente(a, b) {
    const x = normNome(a), y = normNome(b);
    if (!x.length || !y.length) return null; // não deu para comparar
    return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
  }
  // Devolve { sinal, aviso }. Só usa o sinal se for recente e (quando dá para conferir) do mesmo cliente.
  function escolherSinal(a, clienteMK) {
    if (!a || (!a.sinal && !a.status)) return { sinal: "", aviso: "Sinal: abra o cliente no AutoISP para preencher" };
    if (Date.now() - a.t > SINAL_MAX_AGE) return { sinal: "", aviso: "Sinal do AutoISP desatualizado (>30 min); reabra o cliente lá" };
    const igual = mesmoCliente(a.nome, clienteMK);
    if (igual === false) return { sinal: "", aviso: `Sinal ignorado: AutoISP está em outro cliente (${a.nome})` };
    // status "LOS" / "Sem energia" (lido no AutoISP) vem antes; se houver dBm junto, vai depois
    const texto = a.status ? (a.sinal ? `${a.status} · ${a.sinal}` : a.status) : a.sinal;
    return { sinal: texto, aviso: igual === null ? "Sinal preenchido, mas não consegui conferir o nome do cliente" : "" };
  }

  // dado do AutoISP enviado pela ponte (mk-bridge.js)
  let AUTOISP = null;
  window.addEventListener("etecc-autoisp", (ev) => {
    try { AUTOISP = JSON.parse(ev.detail || "null"); } catch (e) { AUTOISP = null; }
  });

  // ---------- texto da O.S. ----------
  function buildTexto(d, atendente) {
    const quedas = (d.quedas || []).map((q) => `${q.inicio}\t${q.fim}\t${q.motivo}`).join("\n");
    const L = [];
    L.push("=== AGENDAMENTO ===");
    L.push(`DATA: ${fmtDate(new Date())}`);
    L.push(`PERÍODO: ${PERIODO_PADRAO}`);
    L.push("");
    L.push("=== INFORMAÇÕES DO CLIENTE ===");
    L.push(`Roteador: ${d.roteador || ""}`);
    L.push(`ONU: ${d.onu || ""}`);
    L.push(`Contato: ${d.telefone || ""}`);
    L.push(`Cliente desde: ${d.clienteDesde || ""}`);
    L.push("");
    L.push("=== DETALHES DA SOLICITAÇÃO ===");
    L.push("");
    L.push("");
    L.push("=== INFORMAÇÕES TÉCNICAS ===");
    L.push(`Sinal/Status: ${d.sinal || ""}`);
    L.push("Histórico:");
    if (quedas) L.push(quedas);
    L.push("");
    L.push("");
    L.push("=== HISTÓRICO ===");
    L.push("Recente Suporte/OS: Não");
    L.push("Tipo:");
    L.push("Data:");
    L.push("Encerramento:");
    L.push("");
    L.push("=== ATENDIMENTO ===");
    L.push(`Atendente: ${atendente || ""}`);
    L.push("Autorização por Exceção: Não");
    return L.join("\n");
  }

  // ---------- ponte com o popup (via mk-bridge.js) ----------
  function emit(id, type, payload) {
    window.dispatchEvent(new CustomEvent("etecc-resp", { detail: JSON.stringify({ id, type, payload }) }));
  }
  function estado() {
    if (!findAtendFrame()) return { aberto: false };
    const c = CACHE[clientKey()] || {};
    return { aberto: true, sess: !!fresh(c.sess), endereco: readEndereco() };
  }
  let gerando = false;
  window.addEventListener("etecc-gerar", async (ev) => {
    let req = {};
    try { req = JSON.parse(ev.detail || "{}"); } catch (e) {}
    if (gerando) return;
    gerando = true;
    try {
      const d = await collect((s) => emit(req.id, "status", s));
      const sg = escolherSinal(req.autoisp, clientKey());
      d.sinal = sg.sinal;
      if (sg.aviso) emit(req.id, "status", sg.aviso);
      emit(req.id, "result", buildTexto(d, req.atendente));
    } catch (e) {
      console.error("[O.S. Rápido]", e);
      emit(req.id, "error", e.message);
    } finally { gerando = false; }
  });
  window.addEventListener("etecc-estado", (ev) => {
    let req = {};
    try { req = JSON.parse(ev.detail || "{}"); } catch (e) {}
    emit(req.id, "estado", estado());
  });

  window.__etecc_buildTexto = buildTexto; // depuração
})();
