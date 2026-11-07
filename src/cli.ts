#!/usr/bin/env node
import { access, readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import {
  convert,
  gpxFilename,
  findPairedDuplicates,
  isConvertibleFilename,
  uniqueGpxFilenames,
  ConversionError,
  parseLengthUnit,
  parseSpeedUnit,
  LENGTH_UNITS,
  SPEED_UNITS,
  type CsvParseOptions,
  type GpxVersion,
  type InputFormat,
  type LengthUnit,
  type SpeedUnit,
} from './core/index.js';

interface CliOptions {
  output?: string;
  outDir?: string;
  stdout?: boolean;
  format?: InputFormat;
  mode?: 'track' | 'waypoints';
  delimiter?: string;
  lat?: string;
  lon?: string;
  position?: string;
  ele?: string;
  time?: string;
  speed?: string;
  course?: string;
  altUnit?: LengthUnit;
  speedUnit?: SpeedUnit;
  gpxVersion: GpxVersion;
  name?: string;
  desc?: string;
  groupBy?: string;
  polygons: boolean;
  force?: boolean;
  quiet?: boolean;
  recursive?: boolean;
  prefer?: InputFormat;
}

function choice<T extends string>(allowed: readonly T[]) {
  return (value: string): T => {
    if (!allowed.includes(value as T)) throw new InvalidArgumentError(`Allowed: ${allowed.join(', ')}`);
    return value as T;
  };
}

function unitParser<T>(parse: (raw: string) => T | undefined, allowed: readonly string[]) {
  return (value: string): T => {
    const unit = parse(value);
    if (unit === undefined) throw new InvalidArgumentError(`Allowed: ${allowed.join(', ')}`);
    return unit;
  };
}

function parseDelimiter(value: string): string {
  const named: Record<string, string> = { tab: '\t', '\\t': '\t', comma: ',', semicolon: ';', pipe: '|' };
  const d = named[value.toLowerCase()] ?? value;
  if (d.length !== 1) throw new InvalidArgumentError('Delimiter must be a single character (or tab/comma/semicolon/pipe)');
  return d;
}

/** One file to convert. `relDir` is its subfolder inside a folder input ('' otherwise), mirrored under --out-dir. */
interface Job {
  input: string;
  relDir: string;
}

/** Expand folder inputs into the convertible files they contain; plain files and "-" pass through. */
async function expandInputs(inputs: string[], recursive: boolean): Promise<{ jobs: Job[]; errors: string[] }> {
  const jobs: Job[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const add = (input: string, relDir: string) => {
    const key = input === '-' ? '-' : path.resolve(input);
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ input, relDir });
  };

  const walk = async (dir: string, relDir: string): Promise<number> => {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    let found = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) found += await walk(full, path.join(relDir, entry.name));
      } else if (isConvertibleFilename(entry.name)) {
        add(full, relDir);
        found++;
      }
    }
    return found;
  };

  for (const input of inputs) {
    const info = input === '-' ? undefined : await stat(input).catch(() => undefined);
    if (!info?.isDirectory()) {
      add(input, ''); // missing files are reported when read
      continue;
    }
    const found = await walk(input, '');
    if (found === 0) {
      errors.push(
        `${input}: no .kml/.csv/.tsv files found${recursive ? '' : ' (use --recursive to include subfolders)'}`,
      );
    }
  }
  return { jobs, errors };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const program = new Command();

program
  .name('to-gpx')
  .description('Convert KML and CSV files to GPX (1.0 by default, or 1.1)')
  .version('1.0.0')
  .argument('<inputs...>', 'input .kml / .csv files or folders of them (use "-" for stdin)')
  .option('-r, --recursive', 'folders: also convert files in subfolders (mirrored under --out-dir)')
  .option(
    '--prefer <format>',
    'when name.csv and name.kml sit side by side (e.g. one Flightradar24 flight), convert only this one: csv | kml',
    choice(['csv', 'kml'] as const),
  )
  .option('-o, --output <file>', 'output file (single input only)')
  .option('-d, --out-dir <dir>', 'directory for output files (default: next to each input)')
  .option('--stdout', 'write GPX to stdout instead of a file')
  .option('-f, --format <format>', 'force input format: kml | csv', choice(['kml', 'csv'] as const))
  .option('--force', 'overwrite existing output files')
  .option('-q, --quiet', 'suppress summary output')
  .option(
    '--gpx-version <version>',
    'GPX 1.0 (native <speed>/<course>) or 1.1 (speed/course in Garmin TrackPointExtension)',
    choice(['1.0', '1.1'] as const),
    '1.0',
  )
  .option('-m, --mode <mode>', 'CSV: rows become a "track" or "waypoints"', choice(['track', 'waypoints'] as const), 'track')
  .option('--delimiter <char>', 'CSV: delimiter (auto-detected; accepts tab/comma/semicolon/pipe)', parseDelimiter)
  .option('--lat <col>', 'CSV: latitude column (header name or 0-based index)')
  .option('--lon <col>', 'CSV: longitude column')
  .option('--position <col>', 'CSV: combined "lat,lon" column (used when there are no separate lat/lon columns)')
  .option('--ele <col>', 'CSV: elevation column')
  .option('--time <col>', 'CSV: timestamp column (ISO 8601 or Unix epoch s/ms)')
  .option('--speed <col>', 'CSV: speed column')
  .option('--course <col>', 'CSV: course/heading column (degrees)')
  .option('--alt-unit <unit>', 'CSV: elevation unit: m | ft (default m; ft for Flightradar24)', unitParser(parseLengthUnit, LENGTH_UNITS))
  .option('--speed-unit <unit>', 'CSV: speed unit: m/s | km/h | kn | mph (default m/s; kn for Flightradar24)', unitParser(parseSpeedUnit, SPEED_UNITS))
  .option('--name <col>', 'CSV: name column')
  .option('--desc <col>', 'CSV: description column')
  .option('--group-by <col>', 'CSV: start a new track whenever this column changes')
  .option('--no-polygons', 'KML: ignore Polygon geometry')
  .addHelpText(
    'after',
    `
Examples:
  $ to-gpx route.kml
  $ to-gpx points.csv --mode waypoints -o pois.gpx
  $ to-gpx log.csv --lat Latitude --lon Longitude --time "GPS Time"
  $ to-gpx *.kml *.csv --out-dir gpx/
  $ to-gpx exports/ --out-dir gpx/      # every .kml/.csv/.tsv in the folder
  $ to-gpx exports/ -r --out-dir gpx/   # including subfolders
  $ to-gpx exports/ -r --prefer csv     # one GPX per flight when both CSV and KML exist
  $ cat track.csv | to-gpx - --stdout > track.gpx
  $ to-gpx flight.kml flight.csv      # Flightradar24 exports are detected automatically
  $ to-gpx flight.csv --gpx-version 1.1`,
  )
  .action(async (args: string[], opts: CliOptions) => {
    if (opts.output && opts.stdout) program.error('--output and --stdout are mutually exclusive');
    const log = (msg: string) => {
      if (!opts.quiet) process.stderr.write(msg + '\n');
    };
    const expanded = await expandInputs(args, opts.recursive ?? false);
    const { errors } = expanded;

    // --prefer: of a same-named CSV/KML pair (one Flightradar24 flight), convert only one.
    const resolved = expanded.jobs.filter((j) => j.input !== '-').map((j) => path.resolve(j.input));
    const skipped = findPairedDuplicates(resolved, opts.prefer);
    const jobs = expanded.jobs.filter((j) => j.input === '-' || !skipped.has(path.resolve(j.input)));
    for (const j of expanded.jobs) {
      const kept = j.input !== '-' && skipped.get(path.resolve(j.input));
      if (kept) log(`${j.input}: skipped (using ${path.basename(kept)} instead)`);
    }

    if (opts.output && jobs.length > 1) {
      program.error('--output can only be used with a single input; use --out-dir for multiple files');
    }

    const csv: CsvParseOptions = {
      mode: opts.mode,
      delimiter: opts.delimiter,
      lat: opts.lat,
      lon: opts.lon,
      position: opts.position,
      ele: opts.ele,
      time: opts.time,
      speed: opts.speed,
      course: opts.course,
      altitudeUnit: opts.altUnit,
      speedUnit: opts.speedUnit,
      name: opts.name,
      desc: opts.desc,
      groupBy: opts.groupBy,
    };

    let failures = errors.length;
    for (const e of errors) process.stderr.write(`error: ${e}\n`);
    if (opts.outDir) await mkdir(opts.outDir, { recursive: true });

    // Outputs that share a directory must not collide (e.g. flight.kml + flight.csv).
    const outDirOf = ({ input, relDir }: Job) => (opts.outDir ? path.join(opts.outDir, relDir) : path.dirname(input));
    const outNames = new Map<Job, string>();
    const byDir = Map.groupBy(
      jobs.filter((j) => j.input !== '-'),
      (j) => path.resolve(outDirOf(j)),
    );
    for (const group of byDir.values()) {
      uniqueGpxFilenames(group.map((j) => j.input)).forEach((name, i) => outNames.set(group[i], name));
    }

    for (const job of jobs) {
      const { input } = job;
      const isStdin = input === '-';
      try {
        const content = isStdin ? await readStdin() : await readFile(input, 'utf8');
        const result = convert(content, {
          format: opts.format,
          filename: isStdin ? undefined : input,
          csv,
          kml: { includePolygons: opts.polygons },
          gpx: { version: opts.gpxVersion },
        });

        const { waypoints, tracks, trackPoints } = result.stats;
        const source = result.data.source ? ` (${result.data.source})` : '';
        const summary = `${result.format.toUpperCase()}${source} → ${waypoints} waypoint(s), ${tracks} track(s), ${trackPoints} track point(s)`;

        if (opts.stdout || (isStdin && !opts.output)) {
          process.stdout.write(result.gpx);
          log(`${isStdin ? 'stdin' : input}: ${summary}`);
        } else {
          const outName = outNames.get(job) ?? gpxFilename(input);
          const outPath = opts.output ?? path.join(outDirOf(job), outName);
          if (path.resolve(outPath) === path.resolve(input)) throw new ConversionError('Output would overwrite the input');
          if (!opts.force && (await exists(outPath))) {
            throw new ConversionError(`${outPath} already exists (use --force to overwrite)`);
          }
          if (job.relDir) await mkdir(path.dirname(outPath), { recursive: true });
          await writeFile(outPath, result.gpx, 'utf8');
          log(`${input} → ${outPath}: ${summary}`);
        }
        for (const w of result.warnings) log(`  warning: ${w}`);
      } catch (err) {
        failures++;
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`error: ${input}: ${msg}\n`);
      }
    }

    if (failures > 0) process.exitCode = 1;
  });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

program.parseAsync().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
