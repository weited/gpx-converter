/** A single geographic point. */
export interface GeoPoint {
  lat: number;
  lon: number;
  /** Elevation in meters. */
  ele?: number;
  time?: Date;
  /** Speed over ground in meters per second. */
  speed?: number;
  /** Course over ground (heading) in degrees, 0–360, clockwise from true north. */
  course?: number;
  name?: string;
  desc?: string;
}

/** A track made of one or more continuous segments. */
export interface Track {
  name?: string;
  desc?: string;
  segments: GeoPoint[][];
}

/** Format-neutral representation of everything a GPX file can hold here. */
export interface GeoData {
  name?: string;
  waypoints: GeoPoint[];
  tracks: Track[];
  /** Recognized source preset, e.g. "Flightradar24". */
  source?: string;
  /** Non-fatal issues encountered while parsing (e.g. skipped rows). */
  warnings?: string[];
}

export type InputFormat = 'kml' | 'csv';

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}
