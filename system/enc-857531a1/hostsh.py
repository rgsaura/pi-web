#!/usr/bin/env python3
"""hostsh.py — ejecuta un comando corto en VM101 vía /api/terminal de la UI prod.
Canal de despliegue para enc-31db1c6b (sandbox: sin systemd, ~/.local/bin RO).
Los payloads largos van en ficheros del worktree (montaje rw compartido con VM101).
  hostsh.py "comando corto"      → terminal nuevo, imprime salida
  hostsh.py -t <id> "comando"    → reusa terminal
  hostsh.py -k <id>              → mata terminal
"""
import argparse
import json
import shlex
import sys
import time
import urllib.request

BASE = "http://172.17.0.1:30164/api/terminal"
import os
TOKEN = ""
for _line in open(os.path.expanduser("~/.config/exohuman/pi-web-runner/env")):
    if _line.startswith("PI_WEB_RUNNER_TOKEN="):
        TOKEN = _line.split("=", 1)[1].strip()
HDR = {"Content-Type": "application/json", "X-Runner-Token": TOKEN}


def req(method, path, payload=None, timeout=10):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=HDR)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.read().decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-t", "--tid")
    ap.add_argument("-k", "--kill", action="store_true")
    ap.add_argument("cmd", nargs="?")
    a = ap.parse_args()

    if a.kill:
        print(req("DELETE", f"/{a.tid}"))
        return 0

    tid = a.tid
    created = not tid
    if not tid:
        tid = json.loads(req("POST", "", {"cwd": "/home/rgsaura/workspaces/exohuman"}))["id"]
        time.sleep(0.6)
        req("POST", f"/{tid}", {"type": "resize", "cols": 500, "rows": 50})
        time.sleep(0.2)
        req("POST", f"/{tid}", {"type": "input", "data": "stty -echo; export PS1=\r"})
        time.sleep(0.8)
        print(f"[tid={tid}]", file=sys.stderr)

    # Marcador ensamblado por shell: nunca aparece en el eco de la línea enviada.
    mval = str(time.time_ns() % 100000)
    op2 = int(mval) - 137
    tail = f'; printf "MKST_$((137+{op2}))_END\\n"'
    line = a.cmd + tail + "\r"
    req("POST", f"/{tid}", {"type": "input", "data": line})

    endmark = f"MKST_{mval}_END"
    r = urllib.request.Request(f"{BASE}/{tid}/events", headers=HDR)
    buf = ""
    deadline = time.time() + 60
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            for raw in resp:
                if time.time() > deadline:
                    break
                s = raw.decode(errors="replace").strip()
                if not s.startswith("data: "):
                    continue
                try:
                    d = json.loads(s[6:])
                except Exception:
                    continue
                out = d.get("data", "") if isinstance(d, dict) else ""
                buf += out
                if endmark in buf:
                    break
    except Exception:
        pass
    if created:
        try:
            req("DELETE", f"/{tid}")
        except Exception:
            pass

    import re as _re
    buf = _re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", buf)
    end = buf.find(endmark)
    body = buf[:end if end >= 0 else len(buf)]
    # Quita el eco de la línea enviada (termina justo antes de la primera \r\n posterior).
    echo_frag = a.cmd[:40]
    i = body.find(echo_frag)
    if i >= 0:
        j = body.find("\r\n", i)
        if j >= 0:
            body = body[j + 2:]
    result = body.strip("\r\n")
    if not result:
        print(f"[WARN empty buf={buf!r}]", file=sys.stderr)
    print(result)


if __name__ == "__main__":
    main()
