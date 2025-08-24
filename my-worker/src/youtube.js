// Получаем субтитры по публичному endpoint video.google.com/timedtext
// Возвращаем массив { start, dur, text } либо null если нет

export async function fetchCaptions(videoId, langs = ['en', 'ru']) {
  for (const lang of langs) {
    const url = `https://video.google.com/timedtext?lang=${lang}&v=${videoId}`;
    try {
      const res = await fetch(url, { cf: { cacheTtl: 3600 } });
      if (!res.ok) continue;
      const txt = await res.text();
      if (!txt || !txt.includes('<transcript')) continue;
      // Парсим XML через DOMParser (работает в Workers)
      const parser = new DOMParser();
      const xml = parser.parseFromString(txt, 'text/xml');
      const texts = Array.from(xml.getElementsByTagName('text'));
      if (texts.length === 0) continue;
      const items = texts.map(t => {
        const start = parseFloat(t.getAttribute('start') || '0');
        const dur = parseFloat(t.getAttribute('dur') || '0');
        // innerHTML может содержать escaped entities
        const raw = t.textContent || '';
        return { start, dur, text: raw.trim() };
      });
      return { lang, items };
    } catch (err) {
      // игнорируем и пробуем следующий язык
      continue;
    }
  }
  return null;
}

// Получаем oEmbed метаданные (title, author)
export async function fetchOEmbed(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}
