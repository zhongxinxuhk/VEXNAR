#!/usr/bin/env python3
"""Minimal stand-in for the Go sidecar.

Used by `VEXNAR_DESKTOP_SMOKE=1` to verify port selection, spawning and the
health probe without a database. It implements only what the supervisor needs.
"""

import argparse
import http.server
import socketserver


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-addr", default="127.0.0.1:8799")
    args, _ = parser.parse_known_args()
    host, port = args.addr.rsplit(":", 1)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 - stdlib naming
            if self.path == "/api/health":
                body = b'{"status":"ok"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *_args):
            pass

    with socketserver.TCPServer((host, int(port)), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
