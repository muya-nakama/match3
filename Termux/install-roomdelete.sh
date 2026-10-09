#!/data/data/com.termux/files/usr/bin/bash
set -e
src="$(cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$HOME/monpatch-firebase"
node --check "$src/roomdelete.cjs"
cp "$src/roomdelete.cjs" "$HOME/monpatch-firebase/roomdelete.cjs"
node <<'JS'
const fs = require('fs');
const p = require('os').homedir() + '/.bashrc';
const line = 'alias roomdelete=\'node "$HOME/monpatch-firebase/roomdelete.cjs"\'';
const current = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
if (!current.split('\n').includes(line)) fs.appendFileSync(p, '\n' + line + '\n');
JS
echo 'roomdeleteを登録しました。source ~/.bashrc を実行してください。'
