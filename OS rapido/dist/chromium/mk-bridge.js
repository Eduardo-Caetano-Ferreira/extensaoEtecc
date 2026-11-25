// Mundo isolado, só no frame principal: liga o popup da extensão ao mk-main.js (mundo da página).
if (window === window.top) {
  // Repassa à página o último sinal lido no AutoISP (para o checklist). Repete a cada 2 s
  // porque o mk-main.js só começa a escutar depois que a página termina de carregar.
  const enviarAutoisp = () => {
    try {
      chrome.storage.local.get(["autoisp"], (s) => {
        window.dispatchEvent(new CustomEvent("etecc-autoisp", { detail: JSON.stringify(s.autoisp || null) }));
      });
    } catch (e) { /* extensão recarregada */ }
  };
  setInterval(enviarAutoisp, 2000);
  enviarAutoisp();

  // Cor escolhida para o checklist (popup -> storage -> página)
  const enviarTema = () => {
    try {
      chrome.storage.local.get(["ckCor"], (s) => {
        window.dispatchEvent(new CustomEvent("etecc-tema", { detail: JSON.stringify(s.ckCor || "claro") }));
      });
    } catch (e) { /* extensão recarregada */ }
  };
  setInterval(enviarTema, 1500);
  enviarTema();

  // Técnico da região (para o checklist): o mk-main.js manda o endereço lido no atendimento;
  // aqui cruzamos com a escala do dia (e com os bairros vizinhos que você já escolheu) e devolvemos um resumo.
  let ENDERECO = "";
  window.addEventListener("etecc-endereco", (ev) => {
    try { ENDERECO = JSON.parse(ev.detail || '""') || ""; } catch (e) { ENDERECO = ""; }
  });
  let buscandoEscala = false;
  const tecnicoTick = () => {
    try {
      chrome.storage.local.get(["rota", "aliases", "rotaBuscadaEm"], async (s) => {
        let rota = s.rota;
        // renova a escala a cada 10 min (o popup também renova ao abrir)
        if ((!s.rotaBuscadaEm || Date.now() - s.rotaBuscadaEm > 10 * 60 * 1000) && !buscandoEscala && typeof RotaLib !== "undefined") {
          buscandoEscala = true;
          try {
            rota = await RotaLib.carregarEscala();
            chrome.storage.local.set({ rota, rotaBuscadaEm: Date.now() });
          } catch (e) {
            chrome.storage.local.set({ rotaBuscadaEm: Date.now() - 8 * 60 * 1000 }); // tenta de novo em ~2 min
          } finally { buscandoEscala = false; }
        }
        let out;
        if (!ENDERECO) out = { ok: false, linha: "endereço ainda não lido" };
        else if (!rota) out = { ok: false, linha: "escala indisponível" };
        else out = RotaLib.resumo(RotaLib.resolver(ENDERECO, rota, s.aliases || {}));
        window.dispatchEvent(new CustomEvent("etecc-tecnico", { detail: JSON.stringify(out) }));
      });
    } catch (e) { /* extensão recarregada */ }
  };
  setInterval(tecnicoTick, 2000);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "gerar") return;
    const onResp = (ev) => {
      try { port.postMessage(JSON.parse(ev.detail)); } catch (e) {}
    };
    window.addEventListener("etecc-resp", onResp);
    port.onDisconnect.addListener(() => window.removeEventListener("etecc-resp", onResp));
    port.onMessage.addListener((msg) => {
      const detail = JSON.stringify({ id: Date.now(), atendente: msg.atendente || "", autoisp: msg.autoisp || null });
      if (msg.type === "gerar") window.dispatchEvent(new CustomEvent("etecc-gerar", { detail }));
      if (msg.type === "estado") window.dispatchEvent(new CustomEvent("etecc-estado", { detail }));
    });
  });
}
