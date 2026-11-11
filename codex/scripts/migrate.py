#!/usr/bin/env python3
"""Prepare non-secret cc-connect config and unambiguous active sessions; never copies credentials."""
import argparse
import glob
import json
import os
from pathlib import Path
import tomllib

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=Path.home() / 'codex-matrix')
parser.add_argument('--output', type=Path, help='New empty directory for migration artifacts')
args = parser.parse_args()
source = args.source
with (source / 'config.toml').open('rb') as f:
    data = tomllib.load(f)
projects = [p for p in data['projects'] if p.get('agent', {}).get('type') == 'codex']
if len(projects) != 1:
    raise SystemExit('Expected exactly one Codex project')
p = projects[0]
platforms = [x['options'] for x in p['platforms'] if x.get('type') == 'matrix']
if len(platforms) != 1:
    raise SystemExit('Expected exactly one Matrix platform')
m = platforms[0]
allowed = [x.strip() for x in m.get('allow_from', '').split(',') if x.strip()]
admins = [x.strip() for x in p.get('admin_from', '').split(',') if x.strip()]
if not allowed or not admins:
    raise SystemExit('Cannot migrate an empty sender or admin policy automatically')
opts = p['agent'].get('options', {})
config = {'homeserver': m['homeserver'], 'user_id': m['user_id'], 'allowed_senders': allowed, 'admins': admins,
          'direct_rooms': [], 'group_reply_all': bool(m.get('group_reply_all')), 'auto_join': bool(m.get('auto_join', True)), 'cwd': p['base_dir'],
          'codex_cmd': opts.get('cmd', 'codex'), 'codex_home': opts.get('codex_home', '')}
state = {'rooms': {}, 'inbox': []}
bindings_path = source / 'state/.cc-connect/workspace_bindings.json'
if bindings_path.exists():
    bindings = json.loads(bindings_path.read_text()).get('project:' + p['name'], {})
    for key, value in bindings.items():
        if key.startswith('matrix:'):
            state['rooms'][key[7:]] = {'workspace': value['workspace']}
candidates = {}
for path in glob.glob(str(source / 'state/.cc-connect/sessions/*.json')):
    data = json.loads(Path(path).read_text())
    for key, sid in data.get('active_session', {}).items():
        if not key.startswith('matrix:'):
            continue
        room = key[7:].split(':@', 1)[0]
        session = data.get('sessions', {}).get(sid, {})
        tid = session.get('agent_session_id')
        if tid and session.get('agent_type') == 'codex':
            candidates.setdefault(room, {}).setdefault(tid, set()).add(key)
ambiguous = 0
for room, ids in candidates.items():
    if len(ids) == 1:
        state['rooms'].setdefault(room, {})['thread_id'] = next(iter(ids))
    else:
        ambiguous += 1
        state['rooms'].setdefault(room, {})['migration_candidates'] = [{'thread_id': tid, 'scopes': sorted(scopes)} for tid, scopes in sorted(ids.items())]
print(f"项目 1，工作区绑定 {sum('workspace' in x for x in state['rooms'].values())}，可唯一匹配的房间会话 {sum('thread_id' in x for x in state['rooms'].values())}，存在歧义的房间 {ambiguous}。不复制令牌。")
if args.output:
    config['state_path'] = str((args.output / 'state.json').resolve())
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, obj in [('config.json', config), ('state.json', state)]:
        fd = os.open(args.output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    print('迁移文件已生成；未修改旧配置，也未启动或切换服务。')
