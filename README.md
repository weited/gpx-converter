# GPX Converter

Convert **KML** and **CSV** files to **GPX**, from the command line or in the browser. Built mainly for turning **Flightradar24** flight exports into GPX tracks (with time and speed) for apps like Fog of World, Dots of Life or FootPrint. Both share one TypeScript core (`src/core`), so they produce identical output.

## Setup

Requires Node 26+ (see `.node-version`).

```bash
npm install
npm run build        # builds the CLI (dist/) and the web app (dist-web/)
npm test
```

## CLI

### Use it from any folder

```bash
npm run build:cli    # compile src/ → dist/
npm link             # put a global `to-gpx` command on your PATH
```

- `npm link` creates a link, not a copy. The global command runs this folder's `dist/`, so after you change the code, run `npm run build:cli` again. You don't need to link again.
- The link is installed for the Node version that was active when you ran it. With fnm, if you switch to another Node version, `to-gpx` isn't found until you switch back or run `npm link` again.
- To install a fixed copy that doesn't follow your edits, run `npm install -g .` instead. You'll need to reinstall after each change.
- To remove it: `npm unlink -g gpx-converter`.

### Usage

```bash
to-gpx route.kml                                   # → route.gpx next to the input
to-gpx points.csv --mode waypoints -o pois.gpx
to-gpx log.csv --lat Latitude --lon Longitude --time "GPS Time"
to-gpx *.kml *.csv --out-dir gpx/
to-gpx exports/ --out-dir gpx/                     # every .kml/.csv/.tsv in a folder
to-gpx exports/ -r --out-dir gpx/                  # …including subfolders
cat track.csv | to-gpx - > track.gpx               # stdin → stdout
```

Without `npm link`, run `node dist/cli.js …` or `npm run cli -- …`.

| Option | Description |
| --- | --- |
| `-o, --output <file>` | Output file (single input only) |
| `-d, --out-dir <dir>` | Output directory (default: next to each input) |
| `--stdout` | Write GPX to stdout |
| `-f, --format kml\|csv` | Force input format (default: from extension, then content) |
| `--force` | Overwrite existing outputs (refused by default) |
| `-q, --quiet` | No summary output |
| `-r, --recursive` | Folder inputs: also convert files in subfolders (the folder structure is recreated under `--out-dir`) |
| `--prefer csv\|kml` | When `name.csv` and `name.kml` are in the same folder (one Flightradar24 flight), convert only this one |
| `--gpx-version 1.0\|1.1` | 1.0 (default): native `<speed>`/`<course>`. 1.1: speed/heading in Garmin TrackPointExtension |
| `-m, --mode track\|waypoints` | CSV: rows form one track (default) or become waypoints |
| `--delimiter <char>` | CSV: delimiter; auto-detects `,` `;` tab `\|` |
| `--lat/--lon/--ele/--time/--speed/--course/--name/--desc <col>` | CSV: column by header name or 0-based index |
| `--position <col>` | CSV: one column holding `"lat,lon"` |
| `--alt-unit m\|ft`, `--speed-unit m/s\|km/h\|kn\|mph` | CSV: input units (converted to meters and m/s) |
| `--group-by <col>` | CSV: start a new track whenever this column changes |
| `--no-polygons` | KML: ignore Polygon geometry |

An input can be a folder. Every `.kml`, `.csv` and `.tsv` file in it is converted. Hidden files (such as macOS `._*` files) and other file types are skipped, and subfolders are only included with `-r`. A folder with no matching files counts as a failure.

Exit code is `1` if any input fails; other inputs are still converted.

## Web app

```bash
npm run dev          # http://localhost:5173
npm run build:web    # static site in dist-web/ — host anywhere (uses relative paths)
```

Drop files onto the page, adjust CSV options, download the GPX. Conversion runs entirely client-side.

To convert a whole folder, drop the folder onto the page or click **Choose a folder…**. Every `.kml`, `.csv` and `.tsv` file in it and its subfolders is added. Hidden files and other file types are skipped.

**When a flight has both CSV and KML** works like the CLI's `--prefer`. Choose **Only convert the CSV** to get one GPX per flight; the skipped files stay in the list, greyed out. Changing the choice updates the list right away, so you don't need to drop the files again.

The UI is React 19 with React Router (`HashRouter`, so the static build needs no server rewrites). To add a page, create a component in `src/web/pages/`, add a `<Route>` in `src/web/main.tsx`, and add a link to `NAV` in `src/web/Layout.tsx`.

## Flightradar24 exports

Both FR24 export formats are detected automatically; no options needed:

```bash
to-gpx 1002_SHA_CAN_HO1853.kml 1002_SHA_CAN_HO1853.csv --out-dir gpx/
# → gpx/1002_SHA_CAN_HO1853.kml.gpx, gpx/1002_SHA_CAN_HO1853.csv.gpx
```

Each becomes a single track; every point has time, altitude (feet converted to meters), speed (knots converted to m/s) and heading. From the KML, the `Route` points are used and the duplicate `Trail` lines are skipped. When two inputs would produce the same output name, the source extension is kept (`.kml.gpx` / `.csv.gpx`).

Both files of a flight give the same points; only the track name differs. Importing both would add each flight twice to a footprint app, so for batches convert just one. The CSV is the better choice: it's about 20× smaller, and its speed and heading come from plain columns, not from text parsed out of the KML's HTML descriptions. For example:

```bash
to-gpx ~/flights -r --prefer csv --out-dir gpx/
# → one gpx/<flight>.gpx per flight; KMLs are used only where a flight has no CSV
```

Output is GPX 1.0 by default, because it has native `<speed>` and `<course>` fields. If an app needs GPX 1.1, use `--gpx-version 1.1` (or "GPX 1.1" in the web app); speed and heading are then written in a Garmin TrackPointExtension.

## What gets converted

**KML** (any nesting of Document/Folder):

| KML | GPX |
| --- | --- |
| `Point` | `<wpt>` with name, description, `TimeStamp` |
| `LineString` | `<trk>` |
| `MultiGeometry` with several lines | one `<trk>` with several `<trkseg>` |
| `gx:Track` / `gx:MultiTrack` | `<trk>` with per-point `<time>` |
| `Polygon` | `<trk>` following the outer boundary (disable with `--no-polygons`) |

**CSV**: header names are matched case-insensitively against common aliases:

- latitude: `lat`, `latitude`, `y` · longitude: `lon`, `lng`, `long`, `longitude`, `x`
- combined `"lat,lon"`: `position`, `coordinates`, `latlon`, `location`
- elevation: `ele`, `elevation`, `alt`, `altitude`, `height`, `z`
- speed: `speed`, `ground_speed`, `gs` · heading: `course`, `heading`, `direction`, `bearing`
- time: `time`, `timestamp`, `datetime`, `date`, `utc`
- name: `name`, `title`, `label` · description: `desc`, `description`, `comment`, `notes`
- track grouping: `track`, `track_id`, `track_name`, `segment`, `trip`, `callsign`, `flight`

Also handled: quoted fields (including embedded delimiters/newlines), UTF-8 BOM, decimal commas in `;`/tab-delimited files, and headerless files (assumed `lat,lon[,ele]`). Rows with invalid coordinates are skipped with a warning.

Timestamps may be ISO 8601 or Unix epoch (seconds, or milliseconds when > 1e11). **Date-times without a timezone are treated as UTC.**

## Library use

```ts
import { convert } from 'gpx-converter';

const { gpx, stats, warnings } = convert(text, { filename: 'route.kml' });
```

`parseKml`, `parseCsv` and `toGpx` are also exported to work with the intermediate `GeoData` model.

## Layout

```
src/core/   isomorphic parsing + GPX writing (Node and browser)
src/cli.ts  commander-based CLI
src/web/    React + React Router web UI, built with Vite
test/       vitest tests + fixtures
```
