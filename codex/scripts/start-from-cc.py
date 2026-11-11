#!/usr/bin/env python3
"""Run bridge using the existing cc-connect token without copying it to disk."""
import argparse
import os
import json
from pathlib import Path
import shutil
import tomllib
import urllib.request
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--cc-config', type=Path, default=Path.home() / 'codex-matrix/config.toml')
parser.add_argument('--config', type=Path, required=True)
parser.add_argument('--node', default='node')
args = parser.parse_args()
with args.cc_config.open('rb') as f:
    data = tomllib.load(f)
platforms = [x['options'] for p in data.get('projects', []) if p.get('agent', {}).get('type') == 'codex' for x in p.get('platforms', []) if x.get('type') == 'matrix']
if len(platforms) != 1 or not platforms[0].get('access_token'):
    raise SystemExit('Expected one Codex Matrix platform with an access token')
with args.config.open(encoding='utf-8') as f:
    target = json.load(f)
if target.get('user_id') != platforms[0].get('user_id'):
    raise SystemExit('Target Matrix account differs from source; refusing to pass the token')
source_url = platforms[0].get('homeserver', '').rstrip('/')
target_url = target.get('homeserver', '').rstrip('/')
if target_url != source_url:
    endpoint = urlsplit(target_url)
    if target.get('matrix_transport') != 'pantalaimon' or endpoint.scheme not in ('http', 'https') or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise SystemExit('Target must be the configured Pantalaimon proxy; refusing to pass the token')
    req = urllib.request.Request(target_url + '/_matrix/client/v3/account/whoami', headers={'Authorization': 'Bearer ' + platforms[0]['access_token']})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(req, timeout=8) as response:
            identity = json.load(response)
    except Exception:
        raise SystemExit('Pantalaimon identity check failed; token not passed to the bridge')
    if identity.get('user_id') != target.get('user_id'):
        raise SystemExit('Pantalaimon returned a different user ID; token not passed to the bridge')
node = shutil.which(args.node)
if not node:
    raise SystemExit('Node.js executable not found')
engine = Path(__file__).resolve().parent.parent / 'plugins/matrix-bridge/engine/main.mjs'
env = os.environ.copy()
env['MATRIX_ACCESS_TOKEN'] = platforms[0]['access_token']
os.execve(node, [node, str(engine), str(args.config.resolve())], env)
