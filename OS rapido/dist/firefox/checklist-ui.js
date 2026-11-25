// Caixa do checklist (discreta, arrastável, minimizável, com cores), compartilhada pelo MK e pelo AutoISP.
// Uso:  const ck = EteccCK.criar({ id, posKey });   ck.render(documento, itens, "rosa");   // itens: [{t, ok, v}] ou null
//
// Posição: guardamos a posição DESEJADA como proporção do espaço livre da janela (0 = canto esquerdo/topo,
// 1 = canto direito/base). Assim ela volta ao mesmo lugar depois de trocar de tela, mudar o zoom ou
// redimensionar a janela, e nunca é "achatada" para o canto por uma janela momentaneamente pequena.
(function (g) {
  "use strict";

  // bg/borda = caixa · txt = valor · lab = rótulos e título · ok/no = bolinha pronta/pendente · pend = valor pendente
  const TEMAS = {
    claro:    { bg: "rgba(255,255,255,.82)", borda: "rgba(100,116,139,.16)", txt: "#334155", lab: "#94a3b8", ok: "#16a34a", no: "#cbd5e1", pend: "#94a3b8" },
    escuro:   { bg: "rgba(15,23,42,.86)",    borda: "rgba(148,163,184,.25)", txt: "#e2e8f0", lab: "#94a3b8", ok: "#4ade80", no: "#475569", pend: "#94a3b8" },
    verde:    { bg: "rgba(240,253,244,.88)", borda: "rgba(22,163,74,.30)",   txt: "#14532d", lab: "#4d7c5a", ok: "#16a34a", no: "#bbf7d0", pend: "#6b9a7a" },
    azul:     { bg: "rgba(239,246,255,.88)", borda: "rgba(37,99,235,.28)",   txt: "#1e3a8a", lab: "#6b8fc9", ok: "#2563eb", no: "#bfdbfe", pend: "#7c9bd0" },
    vermelho: { bg: "rgba(254,242,242,.88)", borda: "rgba(232,25,46,.28)",   txt: "#7f1d1d", lab: "#c07a80", ok: "#e8192e", no: "#fecaca", pend: "#c98e93" },
    roxo:     { bg: "rgba(250,245,255,.88)", borda: "rgba(147,51,234,.28)",  txt: "#581c87", lab: "#9b7ab8", ok: "#9333ea", no: "#e9d5ff", pend: "#a98cc4" },
    rosa:     { bg: "rgba(253,242,248,.88)", borda: "rgba(219,39,119,.28)",  txt: "#831843", lab: "#c0749a", ok: "#db2777", no: "#fbcfe8", pend: "#c98aae" },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const entre01 = (v) => Math.min(1, Math.max(0, v));

  function criar(opts) {
    const ID = opts.id || "etecc-checklist";
    const CHAVE = opts.posKey || "etecc_ck_pos";
    let ckHtml = "";
    let ultimo = null; // { doc, itens, tema } para redesenhar ao minimizar
    let pref = null;   // { fx, fy, min } — preferência do usuário (posição desejada e minimizado)

    // ---- memória (localStorage do frame e, se falhar, do topo da página) ----
    function lugares(win) {
      const l = [win];
      try { if (win.top && win.top !== win) l.push(win.top); } catch (e) {}
      return l;
    }
    function lerPref(win) {
      for (const w of lugares(win)) {
        try { const p = JSON.parse(w.localStorage.getItem(CHAVE) || "null"); if (p && typeof p === "object") return p; } catch (e) {}
      }
      return {};
    }
    function gravarPref(win) {
      for (const w of lugares(win)) { try { w.localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch (e) {} }
    }

    const escala = () => Math.min(2.6, Math.max(0.7, +(pref && pref.s) || 1));

    function render(doc, itens, temaId) {
      if (!doc || !doc.body) return;
      ultimo = { doc, itens, tema: temaId };
      let box = doc.getElementById(ID);
      if (!itens) { if (box) box.style.display = "none"; return; }
      if (!pref) pref = lerPref(doc.defaultView);
      if (!box) box = montar(doc);
      box.style.display = "block";
      const T = TEMAS[temaId] || TEMAS.claro;
      box.style.background = T.bg;
      box.style.borderColor = T.borda;
      const min = !!pref.min;
      const s = escala();
      box.style.width = Math.round(235 * s) + "px";
      box.style.fontSize = (10.5 * s).toFixed(1) + "px";
      const n = itens.filter((i) => i.ok).length;
      // minimalista: uma linha por item (bolinha + rótulo curto + valor); o valor completo aparece ao passar o mouse
      // (medidas em em: acompanham o tamanho da letra quando o checklist é redimensionado)
      const corpo = min ? "" : itens.map((i) =>
        `<div title="${esc(i.v)}" style="display:flex;gap:.57em;padding:.1em .95em;align-items:baseline">` +
        `<span style="color:${i.ok ? T.ok : T.no};font-size:.76em;line-height:1">●</span>` +
        `<span style="width:4.6em;flex:none;color:${T.lab}">${esc(i.t)}</span>` +
        `<span style="flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:${i.ok ? T.txt : T.pend}">${esc(i.v)}</span></div>`).join("");
      const grip = min ? "" : `<div data-acao="grip" title="Arraste para redimensionar" style="position:absolute;right:2px;bottom:2px;width:12px;height:12px;cursor:nwse-resize;opacity:.55">` +
        `<svg width="12" height="12" viewBox="0 0 12 12" style="display:block;pointer-events:none"><path d="M11 3L3 11M11 7L7 11" stroke="${T.lab}" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg></div>`;
      const html = `<div data-acao="min" style="padding:0 .95em .2em;color:${T.lab};cursor:pointer;letter-spacing:.02em">` +
        `O.S. Rápido · ${n}/${itens.length} ${min ? "▴" : "▾"}</div>${corpo}${grip}`;
      if (html !== ckHtml) { box.innerHTML = html; ckHtml = html; if (box._manter) box._manter(); }
      // primeira vez com conteúdo (ou voltou a ficar visível): aplica a posição desejada
      if (box._aplicarPendente) { box._aplicarPendente = false; if (box._aplicar) box._aplicar(); }
      else if (box._foraDaTela && box._foraDaTela() && box._aplicar) box._aplicar();
    }

    function montar(doc) {
      const win = doc.defaultView;
      pref = lerPref(win);
      const box = doc.createElement("div");
      box.id = ID;
      box.style.cssText = "position:fixed;right:12px;bottom:80px;z-index:2147483646;width:235px;padding:5px 0;" +
        "backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);" +
        "border:1px solid transparent;border-radius:8px;font-family:Arial,sans-serif;line-height:1.35;box-sizing:border-box;" +
        "opacity:.93;transition:opacity .15s;cursor:grab;user-select:none;touch-action:none";
      box.addEventListener("mouseenter", () => (box.style.opacity = "1"));
      box.addEventListener("mouseleave", () => (box.style.opacity = ".93"));

      let drag = null, moveu = false, apertouTitulo = false;

      const medidas = () => {
        const W = win.innerWidth, H = win.innerHeight;
        if (!(W > 60 && H > 60)) return null; // janela ainda sem tamanho (escondida): não mexe
        const r = box.getBoundingClientRect();
        return { W, H, r, livreX: Math.max(0, W - r.width), livreY: Math.max(0, H - r.height) };
      };
      const colocar = (left, top, m) => {
        box.style.left = Math.min(Math.max(0, left), m.livreX) + "px";
        box.style.top = Math.min(Math.max(0, top), m.livreY) + "px";
        box.style.right = "auto"; box.style.bottom = "auto";
      };
      // aplica a posição DESEJADA (proporção do espaço livre); sem preferência, fica no canto padrão
      box._aplicar = () => {
        if (!(pref.fx >= 0 && pref.fy >= 0)) return;
        const m = medidas(); if (!m) return;
        colocar(entre01(pref.fx) * m.livreX, entre01(pref.fy) * m.livreY, m);
      };
      // depois de crescer/encolher (minimizar etc.), só garante que não sai da tela (não muda a preferência)
      box._manter = () => {
        if (!box.style.left) return;
        const m = medidas(); if (!m) return;
        colocar(m.r.left, m.r.top, m);
      };
      box._foraDaTela = () => {
        const m = medidas(); if (!m) return false;
        return m.r.right < 20 || m.r.bottom < 20 || m.r.left > m.W - 20 || m.r.top > m.H - 20;
      };
      box._aplicarPendente = true;
      win.addEventListener("resize", () => box._aplicar());

      // Minimizar/expandir: clique no título (▾ / ▴). Com o arrasto, o navegador manda o clique para a
      // própria caixa, então guardamos se o mouse foi apertado em cima do título.
      box.addEventListener("click", () => {
        if (moveu) { moveu = false; return; } // foi um arrasto, não um clique
        if (apertouTitulo) {
          pref.min = !pref.min; gravarPref(win); ckHtml = "";
          if (ultimo) render(ultimo.doc, ultimo.itens, ultimo.tema);
        }
        apertouTitulo = false;
      });
      box.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        const r = box.getBoundingClientRect();
        drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, x0: ev.clientX, y0: ev.clientY };
        // canto de redimensionar: o arrasto muda a escala (largura + letra) em vez de mover a caixa
        if (ev.target.closest && ev.target.closest('[data-acao="grip"]')) {
          drag.redim = { w0: r.width, s0: escala() };
          // ancora pelo canto superior esquerdo, para a caixa crescer para a direita/baixo junto com o mouse
          box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.right = "auto"; box.style.bottom = "auto";
        }
        moveu = false;
        apertouTitulo = !!(ev.target.closest && ev.target.closest('[data-acao="min"]'));
        try { box.setPointerCapture(ev.pointerId); } catch (e) {}
      });
      box.addEventListener("pointermove", (ev) => {
        if (!drag) return;
        if (!moveu && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
        moveu = true;
        if (drag.redim) {
          const w = drag.redim.w0 + (ev.clientX - drag.x0);
          pref.s = Math.min(2.6, Math.max(0.7, drag.redim.s0 * w / drag.redim.w0));
          ckHtml = "";
          if (ultimo) render(ultimo.doc, ultimo.itens, ultimo.tema);
          return;
        }
        box.style.cursor = "grabbing";
        const m = medidas(); if (!m) return;
        colocar(ev.clientX - drag.dx, ev.clientY - drag.dy, m);
      });
      const soltar = () => {
        if (!drag) return;
        const eraRedim = !!drag.redim;
        drag = null;
        box.style.cursor = "grab";
        if (eraRedim) { if (moveu) gravarPref(win); return; }
        if (moveu) { // guarda a posição como proporção do espaço livre
          const m = medidas();
          if (m) {
            pref.fx = m.livreX ? entre01(parseFloat(box.style.left) / m.livreX) : 0;
            pref.fy = m.livreY ? entre01(parseFloat(box.style.top) / m.livreY) : 0;
            gravarPref(win);
          }
        }
      };
      box.addEventListener("pointerup", soltar);
      box.addEventListener("pointercancel", soltar);

      // formato antigo (pixels) -> converte na primeira aplicação
      if (pref.fx == null && isFinite(pref.x) && isFinite(pref.y)) {
        const W = win.innerWidth, H = win.innerHeight;
        if (W > 300 && H > 150) { pref.fx = entre01(pref.x / Math.max(1, W - 235)); pref.fy = entre01(pref.y / Math.max(1, H - 120)); }
      }

      doc.body.appendChild(box);
      ckHtml = "";
      return box;
    }

    return { render };
  }

  g.EteccCK = { TEMAS, criar };
})(typeof globalThis !== "undefined" ? globalThis : this);
