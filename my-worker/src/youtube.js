// Загрузка HTML страницы YouTube
export async function getYoutubeHtml(videoUrl) {
  const res = await fetch(videoUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  })
  if (!res.ok) throw new Error('Не удалось загрузить страницу видео')
  return await res.text()
}

// Загрузка транскрипта через официальный API YouTube
export async function getYoutubeTranscript(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  const apiUrl = `https://youtubetranscript.com/?server_vid=${videoId}`

  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error('Не удалось получить транскрипт')
  const data = await res.json()

  return data.transcript.map(item => item.text).join(' ')
}

// Извлечение id видео
export function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (!match) throw new Error('Неверная ссылка на YouTube')
  return match[1]
}
