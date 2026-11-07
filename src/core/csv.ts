import { ConversionError, type GeoData, type GeoPoint, type Track } from './types.js';
import { toMeters, toMetersPerSecond, type LengthUnit, type SpeedUnit } from './units.js';

/** A column reference: header name (case-insensitive) or 0-based index. */
export type ColumnRef = string | number;

export interface CsvParseOptions {
  /** `track`: rows form a track (default). `waypoints`: each row becomes a waypoint. */
  mode?: 'track' | 'waypoints';
  /** Field delimiter. Auto-detected from `, ; \t |` when omitted. */
  delimiter?: string;
  lat?: ColumnRef;
  lon?: ColumnRef;
  /** A single column holding "lat,lon" (or "lat lon"), used when there are no separate lat/lon columns. */
  position?: ColumnRef;
  ele?: ColumnRef;
  time?: ColumnRef;
  speed?: ColumnRef;
  course?: ColumnRef;
  name?: ColumnRef;
  desc?: ColumnRef;
  /** In track mode, start a new track whenever this column's value changes. */
  groupBy?: ColumnRef;
  /** Track name used when there is no group column (default: none). */
  trackName?: string;
  /** Unit of the elevation column (default `m`, or `ft` for Flightradar24 exports). */
  altitudeUnit?: LengthUnit;
  /** Unit of the speed column (default `m/s`, or `kn` for Flightradar24 exports). */
  speedUnit?: SpeedUnit;
}

type ColumnKey = 'lat' | 'lon' | 'position' | 'ele' | 'time' | 'speed' | 'course' | 'name' | 'desc' | 'groupBy';

const ALIASES: Record<ColumnKey, string[]> = {
  lat: ['lat', 'latitude', 'lat_deg', 'latitude_deg', 'y'],
  lon: ['lon', 'lng', 'long', 'longitude', 'lon_deg', 'longitude_deg', 'x'],
  position: ['position', 'coordinates', 'coords', 'latlon', 'lat_lon', 'latlng', 'lat_lng', 'location'],
  ele: ['ele', 'elevation', 'alt', 'altitude', 'height', 'altitude_m', 'elevation_m', 'z'],
  time: ['time', 'timestamp', 'datetime', 'date_time', 'utc', 'time_utc', 'date'],
  speed: ['speed', 'ground_speed', 'groundspeed', 'gs', 'speed_mps', 'velocity'],
  course: ['course', 'heading', 'direction', 'bearing', 'track_angle', 'cog'],
  name: ['name', 'title', 'label'],
  desc: ['desc', 'description', 'comment', 'notes', 'note'],
  groupBy: ['track', 'track_id', 'trackid', 'track_name', 'segment', 'trip', 'trip_id', 'callsign', 'flight'],
};

/** Flightradar24 CSV export: Timestamp,UTC,Callsign,Position,Altitude,Speed,Direction (feet, knots). */
function isFlightradar24(headers: string[]): boolean {
  return ['timestamp', 'utc', 'callsign', 'position', 'altitude', 'speed', 'direction'].every((h) => headers.includes(h));
}

/** RFC 4180-style CSV tokenizer supporting quoted fields, escaped quotes and CRLF. */
export function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((l) => tokenizeCsv(l, d)[0]?.length ?? 0);
    if (counts.length === 0 || counts[0] < 2) continue;
    // Prefer delimiters that give a consistent, larger column count.
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0];
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-.]+/g, '_').replace(/[()[\]]/g, '');
}

function resolveColumn(ref: ColumnRef | undefined, headers: string[] | null, label: string): number | undefined {
  if (ref === undefined) return undefined;
  if (typeof ref === 'number' || /^\d+$/.test(ref)) {
    const idx = Number(ref);
    if (headers && idx >= headers.length) throw new ConversionError(`Column index ${idx} for ${label} is out of range`);
    return idx;
  }
  if (!headers) throw new ConversionError(`Column "${ref}" for ${label} given by name, but the CSV has no header row`);
  const idx = headers.indexOf(normalizeHeader(ref));
  if (idx < 0) throw new ConversionError(`Column "${ref}" for ${label} not found. Available: ${headers.join(', ')}`);
  return idx;
}

function findAlias(headers: string[], key: keyof typeof ALIASES): number | undefined {
  for (const alias of ALIASES[key]) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return undefined;
}

function parseNumber(raw: string | undefined, decimalComma: boolean): number {
  if (raw === undefined) return NaN;
  let s = raw.trim();
  if (s === '') return NaN;
  if (decimalComma) s = s.replace(',', '.');
  return Number(s);
}

/**
 * Parse a timestamp. Numbers are treated as Unix epoch (seconds, or milliseconds when > 1e11).
 * Date-time strings without a timezone are interpreted as UTC so results don't depend on the machine.
 */
export function parseTimeValue(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return new Date(Math.abs(n) > 1e11 ? n : n * 1000);
  }
  let iso = s;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)$/.exec(s);
  if (m) {
    const clock = m[2][1] === ':' ? `0${m[2]}` : m[2]; // "9:05" -> "09:05"
    iso = `${m[1]}T${clock}Z`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse CSV text into GeoData. Lat/lon columns are detected from common header names. */
export function parseCsv(text: string, options: CsvParseOptions = {}): GeoData {
  const clean = text.replace(/^﻿/, '');
  const delimiter = options.delimiter ?? detectDelimiter(clean);
  const rows = tokenizeCsv(clean, delimiter);
  if (rows.length === 0) throw new ConversionError('CSV file is empty');

  // A header row is one where the first two cells are not both numeric.
  const first = rows[0];
  const decimalComma = delimiter !== ',';
  const looksNumeric = (v: string | undefined) => Number.isFinite(parseNumber(v, decimalComma));
  const hasHeader = !(looksNumeric(first[0]) && looksNumeric(first[1]));
  const headers = hasHeader ? first.map(normalizeHeader) : null;
  const body = hasHeader ? rows.slice(1) : rows;

  const pick = (key: ColumnKey) => {
    const explicit = resolveColumn(options[key], headers, key);
    return explicit ?? (headers ? findAlias(headers, key) : undefined);
  };
  const col = {
    lat: pick('lat'),
    lon: pick('lon'),
    position: pick('position'),
    ele: pick('ele'),
    time: pick('time'),
    speed: pick('speed'),
    course: pick('course'),
    name: pick('name'),
    desc: pick('desc'),
    groupBy: pick('groupBy'),
  };

  const fr24 = headers !== null && isFlightradar24(headers);
  const altitudeUnit = options.altitudeUnit ?? (fr24 ? 'ft' : 'm');
  const speedUnit = options.speedUnit ?? (fr24 ? 'kn' : 'm/s');

  // A combined "lat,lon" column is only used when separate lat/lon columns are absent.
  const usePosition = (col.lat === undefined || col.lon === undefined) && col.position !== undefined;

  if (!usePosition && (col.lat === undefined || col.lon === undefined)) {
    if (!headers) {
      // Headerless numeric CSV: assume lat, lon[, ele].
      col.lat = 0;
      col.lon = 1;
      if (first.length > 2 && looksNumeric(first[2])) col.ele = 2;
    } else {
      throw new ConversionError(
        `Could not find latitude/longitude columns. Headers: ${headers.join(', ')}. ` +
          'Specify them explicitly (CLI: --lat <col> --lon <col>, or --position <col> for a combined "lat,lon" column).',
      );
    }
  }

  const warnings: string[] = [];
  const mode = options.mode ?? 'track';
  const data: GeoData = { waypoints: [], tracks: [], warnings };
  if (fr24) data.source = 'Flightradar24';
  let current: Track | undefined;
  let currentGroup: string | undefined;
  let skipped = 0;

  const num = (c: number | undefined, r: string[]) => (c === undefined ? NaN : parseNumber(r[c], decimalComma));

  body.forEach((r, i) => {
    let lat: number;
    let lon: number;
    if (usePosition) {
      // "lat,lon" or "lat lon"; the field was quoted in the CSV, so commas here are separators, not decimals.
      [lat, lon] = (r[col.position!] ?? '').split(/[,\s;]+/).filter(Boolean).map(Number);
    } else {
      lat = num(col.lat, r);
      lon = num(col.lon, r);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      skipped++;
      if (skipped <= 5) warnings.push(`Row ${i + (hasHeader ? 2 : 1)}: invalid coordinates, skipped`);
      return;
    }
    const p: GeoPoint = { lat, lon };
    const ele = num(col.ele, r);
    if (Number.isFinite(ele)) p.ele = toMeters(ele, altitudeUnit);
    const speed = num(col.speed, r);
    if (Number.isFinite(speed) && speed >= 0) p.speed = toMetersPerSecond(speed, speedUnit);
    const course = num(col.course, r);
    if (Number.isFinite(course)) p.course = ((course % 360) + 360) % 360;
    if (col.time !== undefined) {
      const t = parseTimeValue(r[col.time]);
      if (t) p.time = t;
    }
    const name = col.name !== undefined ? r[col.name]?.trim() : undefined;
    const desc = col.desc !== undefined ? r[col.desc]?.trim() : undefined;
    if (name) p.name = name;
    if (desc) p.desc = desc;

    if (mode === 'waypoints') {
      data.waypoints.push(p);
      return;
    }

    const group = col.groupBy !== undefined ? (r[col.groupBy] ?? '').trim() : '';
    if (!current || group !== currentGroup) {
      current = { name: col.groupBy !== undefined ? group || undefined : options.trackName, segments: [[]] };
      currentGroup = group;
      data.tracks.push(current);
    }
    current.segments[0].push(p);
  });

  if (skipped > 5) warnings.push(`...and ${skipped - 5} more invalid rows skipped`);
  if (data.waypoints.length === 0 && data.tracks.length === 0) {
    throw new ConversionError('No valid coordinate rows found in CSV');
  }
  return data;
}
