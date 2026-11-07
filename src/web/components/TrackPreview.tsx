import { useMemo } from 'react';
import type { GeoData, GeoPoint } from '../../core/index.js';
import { cn } from '@/lib/utils';

const W = 160;
const H = 112;
const PAD = 10;
/** Cap per-segment points so huge tracks stay cheap to render. */
const MAX_POINTS = 400;

function downsample(seg: GeoPoint[]): GeoPoint[] {
  if (seg.length <= MAX_POINTS) return seg;
  const step = (seg.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => seg[Math.round(i * step)]);
}

/** Small route sketch: equirectangular projection scaled by cos(latitude), fitted into the box. */
export function TrackPreview({ data, className }: { data: GeoData; className?: string }) {
  const shape = useMemo(() => {
    const segments = data.tracks.flatMap((t) => t.segments).filter((s) => s.length > 0).map(downsample);
    const all = [...segments.flat(), ...data.waypoints];
    if (all.length === 0) return undefined;

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of all) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = (maxLon - minLon) * kx || 1e-9;
    const spanY = maxLat - minLat || 1e-9;
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const ox = (W - spanX * scale) / 2;
    const oy = (H - spanY * scale) / 2;
    const xy = (p: GeoPoint): [number, number] => [ox + (p.lon - minLon) * kx * scale, H - oy - (p.lat - minLat) * scale];

    const lines = segments.map((s) => s.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' '));
    const first = segments[0]?.[0];
    const lastSeg = segments.at(-1);
    const last = lastSeg?.at(-1);
    return {
      lines,
      start: first && xy(first),
      end: last && segments.flat().length > 1 ? xy(last) : undefined,
      wpts: data.waypoints.slice(0, 200).map(xy),
    };
  }, [data]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-muted/50 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:12px_12px]',
        className,
      )}
    >
      {shape && (
        <svg viewBox={`0 0 ${W} ${H}`} className="size-full" role="img" aria-label="Route preview">
          {shape.lines.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="var(--track)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {shape.wpts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill="var(--warning)" stroke="var(--card)" strokeWidth={1} />
          ))}
          {shape.start && <circle cx={shape.start[0]} cy={shape.start[1]} r={3.5} fill="var(--success)" stroke="var(--card)" strokeWidth={1.5} />}
          {shape.end && <circle cx={shape.end[0]} cy={shape.end[1]} r={3.5} fill="var(--destructive)" stroke="var(--card)" strokeWidth={1.5} />}
        </svg>
      )}
    </div>
  );
}
