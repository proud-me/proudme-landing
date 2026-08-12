# ProudMe Landing Site

Public marketing site, support pages, and ten-guide content library for the ProudMe mobile app, a healthy-habit app built by the Pedagogical Kinesiology Lab at Louisiana State University (PI: Dr. Senlin Chen). Public marketing says “For kids and teens ages 7–13+”; accounts are intended for ages 7 through 17. Ordinary app use is separate from the lab’s IRB-approved research study.

Static HTML/CSS/JS. No build step. Designed to be served by GitHub Pages.

## Files

| File | Purpose |
|---|---|
| `index.html` | Marketing landing page, real app previews, parent FAQ, download funnel, and contact form |
| `blog/` | Ten source-backed parent guides and the four-cluster blog hub |
| `about.html` | Team, editorial standards, AI-assistance disclosure, and correction process |
| `privacy.html` | Canonical policy draft; LSU approval is required before the wider-age release |
| `support.html`, `contact/` | Support and contact routes |
| `feed.xml` | RSS 2.0 feed for all ten guides |
| `404.html` | Branded, noindex error page |
| `.well-known/security.txt` | Security contact and disclosure policy |
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

The canonical domain is `https://proudme.org/`, configured by the existing `CNAME`. Keep canonical metadata, `sitemap.xml`, the RSS feed, and `robots.txt` synchronized.

## Contact form

The homepage contact form posts JSON to the production ProudMe backend endpoint configured in `script.js`.

## Release gates

- LSU operator, IRB, or counsel approval is required for revised age, consent, research, and deletion language.
- App Store approval for the existing listing must precede publication of the wider audience claim.
- Exact App Store Connect campaign URLs (`pt`, `ct`, and `mt`) must replace direct listing links before campaign attribution and the desktop QR code can ship. Never invent a provider token.
- Commit, push, GitHub Pages publication, App Store submission, and Search Console submission are operator-gated actions.
