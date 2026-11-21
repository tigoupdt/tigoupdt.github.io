#!/usr/bin/env node
// Genera la web de la tienda (5 idiomas, sitemap.xml y robots.txt) sin dependencias.
//   node build.js            → versión para publicar (los huecos de foto vacíos no salen)
//   node build.js --preview  → además marca los huecos de foto vacíos (solo para ver en local)
const fs = require('fs');
const path = require('path');
const T = require('./build/i18n.js');

const ROOT = __dirname;
const PREVIEW = process.argv.includes('--preview');
const BASE = 'https://tigoupdt.github.io';
const LANGS = ['es', 'ca', 'en', 'de', 'zh'];
const PATHS = { es: '/', ca: '/ca/', en: '/en/', de: '/de/', zh: '/zh/' };
const HREFLANG = { es: 'es', ca: 'ca', en: 'en', de: 'de', zh: 'zh-Hans' };

const STORE = {
  name: 'Tigo: un poco de todo',
  street: 'Carrer de Cecili Metel, 6, Bajos',
  postalCode: '07460', city: 'Pollença', region: 'Illes Balears', country: 'ES',
  lat: 39.8769648, lng: 3.021083,
  mapsUrl: 'https://maps.app.goo.gl/aU5gw8QWpyf7ZBVE7',
  directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=39.8769648,3.021083',
  appStore: 'https://apps.apple.com/app/id6834421582',
  play: 'https://play.google.com/store/apps/details?id=com.zihao.tigo',
  privacy: BASE + '/tigo-privacidad/',
  deleteAccount: BASE + '/tigo-privacidad/eliminar-cuenta.html',
};
const PRIVACY_HASH = { es: '', ca: '#ca', en: '#en', de: '#de', zh: '#zh' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Fotos reales: se detectan en img/ (fachada, interior, secciones con .jpg .jpeg .png .webp)
function findPhoto(slot) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (fs.existsSync(path.join(ROOT, 'img', `${slot}.${ext}`))) return `/img/${slot}.${ext}`;
  }
  return null;
}
const SLOTS = ['fachada', 'interior', 'secciones'];
const photos = Object.fromEntries(SLOTS.map((s) => [s, findPhoto(s)]));
const ogImage = BASE + (photos.fachada || '/logo.png');

function jsonLd(lang) {
  const t = T[lang];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': BASE + '/#tienda',
    name: STORE.name,
    description: t.jsonDescription,
    url: BASE + PATHS[lang],
    inLanguage: HREFLANG[lang],
    image: [ogImage],
    logo: BASE + '/logo.png',
    address: {
      '@type': 'PostalAddress',
      streetAddress: STORE.street,
      postalCode: STORE.postalCode,
      addressLocality: STORE.city,
      addressRegion: STORE.region,
      addressCountry: STORE.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: STORE.lat, longitude: STORE.lng },
    hasMap: STORE.mapsUrl,
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '21:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '09:00', closes: '20:30' },
    ],
  };
  return JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
}

function head(lang) {
  const t = T[lang];
  const alt = LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${BASE}${PATHS[l]}">`).join('\n');
  const ogAlt = LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${T[l].ogLocale}">`).join('\n');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<meta name="theme-color" content="#1f5fa8">
<link rel="canonical" href="${BASE}${PATHS[lang]}">
${alt}
<link rel="alternate" hreflang="x-default" href="${BASE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(STORE.name)}">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${BASE}${PATHS[lang]}">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="${t.ogLocale}">
${ogAlt}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">
${jsonLd(lang)}
</script>`;
}

function photoFigure(slot, t) {
  const [cap, alt] = t.photos[slot];
  if (photos[slot]) {
    return `<figure><img src="${photos[slot]}" alt="${esc(alt)}" loading="lazy" decoding="async"><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  if (PREVIEW) {
    return `<figure><div class="ph" role="img" aria-label="${esc(cap)}"><strong>FOTO PENDIENTE</strong><span>${esc(cap)}</span><code>img/${slot}.jpg</code></div><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  return '';
}

function page(lang) {
  const t = T[lang];
  const langLinks = LANGS.map((l) =>
    `<a href="${PATHS[l]}" hreflang="${HREFLANG[l]}" lang="${HREFLANG[l]}"${l === lang ? ' aria-current="page"' : ''}>${esc(T[l].label)}</a>`).join('\n      ');
  const productItems = t.products.map(([n, d]) => `<li><h3>${esc(n)}</h3><p>${esc(d)}</p></li>`).join('\n        ');
  const figs = SLOTS.map((s) => photoFigure(s, t)).join('');
  const gallery = figs ? `
  <section class="band" aria-labelledby="h-photos">
    <div class="wrap">
      <h2 id="h-photos">${esc(t.photosH)}</h2>
      <div class="gallery">${figs}</div>
    </div>
  </section>` : '';
  const appItems = t.appItems.map((i) => `<li>${esc(i)}</li>`).join('\n          ');
  const addr = t.addressLines.map(esc).join('<br>');
  const mapSrc = `https://www.google.com/maps?q=${STORE.lat},${STORE.lng}&hl=${t.mapsHl}&z=17&output=embed`;

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
${head(lang)}
</head>
<body>
<a class="skip" href="#contenido">${esc(t.skip)}</a>

<header class="top">
  <div class="wrap top-row">
    <a class="brand" href="${PATHS[lang]}"><img src="/logo.png" width="1283" height="470" alt="Tigo: un poco de todo"></a>
    <nav class="langs" aria-label="${esc(t.langNav)}">
      ${langLinks}
    </nav>
  </div>
</header>

<main id="contenido">
  <section class="hero">
    <div class="wrap">
      <p class="kicker">${esc(t.kicker)}</p>
      <h1>Tigo: un poco de todo</h1>
      <p class="lead">${esc(t.lead)}</p>
      <div class="actions">
        <a class="btn" href="/app/">${esc(t.btnApp)}</a>
        <a class="btn outline" href="${STORE.directionsUrl}" rel="noopener">${esc(t.btnDirections)}</a>
      </div>
    </div>
  </section>

  <section class="wrap info" aria-label="${esc(t.hoursH)} / ${esc(t.whereH)}">
    <div class="card" id="horario">
      <h2>${esc(t.hoursH)}</h2>
      <dl class="hours">
        <div><dt>${esc(t.monSat)}</dt><dd>9:00–21:00</dd></div>
        <div><dt>${esc(t.sunday)}</dt><dd>9:00–20:30</dd></div>
      </dl>
      <p class="status" id="status" hidden data-open="${esc(t.openNow)}" data-closed="${esc(t.closedNow)}"></p>
    </div>
    <div class="card" id="donde">
      <h2>${esc(t.whereH)}</h2>
      <address>${addr}</address>
      <div class="actions">
        <a class="btn" href="${STORE.directionsUrl}" rel="noopener">${esc(t.btnDirections)}</a>
      </div>
      <p class="more"><a href="${STORE.mapsUrl}" rel="noopener">${esc(t.seeMaps)}</a></p>
    </div>
  </section>

  <div class="wrap">
    <div class="map"><iframe title="${esc(t.mapTitle)}" src="${mapSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
  </div>

  <section class="wrap products" aria-labelledby="h-products">
    <h2 id="h-products">${esc(t.productsH)}</h2>
    <p class="intro">${esc(t.productsIntro)}</p>
    <ul class="grid">
        ${productItems}
    </ul>
  </section>
${gallery}
  <section class="app" id="app" aria-labelledby="h-app">
    <div class="wrap app-row">
      <div>
        <h2 id="h-app">${esc(t.appH)}</h2>
        <ul class="ticks">
          ${appItems}
        </ul>
      </div>
      <div class="stores">
        <a class="btn light" href="${STORE.appStore}" rel="noopener"><small>${esc(t.iosSmall)}</small><span>${esc(t.iosBtn)}</span></a>
        <a class="btn light" href="${STORE.play}" rel="noopener"><small>${esc(t.playSmall)}</small><span>${esc(t.playBtn)}</span></a>
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap">
    <p>${esc(t.rights)}</p>
    <p><a href="${STORE.privacy}${PRIVACY_HASH[lang]}">${esc(t.privacy)}</a> · <a href="${STORE.deleteAccount}">${esc(t.deleteAccount)}</a></p>
  </div>
</footer>

<script>
// Abierto / cerrado ahora, con la hora de España (si falla, no se muestra nada)
(function () {
  try {
    var el = document.getElementById('status');
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var get = function (k) { return p.filter(function (x) { return x.type === k; })[0].value; };
    var mins = Number(get('hour')) * 60 + Number(get('minute'));
    var sun = get('weekday') === 'Sun';
    var open = mins >= 540 && mins < (sun ? 1230 : 1260);
    el.textContent = open ? el.getAttribute('data-open').replace('{t}', sun ? '20:30' : '21:00') : el.getAttribute('data-closed');
    el.className = 'status ' + (open ? 'is-open' : 'is-closed');
    el.hidden = false;
  } catch (e) {}
})();
</script>
</body>
</html>
`;
}

function write(rel, content) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

for (const lang of LANGS) write(lang === 'es' ? 'index.html' : `${lang}/index.html`, page(lang));

const today = new Date().toISOString().slice(0, 10);
const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${BASE}${PATHS[l]}"/>`).join('\n')
  + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/"/>`;
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>\n    <loc>${BASE}${PATHS[l]}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`Generado: ${LANGS.length} páginas, sitemap.xml y robots.txt${PREVIEW ? ' (vista previa con huecos de foto)' : ''}`);
