# ProudMe SEO Next Steps

Last updated: August 18, 2026

## Current status

- The redesigned ProudMe website is live at <https://proudme.org/>.
- The sitemap is live at <https://proudme.org/sitemap.xml>.
- `robots.txt` references the sitemap.
- The sitemap contains 16 public URLs.
- Four priority URLs have been submitted manually through URL Inspection.
- Google should discover the other 12 URLs through the sitemap and internal links.
- Google Search Console has been connected, but reporting may need several days to populate.
- Google Analytics 4 is not installed. The website currently promises that it has no analytics trackers.

## 1. Turn on the Search Console performance metrics

This can be done immediately. It is not necessary to wait for every page to be indexed.

1. Open <https://search.google.com/search-console>.
2. Select the `proudme.org` Domain property.
3. Open **Performance → Search results**.
4. Above the chart, click all four metric cards so they are selected:
   - **Total clicks**
   - **Total impressions**
   - **Average CTR**
   - **Average position**
5. Set the date range to **Last 28 days**.
6. Keep the search type set to **Web**.

Selected metric cards are colored. A white card is turned off.

Search Console normally has a two-to-three-day reporting delay. A newly connected property can take up to a week to display meaningful data.

Official documentation:

- <https://support.google.com/webmasters/answer/7576553>
- <https://support.google.com/webmasters/answer/96568>

## 2. Confirm sitemap processing

1. Open **Indexing → Sitemaps**.
2. Click the submitted `sitemap.xml` row.
3. Confirm:
   - Status is **Success**.
   - Discovered pages is **16**.
4. Do not submit every page as a separate sitemap.

Definitions:

- **Discovered:** Google knows the URL exists.
- **Crawled:** Google has visited the URL.
- **Indexed:** Google has stored the page and may show it in search results.
- **Impression:** A link to the site appeared in someone's Google results.

Submitting a sitemap helps Google discover pages but does not guarantee that every page will be indexed.

## 3. Monitor indexing

Check **Indexing → Pages** after several days.

Review:

- Indexed pages
- Crawled — currently not indexed
- Discovered — currently not indexed
- Duplicate or canonical issues
- Redirect errors
- Server errors
- Pages excluded by `noindex`

Use the sitemap filter when available so the report focuses on the 16 submitted URLs.

Do not manually request all remaining URLs immediately. If an important URL is still not indexed after approximately one week:

1. Open **URL Inspection**.
2. Paste the complete URL.
3. Click **Test Live URL**.
4. Confirm the page is available to Google.
5. Click **Request indexing**.

Priority URLs to monitor:

- <https://proudme.org/>
- <https://proudme.org/blog/>
- <https://proudme.org/blog/four-healthy-habits-for-kids.html>
- <https://proudme.org/blog/how-proudme-keeps-ai-kid-safe.html>

## 4. Review Search Console every week

Open **Performance → Search results** and use the following tabs.

### Queries

Track:

- Searches that produce the most impressions
- Searches that produce clicks
- High-impression queries with a low CTR
- Branded searches such as `ProudMe`
- Non-branded searches related to healthy habits for kids and teens

### Pages

Track:

- Blog articles receiving impressions
- Pages receiving clicks
- Pages with high impressions but low CTR
- Pages whose impressions or position are improving

### Countries and devices

Track:

- Primary visitor countries
- Mobile versus desktop impressions
- Mobile CTR compared with desktop CTR

### Recommended reporting schedule

- Review **Last 28 days** every week.
- After 28 days of data, compare the latest 28 days with the previous 28 days.
- Record significant content launches and website changes so performance shifts have context.
- Prioritize trends in impressions and clicks over small day-to-day ranking changes.

## 5. Review Core Web Vitals

Open **Experience → Core Web Vitals** and review mobile results first.

Search Console needs real-user traffic before this report can populate. It may take several weeks.

Watch for:

- Largest Contentful Paint
- Interaction to Next Paint
- Cumulative Layout Shift

## 6. Decide whether to add GA4

Google Search Console tracks organic Google Search performance. Google Analytics 4 tracks what visitors do after arriving on the website.

GA4 is currently not installed. Before installing it, address the following:

- The homepage says the website has no analytics trackers.
- The Privacy Policy says third-party analytics SDKs are not embedded.
- Automated tests currently reject Google Analytics and other tracker scripts.
- ProudMe is youth-oriented, so analytics collection and consent require additional privacy care.

Recommended approach:

- Keep Search Console active regardless of the GA4 decision.
- If GA4 is approved, use a consent banner and **basic consent mode**.
- Do not load the Google tag until the visitor affirmatively accepts analytics.
- Keep advertising storage, advertising user data, and advertising personalization disabled.
- Do not enable Google Signals or use GA4 for advertising audiences.
- Do not send names, email addresses, child account data, chat content, health information, or other personally identifiable information to GA4.
- Have the final privacy and consent language reviewed by the appropriate ProudMe/LSU owner.

Google's consent-mode documentation:

- <https://support.google.com/analytics/answer/10000067>
- <https://support.google.com/analytics/answer/14009635>

## 7. Create the GA4 property

Only complete this section after the privacy and consent approach is approved.

1. Open <https://analytics.google.com/>.
2. Sign in with the permanent ProudMe or LSU-owned Google account.
3. Open **Admin**.
4. Click **Create → Property**.
5. Configure:
   - Property name: `ProudMe Website`
   - Reporting time zone: `United States — Chicago Time`
   - Currency: `USD`
6. Complete the business details without enabling advertising features that ProudMe does not need.
7. Open **Data streams → Add stream → Web**.
8. Configure:
   - Website URL: `https://proudme.org`
   - Stream name: `ProudMe Website`
9. Create the stream.
10. Copy the Measurement ID beginning with `G-`.

Official GA4 setup instructions:

- <https://support.google.com/analytics/answer/14183469>

## 8. Provide the GA4 Measurement ID for implementation

Send the `G-XXXXXXXXXX` Measurement ID to the developer.

The website implementation should include:

- A clear analytics consent banner
- Basic consent mode
- No GA4 network request before consent
- A way to withdraw or change analytics consent
- Updated homepage FAQ language
- Updated Privacy Policy language
- Updated automated tests
- GA4 initialization on every public page only after consent
- No analytics code on private/admin pages unless separately approved

The implementation must be tested before deployment with:

- Browser network inspection
- Google Tag Assistant
- GA4 DebugView or Realtime
- Consent accepted
- Consent rejected
- Consent withdrawn
- Mobile and desktop browsers

## 9. Recommended GA4 events

Use page views and a small number of meaningful conversion events. Avoid collecting sensitive or child-specific data.

Recommended events:

- `app_store_click`
  - Fired when a visitor selects an App Store download link.
  - Safe parameters: page path and campaign label.
- `contact_submit`
  - Fired only after the public contact form succeeds.
  - Do not send the visitor's name, email address, message, or form contents.
- `blog_cta_click`
  - Fired when a visitor uses an article download CTA.
  - Safe parameters: article slug and CTA location.
- `blog_article_view`
  - Optional if standard page-view reporting is insufficient.
  - Safe parameter: article slug.

Recommended key events:

- `app_store_click`
- `contact_submit`

Do not create events from Pebble chats, app account activity, health logs, research participation, or child-level behavior.

## 10. Verify GA4 after deployment

1. Open the live website in a private browser window.
2. Reject analytics consent.
3. Confirm no GA4 request is transmitted.
4. Accept analytics consent.
5. Open **GA4 → Reports → Realtime**.
6. Confirm the visit appears.
7. Test an App Store CTA.
8. Confirm `app_store_click` appears.
9. Submit a test contact form only if an approved test message is appropriate.
10. Confirm `contact_submit` contains no form values or personal information.

GA4 may take up to approximately 30 minutes to begin displaying basic data, although Realtime is usually faster.

## 11. Link GA4 to Search Console

After both services are collecting data:

1. Open **GA4 → Admin**.
2. Under **Product links**, choose **Search Console Links**.
3. Click **Link**.
4. Select the verified `proudme.org` Search Console property.
5. Select the `ProudMe Website` web data stream.
6. Review and submit the link.

Required permissions:

- Verified owner of the Search Console property
- Editor or Administrator access to the GA4 property

Search Console data can take approximately 48 hours to appear in GA4.

The Search Console reports may be unpublished by default. In GA4:

1. Open **Reports → Library**.
2. Find the Search Console collection.
3. Publish it.

Official linking instructions:

- <https://support.google.com/analytics/answer/10737381>

## 12. Monthly SEO review

Once at least 28 days of data exists, create a monthly review containing:

- Total organic clicks
- Total impressions
- Average CTR
- Average position
- Indexed pages out of 16 submitted pages
- Top 10 queries
- Top 10 landing pages
- High-impression, low-CTR opportunities
- Pages losing impressions or clicks
- Core Web Vitals status
- App Store clicks from organic landing pages, if GA4 is approved
- Contact conversions from organic landing pages, if GA4 is approved

Use the data to decide which titles, descriptions, internal links, and articles should be improved next.
