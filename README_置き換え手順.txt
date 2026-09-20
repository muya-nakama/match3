モンパッチ PWA v2.62 置き換え用

GitHubの本家リポジトリ直下に、このZIPの中身を同じ構成で上書きしてください。

上書き対象:
game.html
download/index.html
download/game.html
download/manifest.webmanifest
download/sw.js

新規追加:
download/monpatch-icon-192.png
download/monpatch-icon-512.png
download/apple-touch-icon.png

変更内容:
- 右側のアイコン画像を採用
- PWA manifestを192x192 / 512x512 PNGアイコンに変更
- apple-touch-icon追加
- Service Workerのキャッシュ対象にPNGアイコンを追加
- Service Workerキャッシュ名を 2.62.1 に変更して更新を反映しやすくした
- download/game.html のタイトル表記を v2.62 に修正
- 本家 game.html から不要なPWA manifest/apple-touch-icon参照を削除し、タイトルをv2.62へ修正

注意:
既存の download/icon.svg は削除しなくても構いません。
新しいmanifestとHTMLでは使わなくなります。
