// Prueba de la detección de dispositivo e idioma de index.html.
// Uso: node tests/detect.test.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* detect:start \*\/([\s\S]*?)\/\* detect:end \*\//);
if (!m) { console.error('No se encuentra el bloque detect en index.html'); process.exit(1); }
const { detectDevice, detectLang, androidIntentUrl, APP_STORE_URL } = new Function(m[1] + '; return { detectDevice, detectLang, androidIntentUrl, APP_STORE_URL };')();

const devices = [
  ['Android Chrome (Pixel)', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 5, 'android'],
  ['Android Huawei sin Google', 'Mozilla/5.0 (Linux; Android 12; NOH-AN00 Build/HUAWEINOH-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/99.0.4844.88 Mobile Safari/537.36', 5, 'android'],
  ['Android tablet Samsung', 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 10, 'android'],
  ['Android WeChat', 'Mozilla/5.0 (Linux; Android 13; V2227A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47', 5, 'android'],
  ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 5, 'ios'],
  ['iPhone Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1', 5, 'ios'],
  ['iPad antiguo (se identifica como iPad)', 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1', 5, 'ios'],
  ['iPadOS como Mac (táctil)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 5, 'ios'],
  ['Mac de verdad (sin táctil)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 0, 'other'],
  ['Windows Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, 'other'],
  ['Windows táctil (Surface)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0', 10, 'other'],
  ['Linux Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 0, 'other'],
  ['UA vacío', '', undefined, 'other'],
];
const langs = [
  ['es-ES', 'es'], ['ca', 'ca'], ['ca-ES', 'ca'], ['en-GB', 'en'], ['de-DE', 'de'], ['zh-CN', 'zh'], ['zh-Hant-TW', 'zh'],
  ['ZH-cn', 'zh'], ['fr-FR', 'es'], ['it', 'es'], ['', 'es'], [undefined, 'es'],
];

let fail = 0;
for (const [name, ua, touch, want] of devices) {
  const got = detectDevice(ua, touch);
  if (got !== want) fail++;
  console.log(`${got === want ? 'ok  ' : 'FALLO'} ${name.padEnd(40)} -> ${got}${got === want ? '' : ' (esperado ' + want + ')'}`);
}
for (const [l, want] of langs) {
  const got = detectLang(l);
  if (got !== want) fail++;
  console.log(`${got === want ? 'ok  ' : 'FALLO'} idioma ${String(l).padEnd(33)} -> ${got}${got === want ? '' : ' (esperado ' + want + ')'}`);
}
const links = [
  ['App Store', APP_STORE_URL, 'https://apps.apple.com/app/id6834421582'],
  ['intent de Play', androidIntentUrl(), 'intent://details?id=com.zihao.tigo#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.zihao.tigo;end'],
];
for (const [name, got, want] of links) {
  if (got !== want) fail++;
  console.log(`${got === want ? 'ok  ' : 'FALLO'} enlace ${name.padEnd(33)} -> ${got}`);
}
console.log(fail ? `\n${fail} fallo(s)` : '\nTodo correcto');
process.exit(fail ? 1 : 0);
