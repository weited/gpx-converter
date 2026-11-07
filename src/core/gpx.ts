import type { GeoData, GeoPoint } from './types.js';

export type GpxVersion = '1.1' | '1.0';

export interface GpxWriteOptions {
  /** Value of the `creator` attribute. */
  creator?: string;
  /** Number of decimal places for lat/lon (default 7, ~1 cm). */
  precision?: number;
  /**
   * `1.0` (default): speed/course are native `<speed>`/`<course>` elements, which GPS-footprint apps read most reliably.
   * `1.1`: speed/course go in a Garmin TrackPointExtension v2 block (1.1 has no native speed element).
   */
  version?: GpxVersion;
}

const NS = {
  '1.1': 'http://www.topografix.com/GPX/1/1',
  '1.0': 'http://www.topografix.com/GPX/1/0',
  gpxtpx: 'http://www.garmin.com/xmlschemas/TrackPointExtension/v2',
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n: number, precision: number): string {
  // Trim trailing zeros so output stays compact but lossless at `precision`.
  return Number(n.toFixed(precision)).toString();
}

const has = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n);

function pointXml(tag: 'wpt' | 'trkpt', p: GeoPoint, indent: string, precision: number, version: GpxVersion): string {
  const children: string[] = [];
  // Element order follows each schema's sequence.
  if (has(p.ele)) children.push(`<ele>${fmt(p.ele, 2)}</ele>`);
  if (p.time && !Number.isNaN(p.time.getTime())) children.push(`<time>${p.time.toISOString()}</time>`);
  if (version === '1.0') {
    if (has(p.course)) children.push(`<course>${fmt(p.course, 1)}</course>`);
    if (has(p.speed)) children.push(`<speed>${fmt(p.speed, 2)}</speed>`);
  }
  if (p.name) children.push(`<name>${escapeXml(p.name)}</name>`);
  if (p.desc) children.push(`<desc>${escapeXml(p.desc)}</desc>`);
  if (version === '1.1' && tag === 'trkpt' && (has(p.speed) || has(p.course))) {
    const ext = [
      has(p.speed) ? `<gpxtpx:speed>${fmt(p.speed, 2)}</gpxtpx:speed>` : '',
      has(p.course) ? `<gpxtpx:course>${fmt(p.course, 1)}</gpxtpx:course>` : '',
    ].join('');
    children.push(`<extensions><gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension></extensions>`);
  }

  const open = `${indent}<${tag} lat="${fmt(p.lat, precision)}" lon="${fmt(p.lon, precision)}"`;
  if (children.length === 0) return `${open}/>`;
  const inner = children.map((c) => `${indent}  ${c}`).join('\n');
  return `${open}>\n${inner}\n${indent}</${tag}>`;
}

/** Serialize GeoData into a GPX 1.0 (default) or 1.1 document. */
export function toGpx(data: GeoData, options: GpxWriteOptions = {}): string {
  const creator = options.creator ?? 'gpx-converter';
  const precision = options.precision ?? 7;
  const version = options.version ?? '1.0';

  const ns = NS[version];
  const attrs =
    version === '1.1'
      ? `xmlns="${ns}" xmlns:gpxtpx="${NS.gpxtpx}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="${ns} ${ns}/gpx.xsd ${NS.gpxtpx} https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd"`
      : `xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${ns}/gpx.xsd"`;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="${version}" creator="${escapeXml(creator)}" ${attrs}>`,
  ];

  if (data.name) {
    // GPX 1.0 has <name> directly under <gpx>; 1.1 wraps it in <metadata>.
    if (version === '1.0') lines.push(`  <name>${escapeXml(data.name)}</name>`);
    else lines.push('  <metadata>', `    <name>${escapeXml(data.name)}</name>`, '  </metadata>');
  }

  // Schema order: metadata, wpt*, rte*, trk*
  for (const w of data.waypoints) lines.push(pointXml('wpt', w, '  ', precision, version));

  for (const trk of data.tracks) {
    const segments = trk.segments.filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    lines.push('  <trk>');
    if (trk.name) lines.push(`    <name>${escapeXml(trk.name)}</name>`);
    if (trk.desc) lines.push(`    <desc>${escapeXml(trk.desc)}</desc>`);
    for (const seg of segments) {
      lines.push('    <trkseg>');
      // Track points don't carry per-point names from our sources; keep them lean.
      for (const p of seg) {
        lines.push(pointXml('trkpt', { ...p, name: undefined, desc: undefined }, '      ', precision, version));
      }
      lines.push('    </trkseg>');
    }
    lines.push('  </trk>');
  }

  lines.push('</gpx>', '');
  return lines.join('\n');
}
