import { useMemo, useState } from 'react';
import { convert, uniqueGpxFilenames, type ConvertResult, type GpxVersion } from '../../core/index.js';
import { CsvOptionsForm, DEFAULT_CSV_FORM, toCsvOptions, type CsvFormValues } from '../components/CsvOptionsForm.js';
import { DropZone } from '../components/DropZone.js';
import { downloadText } from '../lib/download.js';

interface SourceFile {
  id: number;
  name: string;
  text: string;
}

type Outcome = { source: SourceFile; outName: string } & ({ result: ConvertResult } | { error: string });

let nextId = 1;

export function ConverterPage() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [csvForm, setCsvForm] = useState<CsvFormValues>(DEFAULT_CSV_FORM);
  const [gpxVersion, setGpxVersion] = useState<GpxVersion>('1.0');

  // Re-run conversions whenever files or options change; conversion is synchronous and fast.
  const outcomes = useMemo<Outcome[]>(() => {
    const csv = toCsvOptions(csvForm);
    const outNames = uniqueGpxFilenames(files.map((f) => f.name));
    return files.map((source, i) => {
      const outName = outNames[i];
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
  }, [files, csvForm, gpxVersion]);

  const addFiles = async (list: File[]) => {
    const added = await Promise.all(list.map(async (f) => ({ id: nextId++, name: f.name, text: await f.text() })));
    setFiles((prev) => [...prev, ...added]);
  };

  const successful = outcomes.filter((o): o is Outcome & { result: ConvertResult } => 'result' in o);

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

      <DropZone accept=".kml,.csv,.tsv,.txt" title="Drop .kml or .csv files here" onFiles={addFiles} />
      <div className="output-options">
        <label>
          Output format
          <select value={gpxVersion} onChange={(e) => setGpxVersion(e.target.value as GpxVersion)}>
            <option value="1.0">GPX 1.0 (native speed field)</option>
            <option value="1.1">GPX 1.1 (speed in Garmin extension)</option>
          </select>
        </label>
      </div>
      <CsvOptionsForm value={csvForm} onChange={setCsvForm} />

      <section className="results" aria-live="polite">
        {outcomes.map((o) => (
          <div className="file" key={o.source.id}>
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
              ) : (
                <div className="meta err">{o.error}</div>
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
