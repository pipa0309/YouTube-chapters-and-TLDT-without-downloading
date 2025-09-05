// Извлечение глав из HTML YouTube
export function extractChapters(html) {
  const match = html.match(/\"chapters\":\[(.*?)\]\}/)
  if (!match) {
    throw new Error('Главы не найдены в этом видео')
  }

  const jsonString = `[${match[1]}]`
  const chaptersData = JSON.parse(jsonString)

  return chaptersData.map(chapter => ({
    title: chapter.title.simpleText,
    time: chapter.startTimeMs
      ? msToTime(parseInt(chapter.startTimeMs))
      : '00:00'
  }))
}

// Перевод миллисекунд в mm:ss
function msToTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
