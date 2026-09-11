/*
 * RVA Date Night Roulette — content
 * ----------------------------------
 * This is the only file you need to edit to add, remove, or update a date.
 * Everything else (wheel, filters, Full Date builder) reads from here.
 *
 * Field guide
 *   id        unique slug, used in share links (?date=id) — never reuse an old id
 *   name      full business name shown on the result card
 *   short     label printed on the wheel (keep it 12 characters or fewer)
 *   category  'eat' | 'play' | 'create'  (drives the All / Eat / Play / Create tabs)
 *   kind      finer type used by the Full Date builder:
 *             dinner, drinks, dessert, museum, escape, game, show, outdoor, candle, clay, paint
 *   area      neighborhood shown to you
 *   zone      rough cluster used to keep Full Date stops close together
 *   price     1 = $ (under ~$25/person), 2 = $$ (~$25–60), 3 = $$$ ($60+)
 *   moods     any of: chill, romantic, competitive, creative, foodie, spontaneous
 *   indoor    false only for weather-dependent spots
 *   address   used to build the Google Maps link and multi-stop routes
 *   website   official site (null if the business has no reliable site)
 *   booking   reservation/ticket link (null = walk-in or book on their site)
 *
 * Research snapshot: September 2026. Places change — run `node scripts/check-links.mjs`
 * every few months and swap out anything that has closed.
 */
(function (root) {
  const ZONES = {
    city: { label: "Fan & Scott's", near: ['downtown', 'westend', 'south'] },
    downtown: { label: 'Downtown', near: ['city', 'east', 'south'] },
    east: { label: 'East End', near: ['downtown'] },
    westend: { label: 'West End', near: ['city'] },
    south: { label: 'Southside', near: ['city', 'downtown'] }
  };

  const KIND_EMOJI = {
    dinner: '🥂', drinks: '🍸', dessert: '🍰', museum: '🖼️', escape: '🔐',
    game: '🕹️', show: '🎭', outdoor: '🌅', candle: '🕯️', clay: '🏺', paint: '🎨'
  };

  const KIND_LABEL = {
    dinner: 'Dinner', drinks: 'Drinks', dessert: 'Dessert', museum: 'Museum',
    escape: 'Escape room', game: 'Games', show: 'Live show', outdoor: 'Golden hour',
    candle: 'Candle making', clay: 'Pottery', paint: 'Painting'
  };

  const OPTIONS = [
    // ───────────── EAT: dinner ─────────────
    {
      id: 'lopossum', name: "L'Opossum", short: "L'Opossum", category: 'eat', kind: 'dinner',
      area: 'Oregon Hill', zone: 'city', price: 3, moods: ['romantic', 'foodie'], indoor: true,
      desc: 'Witty French-meets-Southern plates in a moody, art-crammed dining room. Order the Beef Swellington, then take a lap to see the art.',
      tip: 'Dinner Tuesday to Saturday. It is small, so book ahead.',
      address: '626 China St, Richmond, VA 23220',
      website: 'https://www.lopossum.com/', booking: 'https://www.opentable.com/lopossum'
    },
    {
      id: 'lostletter', name: 'Lost Letter', short: 'Lost Letter', category: 'eat', kind: 'dinner',
      area: "Scott's Addition", zone: 'city', price: 3, moods: ['romantic', 'foodie'], indoor: true,
      desc: 'Candlelit Italian with fresh pasta and a serious Italian wine list. The garden patio feels like a trip to Piemonte on warm nights.',
      tip: 'Open Wednesday to Sunday evenings. Bar seats work for walk-ins.',
      address: '2939 W Clay St, Richmond, VA 23230',
      website: 'https://www.lostletterrva.com/', booking: 'https://resy.com/cities/richmond-va/venues/lost-letter'
    },
    {
      id: 'grisette', name: 'Grisette', short: 'Grisette', category: 'eat', kind: 'dinner',
      area: 'Church Hill', zone: 'east', price: 3, moods: ['romantic', 'foodie'], indoor: true,
      desc: 'A tiny French bouchon: house charcuterie, steak frites, and profiteroles made for splitting. Weeknights are the sweet spot.',
      tip: 'Dinner Monday to Saturday from 5. Park by Chimborazo Park and stroll over.',
      address: '3119 E Marshall St, Richmond, VA 23223',
      website: 'https://grisetterva.com/', booking: 'https://resy.com/cities/richmond-va/venues/grisette'
    },
    {
      id: 'lemaire', name: 'Lemaire', short: 'Lemaire', category: 'eat', kind: 'dinner',
      area: 'Downtown (The Jefferson)', zone: 'downtown', price: 3, moods: ['romantic', 'foodie'], indoor: true,
      desc: 'A dress-up dinner inside The Jefferson Hotel. Ask for the main dining room for quiet, then wander the grand staircase after.',
      tip: 'Dinner nightly 5 to 9. The bar is livelier if you want energy.',
      address: '101 W Franklin St, Richmond, VA 23220',
      website: 'https://www.lemairerestaurant.com/', booking: 'https://www.opentable.com/lemaire-at-the-jefferson-hotel'
    },
    {
      id: 'stellas', name: "Stella's", short: "Stella's", category: 'eat', kind: 'dinner',
      area: 'Near West End', zone: 'city', price: 2, moods: ['foodie', 'romantic', 'chill'], indoor: true,
      desc: 'Beloved Greek neighborhood spot. Share meze, the black kale salad, and the flaming saganaki.',
      tip: 'Closed Sundays. Reserve, or grab the bar or communal table as walk-ins.',
      address: '1012 Lafayette St, Richmond, VA 23221',
      website: 'https://stellasrichmond.com/', booking: 'https://www.opentable.com/stellas-restaurant-richmond'
    },
    {
      id: 'amuse', name: 'Amuse at VMFA', short: 'Amuse', category: 'eat', kind: 'dinner',
      area: 'Museum District', zone: 'city', price: 3, moods: ['romantic', 'foodie'], indoor: true,
      desc: "Seasonal dining on the museum's top floor overlooking the sculpture garden. The menu riffs on whatever exhibition is on.",
      tip: 'Dinner Wednesday to Friday only (lunch the other days). Pair it with a gallery walk.',
      address: '200 N Arthur Ashe Blvd, Richmond, VA 23220',
      website: 'https://www.vmfa.museum/visit/amuse-restaurant', booking: 'https://www.opentable.com/amuse-at-the-virginia-museum-of-fine-arts'
    },
    {
      id: 'celladora', name: 'Celladora', short: 'Celladora', category: 'eat', kind: 'dinner',
      area: 'The Fan', zone: 'city', price: 2, moods: ['romantic', 'chill', 'foodie'], indoor: true,
      desc: 'A wine shop that becomes one of the best little dinners in the city. Let them pick your bottle, and get the focaccia and flatiron.',
      tip: 'Tiny room. Go early or on a weeknight.',
      address: '111b N Lombardy St, Richmond, VA 23220',
      website: null, booking: null
    },
    {
      id: 'brooklyn', name: 'The Brooklyn', short: 'The Brooklyn', category: 'eat', kind: 'dinner',
      area: "Scott's Addition", zone: 'city', price: 3, moods: ['foodie', 'romantic'], indoor: true,
      desc: 'Dark, wood-fired, and very date night. Sit at the bar for cocktails, crispy branzino, and a dessert course worth saving room for.',
      tip: null,
      address: '1616 Summit Ave, Richmond, VA 23230',
      website: null, booking: 'https://resy.com/cities/richmond-va/venues/the-brooklyn'
    },
    {
      id: 'beaucoup', name: 'Beaucoup', short: 'Beaucoup', category: 'eat', kind: 'dinner',
      area: 'The Fan', zone: 'city', price: 3, moods: ['foodie', 'romantic', 'spontaneous'], indoor: true,
      desc: 'Loud, cozy, very French raw bar. Pristine oysters, crispy panisse, and a fried soft egg you will fight over.',
      tip: null,
      address: '111 N Robinson St, Richmond, VA 23220',
      website: null, booking: 'https://resy.com/cities/richmond-va/venues/beaucoup'
    },
    {
      id: 'cheznous', name: 'Chez Nous', short: 'Chez Nous', category: 'eat', kind: 'dinner',
      area: 'Downtown', zone: 'downtown', price: 2, moods: ['romantic', 'chill'], indoor: true,
      desc: "Feels like a friend's Paris apartment stocked with wine. Jambon beurre on crackly baguette and whatever they are pouring tonight.",
      tip: null,
      address: '4 W Cary St, Richmond, VA 23220',
      website: null, booking: null
    },
    {
      id: 'blueatlas', name: 'Blue Atlas', short: 'Blue Atlas', category: 'eat', kind: 'dinner',
      area: 'Fulton Hill', zone: 'east', price: 2, moods: ['chill', 'foodie'], indoor: true,
      desc: 'Globe-trotting small plates with a skyline view from a converted school. Great vegetarian dishes and one of the best happy hours in town.',
      tip: 'Next door to Fruision Candles, so candle-then-dinner is easy.',
      address: '1000 Carlisle Ave, Richmond, VA 23231',
      website: null, booking: 'https://www.exploretock.com/blue-atlas-richmond'
    },
    {
      id: 'edos', name: "Edo's Squid", short: "Edo's Squid", category: 'eat', kind: 'dinner',
      area: 'The Fan (VCU)', zone: 'city', price: 2, moods: ['foodie', 'spontaneous'], indoor: true,
      desc: 'Crowded, garlicky, joyful Italian. Branzino, sausage over polenta, tiramisu, and a very simple, very good martini.',
      tip: 'Expect a wait. Worth it.',
      address: '411 N Harrison St, Richmond, VA 23220',
      website: null, booking: null
    },
    {
      id: 'mamajs', name: "Mama J's", short: "Mama J's", category: 'eat', kind: 'dinner',
      area: 'Jackson Ward', zone: 'downtown', price: 1, moods: ['foodie', 'chill'], indoor: true,
      desc: "Richmond's fried chicken bragging rights: mahogany crust, fried catfish, and bubbling mac and cheese. Strong drinks at the bar.",
      tip: 'If there is a wait, the bar is the move.',
      address: '415 N 1st St, Richmond, VA 23219',
      website: null, booking: null
    },
    {
      id: 'cochiloco', name: 'Cochiloco', short: 'Cochiloco', category: 'eat', kind: 'dinner',
      area: "Scott's Addition", zone: 'city', price: 2, moods: ['spontaneous', 'foodie'], indoor: true,
      desc: 'Bright, buzzy taqueria with margaritas, drippy nachos, and big garage doors. A great first stop before games nearby.',
      tip: null,
      address: '3340 W Moore St, Richmond, VA 23230',
      website: null, booking: null
    },
    {
      id: 'shoreline', name: 'Shoreline', short: 'Shoreline', category: 'eat', kind: 'dinner',
      area: 'West End', zone: 'westend', price: 3, moods: ['foodie', 'romantic'], indoor: true,
      desc: 'Seafood so fresh the fish case is the decor. Take the semicircle bar seats and watch the chef plate scallop crudo in front of you.',
      tip: null,
      address: '10614 Patterson Ave, Henrico, VA 23238',
      website: null, booking: null
    },

    // ───────────── EAT: drinks ─────────────
    {
      id: 'jasper', name: 'The Jasper', short: 'The Jasper', category: 'eat', kind: 'drinks',
      area: 'Carytown', zone: 'city', price: 2, moods: ['romantic', 'chill'], indoor: true,
      desc: "Carytown's cocktail blueprint: moody booths, serious drinks, zero pretension. Named for legendary Richmond bartender Jasper Crouch.",
      tip: 'Happy hour is a steal. Holiday pop-up books up fast.',
      address: '3113 W Cary St, Richmond, VA 23221',
      website: null, booking: null
    },
    {
      id: 'emerald', name: 'The Emerald Lounge', short: 'Emerald', category: 'eat', kind: 'drinks',
      area: 'Church Hill', zone: 'east', price: 2, moods: ['spontaneous', 'chill', 'romantic'], indoor: true,
      desc: 'A lush, retro-tropical cocktail bar from The Jasper team. Rum, agave, frozen drinks, and that famous seasoned popcorn.',
      tip: 'Spotty Dog Ice Cream is in the same building.',
      address: '2416 Jefferson Ave, Richmond, VA 23223',
      website: 'https://www.emeraldloungerva.com/', booking: null
    },
    {
      id: 'qrooftop', name: 'Q Rooftop', short: 'Q Rooftop', category: 'eat', kind: 'drinks',
      area: 'Arts District', zone: 'downtown', price: 2, moods: ['romantic', 'spontaneous'], indoor: false,
      desc: 'Sunset drinks on top of the Quirk Hotel. Go right before golden hour and stay for the city lights.',
      tip: 'Outdoor and weather dependent, so check that it is open.',
      address: 'Q Rooftop Bar, Quirk Hotel, W Broad St, Richmond, VA',
      website: null, booking: null
    },

    // ───────────── EAT: dessert ─────────────
    {
      id: 'shyndigz', name: 'Shyndigz', short: 'Shyndigz', category: 'eat', kind: 'dessert',
      area: 'The Fan', zone: 'city', price: 1, moods: ['romantic', 'foodie', 'chill'], indoor: true,
      desc: 'Towering layer cakes and oatmeal cream pies under twinkle lights. Split a slice of salted chocolate caramel.',
      tip: 'Closed Mondays. Open until 11 on Fridays and Saturdays.',
      address: '1912 W Cary St, Richmond, VA 23220',
      website: 'https://www.shyndigz.com/', booking: null
    },
    {
      id: 'gelati', name: 'Gelati Celesti', short: 'Gelati', category: 'eat', kind: 'dessert',
      area: "Scott's Addition", zone: 'city', price: 1, moods: ['chill', 'spontaneous'], indoor: true,
      desc: 'Dense, creamy, small-batch ice cream made in Richmond since 1984. Sample shamelessly, then commit.',
      tip: null,
      address: '1400 N Arthur Ashe Blvd, Richmond, VA 23230',
      website: 'https://www.gelatiicecream.com/', booking: null
    },
    {
      id: 'gelatisp', name: 'Gelati Celesti Short Pump', short: 'Gelati SP', category: 'eat', kind: 'dessert',
      area: 'Short Pump', zone: 'westend', price: 1, moods: ['chill', 'spontaneous'], indoor: true,
      desc: "The Short Pump outpost of Richmond's favorite ice cream. The easy sweet ending after anything at the Town Center.",
      tip: null,
      address: 'Gelati Celesti, The Corner at Short Pump, 11805 W Broad St, Henrico, VA 23233',
      website: 'https://www.gelatiicecream.com/', booking: null
    },
    {
      id: 'spottydog', name: 'Spotty Dog Ice Cream', short: 'Spotty Dog', category: 'eat', kind: 'dessert',
      area: 'Church Hill', zone: 'east', price: 1, moods: ['chill', 'romantic'], indoor: true,
      desc: 'A cozy, nostalgic parlor with inventive flavors and proper sundaes, next door to The Emerald Lounge.',
      tip: null,
      address: '2416 Jefferson Ave, Richmond, VA 23223',
      website: 'https://www.spottydogicecream.com/', booking: null
    },

    // ───────────── PLAY ─────────────
    {
      id: 'vmfa', name: 'Virginia Museum of Fine Arts', short: 'VMFA', category: 'play', kind: 'museum',
      area: 'Museum District', zone: 'city', price: 1, moods: ['chill', 'romantic', 'creative'], indoor: true,
      desc: 'Free general admission, open every day, and full of wow: Fabergé eggs, the sculpture garden, and big special exhibitions.',
      tip: 'Special exhibitions may be ticketed.',
      address: '200 N Arthur Ashe Blvd, Richmond, VA 23220',
      website: 'https://www.vmfa.museum/', booking: null
    },
    {
      id: 'smv', name: 'Science Museum of Virginia', short: 'The Dome', category: 'play', kind: 'museum',
      area: 'Museum District', zone: 'city', price: 2, moods: ['spontaneous', 'chill'], indoor: true,
      desc: "Catch a show under The Dome, Virginia's largest screen, then play with the hands-on exhibits. Watch for 21+ Science on Tap nights.",
      tip: null,
      address: '2500 W Broad St, Richmond, VA 23220',
      website: 'https://smv.org/', booking: 'https://smv.org/visit/tickets-admissions/'
    },
    {
      id: 'breakout', name: 'Breakout Games Richmond', short: 'Breakout', category: 'play', kind: 'escape',
      area: 'Midlothian', zone: 'south', price: 2, moods: ['competitive'], indoor: true,
      desc: 'Private escape rooms with big cinematic themes, from a volcano island to a blindfolded kidnapping.',
      tip: 'About 15 minutes from downtown.',
      address: 'Breakout Games Richmond, Midlothian, VA',
      website: 'https://breakoutgames.com/richmond/escape-rooms', booking: 'https://breakoutgames.com/richmond/escape-rooms'
    },
    {
      id: 'escaperva', name: 'Escape Room RVA', short: 'Escape RVA', category: 'play', kind: 'escape',
      area: 'Near West End', zone: 'city', price: 2, moods: ['competitive'], indoor: true,
      desc: "Four intricate, locally built rooms that Richmond Magazine readers voted the city's best. Clever puzzles and great game masters.",
      tip: 'Bookings are non-refundable but can be moved.',
      address: '7025 Three Chopt Rd, Richmond, VA 23226',
      website: 'https://www.escaperoomrva.com/', booking: 'https://www.escaperoomrva.com/reservations'
    },
    {
      id: 'riddle', name: 'Riddle Me This Escape Rooms', short: 'Riddle Me', category: 'play', kind: 'escape',
      area: 'Regency (Henrico)', zone: 'westend', price: 2, moods: ['competitive', 'spontaneous'], indoor: true,
      desc: 'Private rooms for two to ten with real atmosphere. Feeling brave? Some games add a live actor.',
      tip: 'A few rooms have a high fear factor. Reserve with a $50 deposit.',
      address: '1404 N Parham Rd, Richmond, VA 23229',
      website: 'https://www.riddlemethisrva.com/', booking: 'https://www.riddlemethisrva.com/'
    },
    {
      id: 'reddoor', name: 'Red Door Escape Room', short: 'Red Door', category: 'play', kind: 'escape',
      area: 'Short Pump', zone: 'westend', price: 2, moods: ['competitive'], indoor: true,
      desc: 'Six themed episodes inside Short Pump Town Center, from an enchanted forest to a prison break with a head-to-head mode.',
      tip: null,
      address: '11800 W Broad St, Suite 1216, Henrico, VA 23233',
      website: 'https://reddoorescape.com/escape-rooms/richmond/', booking: 'https://reddoorescape.com/escape-rooms/richmond/'
    },
    {
      id: 'sandbox', name: 'Sandbox VR Short Pump', short: 'Sandbox VR', category: 'play', kind: 'game',
      area: 'Short Pump', zone: 'westend', price: 3, moods: ['competitive', 'spontaneous'], indoor: true,
      desc: 'Full-body, free-roam VR with haptic vests. Battle side by side, then keep your highlight reel.',
      tip: 'Plan about an hour, including gearing up.',
      address: '11800 W Broad St, Space 2132, Henrico, VA 23233',
      website: 'https://sandboxvr.com/richmond/short-pump', booking: 'https://sandboxvr.com/richmond/short-pump'
    },
    {
      id: 'draftcade', name: 'Richmond Draftcade', short: 'Draftcade', category: 'play', kind: 'game',
      area: 'Short Pump', zone: 'westend', price: 1, moods: ['competitive', 'spontaneous'], indoor: true,
      desc: 'One wristband, unlimited retro arcade games, and dozens of taps. Loser buys the next round.',
      tip: '21 and up after 7pm.',
      address: '11800 W Broad St #1090, Richmond, VA 23233',
      website: 'https://richmond.draftcade.com/', booking: null
    },
    {
      id: 'bingo', name: 'Bingo Beer Co.', short: 'Bingo Beer', category: 'play', kind: 'game',
      area: "Scott's Addition", zone: 'city', price: 1, moods: ['competitive', 'spontaneous'], indoor: true,
      desc: 'Lager hall meets arcade: pinball, skee-ball, air hockey, plus a patio with fire pits.',
      tip: null,
      address: '2900 W Broad St, Richmond, VA 23230',
      website: 'https://bingobeerco.com/', booking: null
    },
    {
      id: 'funnybone', name: 'Richmond Funny Bone', short: 'Funny Bone', category: 'play', kind: 'show',
      area: 'Short Pump', zone: 'westend', price: 2, moods: ['spontaneous', 'chill'], indoor: true,
      desc: 'Touring headliners in an intimate club with dinner and drinks at your table.',
      tip: 'Two-item minimum, and tables of four may be shared.',
      address: '11800 W Broad St, Richmond, VA 23233',
      website: 'https://richmond.funnybone.com/', booking: 'https://richmond.funnybone.com/'
    },
    {
      id: 'coalition', name: 'Coalition Theater', short: 'Coalition', category: 'play', kind: 'show',
      area: 'Arts District', zone: 'downtown', price: 1, moods: ['spontaneous', 'chill'], indoor: true,
      desc: "Richmond's home for improv and sketch. Cheap tickets, fast laughs, and weekend shows at 8 and 10.",
      tip: null,
      address: '8 W Broad St, Richmond, VA 23220',
      website: 'https://rvacomedy.com/', booking: 'https://rvacomedy.com/'
    },
    {
      id: 'byrd', name: 'The Byrd Theatre', short: 'The Byrd', category: 'play', kind: 'show',
      area: 'Carytown', zone: 'city', price: 1, moods: ['chill', 'romantic'], indoor: true,
      desc: 'A gilded 1928 movie palace with a Mighty Wurlitzer organ played before most films. Popcorn, wine, and chandeliers.',
      tip: null,
      address: '2908 W Cary St, Richmond, VA 23221',
      website: 'https://byrdtheatre.org/', booking: 'https://byrdtheatre.org/buy-movie-tickets-online/'
    },
    {
      id: 'libbyhill', name: 'Sunset at Libby Hill Park', short: 'Libby Hill', category: 'play', kind: 'outdoor',
      area: 'Church Hill', zone: 'east', price: 1, moods: ['romantic', 'chill', 'spontaneous'], indoor: false,
      desc: 'The famous river-bend overlook at golden hour. Free, gorgeous, and a short walk to dinner on the Hill.',
      tip: 'Outdoor, so save it for a clear evening.',
      address: 'Libby Hill Park, Richmond, VA 23223',
      website: null, booking: null
    },

    // ───────────── CREATE ─────────────
    {
      id: 'wicksip', name: 'Wick & Sip Candle Lounge', short: 'Wick & Sip', category: 'create', kind: 'candle',
      area: 'Shockoe Slip', zone: 'downtown', price: 2, moods: ['creative', 'romantic'], indoor: true,
      desc: 'Pick a vessel, blend your own scent from dozens of fragrances, and pour it with a drink in hand.',
      tip: 'Reservation only.',
      address: '1321 1/2 E Main St, Richmond, VA 23219',
      website: 'https://www.bookwickandsip.com/', booking: 'https://www.bookwickandsip.com/'
    },
    {
      id: 'fruision', name: 'Fruision Candles', short: 'Fruision', category: 'create', kind: 'candle',
      area: 'Fulton Hill', zone: 'east', price: 2, moods: ['creative', 'romantic', 'chill'], indoor: true,
      desc: 'An intimate, slower-paced candle bar with city views. Also hosts soap, perfume, and massage-candle date nights.',
      tip: 'Book by phone: (804) 300-6505.',
      address: '1021 Carlisle Ave, Richmond, VA 23231',
      website: 'https://www.facebook.com/FruisionCandles/', booking: 'tel:+18043006505', bookingLabel: 'Call to book'
    },
    {
      id: 'stilllife', name: 'Still Life Ceramics', short: 'Still Life', category: 'create', kind: 'clay',
      area: "Scott's Addition", zone: 'city', price: 2, moods: ['creative'], indoor: true,
      desc: 'Bowl-in-One: throw a bowl on the potter\'s wheel in one hour. They glaze and fire it, and you pick it up about three weeks later.',
      tip: 'Fridays and Sundays, ages 18 and up.',
      address: '1600 Altamont Ave, Richmond, VA 23230',
      website: 'https://rva.still-life-studio.com/', booking: 'https://rva.still-life-studio.com/products/bowl-in-one'
    },
    {
      id: 'throws', name: 'Throws Like a Girl Ceramics', short: 'Throws Clay', category: 'create', kind: 'clay',
      area: 'Forest Hill', zone: 'south', price: 2, moods: ['creative', 'romantic'], indoor: true,
      desc: 'A two-hour wheel or hand-building class with a VCU-trained potter. You keep up to three pieces. Pure Ghost energy.',
      tip: 'Classes at 43rd Street Studios.',
      address: '1410 W 43rd St, Richmond, VA 23225',
      website: 'https://throwslikeagirlceramics.com/', booking: 'https://throwslikeagirlceramics.com/pages/take-a-class'
    },
    {
      id: 'clayground', name: 'Clay Ground Richmond', short: 'Clay Ground', category: 'create', kind: 'clay',
      area: 'East End', zone: 'east', price: 2, moods: ['creative', 'chill'], indoor: true,
      desc: 'An inclusive East End ceramics studio with date-night classes and private lessons.',
      tip: null,
      address: 'Clay Ground Ceramic Studio, Richmond, VA',
      website: 'https://www.clayground.net/', booking: 'https://www.clayground.net/'
    },
    {
      id: 'muse', name: 'Muse Paintbar', short: 'Muse Paint', category: 'create', kind: 'paint',
      area: 'Willow Lawn', zone: 'city', price: 2, moods: ['creative', 'romantic'], indoor: true,
      desc: 'Guided paint-and-sip with a real kitchen and bar, plus themed nights including couples canvases.',
      tip: 'Free parking across from the studio.',
      address: 'Muse Paintbar, Willow Lawn, Richmond, VA',
      website: 'https://www.musepaintbar.com/events/richmond-paint-bar', booking: 'https://www.musepaintbar.com/events/richmond-paint-bar'
    },
    {
      id: 'twist', name: 'Painting with a Twist Short Pump', short: 'Paint Twist', category: 'create', kind: 'paint',
      area: 'Short Pump', zone: 'westend', price: 2, moods: ['creative', 'spontaneous'], indoor: true,
      desc: "Step-by-step canvases with wine and themed nights. Paint each other's portrait if you are brave.",
      tip: null,
      address: '201 Towne Center West Blvd #710, Richmond, VA 23233',
      website: 'https://www.paintingwithatwist.com/studio/richmond-short-pump/', booking: 'https://www.paintingwithatwist.com/studio/richmond-short-pump/'
    }
  ];

  /*
   * Full Date templates. Each slot lists which `kind`s can fill it.
   * The builder keeps stops in the same zone when it can (see app.js → buildNight).
   */
  const NIGHT_TEMPLATES = [
    { id: 'dad', title: 'Dinner, activity, dessert', short: 'Dinner + Fun', slots: [['dinner'], ['escape', 'game', 'show', 'museum'], ['dessert']] },
    { id: 'cdd', title: 'Create, drinks, dessert', short: 'Make + Sip', slots: [['candle', 'clay', 'paint'], ['drinks'], ['dessert']] },
    { id: 'md', title: 'Museum, then dinner', short: 'Art + Dinner', slots: [['museum'], ['dinner']] },
    { id: 'ed', title: 'Escape room, then dinner', short: 'Escape + Eat', slots: [['escape'], ['dinner']] },
    { id: 'cd', title: 'Candle making, then dessert', short: 'Candle + Sweet', slots: [['candle'], ['dessert']] },
    { id: 'gdd', title: 'Golden hour, dinner, drinks', short: 'Sunset Night', slots: [['outdoor'], ['dinner'], ['drinks']] },
    { id: 'sd', title: 'Games, then a sweet ending', short: 'Play + Sweet', slots: [['game', 'show'], ['dessert']] }
  ];

  const MOODS = ['chill', 'romantic', 'competitive', 'creative', 'foodie', 'spontaneous'];

  const DATA = { ZONES, KIND_EMOJI, KIND_LABEL, OPTIONS, NIGHT_TEMPLATES, MOODS };
  root.RVA_DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
