#!/usr/bin/env python3
"""
Roda o dash no seu computador, sem Vercel:  python3 servidor_local.py
Abre http://localhost:8765 no navegador. Serve a página e faz o proxy para o TSE.
"""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORTA = int(os.environ.get("PORTA", "8765"))
TSE = os.environ.get("TSE_BASE", "https://resultados.tse.jus.br/oficial")
PERMITIDO = re.compile(r"^ele20\d\d/\d{3,5}/dados/[a-z]{2}/[a-z]{2}-c0001-e\d{6}-u\.jws$")
PASTA = os.path.dirname(os.path.abspath(__file__))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://resultados.tse.jus.br/oficial/app/index.html",
}
CACHE = {}  # path -> (timestamp, bytes)


def buscar(path):
    agora = time.time()
    if path in CACHE and agora - CACHE[path][0] < 10:
        return CACHE[path][1]
    req = urllib.request.Request(f"{TSE}/{path}?nocache={int(agora * 1000)}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        t = r.read().decode("utf-8").strip()
    if t.startswith("{"):
        payload = json.loads(t)
    else:
        meio = t.split(".")[1]
        payload = json.loads(base64.urlsafe_b64decode(meio + "=" * (-len(meio) % 4)).decode("utf-8"))
    corpo = json.dumps(payload).encode("utf-8")
    CACHE[path] = (agora, corpo)
    return corpo


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PASTA, **kw)

    def log_message(self, *a):
        pass

    def responder(self, status, corpo):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/tse":
            return super().do_GET()
        path = urllib.parse.parse_qs(u.query).get("path", [""])[0]
        if not PERMITIDO.match(path):
            return self.responder(400, b'{"error":"path invalido"}')
        try:
            self.responder(200, buscar(path))
        except urllib.error.HTTPError as e:
            self.responder(e.code, json.dumps({"error": f"TSE respondeu {e.code}"}).encode())
        except Exception as e:  # noqa: BLE001
            self.responder(502, json.dumps({"error": str(e)}).encode())


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    url = f"http://localhost:{PORTA}"
    print(f"Dash rodando em {url}  (Ctrl+C para parar)")
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    srv.serve_forever()
