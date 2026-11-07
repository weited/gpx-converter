import { parseCsv, type CsvParseOptions } from './csv.js';
import { toGpx, type GpxWriteOptions } from './gpx.js';
import { parseKml, type KmlParseOptions } from './kml.js';
import { ConversionError, type GeoData, type InputFormat } from './types.js';

export * from './types.js';
export { parseCsv, tokenizeCsv, detectDelimiter, parseTimeValue } from './csv.js';
export type { CsvParseOptions, ColumnRef } from './csv.js';
export { parseKml, parseCoordinates } from './kml.js';
export type { KmlParseOptions } from './kml.js';
export { toGpx, escapeXml } from './gpx.js';
export type { GpxWriteOptions, GpxVersion } from './gpx.js';
export * from './units.js';

export interface ConvertOptions {
  /** Input format; detected from filename/content when omitted. */
  format?: InputFormat;
  /** Used for format detection and as the default GPX name. */
  filename?: string;
  csv?: CsvParseOptions;
  kml?: KmlParseOptions;
  gpx?: GpxWriteOptions;
}

export interface ConvertResult {
  gpx: string;
  format: InputFormat;
  data: GeoData;
  stats: { waypoints: number; tracks: number; trackPoints: number };
  warnings: string[];
}

/** Guess the input format from the file extension, falling back to sniffing the content. */
export function detectFormat(filename: string | undefined, content: string): InputFormat {
  const ext = filename?.toLowerCase().split('.').pop();
  if (ext === 'kml') return 'kml';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  const head = content.replace(/^﻿/, '').trimStart().slice(0, 500);
  if (head.startsWith('<') && /<kml[\s>]/i.test(head)) return 'kml';
  if (head.startsWith('<')) throw new ConversionError('Unsupported XML input (expected KML)');
  return 'csv';
}

function baseName(filename: string): string {
  const file = filename.split(/[\\/]/).pop() ?? filename;
  return file.replace(/\.[^.]+$/, '');
}

/** Convert KML or CSV text to a GPX 1.1 string. */
export function convert(content: string, options: ConvertOptions = {}): ConvertResult {
  const format = options.format ?? detectFormat(options.filename, content);
  const data = format === 'kml' ? parseKml(content, options.kml) : parseCsv(content, options.csv);
  if (!data.name && options.filename) data.name = baseName(options.filename);

  // Name unnamed CSV tracks after the file so they're identifiable in GPX apps.
  if (format === 'csv' && options.filename) {
    for (const t of data.tracks) t.name ??= baseName(options.filename);
  }

  const gpx = toGpx(data, options.gpx);
  const trackPoints = data.tracks.reduce((n, t) => n + t.segments.reduce((m, s) => m + s.length, 0), 0);
  return {
    gpx,
    format,
    data,
    stats: { waypoints: data.waypoints.length, tracks: data.tracks.length, trackPoints },
    warnings: data.warnings ?? [],
  };
}

/** Replace the extension of a filename with `.gpx`. */
export function gpxFilename(filename: string): string {
  return `${baseName(filename)}.gpx`;
}

/**
 * Output names for a batch of inputs. Inputs that would collide (e.g. Flightradar24's
 * `flight.kml` + `flight.csv`) keep their source extension: `flight.kml.gpx`, `flight.csv.gpx`.
 */
export function uniqueGpxFilenames(filenames: string[]): string[] {
  const plain = filenames.map(gpxFilename);
  const counts = new Map<string, number>();
  for (const n of plain) counts.set(n, (counts.get(n) ?? 0) + 1);
  return filenames.map((f, i) => {
    if (counts.get(plain[i])! < 2) return plain[i];
    const file = f.split(/[\\/]/).pop() ?? f;
    return `${file}.gpx`;
  });
}
