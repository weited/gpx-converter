# AGENTS.md

This file provides guidance to AI agents (like Claude or Codex) when working with code in this repository.

## Commands

```bash
npm run build          # build:cli (tsc → dist/) + build:web (vite → dist-web/)
npm run dev            # Vite dev server for the web UI (http://localhost:5173)
npm test               # vitest run (all tests)
npx vitest run -t "KML"                 # run tests whose name matches
npx vitest run test/convert.test.ts     # run one file
npm run typecheck      # checks BOTH tsconfig.json (Node) and tsconfig.web.json (browser)
node dist/cli.js <files...>             # run the CLI after build:cli (bin name: to-gpx)
```

There is no linter configured.

The project targets **Node 26** (`.node-version`, read by fnm; `engines` requires ≥ 26). `@types/node` is kept on the same major as the runtime. Non-interactive shells don't run fnm's `--use-on-cd` hook, so they get fnm's *default* version; if `node -v` isn't 26, prefix commands with `fnm exec --using=26.13.0 -- …`.

npm 11 blocks dependency install scripts by default; `fsevents` is listed as pending and is intentionally left unapproved (its script only rebuilds an already-bundled binary).

TypeScript is v7 (the native Go compiler); `tsc` works as usual. `tsconfig.web.json` needs `"types": ["vite/client"]` for CSS/asset imports to type-check.

## Architecture

KML/CSV → GPX converter with a CLI and a browser UI sharing one core.

- `src/core/` is **isomorphic**: it must run unchanged in Node (CLI, tests) and in the browser (Vite bundle). Don't import `node:*` modules here or use browser-only globals. XML is parsed with `@xmldom/xmldom` in both environments; `kml.ts` uses structural typing (`El`) rather than DOM lib types so it compiles under the Node tsconfig, which has no `DOM` lib.
- Data flow: `parseKml` / `parseCsv` → `GeoData` (`types.ts`: waypoints + tracks of segments, plus non-fatal `warnings` and an optional detected `source`) → `toGpx` (`gpx.ts`). `GeoPoint` values are always normalized SI-ish units: `ele` meters, `speed` m/s, `course` degrees; parsers convert on the way in via `units.ts`. `convert()` in `core/index.ts` is the single entry point used by both frontends; it handles format detection (extension first, then content sniffing), defaults the GPX/track name to the input file's base name, and computes stats.
- `src/cli.ts` (commander) and the web UI are thin wrappers around `convert()`. A new CSV option generally needs wiring in three places: `CsvParseOptions` in `core/csv.ts`, a CLI flag, and `CsvFormValues` / `toCsvOptions()` / the form in `src/web/components/CsvOptionsForm.tsx`.
- Web UI is React 19 + React Router 8 (`HashRouter` in `src/web/main.tsx`, chosen so the `base: './'` static build works on any host). `Layout.tsx` holds the nav (`NAV` array) and `<Outlet>`; pages live in `src/web/pages/`. Adding a page = new page component + `<Route>` in `main.tsx` + `NAV` entry. `ConverterPage` keeps raw file text in state and re-derives conversion results with `useMemo`, so changing options re-converts all files.
- Folder inputs: `isConvertibleFilename()` (core, `.kml`/`.csv`/`.tsv`, no dotfiles) decides which files a folder contributes, in both frontends. The CLI expands folders in `expandInputs()` (subfolders only with `-r`, mirrored under `--out-dir`); the web UI handles dropped folders and the `webkitdirectory` picker in `src/web/lib/folder.ts` (always recursive). Explicitly given files are not filtered.
- `--prefer csv|kml` (CLI) and the "When a flight has both CSV and KML" select (web) both use `findPairedDuplicates()` in core: files are paired by same folder + same base name (`.tsv` counts as CSV), and only the non-preferred file of a pair is dropped. It runs before `uniqueGpxFilenames()`, so the kept file gets a plain `name.gpx`. The web UI keeps skipped files in the list (greyed out) so toggling the choice needs no re-drop.
- Output names come from `uniqueGpxFilenames()` in both frontends: inputs that would collide in the same output directory keep their extension (`flight.kml.gpx`, `flight.csv.gpx`).
- User-facing failures are thrown as `ConversionError`; recoverable issues (e.g. skipped CSV rows) go into `GeoData.warnings` instead of throwing.

### Flightradar24 support (primary real-world use case)

The main purpose is turning Flightradar24 flight exports into GPX tracks with time and speed for import into GPS-footprint apps (Fog of World, Dots of Life, FootPrint). `example/` holds a real export pair. Both formats are auto-detected and must each produce **one track, no waypoints**, with time, elevation (m), speed (m/s) and course on every point:

- **CSV** (`Timestamp,UTC,Callsign,Position,Altitude,Speed,Direction`): detected by `isFlightradar24()` in `csv.ts` (all seven headers present). `Position` is a quoted `"lat,lon"` column; altitude is **feet** and speed **knots** (these become the default units only for FR24; explicit `altitudeUnit`/`speedUnit` still win). `Timestamp` is epoch seconds. The track is named from `Callsign` via the `groupBy` alias.
- **KML**: detected by `parseFlightradar24()` in `kml.ts` (a `Route` folder whose placemark descriptions contain `Speed:`, plus a `Trail` folder). Each `Route` Point is a position report: altitude in the coordinates is already **meters**; speed (`448 kt`) and heading are only in the CDATA HTML description (heading also in `IconStyle/heading`) and are regex-parsed. `Trail` repeats the same path as 2-point LineStrings and is ignored. Points are sorted by time.
- The CSV and KML of the same flight should yield matching points; a test asserts this.

Speed/course output: **GPX 1.0 is the default** (core `toGpx`, CLI `--gpx-version`, and the web "Output format" select), because 1.0 has native `<course>`/`<speed>` elements (written after `<time>`, before `<name>`) and footprint apps are more likely to read those than extensions. In 1.0, `<name>` sits directly under `<gpx>` (no `<metadata>`). `--gpx-version 1.1` instead writes speed/course as Garmin `gpxtpx:TrackPointExtension` v2 (`speed` then `course`, schema order), since 1.1 has no speed element. Which format each footprint app actually reads has not been verified.

### Behaviors that are easy to break

- CSV column detection uses alias lists in `csv.ts` (`ALIASES`, including `position`, `speed`, `course`, and `callsign`/`flight` as track-grouping columns); headers are normalized (lowercased, spaces/`-`/`.` → `_`). A header row is assumed unless the first two cells of row 1 are numeric; headerless files default to `lat,lon[,ele]`. A combined `position` column is used only when separate lat/lon columns are absent.
- Non-comma delimiters enable decimal-comma parsing (`48,85` → `48.85`).
- Timestamps without a timezone are deliberately parsed as **UTC**; numeric timestamps are epoch seconds, or milliseconds when > 1e11.
- KML: `Point` → `<wpt>`; `LineString`, `gx:Track`, and Polygon outer rings → `<trk>`; a `MultiGeometry` with several lines becomes one track with multiple `<trkseg>`. Element matching is by `localName`, so `gx:` prefixes don't matter.
- GPX output must keep schema element order (1.1: metadata, wpt, trk; 1.0: name, wpt, trk). Track points intentionally drop per-point name/desc.
- The CLI refuses to overwrite existing outputs without `--force`, and keeps processing remaining inputs after a failure (exit code 1 at the end).

## Build configuration quirks

- `vite.config.ts` sets `root: 'src/web'`, so a separate `vitest.config.ts` exists to make vitest find `test/**/*.test.ts`. Keep them separate.
- Package is ESM (`"type": "module"`, `NodeNext`): relative imports in `src/` need explicit `.js` extensions, including imports of `.tsx` files in the web UI (Vite resolves them).
- `tsconfig.json` (CLI/library, emits `dist/`, target/lib ES2024 — the CLI uses `Map.groupBy`) excludes `src/web`; `tsconfig.web.json` (no emit, `jsx: react-jsx`, DOM lib) covers `src/core` + `src/web`. `npm run typecheck` runs both.
- Test fixtures are in `test/fixtures/` (`fr24.csv` / `fr24.kml` are trimmed from the real export); `example/` contains the full Flightradar24 export pair for manual testing: `node dist/cli.js example/* --out-dir <dir>`.
