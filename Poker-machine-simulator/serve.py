#!/usr/bin/env python3
"""Tiny dev server for the Poker Machine Simulator.

ES modules can't load from a file:// page, so run this and open the printed URL.
Usage:  python3 serve.py        (defaults to port 8000)
        python3 serve.py 8080   (custom port)
"""
import http.server
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        # Don't cache during development so edits show up on reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/index.html"
    print(f"Poker Machine Simulator running at {url}")
    print("Press Ctrl+C to stop.")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
