import { useRef, useState, type DragEvent } from 'react';
import { filesFromDrop, filesFromFolderInput, type PickedFile } from '../lib/folder.js';

interface Props {
  accept: string;
  onFiles: (files: PickedFile[]) => void;
  title: string;
}

export function DropZone({ accept, onFiles, title }: Props) {
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState('');
  const folderInput = useRef<HTMLInputElement | null>(null);

  const deliver = (files: PickedFile[], fromFolder: boolean) => {
    setNotice(fromFolder && files.length === 0 ? 'No .kml, .csv or .tsv files found in that folder.' : '');
    if (files.length) onFiles(files);
  };

  const onDrag = (e: DragEvent) => {
    e.preventDefault();
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
    <div className="drop-wrap">
      <label
        className={`drop${over ? ' over' : ''}`}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) deliver(Array.from(e.target.files, (file) => ({ file, path: file.name })), false);
            e.target.value = '';
          }}
        />
        <strong>{title}</strong>
        <span>or click to choose files</span>
      </label>
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
      <button type="button" className="secondary folder-pick" onClick={() => folderInput.current?.click()}>
        Choose a folder…
      </button>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
