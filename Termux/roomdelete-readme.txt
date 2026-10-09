モンパッチ v2.69.4 / roomdelete

既存ルームの一括削除は2026/10/09 19:31に端末で実施・空を確認済み。
このZIPは今後のルームの更新時刻記録を追加した版です。まだ公開されていません。

配置
ZIPの全ファイルを Download/ゲーム/モンパッチ/Match3 に展開してください。
従来のファイルを全て更新します。古いファイルがアップロード元に混ざらないようにしてください。
download版の機能には今回の変更を加えていません。

Termuxで実行
(
set -e
base="/storage/emulated/0/Download/ゲーム/モンパッチ"
test -s "$base/Match3/Termux/roomdelete.cjs"
cp "$base/Match3/server/Chat.gs" "$base/AppsScript/Chat.gs"
bash "$base/Match3/Termux/install-roomdelete.sh"
)
source ~/.bashrc
upload3
uploadgas
roomdelete --check

AppsScriptのCode.gsとappsscript.jsonは現在のものを継続使用してください。
Firebaseルールには変更を加えていません。uploadfirebaseは今回不要です。

使い方
roomdelete --check : 現時点の削除候補を表示。削除しません。
roomdelete         : 更新から1時間以上経った全ルームを退避して削除。
自動実行の設定は含みません。Termuxで呼び出した時にだけ動きます。

判定
ルームのupdatedAtと全参加者のupdatedAtの最大値を最終更新時刻とします。
作成時刻だけでは判定しません。ルームまたは参加者の更新時刻がない旧版ルームは保持します。
新しい通常版で作成したルームで確認してください。
待機／対戦中／結果の全状態が対象です。操作が1時間ない場合は在室表示があっても対象です。
常時在室確認のための定期通信は追加していません。
Firebase応答のサーバー時刻で1時間を判定します。

保護と記録
削除前に再取得し、条件に合う部屋だけを処理します。
ETagの条件付き削除を使い、再取得後にデータが変わった部屋は削除しません。
退避先：~/monpatch-firebase/room-backups/日時-プロセス番号/
rooms-before.json : 処理開始時の全ルーム
6桁番号.json : 削除直前の各ルーム
result.json : 削除結果
削除対象は /rooms/6桁番号 のみ。
roomChats、chatArchiveQueue、chatArchiveReceipts、スプレッドシートの保存ログは残します。

認証
追加ログイン不要。現在のFirebase CLIログインを使い、認証情報は表示・退避しません。
Firebase CLIの内部認証APIを使用するためfirebase-tools 15.33.0に限定しています。
CLI更新後は対応確認が必要です。Node 24系のfetchを使用します。

検証
ローカル：期限境界／時刻なし保持／参加者の最新時刻／候補表示のみ／退避／更新競合／取得失敗／ETagなしを確認。
プロフィール既存値保持、得点送信、切断時、正常終了の更新記録をスタブ付き実コードで確認。
JavaScript、結合Apps Script、インストール用シェルの構文を確認。
Firebase実接続と新しい通常版の実機動作は未確認。端末でroomdelete --checkから確認します。
