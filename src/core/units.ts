export type LengthUnit = 'm' | 'ft';
export type SpeedUnit = 'm/s' | 'km/h' | 'kn' | 'mph';

export const LENGTH_UNITS: readonly LengthUnit[] = ['m', 'ft'];
export const SPEED_UNITS: readonly SpeedUnit[] = ['m/s', 'km/h', 'kn', 'mph'];

const TO_METERS: Record<LengthUnit, number> = { m: 1, ft: 0.3048 };
const TO_MPS: Record<SpeedUnit, number> = { 'm/s': 1, 'km/h': 1 / 3.6, kn: 1852 / 3600, mph: 0.44704 };

export function toMeters(value: number, unit: LengthUnit = 'm'): number {
  return value * TO_METERS[unit];
}

export function toMetersPerSecond(value: number, unit: SpeedUnit = 'm/s'): number {
  return value * TO_MPS[unit];
}

/** Map loose unit spellings ("kt", "knots", "kmh", "feet") to a SpeedUnit/LengthUnit. */
export function parseSpeedUnit(raw: string): SpeedUnit | undefined {
  const u = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (['m/s', 'mps', 'ms'].includes(u)) return 'm/s';
  if (['km/h', 'kmh', 'kph'].includes(u)) return 'km/h';
  if (['kn', 'kt', 'kts', 'knot', 'knots'].includes(u)) return 'kn';
  if (u === 'mph') return 'mph';
  return undefined;
}

export function parseLengthUnit(raw: string): LengthUnit | undefined {
  const u = raw.trim().toLowerCase();
  if (['m', 'meter', 'meters', 'metre', 'metres'].includes(u)) return 'm';
  if (['ft', 'foot', 'feet'].includes(u)) return 'ft';
  return undefined;
}
