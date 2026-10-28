"""Testes do proxy do Bot UNM (routes_unm.py): só entra quem está logado E tem a permissão 'unm' (ou é admin)."""
import gzip
import json

import pytest
import requests
from flask import Blueprint, Flask
from flask_login import LoginManager, UserMixin, login_user

import routes_unm
from routes_unm import unm_bp, user_can_unm


class FakeUser(UserMixin):
    def __init__(self, username, permissions=None):
        self.id = username
        self.username = username
        self.permissions = permissions


USERS = {
    'admin': FakeUser('admin', None),
    'pleno': FakeUser('pleno', None),                                       # acesso pleno aos outros módulos
    'sem': FakeUser('sem', json.dumps(['dashboard', 'cashflow'])),
    'com': FakeUser('com', json.dumps(['dashboard', 'unm'])),
}


class FakeResponse:
    def __init__(self, content=b'{"ok": true}', status=200, headers=None):
        self.content, self.status_code = content, status
        self.headers = headers or {'Content-Type': 'application/json'}


class Holder:
    """client + chamadas feitas ao bot + a próxima resposta do bot; desempacota como (client, calls)."""
    def __init__(self):
        self.client, self.calls, self.next_response = None, [], FakeResponse()

    def __iter__(self):
        return iter((self.client, self.calls))


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv('UNM_URL', 'http://bot.local:8010/')
    monkeypatch.setenv('UNM_PROXY_KEY', 'chave-secreta')
    app = Flask(__name__)
    app.secret_key = 'x'
    lm = LoginManager(app)
    lm.user_loader(lambda uid: USERS.get(uid))
    auth = Blueprint('auth_bp', __name__)

    @auth.route('/login')
    def login():
        return 'login'

    @auth.route('/_as/<name>')
    def as_user(name):
        login_user(USERS[name])
        return 'ok'

    app.register_blueprint(auth)
    app.register_blueprint(unm_bp)
    holder = Holder()

    def fake_request(method, url, **kw):
        holder.calls.append({'method': method, 'url': url, **kw})
        return holder.next_response

    monkeypatch.setattr(routes_unm.requests, 'request', fake_request)
    holder.client = app.test_client()
    return holder


def login(c, name):
    c.get(f'/_as/{name}')


def test_permission_rules():
    assert user_can_unm(USERS['admin']) and user_can_unm(USERS['com'])
    assert not user_can_unm(USERS['pleno'])   # acesso pleno (NULL) NÃO inclui o Bot UNM
    assert not user_can_unm(USERS['sem'])
    assert not user_can_unm(FakeUser('x', 'json quebrado'))
    assert not user_can_unm(FakeUser('x', json.dumps([])))


def test_anonymous_is_sent_to_login_or_gets_401_for_api_calls(env):
    c, calls = env
    r = c.get('/unm/')
    assert r.status_code == 302 and '/login' in r.headers['Location']
    r = c.get('/unm/api/state')
    assert r.status_code == 401 and r.get_json()['error'] == 'Sessão expirada'
    assert calls == []


@pytest.mark.parametrize('name', ['pleno', 'sem'])
def test_logged_user_without_the_permission_gets_403_and_nothing_reaches_the_bot(env, name):
    c, calls = env
    login(c, name)
    for path in ('/unm/', '/unm/api/state', '/unm/api/chatmix/send'):
        assert c.open(path, method='POST' if 'send' in path else 'GET').status_code == 403
    assert calls == []


@pytest.mark.parametrize('name', ['com', 'admin'])
def test_allowed_user_is_proxied_with_identity_and_key_but_never_the_session_cookie(env, name):
    c, calls = env
    login(c, name)
    r = c.get('/unm/api/ixc/layer/cto?projetos=7', headers={'X-Real-IP': '131.108.214.1', 'Accept': 'application/json'})
    assert r.status_code == 200 and r.get_json() == {'ok': True}
    call = calls[0]
    assert call['method'] == 'GET' and call['url'] == 'http://bot.local:8010/api/ixc/layer/cto'
    assert call['params'].to_dict() == {'projetos': '7'}
    h = call['headers']
    assert h['X-Unm-Proxy-Key'] == 'chave-secreta' and h['X-Analise-User'] == name and h['X-Forwarded-For'] == '131.108.214.1'
    assert not any(k.lower() in ('cookie', 'authorization') for k in h)  # a sessão do Analise não vai para o bot
    assert r.headers['Cache-Control'] == 'no-store'


def test_post_body_and_admin_password_header_are_forwarded(env):
    c, calls = env
    login(c, 'com')
    c.post('/unm/api/chatmix/send', data=json.dumps({'a': 1}), headers={'Content-Type': 'application/json',
                                                                       'X-Admin-Password': 'senha-do-bot'})
    call = calls[0]
    assert call['method'] == 'POST' and call['data'] == b'{"a": 1}'
    assert call['headers']['X-Admin-Password'] == 'senha-do-bot' and call['headers']['Content-Type'] == 'application/json'


def test_page_root_is_served_and_unm_without_slash_redirects(env):
    c, calls = env
    login(c, 'com')
    assert c.get('/unm').headers['Location'].endswith('/unm/')
    c.get('/unm/')
    assert calls[0]['url'] == 'http://bot.local:8010/'


def test_sse_stream_is_not_proxied(env):
    c, calls = env
    login(c, 'com')
    assert c.get('/unm/api/stream').status_code == 404
    assert calls == []


def test_bot_down_is_reported_as_502_without_details(env, monkeypatch):
    c, _ = env
    login(c, 'com')

    def boom(*a, **k):
        raise requests.ConnectionError('http://bot.local:8010 chave-secreta')
    monkeypatch.setattr(routes_unm.requests, 'request', boom)
    r = c.get('/unm/api/state')
    assert r.status_code == 502 and 'chave-secreta' not in r.get_data(as_text=True)


def test_upstream_status_and_download_headers_are_kept(env):
    c, _ = env
    login(c, 'com')
    env.next_response = FakeResponse(b'id,titulo\n', 200, {'Content-Type': 'text/csv; charset=utf-8',
                                                          'Content-Disposition': 'attachment; filename=incidentes.csv',
                                                          'Set-Cookie': 'nao=repassar', 'Server': 'uvicorn'})
    r = c.get('/unm/api/incidents.csv')
    assert r.headers['Content-Disposition'] == 'attachment; filename=incidentes.csv'
    assert 'Set-Cookie' not in r.headers and 'Server' not in r.headers
    env.next_response = FakeResponse(b'{"detail": "x"}', 403)
    assert c.get('/unm/api/config').status_code == 403


def test_big_responses_are_gzipped_only_when_the_browser_accepts(env):
    c, _ = env
    login(c, 'com')
    big = b'{"onus": [' + b'{"id": "FHTT11f81ae0", "status": "online"},' * 2000 + b'{}]}'
    env.next_response = FakeResponse(big)
    r = c.get('/unm/api/state', headers={'Accept-Encoding': 'gzip'})
    assert r.headers['Content-Encoding'] == 'gzip' and gzip.decompress(r.data) == big and len(r.data) < len(big) / 5
    r = c.get('/unm/api/state')
    assert 'Content-Encoding' not in r.headers and r.data == big
