import { FileUp, FolderOpen, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { filesFromDrop, filesFromFolderInput, type PickedFile } from '@/lib/folder';
import { cn } from '@/lib/utils';

interface Props {
  accept: string;
  onFiles: (files: PickedFile[]) => void;
  /** Smaller layout once files have been added. */
  compact?: boolean;
}

export function DropZone({ accept, onFiles, compact = false }: Props) {
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);

  const deliver = (files: PickedFile[], fromFolder: boolean) => {
    setNotice(fromFolder && files.length === 0 ? 'No .kml, .csv or .tsv files found in that folder.' : '');
    if (files.length) onFiles(files);
  };

  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    // dragleave fires when moving onto a child; ignore it unless the pointer really left the zone.
    if (e.type === 'dragleave' && e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const hasFolder = Array.from(e.dataTransfer.items).some((i) => i.webkitGetAsEntry()?.isDirectory);
    filesFromDrop(e.dataTransfer).then(
      (files) => deliver(files, hasFolder),
      (err: unknown) => setNotice(`Could not read the dropped items: ${err instanceof Error ? err.message : String(err)}`),
    );
  };

  return (
    <div className="grid gap-2">
      <div
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card text-center transition-all',
          'hover:border-primary/60 hover:bg-primary/[0.03]',
          over && 'scale-[1.01] border-primary bg-primary/5 ring-4 ring-primary/10',
          compact ? 'gap-3 px-6 py-6 sm:flex-row sm:justify-between sm:text-left' : 'gap-4 px-6 py-14',
        )}
      >
        <div className={cn('flex items-center gap-4', !compact && 'flex-col')}>
          <div
            className={cn(
              'flex items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105',
              compact ? 'size-10' : 'size-14',
            )}
          >
            <UploadCloud className={compact ? 'size-5' : 'size-7'} />
          </div>
          <div className="grid gap-1">
            <p className={cn('font-medium', !compact && 'text-lg')}>
              {over ? 'Release to add files' : compact ? 'Add more files' : 'Drop files or a folder here'}
            </p>
            <p className="text-sm text-muted-foreground">
              KML and CSV/TSV · Flightradar24 exports are detected automatically
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size={compact ? 'sm' : 'default'} onClick={() => fileInput.current?.click()}>
            <FileUp />
            Choose files
          </Button>
          <Button size={compact ? 'sm' : 'default'} variant="outline" onClick={() => folderInput.current?.click()}>
            <FolderOpen />
            Choose folder
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) deliver(Array.from(e.target.files, (file) => ({ file, path: file.name })), false);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        hidden
        ref={(el) => {
          folderInput.current = el;
          if (el) el.webkitdirectory = true;
        }}
        onChange={(e) => {
          if (e.target.files) deliver(filesFromFolderInput(e.target.files), true);
          e.target.value = '';
        }}
      />
      {notice && (
        <p className="text-sm text-warning" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
