import { Router } from 'itty-router'
import { parseChapters } from './parser.js'
import { summarizeVideo } from './summarizer.js'
import { sendTelegramMessage } from './telegram.js'

const router = Router()

router.get('/', () =>
  new Response(JSON.stringify({ status: 'ok', message: 'YouTube Chapters & TLDR API running' }), {
    headers: { 'Content-Type': 'application/json' }
  })
)

router.get('/chapters', async (request) => {
  const url = request.query?.url
  if (!url) {
    return new Response(JSON.stringify({ error: 'No video URL provided' }), { status: 400 })
  }
  try {
    const chapters = await parseChapters(url)
    return new Response(JSON.stringify(chapters), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

router.get('/tldr', async (request) => {
  const url = request.query?.url
  if (!url) {
    return new Response(JSON.stringify({ error: 'No video URL provided' }), { status: 400 })
  }
  try {
    const tldr = await summarizeVideo(url)
    return new Response(JSON.stringify(tldr), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

router.post('/notify', async (request) => {
  try {
    const { chatId, message } = await request.json()
    await sendTelegramMessage(chatId, message)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx)
}
