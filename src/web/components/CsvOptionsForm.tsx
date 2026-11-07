import { ChevronDown, RotateCcw, Table2 } from 'lucide-react';
import type { CsvParseOptions, LengthUnit, SpeedUnit } from '../../core/index.js';
import { SelectField } from '@/components/Field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

const COLUMN_FIELDS: { key: ColumnField; label: string; wide?: boolean }[] = [
  { key: 'lat', label: 'Latitude' },
  { key: 'lon', label: 'Longitude' },
  { key: 'position', label: 'Combined "lat,lon"', wide: true },
  { key: 'ele', label: 'Elevation' },
  { key: 'time', label: 'Time' },
  { key: 'speed', label: 'Speed' },
  { key: 'course', label: 'Heading' },
  { key: 'name', label: 'Name' },
  { key: 'groupBy', label: 'Split tracks by' },
];

interface Props {
  value: CsvFormValues;
  onChange: (value: CsvFormValues) => void;
}

export function CsvOptionsForm({ value, onChange }: Props) {
  const set = <K extends keyof CsvFormValues>(key: K, v: CsvFormValues[K]) => onChange({ ...value, [key]: v });
  const changed = (Object.keys(DEFAULT_CSV_FORM) as (keyof CsvFormValues)[]).filter((k) => value[k] !== DEFAULT_CSV_FORM[k]).length;

  return (
    <Collapsible className="group/csv">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="-mx-2 flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Table2 className="size-4 text-muted-foreground" />
            CSV parsing
            {changed > 0 && <Badge variant="secondary">{changed} changed</Badge>}
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]/csv:rotate-180" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="grid gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Rows become"
              value={value.mode}
              onChange={(v) => set('mode', v)}
              options={[
                { value: 'track', label: 'A track' },
                { value: 'waypoints', label: 'Waypoints' },
              ]}
            />
            <SelectField
              label="Delimiter"
              value={value.delimiter}
              onChange={(v) => set('delimiter', v)}
              options={[
                { value: '', label: 'Auto-detect' },
                { value: ',', label: 'Comma ,' },
                { value: ';', label: 'Semicolon ;' },
                { value: '\t', label: 'Tab' },
                { value: '|', label: 'Pipe |' },
              ]}
            />
            <SelectField
              label="Elevation unit"
              value={value.altitudeUnit}
              onChange={(v) => set('altitudeUnit', v)}
              options={[
                { value: '', label: 'Auto' },
                { value: 'm', label: 'Meters' },
                { value: 'ft', label: 'Feet' },
              ]}
            />
            <SelectField
              label="Speed unit"
              value={value.speedUnit}
              onChange={(v) => set('speedUnit', v)}
              options={[
                { value: '', label: 'Auto' },
                { value: 'm/s', label: 'm/s' },
                { value: 'km/h', label: 'km/h' },
                { value: 'kn', label: 'Knots' },
                { value: 'mph', label: 'mph' },
              ]}
            />
          </div>

          <div className="grid gap-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Column mapping</p>
            <div className="grid grid-cols-2 gap-3">
              {COLUMN_FIELDS.map(({ key, label, wide }) => (
                <div key={key} className={wide ? 'col-span-2 grid gap-1.5' : 'grid gap-1.5'}>
                  <Label htmlFor={`csv-${key}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    id={`csv-${key}`}
                    className="h-8"
                    placeholder="auto"
                    value={value[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A header name or 0-based index. Blank auto-detects headers like <code>lat</code>, <code>lon</code>,{' '}
              <code>ele</code>, <code>time</code>, <code>speed</code>, <code>heading</code>. Flightradar24 exports are
              recognized automatically (feet, knots).
            </p>
          </div>

          {changed > 0 && (
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange(DEFAULT_CSV_FORM)}>
              <RotateCcw />
              Reset CSV options
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
