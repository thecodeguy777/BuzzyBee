// ─────────────────────────────────────────────────────────────────
// Who We Serve — content registry
//
// Three taxonomies, all flat records keyed by slug:
//
//   industries — verticals BuzzyBee actively sells to
//   bundles    — role packages, often spanning multiple verticals
//                (Realtor VA is a bundle, not an industry)
//   services   — horizontal capability pillars (the "what we do" axis)
//
// The mega-menu renders all three columns. Industry / bundle / service
// pages all share a single template that reads their record from here.
//
// To add a new vertical / bundle / service: add an entry below.
// To deepen copy on an existing page: extend its record.
// No code changes required.
// ─────────────────────────────────────────────────────────────────

export interface MenuEntry {
  slug: string
  name: string
  blurb?: string         // 1-line description shown in the mega-menu
  emphasized?: boolean   // bold + tagline in the menu
}

export interface IndustryRecord extends MenuEntry {
  hero: {
    eyebrow: string      // small label above headline ("INDUSTRY · REAL ESTATE")
    headline: string
    sub: string
    primaryCta: { label: string; href: string }
    secondaryCta?: { label: string; href: string }
  }
  pains: { title: string; detail: string }[]
  outcomes: string[]                          // signature outcomes
  topBundles: string[]                        // bundle slugs surfaced on this page
  topServices: string[]                       // service slugs surfaced on this page
  faq: { q: string; a: string }[]
}

export interface BundleRecord extends MenuEntry {
  industries: string[]                        // industry slugs that hire this bundle
  includes: string[]                          // specific tasks the bundle does
  pricing?: { from: number; currency: 'USD' }
}

export interface ServiceRecord extends MenuEntry {
  includes: string[]                          // specific tasks under this service
}

// ─────────────────────────────────────────────────────────────────
// INDUSTRIES (8)
// ─────────────────────────────────────────────────────────────────
export const INDUSTRIES: IndustryRecord[] = [
  {
    slug: 'real-estate',
    name: 'Real Estate & Property',
    blurb: 'Agents, brokerages, property managers',
    emphasized: true,
    hero: {
      eyebrow: 'INDUSTRY · REAL ESTATE',
      headline: 'Stop losing leads to admin work.',
      sub: 'BuzzyBee VAs handle MLS upkeep, FSBO outreach, lead qualification, and CRM hygiene — so you stay in front of clients, not your inbox.',
      primaryCta: { label: 'Hire a Realtor VA', href: '/bundles/realtor-va' },
      secondaryCta: { label: 'Book a 20-min call', href: '#contact' }
    },
    pains: [
      { title: 'Cold leads get cold faster', detail: 'A 5-minute response time wins 80% of leads. Your team can\'t hit that and show houses.' },
      { title: 'MLS data drifts', detail: 'Listings need photo updates, price corrections, status flips — every week, every property.' },
      { title: 'FSBO/expired outreach is a full-time job', detail: 'The agents who close FSBOs are the ones doing the boring outbound nobody else will.' }
    ],
    outcomes: [
      'Sub-5-minute lead response, 7 days a week',
      'MLS listings audited weekly — photos, price, status, copy',
      '50–100 FSBO/expired contacts per week with notes back to you',
      'Pipeline updated daily — every deal, every stage'
    ],
    topBundles: ['realtor-va', 'listings-leadgen-va', 'inbox-calendar-ea'],
    topServices: ['crm-management', 'administrative', 'marketing-social'],
    faq: [
      { q: 'Do your VAs know MLS systems?', a: 'Yes. We train on Matrix, Flexmls, Paragon, and most major MLS platforms during onboarding. If your MLS is regional, we shadow your existing process for the first week.' },
      { q: 'Can they make calls on my behalf?', a: 'Yes — outbound prospecting, FSBO follow-ups, and warm-lead nurture calls. We do not handle inbound seller calls or contract negotiations; those stay with the licensed agent.' },
      { q: 'How fast can we start?', a: '10–14 business days from signed agreement to your VA being live with you. We pre-screen and shortlist Realtor-track VAs, you interview the top 2–3, then onboarding.' }
    ]
  },

  {
    slug: 'ecommerce',
    name: 'E-commerce & DTC',
    blurb: 'Shopify operators, DTC brands',
    emphasized: true,
    hero: {
      eyebrow: 'INDUSTRY · E-COMMERCE',
      headline: 'Your store ships faster than your team can keep up.',
      sub: 'Product listings, inventory sync, customer email, returns, theme tweaks — handled by VAs who live inside Shopify.',
      primaryCta: { label: 'Hire a Shopify Operator', href: '/bundles/shopify-operator-va' }
    },
    pains: [
      { title: 'New SKUs sit in drafts for weeks', detail: 'Photos exist. Copy exists. Nobody has the hour to merge them into a live product.' },
      { title: 'Customer email backlog', detail: 'Refund and "where\'s my order" emails compound; response time creeps from 4 hours to 4 days.' },
      { title: 'Promo launches eat your week', detail: 'Theme edits, banner swaps, email blast, social schedule — five tools, five hours, every campaign.' }
    ],
    outcomes: [
      'Daily product listings with optimized copy + alt-text',
      'Customer email response time under 4 hours',
      'Promo launches handled end-to-end (theme, email, socials)',
      'Inventory and order data clean across Shopify, accounting, and 3PL'
    ],
    topBundles: ['shopify-operator-va', 'content-producer-va', 'funnel-automation-va'],
    topServices: ['marketing-social', 'customer-tech-support', 'web-app-ops'],
    faq: [
      { q: 'Which platforms do you support?', a: 'Shopify (deepest expertise), WooCommerce, BigCommerce, Magento. Plus the usual app stack: Klaviyo, Gorgias, Loop, Recharge, Stamped.' },
      { q: 'Can they handle inventory and 3PL coordination?', a: 'Yes — receive 3PL reports, reconcile against Shopify, flag mismatches, update reorder points. Not a replacement for an ops manager but a strong right-hand.' }
    ]
  },

  {
    slug: 'marketing-agencies',
    name: 'Marketing & Creative Agencies',
    blurb: 'White-label production for agencies',
    emphasized: true,
    hero: {
      eyebrow: 'INDUSTRY · AGENCIES',
      headline: 'Your margin is in the production team.',
      sub: 'White-label VAs that scale your delivery without scaling your payroll. Social posts, ad ops, reporting, content production — billed at agency rates.',
      primaryCta: { label: 'Hire a production VA', href: '/services/marketing-social' }
    },
    pains: [
      { title: 'You over-deliver and under-charge', detail: 'Senior strategists doing junior work. Margin disappears in execution.' },
      { title: 'Hiring locally is too slow and too expensive', detail: 'Account growth needs production capacity tomorrow, not after a 12-week hire.' },
      { title: 'Reporting steals client-strategy time', detail: 'Monthly decks pile up; the strategist becomes a deck-maker.' }
    ],
    outcomes: [
      'Production-grade VAs at 25–35% of local cost',
      'Same-day turnaround on social, ad ops, and reporting',
      'White-label — your client sees your team',
      'Strategist time spent on strategy, not screenshots'
    ],
    topBundles: ['content-producer-va', 'funnel-automation-va', 'bid-proposal-va'],
    topServices: ['marketing-social', 'crm-management', 'web-app-ops'],
    faq: [
      { q: 'Can they work white-label under our brand?', a: 'Yes. We sign your NDA, our VAs use your email and your tools, and they appear on internal Slack as your teammates. Clients never see BuzzyBee.' }
    ]
  },

  {
    slug: 'coaches-consultants',
    name: 'Coaches, Consultants & Solopreneurs',
    blurb: 'One-person businesses that need leverage',
    hero: {
      eyebrow: 'INDUSTRY · COACHES & CONSULTANTS',
      headline: 'You are the product. Stop being the operator.',
      sub: 'Funnel maintenance, course delivery, content repurposing, calendar — handled, so you can stay in your zone of genius.',
      primaryCta: { label: 'Hire an Executive VA', href: '/bundles/inbox-calendar-ea' }
    },
    pains: [
      { title: 'Content batches keep slipping', detail: 'You record 6 podcast episodes; only 2 get repurposed. The rest die in Drive.' },
      { title: 'Your funnel breaks and you don\'t notice for a week', detail: 'A typo in Kajabi, a broken Stripe link, a missing email — silent revenue leaks.' },
      { title: 'Calendar Tetris', detail: 'Discovery calls, podcast guesting, client sessions, family — and you\'re the one moving the squares.' }
    ],
    outcomes: [
      '1 podcast episode → newsletter + 4 short-form posts + show notes — every time',
      'Funnel health monitored daily, broken links flagged within hours',
      'Calendar buffered, batched, and protected — no double-bookings'
    ],
    topBundles: ['content-producer-va', 'funnel-automation-va', 'inbox-calendar-ea'],
    topServices: ['marketing-social', 'administrative', 'web-app-ops'],
    faq: []
  },

  {
    slug: 'professional-services',
    name: 'Professional Services',
    blurb: 'Legal, accounting, financial services',
    hero: {
      eyebrow: 'INDUSTRY · PROFESSIONAL SERVICES',
      headline: 'Bill more hours. Not from your VAs — from you.',
      sub: 'Document prep, intake forms, client onboarding, billing follow-ups, calendar — the supporting cast that keeps your billable hours billable.',
      primaryCta: { label: 'Hire a Compliance VA', href: '/bundles/compliance-ops-va' }
    },
    pains: [
      { title: 'Intake takes hours per client', detail: 'Forms, IDs, conflict checks, engagement letters — repetitive, mandatory, time-eating.' },
      { title: 'AR follow-ups never happen', detail: 'You hate chasing invoices, so you don\'t. 90-day receivables pile up.' },
      { title: 'Compliance docs go stale', detail: 'Licenses, NDAs, retention schedules, audit prep — none of it billable, all of it required.' }
    ],
    outcomes: [
      'Client intake done end-to-end inside 48 hours',
      'AR aged < 60 days, flagged invoices chased weekly',
      'Compliance calendar maintained — nothing expires unnoticed'
    ],
    topBundles: ['compliance-ops-va', 'bid-proposal-va', 'inbox-calendar-ea'],
    topServices: ['administrative', 'finance-bookkeeping', 'crm-management'],
    faq: []
  },

  {
    slug: 'construction-trades',
    name: 'Construction & Trades',
    blurb: 'Builders, contractors, trades businesses',
    hero: {
      eyebrow: 'INDUSTRY · CONSTRUCTION',
      headline: 'Bid more. Chase less. Close more.',
      sub: 'Proposal prep, bid follow-ups, lead qualification, project doc management — the office work that decides whether you actually grow.',
      primaryCta: { label: 'Hire a Bid & Proposal VA', href: '/bundles/bid-proposal-va' }
    },
    pains: [
      { title: 'Bid follow-ups slip', detail: 'You send a proposal; nobody chases it. 30%+ of bids die not from "no" but from "I forgot."' },
      { title: 'Lead intake is a phone game', detail: 'Inbound calls during job hours. Half go to voicemail. Half of those don\'t get returned.' },
      { title: 'Project docs scattered', detail: 'Permits, plans, change orders, photos — across email, Drive, WhatsApp, and the truck.' }
    ],
    outcomes: [
      'Every bid followed up at day 3 / day 7 / day 14',
      'Inbound leads triaged within 2 hours, qualified, scheduled',
      'Project docs centralized per job — searchable, dated, complete'
    ],
    topBundles: ['bid-proposal-va', 'listings-leadgen-va', 'inbox-calendar-ea'],
    topServices: ['administrative', 'crm-management', 'finance-bookkeeping'],
    faq: []
  },

  {
    slug: 'wellness-beauty',
    name: 'Health, Wellness & Beauty',
    blurb: 'DTC brands, clinics, studios',
    hero: {
      eyebrow: 'INDUSTRY · WELLNESS & BEAUTY',
      headline: 'Bookings full. Inbox calm. Brand on schedule.',
      sub: 'Whether you sell skincare or sessions, BuzzyBee handles bookings, customer comms, content production, and the daily DTC machinery.',
      primaryCta: { label: 'Hire a Booking VA', href: '/bundles/booking-scheduling-va' }
    },
    pains: [
      { title: 'Booking software is its own job', detail: 'Acuity, Mindbody, Vagaro, Booksy — confirmations, reschedules, no-show follow-ups.' },
      { title: 'Customer DMs go unanswered', detail: 'Instagram DMs and Shopify chat compete for attention; sales leak through both.' },
      { title: 'Content treadmill', detail: 'Daily content expectations, weekly batch reality.' }
    ],
    outcomes: [
      'All bookings confirmed within 30 minutes — and reschedules absorbed cleanly',
      'DMs and chat triaged daily — order leaks closed',
      'Content scheduled 2 weeks ahead, every week'
    ],
    topBundles: ['booking-scheduling-va', 'shopify-operator-va', 'content-producer-va'],
    topServices: ['customer-tech-support', 'marketing-social', 'administrative'],
    faq: []
  },

  {
    slug: 'hospitality-tourism',
    name: 'Hospitality & Tourism',
    blurb: 'Tour operators, boutique hotels, experiences',
    hero: {
      eyebrow: 'INDUSTRY · HOSPITALITY',
      headline: 'Your guests don\'t care that you\'re short-staffed.',
      sub: 'Booking platforms, guest comms, reviews, itinerary builds, OTA listing upkeep — the work that turns a booking into a 5-star review.',
      primaryCta: { label: 'Hire a Booking VA', href: '/bundles/booking-scheduling-va' }
    },
    pains: [
      { title: 'OTA listings drift across Booking, Airbnb, Expedia', detail: 'Photos, prices, availability — three platforms, three out-of-sync truths.' },
      { title: 'Pre-arrival comms eat hours per booking', detail: 'Confirmations, directions, upsells, custom requests — repeatable but unrelenting.' },
      { title: 'Reviews go unanswered', detail: 'A reply within 48 hours moves the rating. Most operators miss the window.' }
    ],
    outcomes: [
      'OTA channel manager maintained daily — calendar, photos, prices',
      'Pre-arrival sequence delivered for every booking, automatically',
      'Reviews replied to within 24 hours, every platform'
    ],
    topBundles: ['booking-scheduling-va', 'content-producer-va', 'inbox-calendar-ea'],
    topServices: ['customer-tech-support', 'administrative', 'marketing-social'],
    faq: []
  }
]

// ─────────────────────────────────────────────────────────────────
// BUNDLES (9) — role packages, often Venn-intersections
// ─────────────────────────────────────────────────────────────────
export const BUNDLES: BundleRecord[] = [
  {
    slug: 'realtor-va',
    name: 'Realtor VA',
    blurb: 'Cold calling, MLS, FSBO outreach, skip tracing',
    emphasized: true,
    industries: ['real-estate'],
    includes: [
      'Cold calling and outbound prospecting',
      'FSBO and expired listing outreach',
      'Lead qualification and vetting',
      'Skip tracing for contact information',
      'MLS data entry and updates',
      'Drafting property and marketing copy',
      'Organizing home evaluation requests',
      'LinkedIn outreach and networking'
    ],
    pricing: { from: 1500, currency: 'USD' }
  },
  {
    slug: 'listings-leadgen-va',
    name: 'Listings & Lead-Gen VA',
    blurb: 'Listing portals, lead intake, photo curation',
    industries: ['real-estate', 'construction-trades', 'hospitality-tourism'],
    includes: [
      'Listing creation and refresh across portals',
      'Photo curation and basic editing',
      'Lead intake and qualification',
      'Outbound prospecting (LinkedIn, email, targeted lists)',
      'CRM updates and pipeline hygiene'
    ]
  },
  {
    slug: 'shopify-operator-va',
    name: 'Shopify Operator VA',
    blurb: 'DTC product mgmt, theme tweaks, customer reviews',
    emphasized: true,
    industries: ['ecommerce', 'wellness-beauty'],
    includes: [
      'Product import/export and SKU management',
      'Theme tweaks and content edits',
      'Inventory sync (Shopify ↔ accounting ↔ 3PL)',
      'App configuration (Klaviyo, Gorgias, Loop, Recharge)',
      'Customer review handling and reputation management',
      'Promo launch execution (theme + email + socials)'
    ]
  },
  {
    slug: 'booking-scheduling-va',
    name: 'Booking & Scheduling VA',
    blurb: 'Calendar coordination, reservation comms',
    industries: ['hospitality-tourism', 'wellness-beauty', 'coaches-consultants'],
    includes: [
      'Booking platform management (Calendly, Acuity, Mindbody, Booking.com)',
      'OTA channel management for hospitality',
      'Reservation confirmations and reschedules',
      'Pre-arrival / pre-session comms',
      'No-show follow-ups',
      'Calendar buffering and conflict resolution'
    ]
  },
  {
    slug: 'bid-proposal-va',
    name: 'Bid & Proposal VA',
    blurb: 'RFP responses, proposal docs, contract chasing',
    industries: ['construction-trades', 'professional-services', 'marketing-agencies'],
    includes: [
      'RFP response assembly',
      'Proposal document drafting and formatting',
      'Bid follow-ups (day 3, day 7, day 14 cadence)',
      'Contract send and signature tracking',
      'Win/loss logging in CRM'
    ]
  },
  {
    slug: 'content-producer-va',
    name: 'Content Producer VA',
    blurb: 'Repurposing, newsletters, course materials',
    industries: ['coaches-consultants', 'marketing-agencies', 'wellness-beauty'],
    includes: [
      'Long-form to short-form repurposing (podcast → reels, video → carousels)',
      'Newsletter assembly and scheduling',
      'Show notes and episode descriptions',
      'Course material formatting (Kajabi, Teachable, Thinkific)',
      'Asset organization in Drive / Notion'
    ]
  },
  {
    slug: 'funnel-automation-va',
    name: 'Funnel & Automation VA',
    blurb: 'ClickFunnels / GHL / Zapier specialist',
    industries: ['coaches-consultants', 'marketing-agencies', 'ecommerce'],
    includes: [
      'Funnel build and maintenance (ClickFunnels, GoHighLevel, Kajabi, Kartra)',
      'Email automation (Klaviyo, ActiveCampaign, ConvertKit)',
      'No-code workflow assembly (Zapier, Make, n8n)',
      'Funnel health monitoring and break detection',
      'A/B test setup and reporting'
    ]
  },
  {
    slug: 'compliance-ops-va',
    name: 'Compliance & Ops VA',
    blurb: 'NDAs, contracts, license tracking, audit prep',
    industries: ['professional-services', 'construction-trades'],
    includes: [
      'Contract send, track, and file (DocuSign, PandaDoc, Adobe Sign)',
      'NDA and engagement letter management',
      'License renewal tracking and alerts',
      'Document retention and audit prep',
      'Insurance and compliance calendars'
    ]
  },
  {
    slug: 'inbox-calendar-ea',
    name: 'Executive Inbox & Calendar VA',
    blurb: 'The classic EA — inbox triage, calendar Tetris',
    emphasized: true,
    industries: [
      'real-estate', 'ecommerce', 'marketing-agencies', 'coaches-consultants',
      'professional-services', 'construction-trades', 'wellness-beauty', 'hospitality-tourism'
    ],
    includes: [
      'Email triage and inbox-zero workflows',
      'Calendar coordination and conflict resolution',
      'Travel booking and itinerary management',
      'Personal appointment setting',
      'Meeting prep packs and post-meeting follow-ups'
    ]
  }
]

// ─────────────────────────────────────────────────────────────────
// SERVICES (8) — horizontal capability pillars
// Pulled from §07 of the feasibility study, with Web/App expanded.
// ─────────────────────────────────────────────────────────────────
export const SERVICES: ServiceRecord[] = [
  {
    slug: 'marketing-social',
    name: 'Marketing & Social Media',
    blurb: 'Posts, ads, SEO, lead gen',
    emphasized: true,
    includes: [
      'Social media post scheduling and publishing',
      'Video editing for short-form and long-form content',
      'Graphic design (posts, ads, email assets, light brand work)',
      'Keyword research and on-page SEO',
      'Ad campaign monitoring and reporting (Meta, Google, TikTok)',
      'Lead generation and prospecting (LinkedIn, email, outbound)'
    ]
  },
  {
    slug: 'administrative',
    name: 'Administrative Support',
    blurb: 'Inbox, data entry, docs, research',
    includes: [
      'Email management and inbox filtering',
      'Data entry across CRMs, spreadsheets, and custom tools',
      'File organization and folder hygiene (Drive, OneDrive, Dropbox)',
      'PDF conversion and document merging',
      'Transcription of audio or video',
      'Meeting minutes and documentation',
      'Online research and data mining',
      'Form creation and management (Google Forms, Typeform, JotForm)'
    ]
  },
  {
    slug: 'crm-management',
    name: 'CRM Management',
    blurb: 'Pipeline hygiene, dashboards, automations',
    includes: [
      'Contact and lead database hygiene',
      'Pipeline stage updates and deal tracking',
      'CRM reporting, dashboards, and automations',
      'Platform expertise: HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel'
    ]
  },
  {
    slug: 'customer-tech-support',
    name: 'Customer & Tech Support',
    blurb: 'Live chat, email, tickets, order processing',
    includes: [
      'Live chat support',
      'Email support',
      'Ticket management (Zendesk, Freshdesk, Gorgias, Help Scout)',
      'Order processing and fulfillment',
      'Returns and refund coordination'
    ]
  },
  {
    slug: 'finance-bookkeeping',
    name: 'Finance & Bookkeeping',
    blurb: 'Invoicing, AR, expenses, books',
    includes: [
      'Invoice and billing',
      'Expense tracking and categorization',
      'Bookkeeping (QuickBooks, Xero)',
      'Payment follow-ups and AR aging',
      'Payroll coordination'
    ]
  },
  {
    slug: 'hr-recruiting',
    name: 'HR & Recruiting',
    blurb: 'Job posting, screening, onboarding',
    includes: [
      'Job posting across platforms',
      'Resume screening and shortlisting',
      'Interview scheduling and coordination',
      'Onboarding documentation',
      'HRIS upkeep (BambooHR, Gusto, Rippling)'
    ]
  },
  {
    slug: 'web-app-ops',
    name: 'Web & App Operations',
    blurb: 'CMS, Shopify, funnels, automation',
    emphasized: true,
    includes: [
      'CMS upkeep — WordPress, Webflow, Squarespace, Wix (updates, plugins, security)',
      'Shopify operations — products, themes, apps, inventory sync',
      'Funnel builds — ClickFunnels, GoHighLevel, Kajabi, Kartra',
      'Landing page production — copy → Figma → live (Webflow, Framer, WP)',
      'Database and data — Airtable, Notion DBs, Google Sheets automation',
      'UI design — wireframes, mockups, design-system upkeep in Figma',
      'Frontend tweaks — HTML/CSS/Tailwind edits, component fixes',
      'Integrations & automation — Zapier, Make, n8n flows',
      'QA & testing — broken-link sweeps, mobile checks, form testing'
    ]
  },
  {
    slug: 'travel-lifestyle',
    name: 'Travel & Lifestyle',
    blurb: 'Flights, itineraries, personal logistics',
    includes: [
      'Flight and hotel booking',
      'Itinerary planning',
      'Restaurant reservations',
      'Personal appointment setting',
      'Event and venue sourcing'
    ]
  }
]

// ─────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────
export function findIndustry(slug: string): IndustryRecord | undefined {
  return INDUSTRIES.find((x) => x.slug === slug)
}
export function findBundle(slug: string): BundleRecord | undefined {
  return BUNDLES.find((x) => x.slug === slug)
}
export function findService(slug: string): ServiceRecord | undefined {
  return SERVICES.find((x) => x.slug === slug)
}
