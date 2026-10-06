# Vamos

Get from A to B without a plane. Vamos is a browser game: you get a start and a finish somewhere in the world, and you draw your route on the map one leg at a time, choosing how to travel each leg. The options are walking, running, a bicycle, a skateboard, a car, hitchhiking, a train, a boat, a sailboat, a kayak, swimming, a paraglider, a dog sled, a hot air balloon, a giant tortoise, a human cannonball or a rocket. Then you watch a stick figure make the trip, and you're graded against the best route the game can find.

Live site (once GitHub Pages is on): https://batancr.github.io/Vamos/

## How it plays
- Draw your route as lines: tap to add stops, or press ✏️ and drag to draw freehand. Tap any line (on the map or in the list) to change how you travel it.
- Zoom in (down to about 9 m per pixel) and the map switches to satellite imagery; 🛰️ swaps it for streets and roads (OpenStreetMap) or the plain relief map, and has on/off switches for each kind of stop and for terrain shading (desert, grassland, jungle, ice and snow).
- **Stops:** ⚓ ports, 🪂 paragliding hills and 🎈 balloon sites are tap targets. Picking dog sled or paraglider shades where it can go.
- **Auto-stop:** aim a leg too far and it stops at the limit, for example a boat stops at the coast and a car stops at the water's edge, so you can switch mode and carry on.
- **Characters:** Traveller, Fox, Rabbit, Camel, Monkey, Penguin, Mountaineer, Mermaid, Genie, Thunder God, Caped Hero, Star Knight, Relic Hunter and Web Slinger, each with a power. Some are faster on certain terrain: Rabbit on grassland, Camel in deserts, Monkey and Fox in jungle, Penguin on ice and snow. The best route uses your character too. All free for now. 🔭 opens Google Street View or Google's satellite map at the middle of the map.
- **Challenge friends:** after a trip, send a link. Friends play the same trip in Fair mode and send theirs back, and everyone who plays lands on one leaderboard, with their routes shown once you finish. **Custom** lets you tap any start and finish and name them.
- **Online (once switched on):** make an account to keep stats and badges, play the daily trip **Ranked** for up to 1,000 points (1,000 × best route ÷ your time, first finish only), and post or accept **1v1** games in the lobby or challenge a player by username. Setup steps are in `supabase/README.md`.
- **Danger:** Off (the classic game), Easy, Medium, Hard, Nightmare or Custom. Easy brings small hiccups (train delays, flat tyres); Medium adds crashes, dodgy hitchhiking lifts, rocket faults and an energy meter; Hard adds wind, ice, heat and getting lost in the jungle, and running out of energy kills you; Nightmare makes everything likelier, some crashes fatal, and even the tortoise risky. Custom has an overall odds slider and one per mode. Each line shows its accident risk and the energy left after it; accidents are rolled when you press Vamos!, the same for everyone on the same trip and route. Terrain characters are safer at home (Camel in deserts, Penguin on ice, Monkey and Fox in jungle). Danger travels with challenge links and 1v1s; ranked is always Off.
- There's a new trip every day ("Trip #N"), plus random practice trips.
- Rule sets: Classic, Human power, Triathlon, No wheels, Zoo Bonanza (horse, camel ride, elephant, sled dogs, tortoise), Balloonatic, Rocket Man, Silly season.
- Real terrain matters. Hills slow walking and cycling, mountains slow cars and trains, balloons crash into peaks above 4,500 m, boats need water and cars need land.
- People need sleep, so each mode only moves for part of the day. Rockets only fly between real spaceports.
- Altitude sickness, seasickness and cold water add time.
- Big lakes (the Great Lakes, Victoria, Baikal, Titicaca and others) are water: swim, kayak or take a boat.
- Some modes have their own rules. Paragliders launch from hills and fly at most 150 km a leg. Dog sleds need snow. Hitchhiking waits 0 to 6 hours for each lift, and everyone gets the same luck on the daily trip.
- **Stats and badges.** Doing an activity makes you a little faster at it (up to +15%), and odd feats earn badges. Fair mode, on by default for the daily trip, puts everyone at base speed. With it off, the best route is worked out at your stats too, so the grade measures planning, not hours played. Progress stays in your browser; a backup code moves it to another device.
- The result card is plain text you can paste anywhere.

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
  - `online.js`: accounts, ranked play and the 1v1 lobby (Supabase)
  - `worker.js`: runs the solver off the main thread
  - `data/`: terrain grid, basemap image and country borders (built by `tools/`)
- `supabase/`: database setup (`setup.sql`) and how to switch online play on
- `tools/`: data builders and the single-file preview builder
- `tests/`: Node tests
- `data/raw/`: notes on the source data (the downloaded tiles themselves are git-ignored)

See PROCESS.md for decisions, sources and open items.
