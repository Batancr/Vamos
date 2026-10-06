# Vamos: how it's built

## Timeline
- **5 Oct 2026:** brainstormed geography game ideas and picked Vamos. Built a playable prototype as a Claude artifact, then moved it into this repo layout (Fox project routine) with Node tests and a preview build.
- **5–6 Oct 2026:** water, new modes and progression (ideas reviewed in the project's `vamos/ideas/swimming-modes-progression.md`; scuba was rejected). Swimming now uses the average Channel swimmer's pace. Added a lakes layer, seven new modes (hitchhiking, sailboat, kayak, paraglider, dog sled, giant tortoise, human cannonball), a Silly season rule set, earned stats, 13 badges, Fair mode and backup codes. Unbuilt mode ideas are kept in `vamos/ideas/travel-mode-backlog.md` in the project files.
- **6 Oct 2026:** draw-then-assign. Routes are made of lines: a tap adds a one-segment line, and the ✏️ tool turns a freehand drag into one line with several bends. Tapping a line selects it, and the mode buttons then change that whole line.
- **6 Oct 2026:** satellite view, Look around links, custom trips and friend challenges with a leaderboard.

## The gap (checked 5 Oct 2026)
- The closest existing game is [Georoute](https://georoutegame.com/): you connect cities by car, boat, ship, plane or helicopter and score for the fastest or cheapest route. It works in city-to-city hops.
- Vamos differs in four ways. You draw freehand legs anywhere. Real terrain changes your speed. There are silly modes (balloon, rocket, skateboard, swimming). And there are challenge rule sets with no planes at all.
- I found no other game called "Vamos" in a quick search. It's a common Spanish word, so check that the domain is free and that there's no trademark conflict before branding it.

## How changes ship
1. Connect `~/Vamos` in the chat, or download the zip and unzip it over the folder.
2. Edit the files, run `node tests/phys.test.js`, and check the page in a headless browser at about 1360px (light) and 400px (dark). Look for console errors and sideways scrolling, and look at screenshots.
3. Commit with a message a reader would understand.
4. Alexander runs `git push`, then checks https://batancr.github.io/Vamos/.
5. Update this file when something meaningful changes.
6. Optionally run `python3 tools/build_preview.py` and republish the Claude artifact preview.

## Decisions and why
- **No planes.** Planes win every trip, so the game becomes trivial. Every other mode is limited by speed, hours per day, setup time and terrain instead.
- **A simplified travel model, not real routing.** Real road, rail and ferry routing worldwide needs paid or heavy services. A 0.25° terrain grid (about 28 km cells) keeps the site static and free, and the player and the best-route solver follow exactly the same rules.
- **The best route uses day-averaged speeds.** The solver spreads rest over each hour, so for example walking counts as 5 km/h × 10/24. The player's own legs use real days with nights. On long trips the two match; on short hops a player can beat the solver, and the page says so.
- **Straight-line legs on a plain lat/lon map.** This is simple to draw and score. Legs can't wrap across the Pacific (from 180° to −180°), and the solver doesn't wrap either, so the two stay consistent.
- **Lines and legs.** A line is what the player drew in one go and has one mode; inside it are straight legs, which are what the rules score. A freehand stroke is simplified (Ramer–Douglas–Peucker, 6 px) so a wobbly finger doesn't make hundreds of legs. Switching a line to a rocket collapses it to one hop to the spaceport nearest its end. In draw mode one finger draws and two fingers pan and zoom.
- **Satellite imagery: EOxCloudless (Sentinel-2) 2024.** Checked 6 Oct 2026. Esri World Imagery needs an ArcGIS licence (Esri staff on the Esri Community forum), so it's out. EOxCloudless is CC BY-NC-SA 4.0: free for non-commercial use with the credit visible wherever it shows (cloudless.eox.at/documentation/license). **If Vamos ever earns money (ads, paid features), this needs EOX's paid licence or a switch to NASA GIBS (public domain, about 250 m per pixel).** The WGS84 tile set lines up exactly with this plain lat/lon map, so tiles draw straight onto the canvas with no reprojection. Imagery shows from 10 pixels per degree and max zoom is 1,500 pixels per degree (about 75 m per screen pixel): a broad look at the scenery, as Alexander asked, not street level.
- **Look around** uses Google Maps URLs, which need no API key (developers.google.com/maps/documentation/urls). Real Street View inside the page would need a paid Google API key, so it opens a new tab instead.
- **Challenges without a server.** A challenge link (`#c=…`) carries the trip, rule set, hitchhiking seed and up to 12 results (name, time, grade, route at 2 decimals). Opening several friends' links merges them into one board kept in localStorage per challenge id. Challenges always use Fair mode so stats can't decide them. Every field in a link is checked and every name is HTML-escaped, since links come from anyone. A live, real-time "battle royale" would need a server (and probably accounts), so it isn't built.
- **Same-mode legs form one stint.** Drawing a car route in five clicks costs one car hire and shares nights, so extra clicks aren't penalised.
- **Grace zones.** There are 15 km at each end of a leg for docks and coasts. Land modes may also cross short stretches of water (3 km on foot, 25 km by car for bridges, 55 km by train for tunnels), and boats may cross 25 km of land (canals).
- **Art:** a stick figure plus emoji for vehicles, and a cartoon relief map made from the elevation data. No image assets to license.
- **No accounts and no server.** It's a static site. Stats and badges live in localStorage (`vamos.progress`), and a base64 backup code moves them between devices. Restoring merges: the higher km per mode and every badge from both.
- **Lakes.** The grid has a third surface value, 2 = lake, from Natural Earth's 1:50m lakes drawn at 16 sub-cells per degree. A cell is lake if at least 25% of it is lake and it isn't mostly land. Only big lakes show at this scale (Geneva and Loch Ness don't). Australia's usually-dry salt pans (Eyre, Frome, Gairdner, Torrens, Mackay, Disappointment, Barlee) are left as land. Land modes treat lakes like sea; water modes can use them.
- **Stats without grinding.** Grading is against the best route *at your own stats*, so a maxed player who plans badly scores worse than a new player who plans well. Stats are small (+15% cap), only for human-powered modes, earned per km of that mode, and each trip counts once per rule set. Fair mode (base speed for everyone) is on by default for the daily trip.
- **Paraglider par is cautious.** The solver only glides one cell at a time out of hilly cells, while players can draw long glides from a hill. Clever players can beat the par, which the A+ note already allows for.
- **Hitchhiking luck is seeded.** The wait comes from the trip number and leg number, so everyone on the same daily trip gets the same luck. Practice trips use a random seed.

## Game numbers and where they come from
These are game-balance choices unless a source is named. Confidence: H = high, M = medium, L = low or invented for fun.

| Value | Used | Basis | Confidence |
|---|---|---|---|
| Walking speed | 5 km/h, 10 h/day | Naismith's rule of thumb (5 km/h on the flat) | M |
| Climbing penalty, walking | +1 h per 600 m of ascent | Naismith's rule | M; verify the exact figure |
| Running | 10 km/h, 5 h/day | Game choice | L |
| Bicycle | 20 km/h, 8 h/day, +1 h per 700 m | Game choice | L |
| Skateboard | 12 km/h, 4 h/day | Game choice | L |
| Car | 80 km/h average, 12 h/day, slowed by rough terrain | Game choice | L |
| Train | 120 km/h, runs 24 h (sleeper), slowed by mountains | Game choice | L |
| Boat | 30 km/h (about 16 knots), 24 h | Game choice | L |
| Swimming | 2.4 km/h, 8 h/day; 3 h/day above 50° latitude | Average solo Channel crossing, 13 h 34 min (dover.uk.com statistics page), over the 33.2 km narrowest crossing. Hours per day are a game choice | M for the pace, L for the hours |
| Lakes | Natural Earth 1:50m lakes; 2,142 lake cells | naturalearthdata.com via the nvkelso/natural-earth-vector GitHub repo | H for the source, L for the 25% threshold |
| Hitchhiking | Car speed, 0–6 h wait per lift in 15 min steps | Game choice | L |
| Sailboat | 10 km/h ± 8 km/h of wind (never below 4), 24 h | Game choice, same wind belts as the balloon | L |
| Kayak | 6 km/h, 8 h/day, can carry 5 km over land | Game choice | L |
| Paraglider | 25 km/h, 6 h/day, max 150 km a leg, launch 300 m above the cell average | The distance record is about 612 km (freedom-parapente.fr, 2021), so 25 km/h and 150 km are an ordinary pilot | L |
| Dog sled | 12 km/h, 8 h/day, ice sheets or land beyond 60° | Game choice | L |
| Giant tortoise | 0.3 km/h, 24 h/day | Game choice | L |
| Human cannonball | 300 m a shot, 2 h to reload (0.15 km/h) | Game choice | L |
| Stats | +1% per 333 km walking, 300 km running, 1,000 km cycling, 300 km skating, 150 km kayaking, 33 km swimming, 500 km paragliding; cap +15% | Game choice (swim 100 km ≈ +3%, walk 1,000 km ≈ +3%, as proposed) | L |
| Balloon | 15 km/h ± 25 km/h of wind; east between 30° and 60° latitude, west elsewhere | Prevailing wind belts (westerlies and trade winds) | M for direction, L for speeds |
| Balloon ceiling | Crashes over cells with peaks above 4,500 m | Game choice | L |
| Rocket | 72 h launch prep + 1 h flight, spaceport to spaceport | Game choice | L |
| Moon detour | About 6 days | Apollo trips took roughly 3 days each way | M; verify |
| Altitude sickness | +24 h once a human-powered stint goes above 3,000 m | Game choice; real symptoms can start lower | M |
| Seasickness | +4 h per full day at sea | Game choice | L |
| English Channel swim | "Longer than the Channel" message above 34 km | The narrowest crossing is about 33 km | M; verify |
| Spaceport and trip coordinates | To about 0.1° | Recalled, not looked up | M; spot-check before launch |

Data sources and licences are in `data/raw/README.md`.

## Open items
- [ ] Check the attribution wording for AWS Terrain Tiles and Natural Earth.
- [ ] Spot-check spaceport and trip coordinates.
- [x] Lakes layer (6 Oct 2026).
- [x] Progress in localStorage with backup and restore (6 Oct 2026).
- [ ] Add streaks and best grades per trip.
- [ ] One long practice trip can max a stat (e.g. 2,250 km of kayaking). Consider a per-trip limit if that feels too quick.
- [ ] Badges don't unlock modes yet; the ideas doc suggested unlocking fun modes.
- [ ] Satellite licence is non-commercial only (see decisions).
- [ ] Live multiplayer races would need a backend; challenge links are the static version.
- [ ] Very long freehand routes make long challenge links; consider compressing them if chat apps cut them off.
- [ ] Add a minimum time per mode as a custom setting (Triathlon already uses 1 h).
- [ ] Possibly let legs wrap across the Pacific.
- [ ] Possibly add more trips; small towns make better puzzles than capitals.
- [ ] Check that "Vamos" is free as a name and domain.

## How Alexander likes to work
- Say clearly when something is uncertain. Never invent sources or URLs, and flag numbers that need checking.
- Use plain language. Alexander is comfortable running a few Terminal commands when told exactly what to type.
- Alexander tests on the live site, often on a phone, and comes back with what felt slow or confusing.
- Privacy matters: no personal details in public files.
- Alexander likes reusing good features from the other Fox projects (ideas, not copied code).
