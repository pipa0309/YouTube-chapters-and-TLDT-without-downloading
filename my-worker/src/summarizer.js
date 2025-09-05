import { getYoutubeTranscript } from './youtube.js'

export async function summarizeVideo(videoUrl) {
  const transcript = await getYoutubeTranscript(videoUrl)
  // Простейшая логика, можно заменить на OpenAI/GPT
  const sentences = transcript.split('.')
  const summary = sentences.slice(0, 5).join('.') + '...'
  return { summary }
}
