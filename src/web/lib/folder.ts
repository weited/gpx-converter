import { isConvertibleFilename } from '../../core/index.js';

/** A file chosen by the user, with its path relative to the dropped/chosen folder (or just its name). */
export interface PickedFile {
  file: File;
  path: string;
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

/** readEntries() returns results in batches; keep calling until it returns an empty batch. */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.name.startsWith('.')) return;
  if (entry.isDirectory) {
    const children = await readAllEntries(entry as FileSystemDirectoryEntry);
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) await walk(child, out);
  } else if (isConvertibleFilename(entry.name)) {
    out.push({ file: await fileOf(entry as FileSystemFileEntry), path: entry.fullPath.replace(/^\//, '') });
  }
}

/**
 * Files from a drop. Dropped folders are scanned recursively for .kml/.csv/.tsv files;
 * individually dropped files are kept as-is (format detection decides later).
 */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  // Entries must be grabbed synchronously: the DataTransfer is emptied once the event handler returns.
  const entries = Array.from(dt.items, (item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null));
  const plainFiles = Array.from(dt.files);
  if (!entries.some((e) => e?.isDirectory)) return plainFiles.map((file) => ({ file, path: file.name }));

  const out: PickedFile[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.isDirectory) await walk(entry, out);
    else out.push({ file: await fileOf(entry as FileSystemFileEntry), path: entry.name });
  }
  return out;
}

/** Files from an `<input webkitdirectory>`: keep only convertible ones, with their folder-relative paths. */
export function filesFromFolderInput(list: FileList): PickedFile[] {
  return Array.from(list)
    .filter((file) => !file.webkitRelativePath.split('/').some((part) => part.startsWith('.')))
    .filter((file) => isConvertibleFilename(file.name))
    .map((file) => ({ file, path: file.webkitRelativePath || file.name }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
