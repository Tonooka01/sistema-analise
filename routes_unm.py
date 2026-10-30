"""
routes_unm.py
Porta de entrada do Bot UNM (monitor de ONUs/OLTs, mapa e envio de mensagens) pelo próprio Analise.

O bot não tem login: quem chega nele pode mandar WhatsApp aos clientes. Por isso ele só atende o Analise (cabeçalho
X-Unm-Proxy-Key) e este proxy só encaminha quem está logado E tem a permissão 'unm' (ou é o admin).
  /unm/...  ->  UNM_URL/...        (padrão http://172.16.10.70:8010)
Variáveis de ambiente (.env do Analise): UNM_URL, UNM_PROXY_KEY (a mesma chave do .env do bot).
"""
import gzip
import json
import os

import requests
from flask import Blueprint, Response, jsonify, redirect, request, url_for
from flask_login import current_user

unm_bp = Blueprint('unm_bp', __name__)

_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
_FORWARD_REQUEST_HEADERS = ('Content-Type', 'X-Admin-Password', 'Accept')
_FORWARD_RESPONSE_HEADERS = ('Content-Type', 'Content-Disposition')
GZIP_MIN_BYTES = 20_000  # o estado das ONUs passa de 500 KB e é consultado a cada poucos segundos


def user_can_unm(user) -> bool:
    """Admin sempre. Os demais só com 'unm' marcado na lista de permissões: o acesso pleno (permissions = NULL) dos
    outros módulos NÃO vale aqui, porque o bot envia mensagens aos clientes e precisa de liberação explícita."""
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.username == 'admin':
        return True
    raw = getattr(user, 'permissions', None)
    if raw is None:
        return False
    try:
        perms = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        return False
    return 'unm' in perms


def _unm_url() -> str:
    return os.environ.get('UNM_URL', 'http://172.16.10.70:8010').rstrip('/')


def _client_ip() -> str:
    return (request.headers.get('X-Real-IP')
            or (request.headers.getlist('X-Forwarded-For') or [None])[0]
            or request.remote_addr or '')


@unm_bp.route('/unm', methods=['GET'])
def unm_root():
    return redirect('/unm/')


@unm_bp.route('/unm/', defaults={'path': ''}, methods=_METHODS)
@unm_bp.route('/unm/<path:path>', methods=_METHODS)
def unm_proxy(path):
    if not current_user.is_authenticated:
        if path.startswith('api/'):
            return jsonify({"error": "Sessão expirada"}), 401
        return redirect(url_for('auth_bp.login', next='/unm/'))
    if not user_can_unm(current_user):
        return jsonify({"error": "Sem acesso ao Bot UNM"}), 403
    if path == 'api/stream':
        # conexão longa prenderia um trabalhador do gunicorn; a página usa consulta periódica quando vem por aqui
        return jsonify({"error": "Use /unm/api/state"}), 404

    headers = {h: request.headers[h] for h in _FORWARD_REQUEST_HEADERS if h in request.headers}
    headers['X-Analise-User'] = current_user.username
    headers['X-Forwarded-For'] = _client_ip()
    key = os.environ.get('UNM_PROXY_KEY', '')
    if key:
        headers['X-Unm-Proxy-Key'] = key

    try:
        r = requests.request(request.method, f"{_unm_url()}/{path}", params=request.args, data=request.get_data(),
                             headers=headers, timeout=(5, 110), allow_redirects=False)
    except requests.RequestException:
        return jsonify({"error": "Bot UNM indisponível no momento"}), 502

    body = r.content
    # Inject heartbeat so the main tab knows the UNM page is open and skips inactivity logout
    if 'text/html' in r.headers.get('Content-Type', ''):
        _hb = (b'<script>(function(){function p(){try{localStorage.setItem("unm_heartbeat",Date.now());}catch(e){}}'
               b'p();setInterval(p,30000);})();</script>')
        body = body.replace(b'</body>', _hb + b'</body>', 1) if b'</body>' in body else body + _hb
    out = Response(body, status=r.status_code)
    for h in _FORWARD_RESPONSE_HEADERS:
        if h in r.headers:
            out.headers[h] = r.headers[h]
    out.headers['Cache-Control'] = 'no-store'
    if len(body) > GZIP_MIN_BYTES and 'gzip' in request.headers.get('Accept-Encoding', ''):
        out.set_data(gzip.compress(body, compresslevel=5))
        out.headers['Content-Encoding'] = 'gzip'
        out.headers['Vary'] = 'Accept-Encoding'
    return out
