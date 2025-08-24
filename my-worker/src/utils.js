// Утилиты: извлекаем ID из ссылки, чанкер текста
export function extractVideoId(urlOrText) {
  const urlMatch = String(urlOrText).match(/(?:v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{6,})/);
  return urlMatch ? urlMatch[1] : null;
}

export function chunkText(text, maxChars = 3000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const part = text.slice(start, start + maxChars);
    chunks.push(part);
    start += maxChars;
  }
  return chunks;
}
