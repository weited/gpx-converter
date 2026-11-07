import { AlertCircle, ArrowRight, Download, FileText, Layers, Plane, Settings2, SkipForward, Trash2, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  convert,
  findPairedDuplicates,
  uniqueGpxFilenames,
  type ConvertResult,
  type GpxVersion,
  type PreferFormat,
} from '../../core/index.js';
import { CsvOptionsForm, DEFAULT_CSV_FORM, toCsvOptions, type CsvFormValues } from '@/components/CsvOptionsForm';
import { DropZone } from '@/components/DropZone';
import { SelectField } from '@/components/Field';
import { TrackPreview } from '@/components/TrackPreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { downloadText } from '@/lib/download';
import type { PickedFile } from '@/lib/folder';
import { formatCount, formatDistance, formatDuration, formatEle, formatSpeed, summarize } from '@/lib/trackStats';
import { cn } from '@/lib/utils';

interface SourceFile {
  id: number;
  name: string;
  text: string;
}

type Outcome = { source: SourceFile } & (
  | { outName: string; result: ConvertResult }
  | { outName: string; error: string }
  | { skippedFor: string }
);
type Converted = Extract<Outcome, { result: ConvertResult }>;

let nextId = 1;

export function ConverterPage() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [csvForm, setCsvForm] = useState<CsvFormValues>(DEFAULT_CSV_FORM);
  const [gpxVersion, setGpxVersion] = useState<GpxVersion>('1.0');
  const [prefer, setPrefer] = useState<PreferFormat>(undefined);

  // Re-run conversions whenever files or options change; conversion is synchronous and fast.
  const outcomes = useMemo<Outcome[]>(() => {
    const csv = toCsvOptions(csvForm);
    const skipped = findPairedDuplicates(
      files.map((f) => f.name),
      prefer,
    );
    const active = files.filter((f) => !skipped.has(f.name));
    const outNames = new Map(uniqueGpxFilenames(active.map((f) => f.name)).map((n, i) => [active[i], n]));
    return files.map((source): Outcome => {
      const skippedFor = skipped.get(source.name);
      if (skippedFor) return { source, skippedFor };
      const outName = outNames.get(source)!;
      try {
        return {
          source,
          outName,
          result: convert(source.text, { filename: source.name, csv, gpx: { version: gpxVersion } }),
        };
      } catch (err) {
        return { source, outName, error: err instanceof Error ? err.message : String(err) };
      }
    });
  }, [files, csvForm, gpxVersion, prefer]);

  const addFiles = async (list: PickedFile[]) => {
    const added = await Promise.all(
      list.map(async ({ file, path }) => ({ id: nextId++, name: path, text: await file.text() })),
    );
    setFiles((prev) => [...prev, ...added]);
  };
  const removeFile = (id: number) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const successful = outcomes.filter((o): o is Converted => 'result' in o);
  const failed = outcomes.filter((o) => 'error' in o).length;
  const skipped = outcomes.filter((o) => 'skippedFor' in o).length;

  const downloadAll = async () => {
    for (const o of successful) {
      downloadText(o.outName, o.result.gpx);
      // Small gap so browsers don't drop consecutive downloads.
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  return (
    <div className="grid gap-10">
      <section className="grid max-w-2xl gap-4">
        <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-muted-foreground">
          <Plane className="text-primary" />
          Built for Flightradar24 exports
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Turn KML &amp; CSV into <span className="text-primary">GPX tracks</span>
        </h1>
        <p className="text-base text-pretty text-muted-foreground sm:text-lg">
          Convert flight logs and GPS exports into GPX with time, elevation, speed and heading — ready for footprint apps
          like Fog of World. Nothing is uploaded.
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <DropZone accept=".kml,.csv,.tsv,.txt" onFiles={addFiles} compact={files.length > 0} />

          {files.length > 0 && (
            <section className="grid gap-3" aria-live="polite">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="mr-auto flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    Files <span className="font-normal text-muted-foreground">({files.length})</span>
                  </h2>
                  {successful.length > 0 && <Badge variant="success">{successful.length} ready</Badge>}
                  {skipped > 0 && <Badge variant="secondary">{skipped} skipped</Badge>}
                  {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                  <Trash2 />
                  Clear all
                </Button>
                {successful.length > 1 && (
                  <Button size="sm" onClick={downloadAll}>
                    <Download />
                    Download all ({successful.length})
                  </Button>
                )}
              </div>

              <ul className="grid gap-3">
                {outcomes.map((o) => (
                  <li key={o.source.id}>
                    <FileCard outcome={o} onRemove={() => removeFile(o.source.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {files.length === 0 && <HowItWorks />}
        </div>

        <Card className="gap-5 lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              Settings
            </CardTitle>
            <CardDescription>Changes re-convert every file instantly.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SelectField
              label="Output format"
              value={gpxVersion}
              onChange={setGpxVersion}
              options={[
                { value: '1.0', label: 'GPX 1.0 — native speed' },
                { value: '1.1', label: 'GPX 1.1 — Garmin extension' },
              ]}
              hint={
                gpxVersion === '1.0'
                  ? 'Speed and heading as native <speed>/<course> elements. Best for footprint apps.'
                  : 'Speed and heading in a Garmin TrackPointExtension.'
              }
            />
            <SelectField
              label="When a flight has both CSV and KML"
              value={prefer ?? 'both'}
              onChange={(v) => setPrefer(v === 'both' ? undefined : v)}
              options={[
                { value: 'both', label: 'Convert both' },
                { value: 'csv', label: 'Only the CSV' },
                { value: 'kml', label: 'Only the KML' },
              ]}
              hint="Files with the same name in the same folder count as a pair."
            />
            <Separator />
            <CsvOptionsForm value={csvForm} onChange={setCsvForm} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FileCard({ outcome: o, onRemove }: { outcome: Outcome; onRemove: () => void }) {
  const isSkipped = 'skippedFor' in o;
  return (
    <Card
      className={cn(
        'animate-in flex-row items-stretch gap-4 p-3 duration-300 fade-in-0 slide-in-from-bottom-1 sm:p-4',
        isSkipped && 'bg-muted/40 shadow-none',
        'error' in o && 'border-destructive/40',
      )}
    >
      {'result' in o ? (
        <TrackPreview data={o.result.data} className="hidden w-32 shrink-0 sm:block" />
      ) : (
        <div
          className={cn(
            'hidden w-32 shrink-0 items-center justify-center rounded-lg border sm:flex',
            isSkipped ? 'bg-muted/50 text-muted-foreground' : 'bg-destructive/5 text-destructive',
          )}
        >
          {isSkipped ? <SkipForward className="size-6" /> : <AlertCircle className="size-6" />}
        </div>
      )}

      <div className="grid min-w-0 flex-1 content-start gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate font-medium', isSkipped && 'text-muted-foreground')} title={o.source.name}>
            {o.source.name}
          </span>
          {'result' in o && (
            <>
              <Badge variant="outline" className="font-mono">
                {o.result.format.toUpperCase()}
              </Badge>
              {o.result.data.source && (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  <Plane />
                  {o.result.data.source}
                </Badge>
              )}
            </>
          )}
        </div>

        {'result' in o ? (
          <ResultDetails o={o} />
        ) : 'error' in o ? (
          <p className="flex items-start gap-1.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {o.error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Skipped — using <span className="font-medium text-foreground">{o.skippedFor}</span> instead
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Remove ${o.source.name}`} onClick={onRemove}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
        {'result' in o && (
          <Button size="sm" variant="outline" onClick={() => downloadText(o.outName, o.result.gpx)}>
            <Download />
            <span className="hidden sm:inline">Download</span>
          </Button>
        )}
      </div>
    </Card>
  );
}

function ResultDetails({ o }: { o: Converted }) {
  const { stats, data, warnings } = o.result;
  const summary = useMemo(() => summarize(data), [data]);
  const facts = [
    stats.tracks > 0 && `${formatCount(stats.tracks)} track${stats.tracks === 1 ? '' : 's'}`,
    stats.trackPoints > 0 && `${formatCount(stats.trackPoints)} points`,
    stats.waypoints > 0 && `${formatCount(stats.waypoints)} waypoint${stats.waypoints === 1 ? '' : 's'}`,
    summary.distance > 0 && formatDistance(summary.distance),
    summary.duration !== undefined && formatDuration(summary.duration),
    summary.maxEle !== undefined && `max ${formatEle(summary.maxEle)}`,
    summary.maxSpeed !== undefined && `max ${formatSpeed(summary.maxSpeed)}`,
  ].filter((f): f is string => typeof f === 'string');

  return (
    <>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {facts.length ? (
          facts.map((f, i) => (
            <span key={i} className="tabular-nums">
              {f}
            </span>
          ))
        ) : (
          <span className="text-warning">No points found</span>
        )}
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowRight className="size-3 shrink-0 text-success" />
        <span className="truncate font-mono" title={o.outName}>
          {o.outName}
        </span>
      </p>
      {warnings.length > 0 && (
        <details className="group/warn text-xs text-warning">
          <summary className="flex cursor-pointer list-none items-center gap-1.5">
            <TriangleAlert className="size-3.5" />
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1 grid list-disc gap-0.5 pl-8">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

const STEPS = [
  { icon: Layers, title: 'Add files', text: 'Drop KML or CSV files — or a whole folder of Flightradar24 exports.' },
  { icon: Settings2, title: 'Check the result', text: 'Each file is converted instantly with a route preview and stats.' },
  { icon: Download, title: 'Download GPX', text: 'Save one file or all of them, ready to import into your app.' },
];

function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {STEPS.map(({ icon: Icon, title, text }, i) => (
        <li key={title} className="grid gap-2 rounded-xl border bg-card/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{i + 1}</span>
            {title}
            <Icon className="ml-auto size-4 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{text}</p>
        </li>
      ))}
    </ol>
  );
}
