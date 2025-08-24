// Преобразование субтитров в главы и текст для LLM
export function buildTranscriptText(items) {
  // Простая конкатенация с таймштампами
  return items.map(it => `[${formatTime(it.start)}] ${it.text}`).join('\n');
}

function formatTime(sec) {
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor((sec / 60) % 60).toString().padStart(2, '0');
  const h = Math.floor(sec / 3600).toString();
  return (h !== '0' ? h + ':' : '') + m + ':' + s;
}

// Простой генератор глав
export function generateChaptersFromItems(items, maxChapterLengthSec = 180) {
  if (!items || items.length === 0) return [];
  const chapters = [];
  let current = { start: items[0].start, text: '' };
  let lastTime = items[0].start;
  for (const it of items) {
    // если между сегментами большой пропуск — новый заголовок
    if (it.start - lastTime > maxChapterLengthSec) {
      chapters.push({ start: current.start, title: summarizeTitle(current.text) });
      current = { start: it.start, text: it.text };
    } else {
      current.text += ' ' + it.text;
    }
    lastTime = it.start + (it.dur || 0);
    // если накоплено много текста — закрываем главу
    if ((lastTime - current.start) >= maxChapterLengthSec) {
      chapters.push({ start: current.start, title: summarizeTitle(current.text) });
      current = { start: lastTime, text: '' };
    }
  }
  if (current.text && current.text.trim()) {
    chapters.push({ start: current.start, title: summarizeTitle(current.text) });
  }
  return chapters;
}

// Примитивная генерация заголовка для главы — берём первые 6 слов
function summarizeTitle(text) {
  const words = text.trim().split(/\s+/).slice(0, 6);
  return words.join(' ') + (words.length >= 6 ? '…' : '');
}
