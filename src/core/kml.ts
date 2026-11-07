import { DOMParser } from '@xmldom/xmldom';
import { ConversionError, type GeoData, type GeoPoint, type Track } from './types.js';
import { parseLengthUnit, parseSpeedUnit, toMeters, toMetersPerSecond } from './units.js';

export interface KmlParseOptions {
  /** Convert Polygon outer boundaries into tracks (default true). */
  includePolygons?: boolean;
}

// Minimal structural typing so this module works with xmldom in Node and the bundled build in browsers.
type El = {
  localName: string | null;
  nodeType: number;
  childNodes: ArrayLike<unknown>;
  textContent: string | null;
};

const ELEMENT_NODE = 1;

function children(el: El): El[] {
  const out: El[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i] as El;
    if (n.nodeType === ELEMENT_NODE) out.push(n);
  }
  return out;
}

function child(el: El, name: string): El | undefined {
  return children(el).find((c) => c.localName === name);
}

function childText(el: El, name: string): string | undefined {
  const t = child(el, name)?.textContent?.trim();
  return t ? t : undefined;
}

/** Depth-first search for descendants by local name (namespace-agnostic, so `gx:Track` matches `Track`). */
function descendants(el: El, name: string, stopAt?: string): El[] {
  const out: El[] = [];
  const walk = (node: El) => {
    for (const c of children(node)) {
      if (c.localName === name) out.push(c);
      if (stopAt && c.localName === stopAt) continue;
      walk(c);
    }
  };
  walk(el);
  return out;
}

function parseTime(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse a KML `<coordinates>` body: whitespace-separated "lon,lat[,alt]" tuples. */
export function parseCoordinates(text: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    if (!tuple) continue;
    const [lon, lat, alt] = tuple.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const p: GeoPoint = { lat, lon };
    if (Number.isFinite(alt)) p.ele = alt;
    points.push(p);
  }
  return points;
}

/** Parse a `<gx:Track>`: parallel lists of `<when>` and `<gx:coord>` ("lon lat alt"). */
function parseGxTrack(el: El): GeoPoint[] {
  const kids = children(el);
  const whens = kids.filter((c) => c.localName === 'when').map((c) => parseTime(c.textContent?.trim()));
  const coords = kids.filter((c) => c.localName === 'coord');
  const points: GeoPoint[] = [];
  coords.forEach((c, i) => {
    const [lon, lat, alt] = (c.textContent ?? '').trim().split(/\s+/).map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const p: GeoPoint = { lat, lon };
    if (Number.isFinite(alt)) p.ele = alt;
    const t = whens[i];
    if (t) p.time = t;
    points.push(p);
  });
  return points;
}

interface Geometry {
  points: GeoPoint[];
  segments: GeoPoint[][];
}

/** Collect all geometry under `el` into standalone points and line segments. */
function collectGeometry(el: El, opts: Required<KmlParseOptions>, acc: Geometry): void {
  for (const c of children(el)) {
    switch (c.localName) {
      case 'Point': {
        const coords = child(c, 'coordinates');
        if (coords) acc.points.push(...parseCoordinates(coords.textContent ?? '').slice(0, 1));
        break;
      }
      case 'LineString':
      case 'LinearRing': {
        const coords = child(c, 'coordinates');
        const seg = coords ? parseCoordinates(coords.textContent ?? '') : [];
        if (seg.length) acc.segments.push(seg);
        break;
      }
      case 'Polygon': {
        if (!opts.includePolygons) break;
        const outer = child(c, 'outerBoundaryIs');
        if (outer) collectGeometry(outer, opts, acc);
        break;
      }
      case 'Track': {
        const seg = parseGxTrack(c);
        if (seg.length) acc.segments.push(seg);
        break;
      }
      case 'MultiGeometry':
      case 'MultiTrack':
        collectGeometry(c, opts, acc);
        break;
    }
  }
}

/**
 * Flightradar24 KML exports contain a "Route" folder with one timestamped Point per position report
 * (altitude in meters in the coordinates; speed and heading only in the HTML description) and a
 * "Trail" folder repeating the same path as 2-point LineStrings for styling. Build a single timed
 * track from Route and ignore Trail.
 */
function parseFlightradar24(docEl: El, name: string | undefined): Partial<GeoData> | undefined {
  const folders = children(docEl).filter((c) => c.localName === 'Folder');
  const route = folders.find((f) => childText(f, 'name') === 'Route');
  if (!route || !folders.some((f) => childText(f, 'name') === 'Trail')) return undefined;

  const placemarks = children(route).filter((c) => c.localName === 'Placemark');
  const sample = childText(placemarks[0] ?? route, 'description') ?? '';
  if (!/Speed:/.test(sample)) return undefined;

  const points: GeoPoint[] = [];
  for (const pm of placemarks) {
    const pointEl = child(pm, 'Point');
    const coords = pointEl && child(pointEl, 'coordinates');
    const p = coords ? parseCoordinates(coords.textContent ?? '')[0] : undefined;
    if (!p) continue;

    const ts = child(pm, 'TimeStamp');
    const time = ts ? parseTime(childText(ts, 'when')) : undefined;
    if (time) p.time = time;

    const desc = childText(pm, 'description') ?? '';
    const field = (label: string) => new RegExp(`${label}:</b></span>\\s*<span>([\\d.,]+)\\s*([^<]*)</span>`).exec(desc);

    const speed = field('Speed');
    if (speed) {
      const unit = parseSpeedUnit(speed[2]) ?? 'kn';
      p.speed = toMetersPerSecond(Number(speed[1].replace(/,/g, '')), unit);
    }

    const iconStyle = descendants(pm, 'IconStyle')[0];
    const heading = (iconStyle && childText(iconStyle, 'heading')) ?? field('Heading')?.[1];
    if (heading !== undefined && Number.isFinite(Number(heading))) p.course = Number(heading) % 360;

    if (p.ele === undefined) {
      const alt = field('Altitude');
      if (alt) p.ele = toMeters(Number(alt[1].replace(/,/g, '')), parseLengthUnit(alt[2].trim()) ?? 'ft');
    }
    points.push(p);
  }
  if (points.length === 0) return undefined;

  points.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0));
  return { source: 'Flightradar24', waypoints: [], tracks: [{ name, segments: [points] }] };
}

/** Parse a KML document into GeoData. Points become waypoints; lines, tracks and polygons become tracks. */
export function parseKml(text: string, options: KmlParseOptions = {}): GeoData {
  const opts: Required<KmlParseOptions> = { includePolygons: options.includePolygons ?? true };

  let doc: { documentElement: El | null };
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml') as unknown as { documentElement: El | null };
  } catch (e) {
    throw new ConversionError(`Invalid KML/XML: ${(e as Error).message}`);
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'kml') {
    throw new ConversionError('Not a KML document: missing <kml> root element');
  }

  const data: GeoData = { waypoints: [], tracks: [] };
  const docEl = child(root, 'Document') ?? child(root, 'Folder');
  if (docEl) data.name = childText(docEl, 'name');

  const fr24 = docEl ? parseFlightradar24(docEl, data.name) : undefined;
  if (fr24) return { ...data, ...fr24 };

  for (const pm of descendants(root, 'Placemark', 'Placemark')) {
    const name = childText(pm, 'name');
    const desc = childText(pm, 'description');
    const ts = child(pm, 'TimeStamp');
    const when = ts ? parseTime(childText(ts, 'when')) : undefined;

    const geom: Geometry = { points: [], segments: [] };
    collectGeometry(pm, opts, geom);

    for (const p of geom.points) {
      data.waypoints.push({ ...p, name, desc, time: p.time ?? when });
    }
    if (geom.segments.length) {
      const trk: Track = { name, desc, segments: geom.segments };
      data.tracks.push(trk);
    }
  }

  if (data.waypoints.length === 0 && data.tracks.length === 0) {
    throw new ConversionError('No placemarks with supported geometry (Point, LineString, Polygon, gx:Track) found');
  }
  return data;
}
