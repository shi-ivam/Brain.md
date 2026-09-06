import { NodeResource } from '../../../types';

export const getYouTubeId = (url: string): string | null => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/
  );
  return match ? match[1] : null;
};

export const formatFileSize = (bytes?: number): string | null => {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const createResourceSnippet = (res: NodeResource): string => {
  if (res.resource_type === 'youtube') {
    const vid = res.metadata?.videoId || getYouTubeId(res.url);
    return `\n> [!TIP] **Video Lecture**: [${res.title}](${res.url})\n` +
      (vid ? `> [![${res.title}](https://img.youtube.com/vi/${vid}/hqdefault.jpg)](${res.url})\n` : '') +
      (res.notes ? `> *${res.notes}*\n` : '') + '\n';
  }
  if (res.resource_type === 'pdf') {
    return `\n> [!NOTE] **Lecture PDF**: [${res.title}](${res.url})\n` +
      (res.notes ? `> *${res.notes}*\n` : '') + '\n';
  }
  return `\n> [!NOTE] **Reference**: [${res.title}](${res.url})\n` +
    (res.notes ? `> *${res.notes}*\n` : '') + '\n';
};
