import type { GeoData, GeoPoint } from '../../core/index.js';

export interface TrackSummary {
  /** Great-circle length of all track segments, meters. */
  distance: number;
  /** First to last timestamp across all track points, milliseconds; undefined without times. */
  duration?: number;
  /** Highest elevation, meters. */
  maxEle?: number;
  /** Highest speed, m/s. */
  maxSpeed?: number;
}

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Display-only summary of a converted file (the GPX output is unaffected). */
export function summarize(data: GeoData): TrackSummary {
  let distance = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  let maxEle: number | undefined;
  let maxSpeed: number | undefined;
  for (const track of data.tracks) {
    for (const seg of track.segments) {
      for (let i = 0; i < seg.length; i++) {
        const p = seg[i];
        if (i > 0) distance += haversine(seg[i - 1], p);
        if (p.time) {
          const t = p.time.getTime();
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
        }
        if (p.ele !== undefined && (maxEle === undefined || p.ele > maxEle)) maxEle = p.ele;
        if (p.speed !== undefined && (maxSpeed === undefined || p.speed > maxSpeed)) maxSpeed = p.speed;
      }
    }
  }
  return { distance, duration: maxT > minT ? maxT - minT : undefined, maxEle, maxSpeed };
}

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export const formatCount = (n: number) => nf.format(n);

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m >= 100_000 ? nf : nf1).format(m / 1000)} km` : `${nf.format(m)} m`;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${String(min % 60).padStart(2, '0')}m`;
  return `${nf1.format(h / 24)} days`;
}

export const formatEle = (m: number) => `${nf.format(m)} m`;
export const formatSpeed = (ms: number) => `${nf.format(ms * 3.6)} km/h`;
