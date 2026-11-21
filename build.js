#!/usr/bin/env node
// Genera la web de la tienda en _site/ (5 idiomas, Novedades, sitemap.xml y robots.txt). Sin dependencias.
//   node build.js              → versión para publicar (sin huecos de foto vacíos)
//   node build.js --preview    → además marca los huecos de foto vacíos (solo local)
//   node build.js --fixture    → Novedades desde build/fixture.json (sin red para los datos)
//   node build.js --require-news → falla si no hay datos de Novedades (lo usa la GitHub Action)
// Novedades: lee la vista pública public_products de Supabase con la clave PUBLICABLE
//   (variables SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY). Si falla la lectura, el build falla
//   y la web ya publicada se queda como estaba.
const fs = require('fs');
const path = require('path');
const T = require('./build/i18n.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const ARGS = process.argv.slice(2);
const PREVIEW = ARGS.includes('--preview');
const FIXTURE = ARGS.includes('--fixture');
const REQUIRE_NEWS = ARGS.includes('--require-news');
const BASE = 'https://tigoupdt.github.io';
const LANGS = ['es', 'ca', 'en', 'de', 'zh'];
const PATHS = { es: '/', ca: '/ca/', en: '/en/', de: '/de/', zh: '/zh/' };
const HREFLANG = { es: 'es', ca: 'ca', en: 'en', de: 'de', zh: 'zh-Hans' };
const HOME_NEWS = 6;     // tarjetas en la portada
const LIST_MAX = 60;     // novedades en la página de listado

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

// ---------------------------------------------------------------- fotos de la tienda (img/)
function findPhoto(slot) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (fs.existsSync(path.join(ROOT, 'img', `${slot}.${ext}`))) return `/img/${slot}.${ext}`;
  }
  return null;
}
const SLOTS = ['fachada', 'interior', 'secciones'];
const photos = Object.fromEntries(SLOTS.map((s) => [s, findPhoto(s)]));
const ogImage = BASE + (photos.fachada || '/logo.png');

// ---------------------------------------------------------------- Novedades (Supabase)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;
const validPath = (p) => typeof p === 'string' && SAFE_PATH.test(p) && !p.includes('..') && !p.startsWith('/');

function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

async function loadProducts() {
  let rows;
  if (FIXTURE) {
    rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fixture.json'), 'utf8'));
  } else {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      if (REQUIRE_NEWS) throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY');
      console.warn('Sin SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY: se genera la web sin Novedades.');
      return [];
    }
    const res = await fetch(`${url}/rest/v1/public_products?select=*&order=created_at.desc&limit=500`, {
      headers: { apikey: key, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Supabase respondió ${res.status} al leer public_products`);
    rows = await res.json();
  }
  if (!Array.isArray(rows)) throw new Error('Respuesta inesperada de public_products');
  const out = [];
  for (const r of rows) {
    if (!r || !UUID.test(r.id)) continue;
    const photosOk = (Array.isArray(r.photos) ? r.photos : [])
      .filter((p) => p && validPath(p.storage_path))
      .map((p) => ({ storage_path: p.storage_path, thumb_path: validPath(p.thumb_path) ? p.thumb_path : null, position: p.position || 0 }))
      .sort((a, b) => a.position - b.position);
    const base = ['es', 'en', 'ca', 'de', 'zh'].map((l) => r['name_' + l]).find((n) => n && String(n).trim());
    if (!base) continue;
    const id8 = r.id.slice(0, 8);
    out.push({
      id: r.id, slug: `${slugify(r.name_es || base) || 'producto'}-${id8}`, id8,
      name: Object.fromEntries(LANGS.map((l) => [l, (r['name_' + l] || '').trim()])),
      desc: Object.fromEntries(LANGS.map((l) => [l, (r['desc_' + l] || '').trim()])),
      redeemable: r.redeemable === true && Number.isInteger(r.points_price) && r.points_price > 0,
      points: r.points_price,
      createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
      photos: photosOk,
    });
  }
  return out;
}

// Descarga las fotos al sitio (así no se gasta el tráfico gratuito de Supabase al visitar la web)
async function downloadPhotos(products) {
  const base = process.env.SUPABASE_URL || 'https://scrpzxcnisqfuzeexmhp.supabase.co';
  const dir = path.join(OUT, 'novedades-img');
  fs.mkdirSync(dir, { recursive: true });
  const jobs = [];
  for (const p of products) {
    p.photos.forEach((ph, i) => {
      for (const [kind, sp] of [['full', ph.storage_path], ['thumb', ph.thumb_path || ph.storage_path]]) {
        const ext = (sp.match(/\.(jpe?g|png|webp)$/i) || [, 'jpg'])[1].toLowerCase();
        const file = `${p.id8}-${i}${kind === 'thumb' ? '-t' : ''}.${ext}`;
        ph[kind] = `/novedades-img/${file}`;
        jobs.push({ url: `${base}/storage/v1/object/public/product-images/${sp.split('/').map(encodeURIComponent).join('/')}`, file: path.join(dir, file), sp });
      }
    });
  }
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const res = await fetch(j.url);
      if (!res.ok) throw new Error(`No se pudo descargar la foto ${j.sp} (${res.status})`);
      fs.writeFileSync(j.file, Buffer.from(await res.arrayBuffer()));
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
}

const nameOf = (p, lang) => p.name[lang] || p.name.es || p.name.en || p.name.ca || p.name.de || p.name.zh;
const descOf = (p, lang) => p.desc[lang] || p.desc.es || '';
const newsListPath = (lang) => (lang === 'es' ? '' : `/${lang}`) + `/${T[lang].newsSeg}/`;
const productPath = (lang, p) => newsListPath(lang) + p.slug + '/';
const fmtDate = (iso, lang) => new Intl.DateTimeFormat(T[lang].dateLocale, { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const fmtPoints = (n, lang) => new Intl.NumberFormat(T[lang].dateLocale).format(n);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

// ---------------------------------------------------------------- estructura común
function jsonLdStore(lang) {
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
      '@type': 'PostalAddress', streetAddress: STORE.street, postalCode: STORE.postalCode,
      addressLocality: STORE.city, addressRegion: STORE.region, addressCountry: STORE.country,
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

// meta: { title, description, paths:{lang: '/ruta/'}, image, ld?, type? }
function layout(lang, meta, body, extraScript = '') {
  const t = T[lang];
  const url = BASE + meta.paths[lang];
  const alt = LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${BASE}${meta.paths[l]}">`).join('\n');
  const ogAlt = LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${T[l].ogLocale}">`).join('\n');
  const langLinks = LANGS.map((l) =>
    `<a href="${meta.paths[l]}" hreflang="${HREFLANG[l]}" lang="${HREFLANG[l]}"${l === lang ? ' aria-current="page"' : ''}>${esc(T[l].label)}</a>`).join('\n      ');
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta name="theme-color" content="#1f5fa8">
<link rel="canonical" href="${url}">
${alt}
<link rel="alternate" hreflang="x-default" href="${BASE}${meta.paths.es}">
<meta property="og:type" content="${meta.type || 'website'}">
<meta property="og:site_name" content="${esc(STORE.name)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${meta.image || ogImage}">
<meta property="og:locale" content="${t.ogLocale}">
${ogAlt}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="stylesheet" href="/style.css">${meta.ld ? `
<script type="application/ld+json">
${meta.ld}
</script>` : ''}
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
${body}
</main>

<footer class="foot">
  <div class="wrap">
    <p>${esc(t.rights)}</p>
    <p><a href="${STORE.privacy}${PRIVACY_HASH[lang]}">${esc(t.privacy)}</a> · <a href="${STORE.deleteAccount}">${esc(t.deleteAccount)}</a></p>
  </div>
</footer>
${extraScript}</body>
</html>
`;
}

const STATUS_SCRIPT = `
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
`;

// ---------------------------------------------------------------- piezas de Novedades
function redeemBadge(p, lang, cls = 'badge') {
  if (!p.redeemable) return '';
  return `<span class="${cls}">${esc(T[lang].redeem.replace('{n}', fmtPoints(p.points, lang)))}</span>`;
}

function newsCard(p, lang) {
  const ph = p.photos[0];
  const img = ph
    ? `<img src="${ph.thumb}" alt="${esc(nameOf(p, lang))}" loading="lazy" decoding="async" width="480" height="360">`
    : '<div class="noimg" aria-hidden="true"></div>';
  return `<li class="ncard"><a href="${productPath(lang, p)}">${img}<span class="ncard-body"><h3>${esc(nameOf(p, lang))}</h3>${redeemBadge(p, lang)}</span></a></li>`;
}

function homeNews(lang, products) {
  if (!products.length) return '';
  const t = T[lang];
  return `
  <section class="wrap news" aria-labelledby="h-news">
    <h2 id="h-news">${esc(t.newsH)}</h2>
    <p class="intro">${esc(t.newsIntro)}</p>
    <ul class="ngrid">${products.slice(0, HOME_NEWS).map((p) => newsCard(p, lang)).join('')}</ul>
    <p class="center"><a class="btn outline" href="${newsListPath(lang)}">${esc(t.newsAll)}</a></p>
  </section>`;
}

function homeBody(lang, products) {
  const t = T[lang];
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
  return `  <section class="hero">
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
${homeNews(lang, products)}
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
  </section>`;
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

function listBody(lang, products) {
  const t = T[lang];
  return `  <section class="wrap news-list" aria-labelledby="h-news">
    <p class="crumb"><a href="${PATHS[lang]}">← ${esc(t.rights.split(' · ')[0])}</a></p>
    <h1 id="h-news">${esc(t.newsH)}</h1>
    <p class="intro">${esc(t.newsIntro)}</p>
    <ul class="ngrid">${products.slice(0, LIST_MAX).map((p) => newsCard(p, lang)).join('')}</ul>
  </section>`;
}

function productBody(lang, p) {
  const t = T[lang];
  const name = nameOf(p, lang);
  const d = descOf(p, lang);
  const imgs = p.photos.map((ph) => `<img src="${ph.full}" alt="${esc(name)}" loading="lazy" decoding="async">`).join('');
  return `  <article class="wrap product">
    <p class="crumb"><a href="${newsListPath(lang)}">${esc(t.newsBack)}</a></p>
    <h1>${esc(name)}</h1>
    <p class="date">${esc(t.published.replace('{d}', fmtDate(p.createdAt, lang)))}</p>
    ${imgs ? `<div class="pgallery">${imgs}</div>` : ''}
    ${d ? `<p class="pdesc">${esc(d)}</p>` : ''}
    ${p.redeemable ? `<div class="redeem"><strong>${esc(t.redeem.replace('{n}', fmtPoints(p.points, lang)))}</strong><a class="btn" href="/app/">${esc(t.redeemCta)}</a></div>` : ''}
    <p class="ask">${esc(t.askStore)}</p>
    <div class="actions"><a class="btn outline" href="${STORE.directionsUrl}" rel="noopener">${esc(t.btnDirections)}</a></div>
  </article>`;
}

// ---------------------------------------------------------------- salida
function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function copyStatic() {
  for (const f of ['logo.png', 'favicon.png', 'style.css']) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  fs.cpSync(path.join(ROOT, 'app'), path.join(OUT, 'app'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'img'))) {
    fs.cpSync(path.join(ROOT, 'img'), path.join(OUT, 'img'), { recursive: true, filter: (s) => !s.endsWith('.md') });
  }
}

(async () => {
  // Se vacía el contenido (no la carpeta): en Windows un servidor local la deja bloqueada
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
  copyStatic();

  const products = await loadProducts();
  if (REQUIRE_NEWS && !products.length) throw new Error('La vista public_products no devolvió ningún producto');
  if (products.length) await downloadPhotos(products);
  const latest = products[0] ? products.reduce((a, p) => (p.updatedAt > a ? p.updatedAt : a), products[0].updatedAt) : null;

  const urls = []; // para el sitemap: { paths:{lang:path}, lastmod }
  const today = new Date().toISOString().slice(0, 10);

  // Portada
  const homePaths = PATHS;
  for (const lang of LANGS) {
    const t = T[lang];
    const html = layout(lang, { title: t.title, description: t.description, paths: homePaths, ld: jsonLdStore(lang) }, homeBody(lang, products), STATUS_SCRIPT);
    write(lang === 'es' ? 'index.html' : `${lang}/index.html`, html);
  }
  urls.push({ paths: homePaths, lastmod: latest ? latest.slice(0, 10) : today });

  if (products.length) {
    // Listado
    const listPaths = Object.fromEntries(LANGS.map((l) => [l, newsListPath(l)]));
    for (const lang of LANGS) {
      const t = T[lang];
      const firstImg = products.find((p) => p.photos[0]);
      write(`${newsListPath(lang)}index.html`.replace(/^\//, ''), layout(lang, {
        title: t.newsTitle, description: t.newsDescription, paths: listPaths,
        image: firstImg ? BASE + firstImg.photos[0].full : undefined,
      }, listBody(lang, products)));
    }
    urls.push({ paths: listPaths, lastmod: latest.slice(0, 10) });

    // Una página por producto y por idioma
    for (const p of products) {
      const pPaths = Object.fromEntries(LANGS.map((l) => [l, productPath(l, p)]));
      for (const lang of LANGS) {
        const t = T[lang];
        const name = nameOf(p, lang);
        const d = descOf(p, lang);
        const desc = d ? clip(d, 155) : `${name}. ${t.newsIntro}`;
        write(`${productPath(lang, p)}index.html`.replace(/^\//, ''), layout(lang, {
          title: name + t.productSuffix, description: desc, paths: pPaths,
          image: p.photos[0] ? BASE + p.photos[0].full : undefined, type: 'article',
        }, productBody(lang, p)));
      }
      urls.push({ paths: pPaths, lastmod: p.updatedAt.slice(0, 10) });
    }
  }

  // sitemap.xml y robots.txt
  const entry = (u) => {
    const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${BASE}${u.paths[l]}"/>`).join('\n')
      + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}${u.paths.es}"/>`;
    return LANGS.map((l) => `  <url>\n    <loc>${BASE}${u.paths[l]}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n${alts}\n  </url>`).join('\n');
  };
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(entry).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
  console.log(`Generado en _site/: ${LANGS.length} portadas, ${products.length} novedades × ${LANGS.length} idiomas, sitemap.xml y robots.txt${PREVIEW ? ' (vista previa con huecos de foto)' : ''}`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
