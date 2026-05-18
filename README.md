# ProudMe Landing Site

Public marketing page + privacy policy for the [ProudMe mobile app](https://github.com/proud-me/proudme-app), a kids-7-12 wellness app from the Pedagogical Kinesiology Lab at Louisiana State University (PI: Dr. Senlin Chen). IRB-approved.

Static HTML/CSS/JS. No build step. Designed to be served by GitHub Pages.

## Files

| File | Purpose |
|---|---|
| `index.html` | Marketing landing page (hero, features, team, contact) |
| `privacy.html` | Privacy policy (COPPA + FERPA aligned, App Store submission URL) |
| `styles.css` | All styling |
| `script.js` | Hero typewriter, mobile nav, contact form |
| `robots.txt` | Allow-all crawl rules |
| `assets/` | Brand marks, mascot illustrations, og-card |

## Local preview

No dependencies. Just serve the directory:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Or any static server (`npx serve`, VS Code Live Server, etc.).

## Hosting

Designed for GitHub Pages serving from the repo root on `main`. To enable:
1. Settings → Pages → Source: `Deploy from a branch`
2. Branch: `main`, folder: `/ (root)`
3. Save. URL appears at the top of the same page once provisioned (~1 min).

When the final public URL is decided, restore the `og:image`, `twitter:image`, and `canonical` meta tags in `index.html` and `privacy.html` (currently removed; search for `TODO` to find the placement). Also regenerate `sitemap.xml` with that URL and reference it from `robots.txt`.

For a custom domain (e.g. `projectproudme.com`), add a `CNAME` file at the repo root containing the bare domain, and point the DNS A/AAAA records at GitHub Pages per [their docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## Contact form

The contact form posts to Formspree (endpoint configured in `script.js`). Replace the Formspree form id if migrating to a different account.
