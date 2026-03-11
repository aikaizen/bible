# Read the Bible Together — Growth & Marketing Plan

**Product**: Read the Bible Together (bible.promptengines.com)
**Category**: Faith-based Social Reading / Community Bible Study
**Date**: February 2026

---

## Executive Summary

Read the Bible Together is a mobile-first web app where small groups vote on weekly Bible readings, discuss passages with verse-level annotations, and track progress together. The product sits at the intersection of faith tech and social accountability — a growing but underserved niche. This plan outlines a phased approach to reach **10,000 MAU within 12 months** through organic search, community-led growth, content marketing, and strategic partnerships.

---

## Phase 1: Foundation (Months 1–2)

**Goal**: Establish search presence, fix technical SEO, build measurement infrastructure.

### 1.1 Technical SEO Audit & Fixes

- **Server-Side Rendering**: The app is a single-page client (`page.tsx`). Create static landing pages at key routes (`/`, `/about`, `/how-it-works`, `/features`) with proper SSR metadata for crawlability.
- **Meta Tags**: Implement dynamic `<title>`, `<meta description>`, and Open Graph tags per page. Target format: `Read the Bible Together — Weekly Group Bible Reading & Discussion`.
- **Structured Data (JSON-LD)**: Add `WebApplication`, `Organization`, and `SoftwareApplication` schema markup.
- **Core Web Vitals**: Audit LCP, FID, CLS. Current single-CSS-file architecture is a strength — ensure fonts load with `font-display: swap`, images are lazy-loaded, and JS bundle stays under 120KB.
- **Sitemap & Robots.txt**: Generate `sitemap.xml` with all public routes. Submit to Google Search Console and Bing Webmaster Tools.
- **Canonical URLs**: Set `<link rel="canonical">` on all pages to prevent duplicate content.
- **Mobile-First Indexing**: Verify mobile usability in Search Console. The app is already mobile-first — confirm no viewport or tap-target issues.
- **HTTPS & Performance**: Already on Vercel with automatic SSL. Confirm HSTS headers.
- **Internal Linking**: Landing pages should cross-link to features, about, and invite flow.

### 1.2 Analytics & Attribution

- **Google Analytics 4**: Install with enhanced measurement (scroll depth, outbound clicks, site search).
- **Custom Events**: Track key conversion points:
  - `sign_up` (Google OAuth completion)
  - `group_created`
  - `invite_sent` (personal + link invites)
  - `invite_accepted`
  - `first_vote_cast`
  - `first_comment_posted`
  - `passage_marked_read`
  - `7_day_retention` (custom audience)
- **Google Search Console**: Monitor impressions, CTR, average position for target keywords.
- **UTM Framework**: Standardize UTM parameters for all external links:
  - `utm_source` (google, facebook, instagram, church_partner, etc.)
  - `utm_medium` (organic, social, referral, email, paid)
  - `utm_campaign` (launch, lent_2026, easter, etc.)
- **Funnel Definition**:
  - Top: Landing page visit
  - Middle: Sign-up / OAuth
  - Bottom: Join group + cast first vote
  - Retention: 2+ weeks active

### 1.3 Keyword Research & Content Strategy

**Primary Keywords** (high intent, moderate volume):
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---------|-------------------|------------|--------|
| bible reading plan with friends | 1,300 | Low | Transactional |
| group bible study app | 2,400 | Medium | Transactional |
| bible reading accountability | 880 | Low | Informational |
| online bible study group | 3,100 | Medium | Transactional |
| weekly bible reading plan | 5,400 | Medium | Informational |
| bible discussion app | 720 | Low | Transactional |
| vote on bible reading | ~50 | Very Low | Transactional (own) |
| bible study app for small groups | 1,900 | Medium | Transactional |

**Long-Tail Targets**:
- "how to start a bible reading group online"
- "best app for church small group bible study"
- "bible reading plan for couples"
- "how to keep bible reading consistent"
- "bible study discussion questions generator"
- "track bible reading progress with friends"

**Content Pillars**:
1. **Group Bible Study Guides** — "How to Start a Virtual Bible Study Group in 2026"
2. **Reading Plans & Recommendations** — "10 Bible Passages Every Small Group Should Read Together"
3. **Faith & Accountability** — "Why Reading the Bible with Others Changes Everything"
4. **Product-Led Content** — "How Our Group Voting System Makes Bible Study Fun"

---

## Phase 2: Content & Organic Growth (Months 2–4)

**Goal**: Build domain authority, rank for long-tail keywords, establish content flywheel.

### 2.1 Blog / Content Hub

Launch a blog at `bible.promptengines.com/blog` (or subdomain `blog.bible.promptengines.com`).

**Publishing Cadence**: 2 posts per week.

**Content Types**:
- **SEO Pillar Pages** (2,000–3,000 words): Comprehensive guides targeting primary keywords. Example: "The Complete Guide to Starting a Group Bible Study Online" — internally links to 5–8 cluster posts.
- **Cluster Posts** (800–1,500 words): Supporting articles targeting long-tail keywords. Example: "5 Ways to Keep Your Bible Reading Group Engaged Week After Week."
- **Listicles**: "12 Best Bible Passages for Group Discussion" — high shareability, good for backlinks.
- **Comparison Content**: "Read the Bible Together vs. YouVersion Groups vs. Bible App for Me" — captures bottom-funnel search intent.
- **Seasonal Content**: Lent reading plans, Advent guides, Easter study series — timed for search spikes.

### 2.2 On-Page SEO

- Each blog post targets one primary keyword + 2–3 secondary keywords.
- URL structure: `/blog/how-to-start-group-bible-study`
- H1 contains primary keyword. H2s contain secondary keywords.
- Internal links to product pages and related posts (minimum 3 per article).
- Featured snippets optimization: Use FAQ sections, numbered lists, definition boxes.
- Image alt text on all images with descriptive, keyword-relevant text.

### 2.3 Link Building & Digital PR

- **Church Tech Publications**: Pitch guest posts to Church Tech Today, ChurchMag, Outreach Magazine, Christianity Today (tech section).
- **Faith-Based Podcasts**: Appear on podcasts about church technology, small group ministry, and Bible engagement. Pitch angle: "How voting on Bible readings makes group study more engaging."
- **HARO / Connectively**: Monitor queries related to Bible study, faith apps, church technology. Respond with expert quotes + backlink.
- **Resource Page Outreach**: Find church websites with "recommended tools" or "small group resources" pages. Pitch for inclusion.
- **Broken Link Building**: Find 404s on church tech resource pages, offer our content as replacement.
- **Target DA**: Aim for 10+ referring domains per month, DA 30+ sites.

### 2.4 Local SEO (Church Discovery)

- **Google Business Profile**: Create a profile for the app/company if applicable.
- **Church Directory Listings**: Submit to Church Finder, Find A Church, church aggregator sites.
- **"Near Me" Content**: "Bible Study Groups Near Me — How to Start or Join One Online"

---

## Phase 3: Community & Viral Loops (Months 3–6)

**Goal**: Activate word-of-mouth growth, build network effects, optimize invite flow.

### 3.1 Product-Led Growth (PLG) Optimization

The app already has strong viral mechanics (invites, group voting). Optimize them:

- **Invite Flow Optimization**:
  - A/B test invite message copy. Current: generic link. Target: personalized message with social proof ("Join 500+ groups reading the Bible together").
  - Add "Invite 3 friends" prompt after first vote cast (activation moment).
  - Track invite-to-join conversion rate. Target: 30%+ acceptance rate.
- **Shareable Reading Cards**: After a group finishes a passage, generate a shareable image card ("This week we read John 3 together") for Instagram Stories, WhatsApp, iMessage.
- **Weekly Digest Email**: Send a weekly email to group members summarizing activity — who voted, what was read, top discussion comments. Include "Invite a friend" CTA.
- **Public Reading Logs**: Optional public profile page showing reading history. Shareable link for social proof.

### 3.2 Referral Program

- **Mechanic**: "Invite 5 friends who join a group, earn a 'Faithful Connector' badge on your profile."
- **Social Proof**: Show "X groups are reading together this week" on landing page (live counter).
- **Group Growth Incentive**: Groups that reach 8+ members unlock a "Group Insights" dashboard (reading stats, engagement trends).

### 3.3 Community Building

- **Discord / Slack Community**: Launch a "Read the Bible Together" community for group leaders. Share tips, reading recommendations, feature requests. Target: 500 members in 3 months.
- **User-Generated Content (UGC)**: Encourage users to share their reading journey. Hashtag: `#ReadTogetherChallenge`.
- **Testimonial Collection**: After 4 weeks of activity, prompt users for a testimonial. Feature on landing page and social.
- **Ambassador Program**: Recruit 20 "Bible Champions" — active users who promote the app in their churches. Provide them with printed cards, presentation decks, and early access to features.

### 3.4 Social Media

**Platforms** (priority order):
1. **Instagram** — Visual faith content, reading cards, verse graphics. 3–5 posts/week.
2. **TikTok** — Short-form content: "How our small group picks what to read" (product demo), "Bible verses that changed my perspective" (value content). 3 videos/week.
3. **Facebook Groups** — Join and contribute to existing Christian community groups (not spam — genuine participation). Share blog content when relevant.
4. **X (Twitter)** — Faith tech commentary, product updates, engage with church tech community.
5. **YouTube** — Long-form: "How to Run a Virtual Bible Study" tutorials. Monthly.

**Content Mix**:
- 40% Value content (verse graphics, discussion prompts, reading tips)
- 30% Social proof (user testimonials, group milestones, reading stats)
- 20% Product content (feature demos, how-tos, new feature announcements)
- 10% Community (behind the scenes, team faith journey, AMAs)

---

## Phase 4: Partnerships & Distribution (Months 4–8)

**Goal**: Tap into existing distribution channels — churches, ministries, and platforms.

### 4.1 Church Partnership Program

- **Target**: Mid-size churches (200–2,000 members) with active small group ministries.
- **Pitch**: "Replace your paper sign-up sheets and WhatsApp threads with a purpose-built tool. Free for all groups."
- **Onboarding Kit**: PDF guide for small group leaders, 3-minute video walkthrough, pre-configured group templates.
- **Integration**: Offer to set up groups for the church, pre-load their small group structure.
- **Goal**: 50 church partnerships in 6 months.

### 4.2 Seminary & Campus Ministry

- **Target**: Bible colleges, seminaries, campus ministries (Cru, InterVarsity, YoungLife).
- **Use Case**: Assigned reading + group discussion — fits academic Bible study perfectly.
- **Outreach**: Email campus ministry directors. Offer free onboarding call.

### 4.3 Ministry & Nonprofit Partnerships

- **Bible Engagement Nonprofits**: Partner with organizations like Bible Project, She Reads Truth, Navigators.
- **Co-Branded Reading Plans**: Create curated reading plans with ministry partners. Cross-promote to both audiences.
- **API Integration**: If demand warrants, offer an embed or widget for church websites to show their group's current reading.

### 4.4 App Store & Directory Presence

- **PWA Optimization**: Ensure the web app is installable as a PWA with proper manifest, icons, and offline support. This enables listing in some app directories.
- **Product Hunt Launch**: Coordinate a launch day. Target: top 5 in "Faith & Spirituality" or "Social" categories.
- **AlternativeTo / G2 / Capterra**: List the app on comparison sites under "Bible Study Software" and "Church Management" categories.
- **Chrome Web Store**: If applicable, list as a Chrome app for additional discovery.

---

## Phase 5: Paid Acquisition (Months 6–10)

**Goal**: Accelerate growth with targeted paid channels once organic PMF signals are strong.

### 5.1 Prerequisites (Gate Before Spending)

Do not begin paid acquisition until:
- Organic signup-to-active conversion rate > 40%
- 7-day retention > 50%
- Invite acceptance rate > 25%
- At least 100 organic groups created
- CAC payback model is clear (even for a free product — measure against LTV via engagement)

### 5.2 Google Ads

- **Search Campaigns**: Target high-intent keywords: "bible study app for groups", "online bible reading plan with friends", "small group bible discussion tool."
- **Budget**: Start at $500/month. Target CPA of $2–5 per signup.
- **Ad Extensions**: Sitelinks to features, about, and "Start a Group" pages.
- **Negative Keywords**: Exclude "free bible download", "bible pdf", "bible audio" — low intent for our product.

### 5.3 Meta Ads (Facebook + Instagram)

- **Audience Targeting**:
  - Interest-based: Bible study, church, small groups, Christian living, faith community.
  - Lookalike audiences: Based on existing user email list (once 1,000+ users).
  - Custom audiences: Retarget landing page visitors who didn't sign up.
- **Creative Strategy**:
  - Video ads: 15-second product demo ("See how groups vote on what to read").
  - Carousel: Feature highlights (Vote, Read, Discuss, Track).
  - UGC-style: Testimonials from real users/groups.
- **Budget**: $1,000/month. Optimize for "Sign Up" conversion event.

### 5.4 YouTube Ads

- **Pre-roll ads** on faith-based content channels.
- **Target**: Viewers of Bible Project, church sermon channels, Christian living vlogs.
- **Creative**: 30-second explainer — "Your small group deserves better than a group chat."

### 5.5 Podcast Sponsorships

- **Target Podcasts**: The Bible Recap, Bible in a Year, Church Tech Podcast, Carey Nieuwhof Leadership Podcast.
- **Format**: Host-read mid-roll sponsorship. 60-second spot with custom landing page URL (`bible.promptengines.com/podcast`).
- **Budget**: $200–1,000 per episode depending on audience size.

---

## Phase 6: Retention & Expansion (Months 8–12)

**Goal**: Reduce churn, increase engagement depth, expand use cases.

### 6.1 Lifecycle Email Marketing

- **Welcome Sequence** (Days 1–7):
  - Day 0: Welcome + "Create your first group" CTA
  - Day 1: "Invite your first friend" + social proof
  - Day 3: "Cast your first vote" + feature highlight
  - Day 7: "How was your first week?" + feedback request
- **Re-engagement** (Dormant users, 14+ days inactive):
  - "Your group is reading [passage] this week — join the discussion"
  - "3 new comments in your group since you last visited"
- **Weekly Digest**: Group activity summary, reading progress, invite prompt.
- **Milestone Celebrations**: "You've read 10 passages together!" — shareable achievement card.

### 6.2 Push Notifications (PWA)

- Voting opens for the week
- Someone commented on a passage you read
- Your group selected this week's reading
- Voting closes in 24 hours (reminder)
- A friend joined your group via invite

### 6.3 Feature Expansion for Retention

Based on user signals, prioritize:
- **Reading Streaks**: Visual streak counter for consecutive weeks of participation.
- **Group Leaderboard**: Weekly engagement leaderboard (reading, commenting, voting).
- **Audio Bible Integration**: Play audio of the selected passage in-app.
- **Prayer Requests**: Add a prayer thread alongside discussion — deepens engagement.
- **Multi-Group Dashboard**: For power users in multiple groups, a unified view of all activity.

### 6.4 Expansion Plays

- **Internationalization (i18n)**: The app already supports language preferences. Prioritize Spanish, Portuguese, Korean (large Christian populations with high digital adoption).
- **Church Management System (ChMS) Integration**: Integrate with Planning Center, Church Community Builder, Breeze. Auto-sync small groups.
- **Embeddable Widget**: Let churches embed a "Join Our Bible Reading Group" widget on their website.

---

## KPIs & Targets

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Monthly Active Users (MAU) | 500 | 2,500 | 10,000 |
| Active Groups | 50 | 250 | 1,000 |
| Organic Search Sessions/mo | 2,000 | 10,000 | 40,000 |
| Domain Authority | 15 | 25 | 35 |
| Invite Acceptance Rate | 25% | 30% | 35% |
| 7-Day Retention | 45% | 55% | 60% |
| Signup-to-Active Rate | 35% | 45% | 50% |
| Avg. Group Size | 4 | 5 | 6 |
| Weekly Votes Cast | 200 | 1,500 | 8,000 |
| NPS | 40 | 50 | 60 |

---

## Budget Summary (12-Month Estimate)

| Category | Monthly | Annual |
|----------|---------|--------|
| Content Creation (blog, social) | $500 | $6,000 |
| SEO Tools (Ahrefs/Semrush, Search Console Pro) | $100 | $1,200 |
| Google Ads | $500 | $6,000 |
| Meta Ads | $1,000 | $12,000 |
| Podcast Sponsorships | $500 | $6,000 |
| Design (social graphics, ad creative) | $300 | $3,600 |
| Email Platform (Resend/Loops) | $50 | $600 |
| Community Management | $200 | $2,400 |
| **Total** | **$3,150** | **$37,800** |

Note: Budget is modular. Phases 1–3 (organic) can execute on ~$600/month. Paid acquisition in Phase 5 is the primary cost driver and should only activate after organic PMF validation.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Low organic search volume for niche keywords | Expand to broader "bible study" and "church small group" keywords; supplement with social and partnership channels |
| Slow church partnership adoption | Lead with a zero-friction, no-signup-required demo; provide white-glove onboarding for first 10 churches |
| User churn after initial novelty | Lifecycle emails, push notifications, streaks, and social accountability features to drive habit formation |
| Competition from YouVersion/Bible App | Differentiate on group voting mechanic and social accountability — features incumbents lack |
| Paid acquisition CAC too high | Gate paid spend on organic conversion benchmarks; focus on community-led and partnership growth if CAC exceeds $5 |

---

## Competitive Positioning

**Unique Value Proposition**: "The only Bible reading app where your group votes on what to read together."

| Feature | Read the Bible Together | YouVersion | Faithlife / Logos | She Reads Truth |
|---------|------------------------|------------|-------------------|-----------------|
| Group Voting on Readings | Yes | No | No | No |
| Verse-Level Discussion | Yes | Limited | Yes | No |
| Weekly Accountability | Yes | Partial | No | Partial |
| Free / No Account Wall | Yes (Google OAuth) | Yes | Freemium | Paid |
| Mobile-First Web App | Yes | Native App | Desktop-First | Native App |
| Small Group Focus | Core | Add-on | No | No |

---

## Timeline Summary

```
Month 1–2:  Technical SEO, analytics, keyword research, first 8 blog posts
Month 2–4:  Content flywheel, link building, social media launch
Month 3–6:  Invite flow optimization, referral program, community launch, church outreach begins
Month 4–8:  Church partnerships, Product Hunt launch, directory listings, campus ministry outreach
Month 6–10: Paid acquisition (Google, Meta, podcasts) — only if organic benchmarks hit
Month 8–12: Lifecycle email, push notifications, i18n, ChMS integrations, expansion features
```

---

*This is a living document. Review and update quarterly based on performance data and market shifts.*
