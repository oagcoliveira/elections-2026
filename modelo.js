// Modelo de projeção do 2º turno presidencial 2026 por UF.
// Funções puras: recebem os payloads do TSE já decodificados e devolvem a projeção.
(function (root) {
  const UFS = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa",
               "pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to","zz"];

  const NOMES = {ac:"Acre",al:"Alagoas",am:"Amazonas",ap:"Amapá",ba:"Bahia",ce:"Ceará",df:"Distrito Federal",
    es:"Espírito Santo",go:"Goiás",ma:"Maranhão",mg:"Minas Gerais",ms:"Mato Grosso do Sul",mt:"Mato Grosso",
    pa:"Pará",pb:"Paraíba",pe:"Pernambuco",pi:"Piauí",pr:"Paraná",rj:"Rio de Janeiro",rn:"Rio Grande do Norte",
    ro:"Rondônia",rr:"Roraima",rs:"Rio Grande do Sul",sc:"Santa Catarina",se:"Sergipe",sp:"São Paulo",
    to:"Tocantins",zz:"Exterior"};

  // 2º turno 2022: [votos Lula, votos Bolsonaro] por UF
  const BASE22 = {ac:[121566,287750],al:[976831,687827],ap:[189918,200547],am:[1004991,961741],
    ba:[6097815,2357028],ce:[3807891,1634477],es:[926767,1282145],df:[729295,1041331],go:[1542115,2193041],
    ma:[2668425,1082749],mt:[652786,1216730],ms:[599547,880606],mg:[6190960,6141310],pa:[2509084,2073895],
    pb:[1601953,802502],pr:[2506605,4159343],pe:[3640933,1798832],pi:[1551383,467065],rj:[4156217,5403894],
    rn:[1326785,711381],rs:[2891851,3733185],ro:[262904,633236],rr:[67128,213518],sc:[1351918,3047630],
    sp:[11519882,14216587],se:[862951,421086],to:[434593,411654],zz:[152905,145264]};

  const LULA = "13", FLAVIO = "22";

  const num = x => (x == null || x === "") ? 0 : parseFloat(String(x).replace(",", "."));

  // acha o candidato (objeto com n, vap e nmu) em qualquer nível do payload
  function votos(p, n) {
    let v = 0, achou = false;
    (function walk(o) {
      if (achou || !o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o.n === n && "vap" in o && "nmu" in o) { v = num(o.vap); achou = true; return; }
      Object.values(o).forEach(walk);
    })(p);
    return v;
  }

  // base: payloads do 1º turno 2026 por UF -> eleitorado e taxa de válidos
  function montarBase(t1) {
    const base = {};
    for (const uf of UFS) {
      const p = t1[uf] || {};
      const te = num(p.e && p.e.te);
      const vv = num(p.v && p.v.vv);
      const [l22, b22] = BASE22[uf];
      base[uf] = { eleitorado: te, taxa1t: te ? vv / te : 0, share22: l22 / (l22 + b22) };
    }
    return base;
  }

  // opts: { limiar: 5, peso: "validos" | "eleitorado" }
  // UFs abaixo do limiar de seções totalizadas aparecem na tabela, mas ficam fora do total.
  function projetar(base, vivo, br, opts) {
    const limiar = opts.limiar ?? 5;
    const linhas = [];
    let totL = 0, totF = 0;
    for (const uf of UFS) {
      const b = base[uf], p = vivo[uf] || {};
      const pst = num(p.s && p.s.pst);
      const l = votos(p, LULA), f = votos(p, FLAVIO);
      const est = num(p.e && p.e.est);
      const shareAtual = (l + f) ? l / (l + f) : null;
      if (pst < limiar || (l + f) === 0) {
        linhas.push({ uf, nome: NOMES[uf], fonte: "fora", pst, shareAtual, share22: b.share22, share: null,
                      eleitorado: b.eleitorado, peso: 0, margem: null, votosL: l, votosF: f });
        continue;
      }
      const share = shareAtual;
      const taxa = opts.peso === "eleitorado" ? 1 : (est ? (l + f) / est : b.taxa1t);
      const peso = b.eleitorado * taxa;
      const pl = peso * share, pf = peso * (1 - share);
      totL += pl; totF += pf;
      linhas.push({ uf, nome: NOMES[uf], fonte: "apuração", pst, shareAtual, share22: b.share22, share,
                    eleitorado: b.eleitorado, peso, margem: pl - pf, votosL: l, votosF: f });
    }
    const bl = votos(br || {}, LULA), bf = votos(br || {}, FLAVIO);
    return {
      linhas,
      lula: (totL + totF) ? totL / (totL + totF) : null,
      margem: totL - totF,
      tse: { pst: num(br && br.s && br.s.pst), lula: (bl + bf) ? bl / (bl + bf) : null,
             votosL: bl, votosF: bf, hg: br && br.hg, dg: br && br.dg,
             te: num(br && br.e && br.e.te), est: num(br && br.e && br.e.est) },
      ufsApuracao: linhas.filter(r => r.fonte === "apuração").length,
    };
  }

  // Decisão matemática: o líder está eleito quando a vantagem supera todos os votos que
  // ainda podem entrar (eleitorado das seções não totalizadas, como se todos votassem no 2º).
  // eleitoradoBase: usado quando o payload nacional não traz o eleitorado.
  function decisao(tse, eleitoradoBase) {
    const te = tse.te || eleitoradoBase || 0;
    const est = tse.est || te * tse.pst / 100;
    const vantagem = Math.abs(tse.votosL - tse.votosF);
    const lider = tse.votosL === tse.votosF ? null : tse.votosL > tse.votosF ? "Lula" : "Flávio";
    const restantes = Math.max(0, te - est);
    // no ritmo atual (vantagem por eleitor apurado = r), decide quando a fração apurada x
    // do eleitorado satisfaz r·x = 1 − x  →  x = 1/(1+r); convertido para % de seções
    const r = est ? vantagem / est : 0;
    const fracEleit = r ? 1 / (1 + r) : null;
    const secPorEleit = (est && te && tse.pst) ? (tse.pst / 100) / (est / te) : 1;
    const pstDecide = fracEleit == null ? null : Math.min(100, fracEleit * secPorEleit * 100);
    return { lider, vantagem, restantes, decidido: lider != null && te > 0 && vantagem > restantes,
             folga: vantagem - restantes, pstDecide };
  }

  const api = { UFS, NOMES, BASE22, num, votos, montarBase, projetar, decisao };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Modelo = api;
})(this);
