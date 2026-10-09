'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const DB = 'https://match3-battle-53092-default-rtdb.asia-southeast1.firebasedatabase.app';
const HOUR = 60 * 60 * 1000;
class RoomdeleteError extends Error {}

// No createdAt-only fallback: clients without update tracking are retained.
function lastUpdate(room) {
  if (!room || typeof room !== 'object' || !validTime(room.updatedAt)) return null;
  const times = [room.updatedAt];
  for (const player of Object.values(room.players || {})) {
    if (!player || !validTime(player.updatedAt)) return null;
    times.push(player.updatedAt);
  }
  return Math.max(...times);
}
function validTime(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function expired(room, now) {
  const t = lastUpdate(room);
  return t !== null && Number.isFinite(now) && t <= now - HOUR;
}
function checked(response) {
  if (response.status !== 200 || !Number.isFinite(response.serverNow)) {
    throw new RoomdeleteError('Firebaseの取得に失敗しました。削除を中止します。');
  }
  return response;
}
async function run({request, backupDir, dryRun = false, log = console.log}) {
  const snapshot = checked(await request('/rooms'));
  const rooms = snapshot.data || {};
  const entries = Object.entries(rooms);
  const candidates = entries.filter(([code, room]) => /^\d{6}$/.test(code) && expired(room, snapshot.serverNow));
  const missing = entries.filter(([, room]) => lastUpdate(room) === null).length;
  log(`全${entries.length}部屋：削除候補${candidates.length}、更新時刻なし${missing}（保持）`);
  candidates.forEach(([code, room]) => log(`${code} 最終更新 ${new Date(lastUpdate(room)).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})}`));
  if (dryRun || !candidates.length) {
    log(dryRun ? '確認のみ。削除していません。' : '削除対象はありません。');
    return {deleted: 0, skipped: 0, missing};
  }
  fs.mkdirSync(backupDir, {recursive: true, mode: 0o700});
  const save = (name, data) => fs.writeFileSync(path.join(backupDir, name), JSON.stringify(data, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  save('rooms-before.json', rooms);
  log(`退避先：${backupDir}`);
  const result = {deleted: 0, skipped: 0, missing, actions: []};
  const record = () => fs.writeFileSync(path.join(backupDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', {mode:0o600});
  for (const [code] of candidates) {
    const current = checked(await request('/rooms/' + code));
    if (!expired(current.data, current.serverNow)) {
      result.skipped++; result.actions.push({code, action:'kept-after-recheck'}); record();
      log(`${code} 再確認で対象外になったため保持`); continue;
    }
    if (!current.etag) throw new RoomdeleteError('ETagが取得できないため削除を中止します。');
    save(code + '.json', current.data);
    const removed = await request('/rooms/' + code, 'DELETE', current.etag);
    if (removed.status === 412) {
      result.skipped++; result.actions.push({code, action:'kept-concurrent-update'}); record();
      log(`${code} 削除中に更新されたため保持`); continue;
    }
    if (removed.status !== 200 || removed.data !== null) throw new RoomdeleteError(`${code} 削除に失敗しました。退避データは保存済みです。`);
    result.deleted++; result.actions.push({code, action:'deleted'}); record();
    const after = checked(await request('/rooms/' + code));
    if (after.data !== null) {
      if (after.data.createdAt !== current.data.createdAt && validTime(after.data.createdAt)) {
        log(`${code} 元の部屋を削除済み。同番号の新しい部屋は保持`);
      } else throw new RoomdeleteError(`${code} 削除後にデータがあります。確認してください。`);
    } else log(`${code} 削除・確認OK`);
  }
  log(`完了：削除${result.deleted}、再確認で保持${result.skipped}`);
  return result;
}

async function makeRequest() {
  // Reuse the existing Firebase CLI login; never print or copy credentials.
  const npmRoot = execFileSync('npm', ['root', '-g'], {encoding:'utf8'}).trim();
  const cliRoot = path.join(npmRoot, 'firebase-tools');
  const pkg = require(path.join(cliRoot, 'package.json'));
  if (pkg.version !== '15.33.0') throw new RoomdeleteError('このコマンドはfirebase-tools 15.33.0用です。更新後は動作確認が必要です。');
  const {configstore} = require(path.join(cliRoot, 'lib/configstore.js'));
  const {getAccessToken} = require(path.join(cliRoot, 'lib/auth.js'));
  const tokens = configstore.get('tokens');
  const scopes = tokens?.scopes || configstore.get('loginScopes');
  if (!tokens?.refresh_token || !Array.isArray(scopes)) {
    throw new RoomdeleteError('Firebaseのログイン情報がありません。firebase login --no-localhostでログインしてください。');
  }
  return async (location, method='GET', etag) => {
    if (!/^\/rooms(?:\/\d{6})?$/.test(location)) throw new RoomdeleteError('削除対象パスが不正です。');
    const token = (await getAccessToken(tokens.refresh_token, [...scopes])).access_token;
    if (!token) throw new RoomdeleteError('Firebaseの認証に失敗しました。');
    const headers = {Authorization: 'Bearer ' + token};
    if (method === 'GET') headers['X-Firebase-ETag'] = 'true';
    else if (method === 'DELETE' && etag) headers['If-Match'] = etag;
    else throw new RoomdeleteError('条件のない削除は禁止です。');
    const response = await fetch(DB + location + '.json', {
      method, headers, redirect:'error', signal:AbortSignal.timeout(60000)
    });
    let data;
    try { data = await response.json(); } catch { throw new RoomdeleteError('Firebase応答を解析できません。'); }
    return {status:response.status, data, etag:response.headers.get('etag'), serverNow:Date.parse(response.headers.get('date'))};
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) throw new RoomdeleteError('使い方：roomdelete または roomdelete --check');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await run({request:await makeRequest(), dryRun:args.includes('--check'), backupDir:path.join(os.homedir(), 'monpatch-firebase', 'room-backups', stamp + '-' + process.pid)});
}
module.exports = {lastUpdate, expired, run};
if (require.main === module) main().catch(error => {
  // Errors from authentication/HTTP dependencies can contain sensitive request data.
  console.error(error instanceof RoomdeleteError ? error.message : 'roomdeleteを中止しました。ログイン、通信、firebase-toolsのバージョンと退避先を確認してください。');
  process.exitCode = 1;
});
