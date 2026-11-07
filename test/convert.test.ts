import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { convert, detectFormat, parseCsv, parseTimeValue, tokenizeCsv, uniqueGpxFilenames, ConversionError } from '../src/core/index.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function parseGpx(xml: string) {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

describe('KML', () => {
  const result = convert(fixture('sample.kml'), { filename: 'sample.kml' });

  it('converts points, lines, gx:Track and polygons', () => {
    expect(result.format).toBe('kml');
    expect(result.stats).toEqual({ waypoints: 1, tracks: 3, trackPoints: 3 + 2 + 4 });
    expect(result.data.name).toBe('Weekend Hike');
  });

  it('produces well-formed GPX with escaped names and times', () => {
    const doc = parseGpx(result.gpx);
    expect(doc.documentElement?.getAttribute('version')).toBe('1.0');
    const wpt = doc.getElementsByTagName('wpt')[0];
    expect(wpt.getAttribute('lat')).toBe('-33.8688');
    expect(wpt.getElementsByTagName('name')[0].textContent).toBe('Trailhead & Parking');
    expect(result.gpx).toContain('<time>2024-05-01T08:01:00.000Z</time>');
  });

  it('can skip polygons', () => {
    const r = convert(fixture('sample.kml'), { format: 'kml', kml: { includePolygons: false } });
    expect(r.stats.tracks).toBe(2);
  });

  it('rejects non-KML XML', () => {
    expect(() => convert('<foo/>', { format: 'kml' })).toThrow(ConversionError);
  });
});

describe('CSV', () => {
  it('detects aliased columns, groups tracks, and skips bad rows', () => {
    const r = convert(fixture('track.csv'), { filename: 'track.csv' });
    expect(r.stats).toEqual({ waypoints: 0, tracks: 2, trackPoints: 3 });
    expect(r.data.tracks.map((t) => t.name)).toEqual(['morning', 'evening']);
    expect(r.warnings[0]).toMatch(/Row 4/);
    expect(r.data.tracks[0].segments[0][0]).toMatchObject({ lat: -33.8688, lon: 151.2093, ele: 12 });
    expect(r.data.tracks[0].segments[0][0].time?.toISOString()).toBe('2024-05-01T08:00:00.000Z');
    expect(r.data.tracks[1].segments[0][0].time?.toISOString()).toBe('2024-05-01T08:03:00.000Z');
  });

  it('handles semicolons, decimal commas, quotes and waypoint mode', () => {
    const r = convert(fixture('pois-semicolon.csv'), { csv: { mode: 'waypoints' } });
    expect(r.data.waypoints).toHaveLength(2);
    expect(r.data.waypoints[0]).toMatchObject({ name: 'Café, "Central"', lat: 48.8566, lon: 2.3522, desc: 'Paris' });
    expect(r.gpx).toContain('<name>Café, &quot;Central&quot;</name>');
  });

  it('supports explicit columns by name and index', () => {
    const csv = 'a,b,c\n1,10,20\n2,11,21\n';
    const r = parseCsv(csv, { lat: 'b', lon: 2, mode: 'waypoints' });
    expect(r.waypoints[1]).toMatchObject({ lat: 11, lon: 21 });
  });

  it('accepts headerless lat,lon,ele', () => {
    const r = parseCsv('1.5,2.5,100\n1.6,2.6,101\n');
    expect(r.tracks[0].segments[0]).toEqual([
      { lat: 1.5, lon: 2.5, ele: 100 },
      { lat: 1.6, lon: 2.6, ele: 101 },
    ]);
  });

  it('errors helpfully when lat/lon cannot be found', () => {
    expect(() => parseCsv('foo,bar\n1,2\n')).toThrow(/Headers: foo, bar/);
    expect(() => parseCsv('foo,bar\nx,y\n')).toThrow(/latitude\/longitude/);
  });

  it('tokenizes quoted newlines and CRLF', () => {
    expect(tokenizeCsv('a,"b\nc"\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b\nc'],
      ['1', '2'],
    ]);
  });

  it('parses timestamps', () => {
    expect(parseTimeValue('1714550400')?.toISOString()).toBe('2024-05-01T08:00:00.000Z');
    expect(parseTimeValue('1714550400000')?.toISOString()).toBe('2024-05-01T08:00:00.000Z');
    expect(parseTimeValue('2024-05-01 9:05')?.toISOString()).toBe('2024-05-01T09:05:00.000Z');
    expect(parseTimeValue('2024-05-01T08:00:00+02:00')?.toISOString()).toBe('2024-05-01T06:00:00.000Z');
    expect(parseTimeValue('nope')).toBeUndefined();
  });
});

describe('detectFormat', () => {
  it('uses extension then content', () => {
    expect(detectFormat('a.KML', '')).toBe('kml');
    expect(detectFormat('a.csv', '')).toBe('csv');
    expect(detectFormat(undefined, '<?xml version="1.0"?><kml>')).toBe('kml');
    expect(detectFormat(undefined, 'lat,lon')).toBe('csv');
  });
});

describe('Flightradar24', () => {
  it('converts the CSV export to one track with feet→m, knots→m/s, heading and epoch time', () => {
    const r = convert(fixture('fr24.csv'), { filename: 'flight.csv' });
    expect(r.data.source).toBe('Flightradar24');
    expect(r.stats).toEqual({ waypoints: 0, tracks: 1, trackPoints: 3 });
    expect(r.data.tracks[0].name).toBe('DKH1853');
    const cruise = r.data.tracks[0].segments[0][2];
    expect(cruise.lat).toBe(28.735519);
    expect(cruise.lon).toBe(118.223137);
    expect(cruise.ele).toBeCloseTo(8427.72, 2); // 27650 ft
    expect(cruise.speed).toBeCloseTo(230.47, 2); // 448 kt
    expect(cruise.course).toBe(228);
    expect(cruise.time?.toISOString()).toBe('2026-10-02T14:45:48.000Z');
  });

  it('converts the KML export to one time-ordered track, ignoring the duplicate Trail', () => {
    const r = convert(fixture('fr24.kml'), { filename: 'flight.kml' });
    expect(r.data.source).toBe('Flightradar24');
    expect(r.stats).toEqual({ waypoints: 0, tracks: 1, trackPoints: 2 });
    const [first, cruise] = r.data.tracks[0].segments[0];
    expect(first.time?.toISOString()).toBe('2026-10-02T12:49:53.000Z');
    expect(cruise).toMatchObject({ ele: 8427.72, course: 228 });
    expect(cruise.speed).toBeCloseTo(230.47, 2);
  });

  it('CSV and KML exports of the same flight agree', () => {
    const csv = convert(fixture('fr24.csv'), { format: 'csv' }).data.tracks[0].segments[0];
    const kml = convert(fixture('fr24.kml'), { format: 'kml' }).data.tracks[0].segments[0];
    const at = (pts: typeof csv, iso: string) => pts.find((p) => p.time?.toISOString() === iso)!;
    const iso = '2026-10-02T14:45:48.000Z';
    expect(at(csv, iso).ele).toBeCloseTo(at(kml, iso).ele!, 1);
    expect(at(csv, iso).speed).toBeCloseTo(at(kml, iso).speed!, 3);
  });
});

describe('speed and course output', () => {
  const csv = 'lat,lon,speed,heading\n1,2,36,90\n';

  it('GPX 1.1 writes a Garmin TrackPointExtension', () => {
    const r = convert(csv, { format: 'csv', csv: { speedUnit: 'km/h' }, gpx: { version: '1.1' } });
    expect(r.gpx).toContain('xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2"');
    expect(r.gpx).toContain('<gpxtpx:speed>10</gpxtpx:speed><gpxtpx:course>90</gpxtpx:course>');
    expect(parseGpx(r.gpx).getElementsByTagName('gpxtpx:speed')).toHaveLength(1);
  });

  it('GPX 1.0 (the default) writes native course then speed', () => {
    const r = convert(csv, { format: 'csv' });
    expect(r.gpx).toContain('version="1.0"');
    expect(r.gpx).toMatch(/<course>90<\/course>\s*<speed>36<\/speed>/);
    expect(r.gpx).not.toContain('gpxtpx');
  });

  it('reads a combined position column', () => {
    const r = parseCsv('where,alt_ft\n"10.5, 20.25",1000\n', { position: 'where', ele: 'alt_ft', altitudeUnit: 'ft' });
    expect(r.tracks[0].segments[0][0]).toMatchObject({ lat: 10.5, lon: 20.25, ele: 304.8 });
  });
});

describe('uniqueGpxFilenames', () => {
  it('keeps source extensions only for colliding names', () => {
    expect(uniqueGpxFilenames(['a/flight.kml', 'b/flight.csv', 'route.kml'])).toEqual([
      'flight.kml.gpx',
      'flight.csv.gpx',
      'route.gpx',
    ]);
  });
});
