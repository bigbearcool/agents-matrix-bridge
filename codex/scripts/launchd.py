#!/usr/bin/env python3
"""Generate a launchd plist for review; does not install or start a service."""
import argparse
import os
import plistlib
import sys
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--config', type=Path, required=True)
p.add_argument('--cc-config', type=Path, default=Path.home()/'codex-matrix/config.toml')
p.add_argument('--node', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--log-dir', type=Path, required=True)
a = p.parse_args()
for item in (a.config, a.cc_config, a.node):
    if not item.is_file():
        raise SystemExit(f'File not found: {item}')
root = Path(__file__).resolve().parent
program = [sys.executable, str(root/'start-from-cc.py'), '--cc-config', str(a.cc_config.resolve()), '--config', str(a.config.resolve()), '--node', str(a.node.resolve())]
plist = {'Label':'ai.bigbear.codex-native-matrix-bridge', 'ProgramArguments':program, 'RunAtLoad':True, 'KeepAlive':True,
         'StandardOutPath':str(a.log_dir.resolve()/'bridge.out.log'), 'StandardErrorPath':str(a.log_dir.resolve()/'bridge.err.log')}
# Exclusive create prevents accidental overwrite of a user file.
fd=os.open(a.output, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
with os.fdopen(fd,'wb') as f: plistlib.dump(plist,f)
print('LaunchAgent 草稿已生成；未安装或启动。')
