const { test, expect } = require('playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appUrl = 'https://apps.apple.com/us/app/proudme-healthy-habits/id6772700786';

const articles = [
  ['/blog/four-healthy-habits-for-kids.html', 'blog-4-habits'],
  ['/blog/introducing-learn.html', 'blog-learn'],
  ['/blog/how-proudme-keeps-ai-kid-safe.html', 'blog-ai-safety'],
  ['/blog/bedtime-routine-for-kids.html', 'blog-bedtime'],
  ['/blog/reduce-screen-time-for-kids.html', 'blog-screen-time'],
  ['/blog/exercise-for-kids-who-dont-like-sports.html', 'blog-no-sports'],
  ['/blog/healthy-eating-games-for-kids.html', 'blog-eating-games'],
  ['/blog/habit-tracker-for-kids.html', 'blog-habit-tracker'],
  ['/blog/smart-goals-for-kids.html', 'blog-smart-goals'],
  ['/blog/morning-routine-for-kids.html', 'blog-morning-routine'],
];

const routes = [
  '/',
  '/about.html',
  '/privacy.html',
  '/support.html',
  '/contact/',
  '/blog/',
  ...articles.map(([route]) => route),
];

const smartBannerRoutes = new Set(['/', '/blog/', ...articles.map(([route]) => route)]);
const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function canonicalFor(route) {
  return route === '/' ? 'https://proudme.org/' : `https://proudme.org${route}`;
}

function jsonLdTypes(value) {
  if (Array.isArray(value)) return value.flatMap(jsonLdTypes);
  if (!value || typeof value !== 'object') return [];
  const own = value['@type'] ? [value['@type']] : [];
  return own.concat(jsonLdTypes(value['@graph']));
}

for (const route of routes) {
  test(`${route} has one H1, correct canonical, unique-ready metadata, and valid assets`, async ({ page }) => {
    const failedAssets = [];
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalFor(route));
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalFor(route));

    const images = page.locator('img');
    for (let i = 0; i < await images.count(); i += 1) {
      await expect(images.nth(i), `${route} image ${i} has no alt attribute`).toHaveAttribute('alt');
    }
    expect(failedAssets).toEqual([]);
  });
}

test('all public routes have unique, search-friendly titles and descriptions', async ({ page }) => {
  const titles = new Set();
  const descriptions = new Set();
  for (const route of routes) {
    await page.goto(route);
    const title = (await page.title()).trim();
    const description = (await page.locator('meta[name="description"]').getAttribute('content')).trim();
    expect(title.length, `${route} title is too short`).toBeGreaterThan(15);
    expect(title.length, `${route} title is too long`).toBeLessThanOrEqual(70);
    expect(description.length, `${route} description is too short`).toBeGreaterThanOrEqual(100);
    expect(description.length, `${route} description is too long`).toBeLessThanOrEqual(175);
    expect(titles.has(title), `${route} repeats "${title}"`).toBeFalsy();
    expect(descriptions.has(description), `${route} repeats its description`).toBeFalsy();
    titles.add(title);
    descriptions.add(description);
  }
});

test('all JSON-LD parses and page-specific schema types are present', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = scripts.map((text) => JSON.parse(text));
    const types = parsed.flatMap(jsonLdTypes);
    if (route === '/') expect(types).toEqual(expect.arrayContaining(['WebSite', 'Organization', 'MobileApplication']));
    if (route === '/about.html') expect(types).toContain('AboutPage');
    if (route === '/blog/') expect(types).toEqual(expect.arrayContaining(['Blog', 'ItemList']));
    if (articles.some(([articleRoute]) => articleRoute === route)) {
      expect(types).toEqual(expect.arrayContaining(['BlogPosting', 'BreadcrumbList']));
    }
  }
});

test('the blog hub exposes all ten articles in four named clusters', async ({ page }) => {
  await page.goto('/blog/');
  await expect(page.locator('.blog-cluster')).toHaveCount(4);
  await expect(page.locator('.blog-cluster > .blog-card-grid .blog-card')).toHaveCount(10);
  await expect(page.locator('.blog-cluster__heading h2')).toHaveText([
    'Everyday routines',
    'Move & play',
    'Food & learning',
    'Digital safety',
  ]);
  for (const [route] of articles) {
    await expect(page.locator(`.blog-card a[href="${path.basename(route)}"]`).first()).toBeVisible();
  }
});

test('homepage presents the wider audience, habit loop, safeguards, LSU context, and parent FAQ', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero__kicker')).toHaveText('For kids and teens ages 7–13+');
  await expect(page.locator('.inside-app')).toHaveCount(0);
  await expect(page.locator('.story-step__visual--choose .habit-orb')).toHaveCount(4);
  await expect(page.locator('.research-ribbon')).toContainText('Built at LSU');
  await expect(page.locator('.home-faq details')).toHaveCount(9);
  await expect(page.locator('.home-faq')).toContainText('New accounts are intended for ages 7 through 17');

  const applicationSchema = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = JSON.parse(applicationSchema)['@graph'];
  const app = graph.find((entry) => entry['@type'] === 'MobileApplication');
  expect(app.audience.suggestedMinAge).toBe(7);
  expect(app.audience.suggestedMaxAge).toBe(17);
});

test('homepage blog and download sections expose the redesigned visual hierarchy', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.blog-feature__media img')).toHaveCount(1);
  await expect(page.locator('.blog-links__media img')).toHaveCount(2);
  await expect(page.locator('.blog-feature__body .blog-card__link')).toContainText('Read the guide');
  await expect(page.locator('.home-faq > .container > .section__title')).toHaveCSS('text-align', 'center');

  const blogCardHeights = await page.locator('.blog-feature, .blog-links article').evaluateAll((cards) => (
    cards.map((card) => Math.round(card.getBoundingClientRect().height))
  ));
  expect(blogCardHeights).toHaveLength(3);
  expect(Math.max(...blogCardHeights) - Math.min(...blogCardHeights)).toBeLessThanOrEqual(1);

  const habitDistribution = await page.locator('.story-step__visual--choose').evaluate((visual) => {
    const parent = visual.getBoundingClientRect();
    return [...visual.querySelectorAll('.habit-orb')].map((orb) => {
      const box = orb.getBoundingClientRect();
      return {
        x: (box.left + box.width / 2 - parent.left) / parent.width,
        y: (box.top + box.height / 2 - parent.top) / parent.height,
      };
    });
  });
  expect(habitDistribution.filter((point) => point.x < .5)).toHaveLength(2);
  expect(habitDistribution.filter((point) => point.x > .5)).toHaveLength(2);
  expect(habitDistribution.filter((point) => point.y < .5)).toHaveLength(2);
  expect(habitDistribution.filter((point) => point.y > .5)).toHaveLength(2);

  await expect(page.locator('.conversion__proof span')).toHaveText([
    'Free to use',
    'No ads',
    'iPhone + iPad',
  ]);
  await expect(page.locator('.conversion__milestone')).toHaveText([
    '1 Pick a goal',
    '2 Log a win',
    '3 Keep improving',
    '4 Feel proud',
  ]);
  await expect(page.locator('.conversion__action a')).toHaveAttribute('href', appUrl);

  const sectionOrder = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => ({
    id: section.id,
    className: section.className,
  })));
  const blogIndex = sectionOrder.findIndex((section) => section.id === 'blog');
  const faqIndex = sectionOrder.findIndex((section) => section.className.includes('home-faq'));
  const contactIndex = sectionOrder.findIndex((section) => section.id === 'contact');
  const conversionIndex = sectionOrder.findIndex((section) => section.className.includes('conversion'));
  expect(blogIndex).toBeLessThan(faqIndex);
  expect(faqIndex).toBeLessThan(contactIndex);
  expect(contactIndex).toBeLessThan(conversionIndex);
  expect(conversionIndex).toBe(sectionOrder.length - 1);
});

test('age and research positioning stays internally consistent', () => {
  const publicFiles = collectHtml(root).filter((file) => !file.includes(`${path.sep}proudme-admin${path.sep}`));
  for (const file of publicFiles) {
    const html = fs.readFileSync(file, 'utf8');
    expect(html, `${path.relative(root, file)} contains the retired ages 7–11 positioning`).not.toMatch(/ages? 7(?:–|-| to )11/i);
    expect(html, `${path.relative(root, file)} contains the retired ages 7–15 positioning`).not.toMatch(/ages? 7(?:–|-| to )15/i);
    expect(html, `${path.relative(root, file)} treats ordinary app use as research-only`).not.toMatch(/use of ProudMe is part of an IRB-approved research study/i);
  }
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  expect(home).toContain('For kids and teens ages 7–13+');
  expect(home).toContain('ages 7 through 17');
});

for (const [route, campaign] of articles) {
  test(`${route} meets the editorial and download-funnel contract`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('.breadcrumbs')).toHaveCount(1);
    await expect(page.locator('.article__hero-media img')).toHaveAttribute('width', '1200');
    await expect(page.locator('.article__hero-media img')).toHaveAttribute('height', '630');
    await expect(page.locator('.article__summary')).toHaveCount(1);
    expect(await page.locator('.article__toc a').count()).toBeGreaterThanOrEqual(5);
    const faqCount = await page.locator('.article__faq details').count();
    expect(faqCount).toBeGreaterThanOrEqual(3);
    expect(faqCount).toBeLessThanOrEqual(5);
    expect(await page.locator('.article__sources a[href^="http"]').count()).toBeGreaterThanOrEqual(2);
    expect(await page.locator('.article__related a').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.article__author a[rel="author"]')).toHaveAttribute('href', '../about.html');
    await expect(page.locator('.article__cta')).toHaveCount(2);
    await expect(page.locator(`.article__cta a[href="${appUrl}"][data-campaign="${campaign}"]`)).toHaveCount(2);
    await expect(page.locator('.article__cta--closing img[src^="../assets/app/"]')).toHaveCount(1);

    const inlineCitations = page.locator('.article__body > p a[href^="http"], .article__body > ul a[href^="http"], .article__body > ol a[href^="http"]');
    expect(await inlineCitations.count(), `${route} needs a direct inline citation`).toBeGreaterThanOrEqual(1);
  });
}

test('Smart App Banners are present only on intended conversion pages', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const banners = page.locator('meta[name="apple-itunes-app"]');
    if (smartBannerRoutes.has(route)) {
      await expect(banners).toHaveCount(1);
      await expect(banners).toHaveAttribute('content', new RegExp(`app-id=6772700786.*app-argument=${appUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    } else {
      await expect(banners).toHaveCount(0);
    }
  }
});

test('public pages share the yellow app-mark navigation and compact closing CTA', async ({ page }) => {
  for (const route of [...routes, '/404.html']) {
    await page.goto(route);
    await expect(page.locator('.nav__brand-mark')).toHaveAttribute('src', '/assets/logo-mark-brand.svg');
    await expect(page.locator('#nav-links > a')).toHaveText([
      'How it works',
      'Learn',
      'Safety',
      'Blog',
      'Contact',
      'Download app now',
    ]);
    await expect(page.locator('#nav-links a', { hasText: 'About' })).toHaveCount(0);
    await expect(page.locator('#nav-links a', { hasText: 'Support' })).toHaveCount(0);
    await expect(page.locator('.nav__download')).toHaveAttribute('href', appUrl);

    await expect(page.locator('main > .conversion')).toHaveCount(1);
    await expect(page.locator('main > .conversion .conversion__milestone')).toHaveCount(4);
    await expect(page.locator('main > .conversion .conversion__action a')).toHaveAttribute('href', appUrl);
    await expect(page.locator('.download-banner')).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/about.html');
  const compactCta = await page.locator('main > .conversion .conversion__intro').boundingBox();
  expect(compactCta.height).toBeLessThanOrEqual(430);
});

test('the blog guide-library introduction is centered', async ({ page }) => {
  await page.goto('/blog/');
  await expect(page.locator('#guide-library')).toHaveCSS('text-align', 'center');
  await expect(page.locator('.blog-listing > .container > .section__lead')).toHaveCSS('text-align', 'center');
});

test('article closing CTAs use clean screen-only app artwork', async ({ page }) => {
  for (const [route] of articles) {
    await page.goto(route);
    const artwork = page.locator('.article__cta--closing figure img');
    await expect(artwork).toHaveCount(1);
    await expect(artwork).toHaveAttribute('src', /-phone\.webp$/);
    await expect(artwork.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(artwork.locator('..')).toHaveCSS('padding', '0px');
  }
});

test('mobile editorial text is centered across public page types', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/about.html', '/privacy.html', '/support.html', '/contact/', '/blog/', '/blog/how-proudme-keeps-ai-kid-safe.html']) {
    await page.goto(route);
    const misaligned = await page.locator('main h1, main h2, main h3, main p, main .section__eyebrow, main .article__cta-kicker').evaluateAll((nodes) =>
      nodes
        .filter((node) => getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
        .filter((node) => getComputedStyle(node).textAlign !== 'center')
        .map((node) => `${node.tagName.toLowerCase()}.${node.className}`)
    );
    expect(misaligned, `${route} has mobile text that is not centered`).toEqual([]);
  }
});

test('homepage mobile pills, buttons, blog cards, and LSU mark are centered', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.conversion__intro')).toHaveCSS('text-align', 'center');
  await expect(page.locator('.conversion__copy > .section__eyebrow')).toHaveCSS('margin-left', /[1-9]\d*(?:\.\d+)?px/);
  await expect(page.locator('.conversion__proof')).toHaveCSS('justify-content', 'center');
  await expect(page.locator('.conversion__action')).toHaveCSS('align-items', 'center');
  await expect(page.locator('.blog-editorial__heading')).toHaveCSS('align-items', 'center');
  await expect(page.locator('.blog-feature__body')).toHaveCSS('align-items', 'center');
  await expect(page.locator('.blog-feature .blog-card__link')).toHaveCSS('align-self', 'center');
  await expect(page.locator('.blog-links__body > span').first()).toHaveCSS('align-self', 'center');
  await expect(page.locator('.blog-links__read').first()).toHaveCSS('align-self', 'center');
  await expect(page.locator('.research-ribbon')).toHaveCSS('justify-items', 'center');

  const ribbon = await page.locator('.research-ribbon').boundingBox();
  const mark = await page.locator('.research-ribbon__mark').boundingBox();
  expect(Math.abs((mark.x + mark.width / 2) - (ribbon.x + ribbon.width / 2))).toBeLessThanOrEqual(1);

  for (const selector of [
    '.learn-editorial__copy > a[href="blog/introducing-learn.html"]',
    '.safety-story__links > a[href="blog/how-proudme-keeps-ai-kid-safe.html"]',
  ]) {
    const link = await page.locator(selector).boundingBox();
    const wrapper = await page.locator(selector).locator('..').boundingBox();
    expect(Math.abs((link.x + link.width / 2) - (wrapper.x + wrapper.width / 2))).toBeLessThanOrEqual(1);
  }
});

test('App Store links use the verified listing and no fabricated provider token', () => {
  const htmlFiles = collectHtml(root);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const appLinks = [...html.matchAll(/href="(https:\/\/apps\.apple\.com[^"]+)"/g)].map((match) => match[1]);
    for (const url of appLinks) {
      expect(url.startsWith(appUrl), `${path.relative(root, file)} has an unexpected App Store URL`).toBeTruthy();
      const parsed = new URL(url.replace(/&amp;/g, '&'));
      expect(parsed.searchParams.has('pt'), 'Do not invent an App Store provider token').toBeFalsy();
      expect(parsed.searchParams.has('ct'), 'Campaign parameters must wait for App Store Connect URLs').toBeFalsy();
      expect(parsed.searchParams.has('mt'), 'Campaign parameters must wait for App Store Connect URLs').toBeFalsy();
    }
  }
});

for (const viewport of viewports) {
  test(`public routes have no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(width.scroll, `${route} overflowed at ${viewport.width}px`).toBeLessThanOrEqual(width.client + 1);
    }
  });
}

test('mobile navigation supports keyboard dismissal and touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/blog/');
  const toggle = page.locator('.nav__toggle');
  await expect(toggle).toBeVisible();
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  for (const link of await page.locator('#nav-links a').all()) {
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(focus.style).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

test('reduced motion disables decorative and card animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const heroAnimation = await page.locator('.hero').evaluate((node) => getComputedStyle(node, '::after').animationName);
  expect(heroAnimation).toBe('none');
  await page.goto('/blog/');
  const transition = await page.locator('.blog-card__image img').first().evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(transition).toBe('0s');
});

test('homepage keeps the production contact-form contract', async ({ page }) => {
  let requestBody = null;
  await page.route('https://proudme-backend.onrender.com/contact/public', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/');
  await expect(page.locator('#contact-form')).toHaveCount(1);
  await expect(page.locator('#contact-form [name="name"]')).toHaveAttribute('required', '');
  await expect(page.locator('#contact-form [name="email"]')).toHaveAttribute('required', '');
  await expect(page.locator('#contact-form [name="message"]')).toHaveAttribute('required', '');
  await expect(page.locator('#contact-status')).toHaveAttribute('aria-live', 'polite');
  await page.locator('#contact-form [name="name"]').fill('Site Test');
  await page.locator('#contact-form [name="email"]').fill('site-test@example.com');
  await page.locator('#contact-form [name="message"]').fill('Testing the production form contract.');
  await page.locator('#contact-form button[type="submit"]').click();
  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody).toMatchObject({
    name: 'Site Test',
    email: 'site-test@example.com',
    message: 'Testing the production form contract.',
  });
  await expect(page.locator('#contact-status')).toContainText(/sent|thank/i);
});

test('all local links resolve and same-page fragments exist', async ({ page, request }) => {
  const checked = new Set();
  for (const route of routes) {
    await page.goto(route);
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    for (const href of hrefs) {
      if (!href || /^(?:https?:|mailto:|tel:)/.test(href)) continue;
      const target = new URL(href, `http://127.0.0.1:4173${route}`);
      const requestUrl = `${target.origin}${target.pathname}${target.search}`;
      if (!checked.has(requestUrl)) {
        const response = await request.get(requestUrl);
        expect(response.ok(), `${route} links to missing ${href}`).toBeTruthy();
        checked.add(requestUrl);
      }
      if (target.hash && target.pathname === new URL(page.url()).pathname) {
        await expect(page.locator(target.hash), `${route} links to missing ${target.hash}`).toHaveCount(1);
      }
    }
  }
});

test('sitemap covers every canonical route and robots points to it', () => {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  for (const route of routes) expect(sitemap).toContain(`<loc>${canonicalFor(route)}</loc>`);
  expect((sitemap.match(/<url>/g) || []).length).toBe(routes.length);
  expect(robots).toContain('Sitemap: https://proudme.org/sitemap.xml');
  expect(robots).toContain('Disallow: /proudme-admin/');
  expect(sitemap).not.toContain('404.html');
});

test('RSS, custom 404, and security contact files meet their public contracts', async ({ page, request }) => {
  const feed = fs.readFileSync(path.join(root, 'feed.xml'), 'utf8');
  expect((feed.match(/<item>/g) || [])).toHaveLength(10);
  for (const [route] of articles) expect(feed).toContain(`<link>${canonicalFor(route)}</link>`);
  expect(feed).toContain('<atom:link href="https://proudme.org/feed.xml" rel="self" type="application/rss+xml"/>');

  const security = fs.readFileSync(path.join(root, '.well-known', 'security.txt'), 'utf8');
  expect(security).toContain('Contact: mailto:pklab@lsu.edu');
  expect(security).toContain('Canonical: https://proudme.org/.well-known/security.txt');
  expect(security).toContain('Preferred-Languages: en');
  expect(security).toMatch(/Expires: 2027-08-08T23:59:59Z/);

  const securityResponse = await request.get('/.well-known/security.txt');
  expect(securityResponse.ok()).toBeTruthy();
  await page.goto('/404.html');
  await expect(page.locator('h1')).toHaveText('That page wandered off.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});

test('public HTML contains no stale launch copy or tracker scripts', () => {
  const obsolete = [
    /coming soon/i,
    /waiting for Apple review/i,
    /Once Apple(?:'s)? Kids category review clears/i,
  ];
  const trackers = [
    /googletagmanager/i,
    /google-analytics/i,
    /gtag\s*\(/i,
    /segment\.com/i,
    /mixpanel/i,
    /posthog/i,
    /facebook\.net\/.*fbevents/i,
  ];
  for (const file of collectHtml(root).filter((file) => !file.includes(`${path.sep}proudme-admin${path.sep}`))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const pattern of obsolete) expect(html, `${path.relative(root, file)} matched ${pattern}`).not.toMatch(pattern);
    for (const pattern of trackers) expect(html, `${path.relative(root, file)} includes tracker ${pattern}`).not.toMatch(pattern);
  }
});

function collectHtml(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'test-results'].includes(entry.name)) continue;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectHtml(item));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(item);
  }
  return files;
}
