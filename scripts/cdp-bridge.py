"""Forward Chrome's loopback-only CDP to the Windows WSL virtual adapter.

Run on Windows. No payload, cookie, or WebSocket logging. This bridge is a
local-network convenience, NOT an authentication boundary: other WSL guests
may reach the virtual adapter, so keep the dedicated Chrome profile isolated.
"""
import ipaddress
import hmac
import os
import selectors
import socket
import socketserver
from pathlib import Path

LISTEN_IP = os.environ.get('AVITO_BRIDGE_HOST', '172.20.16.1')
LISTEN_PORT = int(os.environ.get('AVITO_BRIDGE_PORT', '19222'))
UPSTREAM = ('127.0.0.1', 9222)
TOKEN_FILE = Path(os.environ.get('AVITO_BRIDGE_TOKEN_FILE', str(Path(os.environ['LOCALAPPDATA']) / 'hermes' / 'avito-cdp-bridge.token')))
# Hyper-V WSL adapter; never bind on Wi-Fi/Ethernet or 0.0.0.0.
if ipaddress.ip_address(LISTEN_IP) not in ipaddress.ip_network('172.16.0.0/12'):
    raise SystemExit('Refusing to bind outside the WSL virtual-adapter range')


class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        # WSL Containers may SNAT every guest to the virtual adapter IP.
        # Authenticate each HTTP request (including WebSocket upgrades).
        request = b''
        self.request.settimeout(5)
        try:
            while b'\r\n\r\n' not in request and len(request) < 16384:
                chunk = self.request.recv(4096)
                if not chunk:
                    return
                request += chunk
        except OSError:
            return
        if b'\r\n\r\n' not in request:
            return
        headers, body = request.split(b'\r\n\r\n', 1)
        lines = headers.split(b'\r\n')
        authorization = next((line.partition(b':')[2].strip() for line in lines[1:] if line.lower().startswith(b'authorization:')), b'')
        expected = b'Bearer ' + TOKEN_FILE.read_text().strip().encode('ascii')
        if not hmac.compare_digest(authorization, expected):
            self.request.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            return
        # Never send the bridge credential to Chrome, or record it in logs.
        clean_headers = b'\r\n'.join(line for line in lines if not line.lower().startswith(b'authorization:'))
        try:
            upstream = socket.create_connection(UPSTREAM, timeout=5)
        except OSError:
            return
        with upstream:
            upstream.sendall(clean_headers + b'\r\n\r\n' + body)
            upstream.setblocking(False)
            self.request.setblocking(False)
            with selectors.DefaultSelector() as selector:
                selector.register(self.request, selectors.EVENT_READ, upstream)
                selector.register(upstream, selectors.EVENT_READ, self.request)
                while True:
                    for key, _ in selector.select(timeout=120):
                        try:
                            data = key.fileobj.recv(65536)
                            if not data:
                                return
                            key.data.sendall(data)
                        except OSError:
                            return


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server((LISTEN_IP, LISTEN_PORT), Relay) as server:
        server.serve_forever()
