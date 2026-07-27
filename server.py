#!/usr/bin/env python3
"""Tiny static server with no-cache headers so edits always show on reload."""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4178


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass


with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'Serving on http://localhost:{PORT} (no-cache)')
    httpd.serve_forever()
