const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const HANDLE = 'lucesita.pastas';

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  console.log('Abriendo Instagram...');
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Cerrar modal de login si aparece
  const closeBtn = page.locator('[aria-label="Close"]');
  if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(1000);
  }

  // Cerrar modal de cookies
  const acceptBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept All"), button:has-text("Decline optional cookies")');
  if (await acceptBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptBtn.first().click();
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(3000);

  // Extraer datos del perfil
  const data = await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el ? el.getAttribute('content') : '';
    };

    // Bio y nombre desde meta tags
    const ogDescription = getMeta('og:description') || '';
    const ogTitle = getMeta('og:title') || '';
    const ogImage = getMeta('og:image') || '';

    // Intentar extraer stats del texto de la página
    const bodyText = document.body.innerText;

    // Stats: buscar patrones de seguidores
    const followersMatch = bodyText.match(/(\d[\d,\.]+[KkMm]?)\s*(?:seguidores|followers)/i);
    const followingMatch = bodyText.match(/(\d[\d,\.]+[KkMm]?)\s*(?:seguidos|following)/i);
    const postsMatch = bodyText.match(/(\d[\d,\.]+[KkMm]?)\s*(?:publicaciones|posts)/i);

    // Nombre visible
    const h1 = document.querySelector('h1, h2');
    const displayName = h1 ? h1.innerText.trim() : '';

    // Foto de perfil desde img
    const profileImg = document.querySelector('img[alt*="foto de perfil"], img[alt*="profile picture"]');
    const profileImgSrc = profileImg ? profileImg.src : ogImage;

    // Bio
    const bioEl = document.querySelector('span[dir="auto"] > span');
    const bio = bioEl ? bioEl.innerText.trim() : ogDescription;

    return {
      handle: 'lucesita.pastas',
      displayName: displayName || ogTitle.split('•')[0].trim(),
      bio,
      followers: followersMatch ? followersMatch[1] : '',
      following: followingMatch ? followingMatch[1] : '',
      posts: postsMatch ? postsMatch[1] : '',
      profileImageUrl: profileImgSrc,
      ogTitle,
      ogDescription,
      ogImage,
      rawText: bodyText.substring(0, 2000)
    };
  });

  console.log('Datos del perfil:', JSON.stringify(data, null, 2));

  // Guardar assets
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

  // Descargar foto de perfil
  if (data.profileImageUrl || data.ogImage) {
    const imgUrl = data.profileImageUrl || data.ogImage;
    try {
      await page.goto(imgUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      // Usar screenshot de la imagen o descargarla directamente
      await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
    } catch (e) {}
  }

  // Capturar las imágenes de los posts
  const postImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('article img, main img'));
    return imgs
      .filter(img => img.src && img.src.includes('instagram') && img.width > 100)
      .map(img => img.src)
      .slice(0, 9);
  });

  console.log(`Encontradas ${postImages.length} imágenes de posts`);
  data.postImages = postImages;

  // Guardar datos
  fs.writeFileSync(path.join(__dirname, 'instagram-data.json'), JSON.stringify(data, null, 2));
  console.log('Datos guardados en instagram-data.json');

  await browser.close();
})();
