# Vamos

Get from A to B without a plane. Vamos is a browser game: you get a start and a finish somewhere in the world, and you draw your route on the map one leg at a time, choosing how to travel each leg. The options include walking, running, a bicycle, a car, a motorbike, a coach, hitchhiking, a train, a boat, a cargo ship, a sailboat, a kayak, swimming, a paraglider, a dog sled, cross-country skis, a horse, a camel, an elephant, an ostrich, a whale, a hot air balloon, a giant tortoise and a rocket. There are goofy ones too: a human cannonball, a trebuchet, a pogo stick, a unicycle, a zorb ball, a shopping trolley, an inflatable flamingo, a jetpack and a spoon for digging. Then you watch a stick figure make the trip, and you're graded against the best route the game can find.

Live site (once GitHub Pages is on): https://batancr.github.io/Vamos/

## How it plays
- Draw your route as lines: tap to add stops, or press ✏️ and drag to draw freehand. Tap any line (on the map or in the list) to change how you travel it.
- Zoom in (down to about 9 m per pixel) and the map switches to satellite imagery; 🛰️ swaps it for streets and roads (OpenStreetMap) or the plain relief map, and has on/off switches for each kind of stop and for terrain shading (desert, grassland, jungle, ice and snow).
- **Stops:** ⚓ ports, 🪂 paragliding hills and 🎈 balloon sites are tap targets. Picking dog sled or paraglider shades where it can go.
- **Auto-stop:** aim a leg too far and it stops at the limit, for example a boat stops at the coast and a car stops at the water's edge, so you can switch mode and carry on.
- **Characters:** Traveller, Fox, Rabbit, Camel, Monkey, Penguin, Mountaineer, Mermaid, Genie, Thunder God, Caped Hero, Star Knight, Relic Hunter and Web Slinger, each with a power. Some are faster on certain terrain: Rabbit on grassland, Camel in deserts, Monkey and Fox in jungle, Penguin on ice and snow. The best route uses your character too. They're off by default, so you play as a plain traveller; tick **Characters on** to use them. All free for now. 🔭 opens Google Street View or Google's satellite map at the middle of the map.
- **Challenge friends:** after a trip, send a link. Friends play the same trip in Fair mode and send theirs back, and everyone who plays lands on one leaderboard, with their routes shown once you finish. **Custom** lets you tap any start and finish and name them.
- **Online (once switched on):** make an account to keep stats and badges, play the daily trip **Ranked** for up to 1,000 points (1,000 × best route ÷ your time, first finish only), and post or accept **1v1** games in the lobby or challenge a player by username. Setup steps are in `supabase/README.md`.
- **Chat (online):** 💬 opens a chat box over the map with two rooms: **This trip** (everyone on the same trip and rule set) and **Everyone**. Anyone can read; signing in lets you write. **Share my plan** posts your route as icons and distances, except on today's daily trip, where ranked routes stay secret. You can delete your own messages and 🔇 mute a player on your device.
- **Danger:** Off (the classic game), Easy, Medium, Hard, Nightmare or Custom. Easy brings small hiccups (train delays, flat tyres); Medium adds crashes, dodgy hitchhiking lifts, rocket faults and an energy meter; Hard adds wind, ice, heat and getting lost in the jungle, and running out of energy kills you; Nightmare makes everything likelier, some crashes fatal, and even the tortoise risky. Custom has an overall odds slider and one per mode. Each line shows its accident risk and the energy left after it; accidents are rolled when you press Vamos!, the same for everyone on the same trip and route. Terrain characters are safer at home (Camel in deserts, Penguin on ice, Monkey and Fox in jungle). Danger travels with challenge links and 1v1s; ranked is always Off.
- There's a new trip every day ("Trip #N"), plus random practice trips.
- Rule sets: Classic, Human power, Triathlon, No wheels, Zoo Bonanza (horse, camel ride, elephant, ostrich, whale, sled dogs, tortoise), Balloonatic, Rocket Man, Silly season (all the goofy modes).
- Real terrain matters. Hills slow walking and cycling, mountains slow cars and trains, balloons crash into peaks above 4,500 m, boats need water and cars need land.
- People need sleep, so each mode only moves for part of the day. Rockets only fly between real spaceports.
- Altitude sickness, seasickness and cold water add time.
- Big lakes (the Great Lakes, Victoria, Baikal, Titicaca and others) are water: swim, kayak or take a boat.
- Some modes have their own rules. Paragliders launch from hills and fly at most 150 km a leg. Dog sleds and skis need snow. Cargo ships load and unload at ⚓ ports. Whales only swim their 🐋 migration lanes. Motorbikes slow down in the cold. Pogo sticks need flat ground, unicycles fall off on bumpy ground, and zorb balls and shopping trolleys only go downhill. Jetpacks refuel at spaceports and fly 25 km. The flamingo drifts with the currents. Digging with a spoon goes 1 m a day. The result card also says how long a carrier pigeon would take to deliver your postcard. Hitchhiking waits 0 to 6 hours for each lift, and everyone gets the same luck on the daily trip.
- **Stats and badges.** Doing an activity makes you a little faster at it (up to +15%), and odd feats earn badges. Fair mode, on by default for the daily trip, puts everyone at base speed. With it off, the best route is worked out at your stats too, so the grade measures planning, not hours played. Progress stays in your browser; a backup code moves it to another device.
- The result card is plain text you can paste anywhere.

## Route Planner (the 🧭 tab)
Not part of the game. Pick a start and a finish (a city, a whole country, or 📍 a spot on the map), tick the ways you may travel (walking, boats, swimming, planes and every game mode), and press **Find the way**. You get the fastest route and its time. If your picks can't make it, you see the furthest you get, how long that takes, what's in the way (say, 500 km of open sea) and buttons to add a mode that could cross it. A country means anywhere in it. `#plan` at the end of the address opens this tab.

Every time is an estimate from the game's simple model. Flights use real airport locations from OurAirports, but flight times are worked out from distance (3 h at airports + 30 min + 800 km/h), not from timetables, and it doesn't check that an airline flies the route.

## Run it locally
```
python3 -m http.server 8000 -d docs
```
Then open http://localhost:8000. A plain file:// open won't load the map data.

## Tests
```
node tests/phys.test.js
```

## Layout
- `docs/`: the whole website, served by GitHub Pages
  - `phys.js`: game rules and the best-route solver. Pure functions, tested in Node.
  - `game.js`: map drawing, input, playback and results
  - `planner.js`: the Route Planner tab (uses `planTrip` in phys.js)
  - `online.js`: accounts, ranked play, the 1v1 lobby and chat (Supabase)
  - `worker.js`: runs the solver off the main thread
  - `data/`: terrain grid, basemap image and country borders (built by `tools/`), plus `planner.json` (countries, cities, airports) and `countries.bin` (which country each cell is in), built by `tools/build_planner.py`
- `supabase/`: database setup (`setup.sql`) and how to switch online play on
- `tools/`: data builders and the single-file preview builder
- `tests/`: Node tests
- `data/raw/`: notes on the source data (the downloaded tiles themselves are git-ignored)

See PROCESS.md for decisions, sources and open items.
