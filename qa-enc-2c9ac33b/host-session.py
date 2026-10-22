#!/usr/bin/env python3
"""host-session.py — sesión terminal PERSISTENTE en el HOST (VM101) vía runner (enc-2c9ac33b).

El contenedor api monta las piezas de sistema en ro; este puente ejecuta en el
host (donde viven ~/.local/bin, ~/.config/exohuman y systemd --user) usando la
API /api/terminal del runner (x-runner-token), el mismo canal que la UI.

Uso CLI:  python3 host-session.py "comando" [timeout]
Uso API:  from host_session import HostSession; s=HostSession(); s.run("cmd")
"""
import json
import re
import subprocess
import sys
import time
import urllib.request
import uuid

# Sin proxy: el contenedor fuerza HTTP(S)_PROXY=127.0.0.1:1056 y el runner
# (172.17.0.1) NO debe pasar por él (502 intermitentes del proxy, enc-2c9ac33b).
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

BASE = "http://172.17.0.1:30164"
# Token del runner: NUNCA hardcodeado aquí (repo público). Se lee del env
# canónico del host (~/.config/exohuman/pi-web-runner/env, prop-60ea3410=B).
def _load_token():
    import re as _re
    try:
        for line in open("/home/rgsaura/.config/exohuman/pi-web-runner/env"):
            m = _re.match(r"PI_WEB_RUNNER_TOKEN=(\S+)", line.strip())
            if m and not line.strip().startswith("#"):
                return m.group(1)
    except FileNotFoundError:
        pass
    import os
    return os.environ.get("PI_WEB_RUNNER_TOKEN", "")
TOKEN = _load_token()


class HostSession:
    def __init__(self, cols=220, rows=50):
        self.term_id = str(uuid.uuid4()).replace("-", "")[:32]
        body = json.dumps({"cwd": "/home/rgsaura", "cols": cols, "rows": rows, "id": self.term_id}).encode()
        r = urllib.request.Request(BASE + "/api/terminal", data=body, method="POST")
        r.add_header("x-runner-token", TOKEN)
        r.add_header("content-type", "application/json")
        got = None
        last = None
        for attempt in range(6):
            try:
                with _opener.open(r, timeout=60) as resp:
                    got = json.loads(resp.read().decode())["id"]
                break
            except Exception as e:
                last = e
                sys.stderr.write(f"retry terminal {attempt}: {e}\n")
                time.sleep(3.0)
        if not got:
            raise SystemExit(f"ERR creating terminal: {last}")
        if got != self.term_id:
            self.term_id = got
        self.out_path = f"/tmp/hs-{self.term_id[:8]}.sse"
        self._pos = 0
        self.reader = subprocess.Popen(
            ["curl", "--noproxy", "*", "-sN", "-m", "10800", "-H", f"x-runner-token: {TOKEN}",
             f"{BASE}/api/terminal/{self.term_id}/events"],
            stdout=open(self.out_path, "wb"), stderr=subprocess.DEVNULL)
        # prompt inicial
        time.sleep(2.0)
        self._drain()

    def _req(self, method, path, body=None, timeout=30, retries=3):
        last = None
        for attempt in range(retries):
            data = json.dumps(body).encode() if body is not None else None
            r = urllib.request.Request(BASE + path, data=data, method=method)
            r.add_header("x-runner-token", TOKEN)
            if data:
                r.add_header("content-type", "application/json")
            try:
                with _opener.open(r, timeout=timeout) as resp:
                    return resp.read().decode("utf-8", "replace")
            except Exception as e:
                last = e
                time.sleep(1.0 + attempt)
        raise last

    def _drain(self):
        """Nuevos caracteres del SSE desde la última lectura."""
        try:
            with open(self.out_path, "rb") as f:
                f.seek(self._pos)
                data = f.read()
                self._pos = f.tell()
            return data.decode("utf-8", "replace")
        except FileNotFoundError:
            return ""

    @staticmethod
    def _sse_to_text(raw):
        """Stream SSE bruto → texto del terminal (sólo payloads data: {...})."""
        chunks = []
        for line in raw.split("\n"):
            line = line.strip()
            if not line.startswith("data:") or line == "data: [DONE]":
                continue
            try:
                obj = json.loads(line[5:].strip())
            except Exception:
                continue
            if isinstance(obj, dict) and "data" in obj:
                chunks.append(obj["data"])
        return "".join(chunks)

    def run(self, cmd, timeout=30.0):
        """Ejecuta cmd en el host; devuelve (texto_limpio, rc).
        El marcador final se parte con "" en el comando para que el ECO del
        terminal no contenga el mark literal (sólo la salida ejecutada lo tiene)."""
        mark = f"__HS_{uuid.uuid4().hex[:10]}__"
        half = len(mark) // 2
        mark_cmd = f"echo {mark[:half]}\"\"{mark[half:]} $?"
        self._drain()  # descarta eco previo
        script = f"bash -c {json.dumps(cmd + '; ' + mark_cmd)}\r"
        self._req("POST", f"/api/terminal/{self.term_id}", {"type": "input", "data": script})
        buf = ""
        deadline = time.time() + timeout
        raw = ""
        while time.time() < deadline:
            time.sleep(0.4)
            raw += self._drain()
            buf = self._sse_to_text(raw)
            if mark in buf:
                break
        rc = None
        m = re.search(re.escape(mark) + r"\s+(\d+)", buf)
        if m:
            rc = int(m.group(1))
        out = buf[: buf.index(mark)] if mark in buf else buf
        out = out.replace("\r", "")
        out = re.sub(r"\x1b\][^\x07]*\x07", "", out)
        out = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", out)
        lines = out.split("\n")
        while lines and ("bash -c" in lines[0]):
            lines = lines[1:]
        # prompts finales del shell interactivo
        while lines and (lines[-1].strip().endswith("$") or lines[-1].strip().endswith("$ ") or not lines[-1].strip()):
            lines = lines[:-1]
        return "\n".join(lines).strip("\n"), rc

    def close(self):
        try:
            self._req("DELETE", f"/api/terminal/{self.term_id}", timeout=8)
        except Exception:
            pass
        try:
            self.reader.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    s = HostSession()
    try:
        text, rc = s.run(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 30.0)
        print(text)
        print(f"__RC__ {rc}")
    finally:
        s.close()
