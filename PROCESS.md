# Vamos: how it's built

## Timeline
- **5 Oct 2026:** brainstormed geography game ideas and picked Vamos. Built a playable prototype as a Claude artifact, then moved it into this repo layout (Fox project routine) with Node tests and a preview build.

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
- **Same-mode legs form one stint.** Drawing a car route in five clicks costs one car hire and shares nights, so extra clicks aren't penalised.
- **Grace zones.** There are 15 km at each end of a leg for docks and coasts. Land modes may also cross short stretches of water (3 km on foot, 25 km by car for bridges, 55 km by train for tunnels), and boats may cross 25 km of land (canals).
- **Art:** a stick figure plus emoji for vehicles, and a cartoon relief map made from the elevation data. No image assets to license.
- **No accounts and no server.** It's a static site. Nothing is stored yet, so there's no backup/restore yet (see open items).

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
| Swimming | 3 km/h, 8 h/day; 3 h/day above 50° latitude | Game choice, roughly a strong open-water swimmer | L |
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
- [ ] Lakes count as land (the Great Lakes, Lake Victoria). This needs a lakes layer.
- [ ] Add streaks and best grades per trip in localStorage, with backup and restore.
- [ ] Add a minimum time per mode as a custom setting (Triathlon already uses 1 h).
- [ ] Possibly add a scuba mode, so "the bends" can apply when someone dives and then flies a balloon or rocket.
- [ ] Possibly let legs wrap across the Pacific.
- [ ] Possibly add more trips; small towns make better puzzles than capitals.
- [ ] Check that "Vamos" is free as a name and domain.

## How Alexander likes to work
- Say clearly when something is uncertain. Never invent sources or URLs, and flag numbers that need checking.
- Use plain language. Alexander is comfortable running a few Terminal commands when told exactly what to type.
- Alexander tests on the live site, often on a phone, and comes back with what felt slow or confusing.
- Privacy matters: no personal details in public files.
- Alexander likes reusing good features from the other Fox projects (ideas, not copied code).
