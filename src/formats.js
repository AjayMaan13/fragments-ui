// src/formats.js

// What each fragment type can be converted to, as URL extensions. This mirrors
// Fragment#formats in the fragments API (src/model/fragment.js): keep them in sync.

const images = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
};

export const FORMATS = {
  'text/plain': ['.pdf', '.docx'],
  'text/markdown': ['.html', '.txt', '.pdf', '.docx'],
  'text/html': ['.txt'],
  'text/csv': ['.json', '.txt'],
  'application/json': ['.yaml', '.xml', '.txt'],
  'application/yaml': ['.txt'],
  'application/xml': ['.json', '.txt'],
  ...Object.fromEntries(
    Object.keys(images).map((type) => [
      type,
      Object.entries(images)
        .filter(([other]) => other !== type)
        .map(([, ext]) => ext),
    ])
  ),
};

// Friendly names shown in the UI
export const TYPE_LABELS = {
  'text/plain': 'Plain text',
  'text/markdown': 'Markdown',
  'text/html': 'HTML',
  'text/csv': 'CSV',
  'application/json': 'JSON',
  'application/yaml': 'YAML',
  'application/xml': 'XML',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/gif': 'GIF',
};

export const FORMAT_LABELS = {
  '.pdf': 'PDF document',
  '.docx': 'Word document',
  '.html': 'HTML',
  '.txt': 'Plain text',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.xml': 'XML',
  '.png': 'PNG image',
  '.jpg': 'JPEG image',
  '.webp': 'WebP image',
  '.avif': 'AVIF image',
  '.gif': 'GIF image',
};
