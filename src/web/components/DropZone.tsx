import { useState, type DragEvent } from 'react';

interface Props {
  accept: string;
  onFiles: (files: File[]) => void;
  title: string;
}

export function DropZone({ accept, onFiles, title }: Props) {
  const [over, setOver] = useState(false);

  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    setOver(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
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
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <strong>{title}</strong>
      <span>or click to choose</span>
    </label>
  );
}
