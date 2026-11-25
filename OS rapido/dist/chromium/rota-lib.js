// Lógica da escala de técnicos, compartilhada pelo popup e pelo checklist (mk-bridge.js).
// A escala vem do MESMO banco do site de geração de O.S. (documento "techniciansList/current").
(function (g) {
  "use strict";

  const ESCALA_URL =
    "https://firestore.googleapis.com/v1/projects/dauntless-attic-rfs6l/databases/" +
    "ai-studio-servicedesk-0627c2e8-c2c2-4323-a7f9-cc38ce027403/documents/techniciansList/current";

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Algarismo romano no FIM do nome vira número ("Cibratel II" == "Cibratel 2", "Cibratel I" == "Cibratel 1")
  const ROMANO = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
  const soAlfa = (s) => {
    const t = norm(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ");
    if (t.length > 1 && ROMANO[t[t.length - 1]]) t[t.length - 1] = ROMANO[t[t.length - 1]];
    return t.join(" ");
  };
  const ehTodas = (t) => /todas\s+as\s+regi/i.test(t.region || "");
  const bairrosDe = (t) => (t.region || "").split(/\s*·\s*/).filter(Boolean);

  // ---------- leitura do banco ----------
  const sv = (f) => (f && f.stringValue) || "";
  function lerLista(campo) {
    const vals = (campo && campo.arrayValue && campo.arrayValue.values) || [];
    return vals.map((v) => {
      const f = (v.mapValue && v.mapValue.fields) || {};
      return { name: sv(f.name).trim(), region: sv(f.region).trim(), city: sv(f.city).trim(), obs: sv(f.obs).trim() };
    }).filter((t) => t.name);
  }
  async function carregarEscala() {
    const r = await fetch(ESCALA_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const f = j.fields || {};
    const rota = { moto: lerLista(f.moto), car: lerLista(f.car), at: Date.parse(sv(f.updatedAt) || j.updateTime) || Date.now() };
    if (!rota.moto.length && !rota.car.length) throw new Error("escala vazia");
    return rota;
  }
  function todos(rota) {
    if (!rota) return [];
    return [
      ...(rota.moto || []).map((t) => ({ ...t, tipo: "Moto" })),
      ...(rota.car || []).map((t) => ({ ...t, tipo: "Carro" })),
    ];
  }

  // ---------- endereço ----------
  // Tokens de complemento que ficam entre o número e o bairro ("CASA", "BLOCO B", "AP15"...)
  const COMPL = /^(casa|bloco|bl|ap|apto|apt|apartamento|fundos|frente|lote|lt|quadra|qd|sobrado|sala|loja|torre|cj|conjunto|edificio|ed|n|no|[a-z]|\d+|ap\d+|apto\d+|bl\d+)$/;
  function bairroDoEndereco(core) {
    const m = core.match(/n[úu]mero\s+\S+\s*(.*)$/i);
    if (!m) return "";
    const toks = m[1].trim().split(/\s+/).filter(Boolean);
    while (toks.length && COMPL.test(soAlfa(toks[0]).replace(/\s+/g, ""))) toks.shift();
    return toks.join(" ");
  }
  // Separa cidade (depois do último " - ") do restante
  function separarEndereco(end) {
    const partes = String(end || "").split(/\s+-\s+/);
    const cidade = partes.length > 1 ? partes[partes.length - 1].trim() : "";
    const core = partes.length > 1 ? partes.slice(0, -1).join(" - ") : String(end || "");
    return { cidade, core, bairroCliente: bairroDoEndereco(core) };
  }

  // ---------- bairros "parecidos" (só pelo nome; é uma sugestão, não uma certeza) ----------
  const GENERICAS = new Set(["jardim", "jd", "vila", "vl", "balneario", "parque", "pq", "cidade", "nova", "novo", "praia", "residencial", "conjunto", "de", "da", "do", "dos", "das", "e", "sao", "santa", "santo", "nossa", "senhora", "sra"]);
  const nucleo = (s) => soAlfa(s).split(" ").filter((w) => w && !GENERICAS.has(w));
  function parecidos(bairroCliente, base) {
    const alvo = new Set(nucleo(bairroCliente));
    if (!alvo.size) return [];
    const vistos = new Map();
    for (const t of base) {
      if (ehTodas(t)) continue;
      for (const b of bairrosDe(t)) {
        const comum = nucleo(b).filter((w) => alvo.has(w)).length;
        if (comum > 0) vistos.set(b, Math.max(vistos.get(b) || 0, comum));
      }
    }
    return [...vistos.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b).slice(0, 5);
  }

  // ---------- resolução do endereço -> técnicos ----------
  const chaveAlias = (cidade, bairro) => soAlfa(cidade) + "|" + soAlfa(bairro);

  // aliases: { "cidade|bairro do cliente": "Bairro da escala" } (escolhas do usuário)
  function resolver(end, rota, aliases) {
    const lista = todos(rota);
    const { cidade, core, bairroCliente } = separarEndereco(end);
    const nCidade = soAlfa(cidade);
    const doCidade = nCidade ? lista.filter((t) => soAlfa(t.city) === nCidade) : [];
    const temCidade = doCidade.length > 0;
    // cidade conhecida mas fora da escala: não procurar bairros de outras cidades (ex.: "Centro")
    const base = temCidade ? doCidade : (nCidade ? [] : lista);

    // bairros da escala (na cidade) -> nome original
    const bairros = new Map();
    for (const t of base) if (!ehTodas(t)) for (const b of bairrosDe(t)) bairros.set(soAlfa(b), b);

    // 1) bairro da escala que aparece MAIS À DIREITA no endereço (evita confundir com nome de rua)
    const nc = " " + soAlfa(core) + " ";
    let melhor = null;
    for (const [nb, orig] of bairros) {
      if (!nb) continue;
      const pos = nc.lastIndexOf(" " + nb + " ");
      if (pos < 0) continue;
      const fim = pos + nb.length + 2;
      if (!melhor || fim > melhor.fim || (fim === melhor.fim && nb.length > melhor.nb.length)) melhor = { nb, orig, fim };
    }
    let modo = "nenhum", bairroEscala = "", nb = "";
    if (melhor) { modo = "exato"; bairroEscala = melhor.orig; nb = melhor.nb; }
    else {
      // 2) bairro vizinho que o usuário já escolheu antes para esse bairro
      const al = aliases && bairroCliente ? aliases[chaveAlias(cidade, bairroCliente)] : "";
      if (al && bairros.has(soAlfa(al))) { modo = "vizinho"; bairroEscala = bairros.get(soAlfa(al)); nb = soAlfa(al); }
      else modo = temCidade ? "cidade" : "nenhum";
    }
    const naRegiao = nb ? base.filter((t) => !ehTodas(t) && bairrosDe(t).some((b) => soAlfa(b) === nb)) : [];
    const cidadeToda = temCidade ? doCidade.filter(ehTodas) : [];
    // opções para o usuário escolher o vizinho: bairros da cidade + quem atende cada um
    const opcoes = [...bairros.entries()].map(([k, orig]) => ({
      bairro: orig,
      tecnicos: base.filter((t) => !ehTodas(t) && bairrosDe(t).some((b) => soAlfa(b) === k)).map((t) => t.name),
    })).sort((a, b) => a.bairro.localeCompare(b.bairro, "pt-BR"));
    return {
      cidade, bairroCliente, modo, bairroEscala, naRegiao, cidadeToda, temCidade, opcoes, doCidade,
      parecidos: modo === "cidade" && bairroCliente ? parecidos(bairroCliente, base) : [],
      chave: bairroCliente ? chaveAlias(cidade, bairroCliente) : "",
    };
  }

  // Resumo curto para o checklist
  function resumo(res) {
    const nome = (t) => `${t.name} (${t.tipo === "Moto" ? "moto" : "carro"})`;
    const reg = res.naRegiao.map(nome).join(" · ");
    const toda = res.cidadeToda.map(nome).join(" · ");
    if (res.modo === "exato") return { ok: true, linha: [reg, toda && "cidade toda: " + toda].filter(Boolean).join(" · ") };
    if (res.modo === "vizinho") return { ok: true, linha: `via bairro vizinho ${res.bairroEscala}: ` + [reg, toda && "cidade toda: " + toda].filter(Boolean).join(" · ") };
    if (res.modo === "cidade") {
      return {
        ok: false,
        linha: `${res.bairroCliente || "bairro"} fora da escala · técnicos de ${res.cidade || "a cidade"}: ` + res.doCidade.map(nome).join(" · "),
      };
    }
    return { ok: false, linha: "cidade do endereço não está na escala" };
  }

  g.RotaLib = { ESCALA_URL, norm, soAlfa, ehTodas, bairrosDe, carregarEscala, todos, separarEndereco, resolver, resumo, chaveAlias };
})(typeof globalThis !== "undefined" ? globalThis : this);
