const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** Return the MIME type for a file extension, or a generic fallback. */
export function getMime(ext: string): string {
  return MIME_MAP[ext] ?? 'application/octet-stream';
}
