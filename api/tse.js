// Proxy mínimo para os arquivos de resultado do TSE (o TSE não libera CORS).
// Só aceita os arquivos de resultado por UF/cargo e devolve o payload do JWS já decodificado.
const PERMITIDO = /^ele20\d\d\/\d{3,5}\/dados\/[a-z]{2}\/[a-z]{2}-c0001-e\d{6}-u\.jws$/;

module.exports = async (req, res) => {
  const path = (req.query && req.query.path) || "";
  if (!PERMITIDO.test(path)) {
    res.status(400).json({ error: "path inválido" });
    return;
  }
  try {
    const r = await fetch(`https://resultados.tse.jus.br/oficial/${path}?nocache=${Date.now()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://resultados.tse.jus.br/oficial/app/index.html",
      },
    });
    if (!r.ok) {
      res.status(r.status).json({ error: `TSE respondeu ${r.status}` });
      return;
    }
    const t = (await r.text()).trim();
    const payload = t.startsWith("{")
      ? JSON.parse(t)
      : JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8"));
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");
    res.status(200).json(payload);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
};
