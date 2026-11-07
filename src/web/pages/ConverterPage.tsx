import { useMemo, useState } from 'react';
import {
  convert,
  findPairedDuplicates,
  uniqueGpxFilenames,
  type ConvertResult,
  type GpxVersion,
  type PreferFormat,
} from '../../core/index.js';
import { CsvOptionsForm, DEFAULT_CSV_FORM, toCsvOptions, type CsvFormValues } from '../components/CsvOptionsForm.js';
import { DropZone } from '../components/DropZone.js';
import { downloadText } from '../lib/download.js';
import type { PickedFile } from '../lib/folder.js';

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

  const successful = outcomes.filter(
    (o): o is Extract<Outcome, { result: ConvertResult }> => 'result' in o,
  );

  const downloadAll = async () => {
    for (const o of successful) {
      downloadText(o.outName, o.result.gpx);
      // Small gap so browsers don't drop consecutive downloads.
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  return (
    <>
      <header>
        <h1>GPX Converter</h1>
        <p className="sub">Convert KML and CSV files to GPX. Everything runs in your browser — files never leave your device.</p>
      </header>

      <DropZone accept=".kml,.csv,.tsv,.txt" title="Drop .kml or .csv files, or a folder, here" onFiles={addFiles} />
      <div className="output-options">
        <label>
          Output format
          <select value={gpxVersion} onChange={(e) => setGpxVersion(e.target.value as GpxVersion)}>
            <option value="1.0">GPX 1.0 (native speed field)</option>
            <option value="1.1">GPX 1.1 (speed in Garmin extension)</option>
          </select>
        </label>
        <label>
          When a flight has both CSV and KML
          <select
            value={prefer ?? 'both'}
            onChange={(e) => setPrefer(e.target.value === 'both' ? undefined : (e.target.value as PreferFormat))}
          >
            <option value="both">Convert both</option>
            <option value="csv">Only convert the CSV</option>
            <option value="kml">Only convert the KML</option>
          </select>
        </label>
      </div>
      <CsvOptionsForm value={csvForm} onChange={setCsvForm} />

      <section className="results" aria-live="polite">
        {outcomes.map((o) => (
          <div className={`file${'skippedFor' in o ? ' skipped' : ''}`} key={o.source.id}>
            <div className="info">
              <div className="fname">{o.source.name}</div>
              {'result' in o ? (
                <>
                  <div className="meta ok">
                    {o.result.format.toUpperCase()}
                    {o.result.data.source && ` (${o.result.data.source})`} → {o.result.stats.waypoints} waypoints · {o.result.stats.tracks} tracks ·{' '}
                    {o.result.stats.trackPoints} track points
                  </div>
                  {o.result.warnings.length > 0 && (
                    <ul className="warn">
                      {o.result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : 'error' in o ? (
                <div className="meta err">{o.error}</div>
              ) : (
                <div className="meta">Skipped: using {o.skippedFor} instead</div>
              )}
            </div>
            {'result' in o && (
              <button type="button" onClick={() => downloadText(o.outName, o.result.gpx)}>
                Download {o.outName}
              </button>
            )}
            <button
              type="button"
              className="secondary icon"
              aria-label={`Remove ${o.source.name}`}
              onClick={() => setFiles((prev) => prev.filter((f) => f.id !== o.source.id))}
            >
              ×
            </button>
          </div>
        ))}
      </section>

      {files.length > 0 && (
        <div className="actions">
          {successful.length > 1 && (
            <button type="button" onClick={downloadAll}>
              Download all
            </button>
          )}
          <button type="button" className="secondary" onClick={() => setFiles([])}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}
