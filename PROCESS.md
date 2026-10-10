# Vamos: how it's built

## Timeline
- **5 Oct 2026:** brainstormed geography game ideas and picked Vamos. Built a playable prototype as a Claude artifact, then moved it into this repo layout (Fox project routine) with Node tests and a preview build.
- **5–6 Oct 2026:** water, new modes and progression (ideas reviewed in the project's `vamos/ideas/swimming-modes-progression.md`; scuba was rejected). Swimming now uses the average Channel swimmer's pace. Added a lakes layer, seven new modes (hitchhiking, sailboat, kayak, paraglider, dog sled, giant tortoise, human cannonball), a Silly season rule set, earned stats, 13 badges, Fair mode and backup codes. Unbuilt mode ideas are kept in `vamos/ideas/travel-mode-backlog.md` in the project files.
- **6 Oct 2026:** draw-then-assign. Routes are made of lines: a tap adds a one-segment line, and the ✏️ tool turns a freehand drag into one line with several bends. Tapping a line selects it, and the mode buttons then change that whole line.
- **6 Oct 2026:** satellite view, Look around links, custom trips and friend challenges with a leaderboard.
- **6 Oct 2026:** streets layer and deeper zoom, stop points (ports, paragliding hills, balloon sites) with sled and hill zones, auto-stop for legs, and ten characters.
- **6 Oct 2026:** biome layer (desert, grassland, jungle, ice and snow) with terrain characters (Rabbit, Camel, Monkey, Penguin; Fox, Mountaineer and Relic Hunter got terrain strengths), on/off switches for each stop kind and terrain shading, and online play on Supabase: accounts, ranked daily trips and a 1v1 lobby.
- **6 Oct 2026:** danger levels (Off to Nightmare, plus Custom odds), accidents per mode, an energy meter with exhaustion, and Zoo Bonanza with three animal mounts (horse, camel ride, elephant). Built from Alexander's brainstorm; a browser AI's write-up was used only where it matched it.
- **10 Oct 2026:** characters off by default (Alexander: "simpler is better"), and a separate 🧭 Route Planner tab: pick a start and finish (place, country or map tap) and allowed modes, including planes, and see the fastest route or how far you get and what blocks you.

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
- **Streets: OpenStreetMap standard tiles.** Their tile policy (operations.osmfoundation.org/policies/tiles, checked 6 Oct 2026) allows interactive use in apps with "© OpenStreetMap contributors" shown, and bans bulk or offline downloading. Vamos only loads tiles on screen. The tiles are Web Mercator, so each is drawn in horizontal strips (16 at low zoom, 1 from z10) to line up with the flat lat/lon map. If Vamos gets heavy traffic, move to a paid tile host.
- **Deeper zoom:** max 12,000 px per degree (about 9 m per screen pixel), the satellite mosaic's full 10 m detail. The basemap and zone masks draw only their visible part so deep zooms stay fast. The game grid is still 0.25° (about 28 km), so coastlines in the rules are rougher than the imagery.
- **Stop points are convenience, not rules.** Boats can still start anywhere on a coast and balloons anywhere. Ports come from Natural Earth 1:10m ports (public domain, 1,081). Balloon sites are 28 well-known areas typed in by hand, coordinates approximate (M). Hill markers are the best launch cell (peak at least 300 m above the cell average) in blocks sized about 70 px apart.
- **Auto-stop (`clipLeg`).** Walks the leg in 0.01° steps. It cuts where the wrong surface runs longer than the mode's gap allowance, where a hard problem starts (ice, snow, peaks), at a paraglider's 150 km, or, if the leg would end on the wrong surface, where that last stretch began. If even the first step is impossible, nothing is added and the reason is shown.
- **Characters** are original names inspired by stories (Thor, Superman, Jedi, Indiana Jones, Spider-Man, the Little Mermaid, the Genie), not the film versions, to avoid using trademarked names and likenesses. They're free for now; Alexander plans limits later. The best-route solver uses the same character (via `setCharacter` in phys.js and the worker), so grades stay fair. The fox is the standard 🦊 emoji; WeChat's own emoji art belongs to Tencent and isn't used.
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

- **Biomes are rough on purpose.** Natural Earth has desert and plain regions but no jungle or land-cover class, so `tools/build_biome.py` uses Natural Earth regions plus hand-typed boxes (about a degree accurate) for rainforests, the Arabian and Australian interiors and two steppes, with wobbly edges so they don't look like rectangles. Ice and snow is the dog-sled rule plus northern tundra. A real land-cover map (for example ESA WorldCover or MODIS) would be better but is far bigger; maybe later.
- **Online play: Supabase (chosen by Alexander, 6 Oct 2026).** A static site can't hold accounts, so this is the one server piece. Reads are public; writes are limited by row-level security, and 1v1 updates go through database functions that check whose turn it is. Routes stay hidden until a match is over (and always for ranked), so nobody can copy them. The rules were tested on a local Postgres 16 with a stand-in for Supabase's auth schema, and the browser side with a fake Supabase client; not yet against a real Supabase project.
- **Ranked = the daily trip, Classic rules, Fair mode, first finish only.** One shared puzzle a day keeps it fair. Finishing it casually first (and seeing the best route) makes the ranked try casual. Genie, Thunder God and Caped Hero fly straight there, so they're casual only.
- **The 1v1 lobby is turn-based, not live.** The host posts the trip on their map and plays first; whoever accepts plays it later and sees who won. The lobby refreshes every 15 seconds while open and the game checks for results every minute. Live races would need realtime channels; possible later.

- **Danger is planned, luck is rolled.** Energy is a forecast you can see while drawing (it's deterministic), so you can plan rests by mixing in trains, boats and lifts. Accidents are rolled when you press Vamos!, from the trip seed and the exact route, so everyone on the same challenge or 1v1 with the same route gets the same luck. The best route still assumes no accidents, which the result card says.
- **Energy model.** On-foot and animal modes use energy per moving hour (walk 3%, run 8%, swim 8%, and so on); every resting hour gives back 2.5%, and sitting on trains, boats and lifts gives back 1.5% an hour. Walking 10 h a day just about breaks even; long swims don't. From Hard, deserts and ice sheets make on-foot travel 60% more tiring unless your character is at home there. On Nightmare the Rabbit tires twice as fast and the Fox can get spooked. The Caped Hero never tires. Everything here is a game-balance guess.
- **Left out of the browser AI's write-up:** items and shelters that revive you, and the Triathlon "double drop after a crash" rule. Both could come later.
- **Ranked stays Off.** Danger adds luck, and ranked is meant to measure planning, so ranked tries need danger Off. Challenges and 1v1s carry their danger setting and lock it.
- **New modes are added at the end of the list,** because route codes in old challenge links store each mode's position.
- **Backlog modes (built 6 Oct 2026, Alexander: "the rest seem good", teleporter not yet).** Normal ones (skis, motorbike, coach, cargo ship, ostrich, whale) are in Classic, so they also count for ranked; goofy ones are in Silly season, so Classic doesn't fill up with joke buttons. The best-route computer ignores jetpacks and spoons and doesn't know about cargo ports or unicycle falls, so its par can be a little optimistic there. The carrier pigeon isn't a mode (you don't move); it's a line on the result card.
- **Cable car left out.** The map's cells are about 28 km wide and real cable cars run a few km, so on this grid a cable car would change nothing. It stays in the ideas list.
- **Whale lanes are hand-placed.** Thirteen rough humpback and grey whale routes (Alaska to Hawaii, Antarctica to Tonga and so on), typed from general knowledge, not survey data. Whales swim within about 140 km of a lane.
- **Characters switch.** Off by default since 10 Oct 2026 (Alexander: simpler is better); only an explicit switch-on is remembered. Off means a plain traveller with no powers; the last pick comes back when it's switched on again. It's a personal setting, not part of challenges or 1v1s.
- **Chat (6 Oct 2026).** One Supabase table, a room per trip and rule set plus one for everyone. The database fills in who sent a message and when, limits each player to one message every 3 seconds and 20 a minute, and clears out messages after 30 days. The game asks for new messages every 5 seconds only while the chat is open, rather than using Supabase's realtime feature, which is simpler and easy to test. A short whole-word filter stars out the worst words, players can mute others on their own device, and Alexander can delete any message in Supabase's Table Editor. Plans can't be shared on today's daily trip, so ranked routes stay secret.
- **Route Planner (10 Oct 2026).** A separate tab, not scored. It reuses the game's map, terrain grid, speeds and solver worker; `planTrip` in phys.js is a multi-start, multi-finish version of the best-route search. Differences from the game solver: changing mode costs that mode's setup time inside the search (so routes don't flip between train and boat every cell); cars, coaches, trains, hitchhiking and boats may hop one grid cell of the wrong surface (bridges, tunnels, canals), which the game solver doesn't; if the finish can't be reached it returns the reached cell nearest the finish, then follows the straight line toward the finish to say what's in the way and how wide it is. Speeds are day-averaged like the game's par, so times include sleep. Characters and stats are ignored.
- **Planes in the planner only.** The game stays plane-free. Airports: OurAirports `airports.csv` (large and medium airports with scheduled service and an IATA code, 3,244 of them). Flight time = 3 h at the airports + 30 min taxi + distance at 800 km/h. Large airports fly to each other up to 15,000 km; any flight involving a medium airport is limited to 2,500 km. These rules are mine, not data: real routes, schedules and layovers aren't modelled. The OpenFlights route list (ODbL) would say which routes exist, but it stopped updating in June 2014 (airports like Istanbul's new one are missing), so it isn't used.
- **Countries for the planner.** Natural Earth 1:50m countries rasterised onto the 0.25° grid (a cell belongs to the country its centre falls in). Picking a country means "anywhere in it". Very small countries that cover no cell centre use their label point instead. Greenland is its own entry, separate from Denmark.

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
| Cross-country skis | 6 km/h, 8 h/day, snow only | Game choice | L |
| Motorbike | 70 km/h, 10 h/day, 60% speed beyond 55° or on ice | Game choice | L |
| Coach | 60 km/h, 16 h/day, 2 h at the station | Game choice | L |
| Cargo ship | 35 km/h (about 19 knots), 24 h, 12 h to load, ports within 30 km | Game choice | L |
| Ostrich | 50 km/h for 1 h a day | Game choice; ostriches are often quoted as sprinting faster, but I haven't checked a source | L |
| Whale | 6 km/h, 24 h, 6 h to find one | Game choice; I'm not certain of real migration speeds | L |
| Pogo stick | 4 km/h, 2 h/day, nothing rougher than 100 m | Game choice | L |
| Unicycle | 8 km/h, 3 h/day, +1 h per 10 km of ground rougher than 50 m | Game choice | L |
| Trebuchet | 1 km a throw, 24 h to build each one | Game choice | L |
| Inflatable flamingo | 2 km/h with the current, 1 across it, 0.2 against; currents follow the wind belts | Very rough: real currents also run north and south along coasts | L |
| Zorb ball / shopping trolley | 3 / 4 km/h on the flat, +1.5 km/h per metre of drop per km, up to +40 / +25; no climbs of 50 m or more between cells; the trolley crashes at the bottom (+30 min) | Game choice | L |
| Jetpack | 100 km/h, 25 km per refill, refills at spaceports | Game choice | L |
| Digging | 1 m a day | Game choice | L |
| Carrier pigeon | 60 km/h, 12 h a day, straight line | Rough guess; I don't have a verified source | L |
| Plane (planner only) | 800 km/h + 30 min taxi + 3 h at airports; 15,000 km max between large airports, 2,500 km otherwise | Game choice; long-haul jets cruise faster than 800 km/h, so this roughly allows for climb and descent | L |
| Planner bridges, tunnels and canals | Land modes with a 25 km+ gap allowance and boats may hop one 28 km cell | Game choice | L |
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
- [ ] A finer land/water mask (e.g. 1/16°) would make auto-stop land closer to the real coast.
- [ ] Spot-check balloon site coordinates.
- [ ] Decide character limits or unlocks.
- [ ] Live multiplayer races (realtime) on top of the turn-based 1v1 lobby.
- [ ] Re-check ranked and 1v1 times on the server (Supabase Edge Function running `phys.js`); today the browser works them out.
- [ ] Test online play (including chat) against the real Supabase project.
- [ ] Username and chat filters are short word lists; consider a proper one and a report button.
- [ ] Chat could use Supabase realtime instead of 5-second checks if lots of people use it.
- [ ] Teleporter booth (not yet, per Alexander) and cable car (needs a finer map).
- [ ] Biomes: replace hand-typed boxes with a real land-cover map.
- [ ] Danger: tune accident odds and energy rates after people play; consider rest stops or items, and a ranked danger ladder.
- [ ] Very long freehand routes make long challenge links; consider compressing them if chat apps cut them off.
- [ ] Add a minimum time per mode as a custom setting (Triathlon already uses 1 h).
- [ ] Possibly let legs wrap across the Pacific.
- [ ] Possibly add more trips; small towns make better puzzles than capitals.
- [ ] Check that "Vamos" is free as a name and domain.
- [ ] Verify the OurAirports licence wording on ourairports.com/data (believed public domain; I couldn't open the page on 10 Oct 2026).
- [ ] Planner: consider real flight routes (needs an up-to-date route source) and real road/rail/ferry networks; today roads and rails are assumed on all land.
- [ ] Planner: pick a final name for the tab (working name "Route Planner").

## How Alexander likes to work
- Say clearly when something is uncertain. Never invent sources or URLs, and flag numbers that need checking.
- Use plain language. Alexander is comfortable running a few Terminal commands when told exactly what to type.
- Alexander tests on the live site, often on a phone, and comes back with what felt slow or confusing.
- Privacy matters: no personal details in public files.
- Alexander likes reusing good features from the other Fox projects (ideas, not copied code).
