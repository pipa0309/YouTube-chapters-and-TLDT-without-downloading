import { getYoutubeHtml } from './youtube.js'
import { extractChapters } from './utils.js'

export async function parseChapters(videoUrl) {
  const html = await getYoutubeHtml(videoUrl)
  return extractChapters(html)
}
