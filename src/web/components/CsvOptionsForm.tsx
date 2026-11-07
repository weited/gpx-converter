import type { CsvParseOptions, LengthUnit, SpeedUnit } from '../../core/index.js';

/** Form state: every field is a string so inputs stay controlled; empty means "auto". */
export interface CsvFormValues {
  mode: 'track' | 'waypoints';
  delimiter: string;
  lat: string;
  lon: string;
  position: string;
  ele: string;
  time: string;
  speed: string;
  course: string;
  name: string;
  groupBy: string;
  /** '' = auto (meters, or feet for Flightradar24). */
  altitudeUnit: '' | LengthUnit;
  /** '' = auto (m/s, or knots for Flightradar24). */
  speedUnit: '' | SpeedUnit;
}

export const DEFAULT_CSV_FORM: CsvFormValues = {
  mode: 'track',
  delimiter: '',
  lat: '',
  lon: '',
  position: '',
  ele: '',
  time: '',
  speed: '',
  course: '',
  name: '',
  groupBy: '',
  altitudeUnit: '',
  speedUnit: '',
};

export function toCsvOptions(v: CsvFormValues): CsvParseOptions {
  const col = (s: string) => s.trim() || undefined;
  return {
    mode: v.mode,
    delimiter: v.delimiter || undefined, // not trimmed: tab must survive
    lat: col(v.lat),
    lon: col(v.lon),
    position: col(v.position),
    ele: col(v.ele),
    time: col(v.time),
    speed: col(v.speed),
    course: col(v.course),
    name: col(v.name),
    groupBy: col(v.groupBy),
    altitudeUnit: v.altitudeUnit || undefined,
    speedUnit: v.speedUnit || undefined,
  };
}

type ColumnField = 'lat' | 'lon' | 'position' | 'ele' | 'time' | 'speed' | 'course' | 'name' | 'groupBy';

const COLUMN_FIELDS: { key: ColumnField; label: string }[] = [
  { key: 'lat', label: 'Latitude column' },
  { key: 'lon', label: 'Longitude column' },
  { key: 'position', label: 'Combined "lat,lon" column' },
  { key: 'ele', label: 'Elevation column' },
  { key: 'time', label: 'Time column' },
  { key: 'speed', label: 'Speed column' },
  { key: 'course', label: 'Heading column' },
  { key: 'name', label: 'Name column' },
  { key: 'groupBy', label: 'Split tracks by column' },
];

interface Props {
  value: CsvFormValues;
  onChange: (value: CsvFormValues) => void;
}

export function CsvOptionsForm({ value, onChange }: Props) {
  const set = <K extends keyof CsvFormValues>(key: K, v: CsvFormValues[K]) => onChange({ ...value, [key]: v });

  return (
    <details className="options">
      <summary>CSV options</summary>
      <div className="grid">
        <label>
          Rows become
          <select value={value.mode} onChange={(e) => set('mode', e.target.value as CsvFormValues['mode'])}>
            <option value="track">a track</option>
            <option value="waypoints">waypoints</option>
          </select>
        </label>
        <label>
          Delimiter
          <select value={value.delimiter} onChange={(e) => set('delimiter', e.target.value)}>
            <option value="">auto-detect</option>
            <option value=",">comma ,</option>
            <option value=";">semicolon ;</option>
            <option value={'\t'}>tab</option>
            <option value="|">pipe |</option>
          </select>
        </label>
        <label>
          Elevation unit
          <select value={value.altitudeUnit} onChange={(e) => set('altitudeUnit', e.target.value as CsvFormValues['altitudeUnit'])}>
            <option value="">auto</option>
            <option value="m">meters</option>
            <option value="ft">feet</option>
          </select>
        </label>
        <label>
          Speed unit
          <select value={value.speedUnit} onChange={(e) => set('speedUnit', e.target.value as CsvFormValues['speedUnit'])}>
            <option value="">auto</option>
            <option value="m/s">m/s</option>
            <option value="km/h">km/h</option>
            <option value="kn">knots</option>
            <option value="mph">mph</option>
          </select>
        </label>
        {COLUMN_FIELDS.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input placeholder="auto" value={value[key]} onChange={(e) => set(key, e.target.value)} />
          </label>
        ))}
      </div>
      <p className="hint">
        Columns can be a header name or a 0-based index. Leave blank to auto-detect from headers like <code>lat</code>,{' '}
        <code>latitude</code>, <code>lon</code>, <code>lng</code>, <code>ele</code>, <code>time</code>,{' '}
        <code>speed</code>, <code>heading</code>. Flightradar24 exports are recognized automatically (feet, knots).
      </p>
    </details>
  );
}
