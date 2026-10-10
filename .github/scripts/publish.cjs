'use strict';
// release/ 폴더(release.json, notes.md, files/*)를 확인하고 GitHub 릴리스를 만든다.
//  prepare: 나뉜 파일(*.partNN) 합치기 → 매니페스트 서명(쎈img 앱에 든 공개키) 확인 → 파일 크기·SHA-256 확인
//  release: 같은 태그가 없을 때만 gh release create (--latest)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA7KfgXTh+h6FW5c8PbuPXKjOO1iGuT3SdIyHOI/pMMlY=
-----END PUBLIC KEY-----`;
const REPO = process.env.GITHUB_REPOSITORY || 'smchosmart-beep/ssenimg-releases';
const DIR = path.join(process.cwd(), 'release'), FILES = path.join(DIR, 'files'), OUT = path.join(process.cwd(), 'out');
const fail = m => { console.error('✖ ' + m); process.exit(1); };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'release.json'), 'utf8'));
if (!/^v\d+\.\d+\.\d+$/.test(meta.tag)) fail('태그 형식 오류');

if (process.argv[2] === 'prepare') {
  fs.mkdirSync(OUT, { recursive: true });
  const names = [...new Set(fs.readdirSync(FILES).map(f => f.replace(/\.part\d{2}$/, '')))];
  for (const n of names) {
    if (!/^[\w.-]+$/.test(n)) fail('파일 이름 오류: ' + n);
    const parts = fs.readdirSync(FILES).filter(f => f === n || f.startsWith(n + '.part')).sort();
    fs.writeFileSync(path.join(OUT, n), Buffer.concat(parts.map(p => fs.readFileSync(path.join(FILES, p)))));
  }
  const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'ssenimg-update.json'), 'utf8'));
  if (!crypto.verify(null, Buffer.from(raw.signed, 'utf8'), PUBLIC_KEY, Buffer.from(raw.signature, 'base64'))) fail('매니페스트 서명이 맞지 않습니다');
  const m = JSON.parse(raw.signed);
  if (m.app !== 'SsenImage' || 'v' + m.version !== meta.tag) fail('매니페스트 버전·앱 이름이 태그와 다릅니다');
  const expect = [m.small, m.full].filter(f => f && f.url.startsWith(`https://github.com/${REPO}/releases/download/${meta.tag}/`));
  if (!expect.some(f => f === m.small)) fail('작은 업데이트 파일 주소가 이 릴리스를 가리키지 않습니다');
  for (const f of expect) {
    const n = f.url.split('/').pop(), p = path.join(OUT, n);
    if (!fs.existsSync(p)) fail(n + ' 없음');
    if (fs.statSync(p).size !== f.size || sha(p) !== f.sha256) fail(n + ' 크기·SHA-256이 매니페스트와 다릅니다');
    console.log(`✔ ${n} ${f.size} bytes 확인`);
  }
  const extra = fs.readdirSync(OUT).filter(n => n !== 'ssenimg-update.json' && !expect.some(f => f.url.endsWith('/' + n)));
  if (extra.length) fail('매니페스트에 없는 파일: ' + extra.join(', '));
  console.log('✔ 서명 확인: 쎈img ' + m.version);
} else if (process.argv[2] === 'release') {
  try { execFileSync('gh', ['release', 'view', meta.tag, '--repo', REPO], { stdio: 'ignore' }); fail(meta.tag + ' 릴리스가 이미 있습니다'); } catch {}
  const assets = fs.readdirSync(OUT).map(n => path.join(OUT, n));
  execFileSync('gh', ['release', 'create', meta.tag, ...assets, '--repo', REPO, '--target', 'main', '--title', meta.title, '--notes-file', path.join(DIR, 'notes.md'), '--latest'], { stdio: 'inherit' });
  console.log('✔ 게시: https://github.com/' + REPO + '/releases/tag/' + meta.tag);
} else fail('prepare 또는 release');
