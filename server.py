import os
import json
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIRECTORY = os.path.join(BASE_DIR, 'vku-facility-check')
DATA_DIR = os.path.join(DIRECTORY, 'data')
SURVEYS_FILE = os.path.join(DATA_DIR, 'surveys.json')
VISITORS_FILE = os.path.join(DATA_DIR, 'visitors.json')

os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(SURVEYS_FILE):
    with open(SURVEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)

if not os.path.exists(VISITORS_FILE):
    with open(VISITORS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)

class VKUHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/surveys':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            with open(SURVEYS_FILE, 'r', encoding='utf-8') as f:
                data = f.read()
            self.wfile.write(data.encode('utf-8'))
            return

        elif parsed.path == '/api/visitors':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            with open(VISITORS_FILE, 'r', encoding='utf-8') as f:
                data = f.read()
            self.wfile.write(data.encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}

        if parsed.path == '/api/surveys':
            try:
                with open(SURVEYS_FILE, 'r', encoding='utf-8') as f:
                    surveys = json.load(f)
            except Exception:
                surveys = []

            survey_id = payload.get('id')
            payload['synced'] = True
            existing_idx = -1
            if survey_id:
                existing_idx = next((i for i, s in enumerate(surveys) if s.get('id') == survey_id), -1)

            if existing_idx >= 0:
                surveys[existing_idx] = payload
            else:
                surveys.insert(0, payload)

            with open(SURVEYS_FILE, 'w', encoding='utf-8') as f:
                json.dump(surveys, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'count': len(surveys)}).encode('utf-8'))
            return

        elif parsed.path == '/api/visitors':
            try:
                with open(VISITORS_FILE, 'r', encoding='utf-8') as f:
                    visitors = json.load(f)
            except Exception:
                visitors = []

            visitors.insert(0, payload)
            if len(visitors) > 500:
                visitors = visitors[:500]

            with open(VISITORS_FILE, 'w', encoding='utf-8') as f:
                json.dump(visitors, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), VKUHandler)
    print(f'VKU Server running on port {PORT}')
    server.serve_forever()
