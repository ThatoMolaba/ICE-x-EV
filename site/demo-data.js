/* ============================================================================
   demo-data.js — sample content for The Garage.
   ----------------------------------------------------------------------------
   Used ONLY when Supabase is configured but unreachable (project paused,
   deleted, or offline). Lets the community UI be designed and reviewed without
   a live backend. Everything here is local and read-only — nothing is written.

   Load after supabase.js:
     <script src="supabase.js"></script>
     <script src="demo-data.js"></script>   → window.GARAGE_DEMO

   Images are inline SVG data URIs so the feed renders with no network at all.
   ============================================================================ */
(function () {
  function ago(mins) {
    return new Date(Date.now() - mins * 60000).toISOString();
  }

  // Abstract gradient panel with a stylised car silhouette — a placeholder that
  // reads as a photo slot without pretending to be a real photograph.
  //
  // The grid crops these with object-fit:cover at several aspect ratios (16/10
  // for a lone photo, 4/3 in a pair, taller still for the lead slot of a trio),
  // so the caption is centred rather than bottom-left: the centre survives both
  // a vertical and a horizontal crop, a corner survives neither.
  function panel(c1, c2, tag) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">' +
        '<defs>' +
          '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + c1 + '"/>' +
            '<stop offset="1" stop-color="' + c2 + '"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<g fill="rgba(255,255,255,.14)">' +
          '<path d="M170 380c0-26 22-40 44-46l58-62c14-15 34-24 55-24h146c21 0 41 9 55 24l58 62c22 6 44 20 44 46v44c0 9-7 16-16 16H186c-9 0-16-7-16-16z"/>' +
          '<circle cx="272" cy="432" r="46"/><circle cx="528" cy="432" r="46"/>' +
        '</g>' +
        '<g fill="rgba(0,0,0,.3)">' +
          '<circle cx="272" cy="432" r="22"/><circle cx="528" cy="432" r="22"/>' +
        '</g>' +
        '<text x="400" y="527" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" ' +
          'font-size="26" fill="rgba(255,255,255,.66)">' + tag + '</text>' +
      '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  var P = {
    thabo:  { id: 'demo-u1', handle: 'thabo_m',    display_name: 'Thabo Mokoena',  avatar_url: null, is_verified_owner: true  },
    naledi: { id: 'demo-u2', handle: 'naledi.dr',  display_name: 'Naledi Dreyer',  avatar_url: null, is_verified_owner: true  },
    sipho:  { id: 'demo-u3', handle: 'siphov',     display_name: 'Sipho Vilakazi', avatar_url: null, is_verified_owner: false },
    lerato: { id: 'demo-u4', handle: 'lerato_k',   display_name: 'Lerato Khumalo', avatar_url: null, is_verified_owner: false },
    devon:  { id: 'demo-u5', handle: 'devon.pkt',  display_name: 'Devon Pieterse', avatar_url: null, is_verified_owner: true  }
  };

  var posts = [
    {
      id: 'demo-p1',
      body: 'Six months in the BYD Dolphin. Charging at home off-peak works out to about R0.42/km — the Polo it replaced was sitting at R1.85/km on 95 unleaded.\n\nStill the single best money decision I have made.',
      photos: [panel('#1e3a8a', '#0b1220', 'Home charge · overnight')],
      comparison_id: null,
      like_count: 128,
      comment_count: 3,
      created_at: ago(24),
      author: P.thabo,
      comparison: null
    },
    {
      id: 'demo-p2',
      body: 'Joburg → Durban in the Ora 03. Two stops, 38 minutes of charging total, R214 for the whole run. Did the same trip in the Corolla last year for just under R900 in petrol.\n\nThe N3 charger coverage is genuinely fine now.',
      photos: [
        panel('#0f766e', '#082f2c', 'Harrismith stop · 22 min'),
        panel('#334155', '#0b1220', 'Mooi River · 16 min')
      ],
      comparison_id: null,
      like_count: 341,
      comment_count: 2,
      created_at: ago(97),
      author: P.naledi,
      comparison: null
    },
    {
      id: 'demo-p3',
      body: 'Ran our Hilux against a Ford Ranger PHEV on the calculator before committing. Eight year window, 30k km a year, load-shedding factored in. Numbers were closer than I expected but the PHEV still took it.',
      photos: [],
      comparison_id: 'demo-c1',
      like_count: 76,
      comment_count: 1,
      created_at: ago(260),
      author: P.devon,
      comparison: {
        id: 'demo-c1',
        title: 'Hilux 2.8 GD-6 vs Ranger PHEV',
        result: { winner: 'Ranger PHEV' }
      }
    },
    {
      id: 'demo-p4',
      body: 'Honest question for the verified owners here — what does a set of tyres actually cost you? Everyone warns me EVs chew rubber because of the weight and the torque. Is that real or is it a forum myth?',
      photos: [],
      comparison_id: null,
      like_count: 44,
      comment_count: 2,
      created_at: ago(430),
      author: P.lerato,
      comparison: null
    },
    {
      id: 'demo-p5',
      body: 'Picked her up on Saturday. GWM Ora 07, Cape Town plates, first EV in the family. Took the long way home along Chapman\'s Peak just because I could do it in silence.',
      photos: [
        panel('#7c3aed', '#1e1b4b', 'Chapman’s Peak'),
        panel('#0369a1', '#0b1220', 'Delivery day'),
        panel('#b45309', '#1c1917', 'First charge')
      ],
      comparison_id: null,
      like_count: 512,
      comment_count: 2,
      created_at: ago(1180),
      author: P.sipho,
      comparison: null
    }
  ];

  var comments = {
    'demo-p1': [
      { id: 'demo-c1a', body: 'This matches mine almost exactly. R0.40/km on the Atto 3 with a Tshwane tariff.', created_at: ago(19), author: P.naledi },
      { id: 'demo-c1b', body: 'What does your municipality charge off-peak? Ours is brutal after 18:00.', created_at: ago(14), author: P.lerato },
      { id: 'demo-c1c', body: 'Eskom direct, so 0.29 off-peak. That is most of the gap right there.', created_at: ago(11), author: P.thabo }
    ],
    'demo-p2': [
      { id: 'demo-c2a', body: 'Which network did you use for the Harrismith stop?', created_at: ago(76), author: P.sipho },
      { id: 'demo-c2b', body: 'GridCars at the Engen. Both stalls were free on a Sunday morning.', created_at: ago(64), author: P.naledi }
    ],
    'demo-p3': [
      { id: 'demo-c3a', body: 'The resale assumption is what moves this one. Try it again at six years.', created_at: ago(240), author: P.thabo }
    ],
    'demo-p4': [
      { id: 'demo-c4a', body: 'Real, but overstated. I got 52 000 km out of the fronts. Rotate them early.', created_at: ago(390), author: P.devon },
      { id: 'demo-c4b', body: 'Same. Drive it like a normal person and it is a non-issue.', created_at: ago(370), author: P.thabo }
    ],
    'demo-p5': [
      { id: 'demo-c5a', body: 'Congratulations! That road in an EV is a different experience entirely.', created_at: ago(1100), author: P.naledi },
      { id: 'demo-c5b', body: 'Welcome to the club 🔌', created_at: ago(1020), author: P.lerato }
    ]
  };

  // ---- dealerships -------------------------------------------------------
  // Trading names here are invented. Fabricated reviews are attached to these
  // records, so they must not name a real dealership — mirrors the live shape
  // (dealers + dealer_scores + dealer_ratings + salespeople) and nothing more.
  var dealers = [
    { id: 'demo-d1', name: 'Highveld Electric Motors', brand: 'BYD',   area: 'Midrand, Gauteng',
      scores: { rating_count: 24, avg_service: 4.8, avg_price: 4.3, avg_honesty: 4.9, avg_overall: 4.7 } },
    { id: 'demo-d2', name: 'Coastline EV Centre',      brand: 'GWM',   area: 'Umhlanga, KZN',
      scores: { rating_count: 17, avg_service: 4.5, avg_price: 4.4, avg_honesty: 4.5, avg_overall: 4.5 } },
    { id: 'demo-d3', name: 'Table Bay Auto Collective', brand: 'Volvo', area: 'Century City, Cape Town',
      scores: { rating_count: 31, avg_service: 4.4, avg_price: 3.8, avg_honesty: 4.6, avg_overall: 4.3 } },
    { id: 'demo-d4', name: 'Silverstone Motors',       brand: 'Multi-brand', area: 'Centurion, Gauteng',
      scores: { rating_count: 12, avg_service: 3.6, avg_price: 4.2, avg_honesty: 3.4, avg_overall: 3.7 } },
    { id: 'demo-d5', name: 'Kalahari Wheels',          brand: 'Chery', area: 'Bloemfontein, Free State',
      scores: { rating_count: 6,  avg_service: 3.2, avg_price: 3.8, avg_honesty: 2.9, avg_overall: 3.3 } },
    { id: 'demo-d6', name: 'Garden Route Auto',        brand: 'Kia',   area: 'George, Western Cape',
      scores: { rating_count: 0,  avg_service: null, avg_price: null, avg_honesty: null, avg_overall: null } }
  ];

  var dealerRatings = {
    'demo-d1': [
      { id: 'demo-r1', service: 5, price: 4, honesty: 5, created_at: ago(2600), author: P.thabo,
        review: 'Quoted me a delivery date and hit it to the day. Handover was 90 minutes and they had the wallbox installer booked before I left.' },
      { id: 'demo-r2', service: 5, price: 5, honesty: 5, created_at: ago(5200), author: P.naledi,
        review: 'No pressure on the extras at all. They talked me out of a service plan I did not need, which cost them money.' },
      { id: 'demo-r3', service: 4, price: 4, honesty: 5, created_at: ago(9100), author: P.lerato,
        review: 'Straight answers on real-world range instead of the brochure figure. Took a while to get through on the phone.' }
    ],
    'demo-d2': [
      { id: 'demo-r4', service: 5, price: 4, honesty: 4, created_at: ago(3400), author: P.sipho,
        review: 'Let me take the car overnight before deciding. That alone made the difference.' },
      { id: 'demo-r5', service: 4, price: 5, honesty: 5, created_at: ago(7700), author: P.devon,
        review: 'Beat two other quotes without me asking. Trade-in valuation was fair and they showed me the book.' }
    ],
    'demo-d3': [
      { id: 'demo-r6', service: 5, price: 3, honesty: 5, created_at: ago(1900), author: P.naledi,
        review: 'Premium pricing and they do not really move on it, but everything they told me turned out to be true.' },
      { id: 'demo-r7', service: 4, price: 4, honesty: 4, created_at: ago(6400), author: P.thabo,
        review: 'Service department is excellent. Sales floor was a bit slow on a Saturday.' }
    ],
    'demo-d4': [
      { id: 'demo-r8', service: 3, price: 4, honesty: 3, created_at: ago(4100), author: P.lerato,
        review: 'Advertised price did not include on-the-road costs and that only came up at signature. Car itself has been fine.' },
      { id: 'demo-r9', service: 4, price: 4, honesty: 4, created_at: ago(8800), author: P.sipho,
        review: 'Decent enough. Ask for everything in writing up front and you will have no problems.' }
    ],
    'demo-d5': [
      { id: 'demo-r10', service: 3, price: 4, honesty: 3, created_at: ago(10200), author: P.devon,
        review: 'Took three calls to get a firm delivery date. Price was competitive once we got there.' }
    ],
    'demo-d6': []
  };

  var salespeople = {
    'demo-d1': [
      { id: 'demo-s1', name: 'Refilwe Motaung', noms: [
        { reason: 'Answered questions on a Sunday and never once pushed the finance product.', author: P.thabo },
        { reason: 'Knew the actual charging curve, not just the spec sheet.', author: P.naledi } ] },
      { id: 'demo-s2', name: 'Yusuf Adams', noms: [
        { reason: 'Sorted a delayed registration in a day when it was not his problem to fix.', author: P.lerato } ] }
    ],
    'demo-d2': [
      { id: 'demo-s3', name: 'Kayla Naidoo', noms: [
        { reason: 'Arranged the overnight test drive and followed up once, not eleven times.', author: P.sipho } ] }
    ],
    'demo-d3': [
      { id: 'demo-s4', name: 'Pieter van Wyk', noms: [
        { reason: 'Told me to wait two months for the facelift rather than sell me the outgoing model.', author: P.naledi } ] }
    ],
    'demo-d4': [{ id: 'demo-s5', name: 'Brandon Nel', noms: [] }],
    'demo-d5': [],
    'demo-d6': []
  };

  window.GARAGE_DEMO = {
    posts: posts,
    comments: comments,
    // Posts authored by people the signed-out demo user "follows".
    followingIds: [P.thabo.id, P.naledi.id],
    dealers: dealers,
    dealerRatings: dealerRatings,
    salespeople: salespeople
  };
})();
