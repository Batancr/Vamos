# Vamos

Get from A to B without a plane. Vamos is a browser game: you get a start and a finish somewhere in the world, and you draw your route on the map one leg at a time, choosing how to travel each leg. The options are walking, running, a bicycle, a skateboard, a car, a train, a boat, swimming, a hot air balloon or a rocket. Then you watch a stick figure make the trip, and you're graded against the best route the game can find.

Live site (once GitHub Pages is on): https://batancr.github.io/Vamos/

## How it plays
- There's a new trip every day ("Trip #N"), plus random practice trips.
- Rule sets: Classic, Human power, Triathlon, No wheels, Balloonatic, Rocket Man.
- Real terrain matters. Hills slow walking and cycling, mountains slow cars and trains, balloons crash into peaks above 4,500 m, boats need water and cars need land.
- People need sleep, so each mode only moves for part of the day. Rockets only fly between real spaceports.
- Altitude sickness, seasickness and cold water add time.
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
  - `worker.js`: runs the solver off the main thread
  - `data/`: terrain grid, basemap image and country borders (built by `tools/`)
- `tools/`: data builders and the single-file preview builder
- `tests/`: Node tests
- `data/raw/`: notes on the source data (the downloaded tiles themselves are git-ignored)

See PROCESS.md for decisions, sources and open items.
