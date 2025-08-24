import { extractVideoId } from '../my-worker/src/utils.js';
import { fetchCaptions, fetchOEmbed } from './youtube.js';
import { buildTranscriptText, generateChaptersFromItems } from '../my-worker/src/parser.js';
import { summarizeTranscript } from '../my-worker/src/summarizer.js';
import { telegramSendMessage } from '../my-worker/src/telegram.js';

// Объявляем переменные окружения (в wrangler секреты)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Handler в стиле Cloudflare Workers
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return new Response('ok');
        }
        if (url.pathname === '/api/summarize') {
            const videoUrl = url.searchParams.get('url');
            if (!videoUrl) return new Response('Missing url', { status: 400 });
            const videoId = extractVideoId(videoUrl);
            if (!videoId) return new Response('Invalid YouTube URL', { status: 400 });

            // Попробуем взять из KV кэш
            const cacheKey = `video:${videoId}`;
            const kv = env.KV_TRANSCRIPTS;
            try {
                const cached = await kv.get(cacheKey);
                if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                // продолжим без кэша
            }

            const meta = await fetchOEmbed(videoId);
            const caps = await fetchCaptions(videoId, ['ru', 'en']);
            if (!caps) {
                return new Response(JSON.stringify({ error: 'No subtitles available. Ask uploader to enable subtitles or use manual transcription.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
            const transcriptText = buildTranscriptText(caps.items);
            const chapters = generateChaptersFromItems(caps.items);
            const summaryRes = await summarizeTranscript(transcriptText, caps.lang || 'en');

            const result = { videoId, meta, lang: caps.lang, chapters, summary: summaryRes.summary };
            const sresult = JSON.stringify(result);
 // Кэшируем на 24 часа
      try { await kv.put(cacheKey, sresult, { expirationTtl: 86400 }); } catch (e) {}
      return new Response(sresult, { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Telegram webhook: простой парсер
      const body = await request.json();
      const message = body.message || body.edited_message;
      if (!message) return new Response('ok');
      const chatId = message.chat.id;
      const text = message.text || '';
      const vid = extractVideoId(text);
      if (!vid) {
        await telegramSendMessage(TELEGRAM_BOT_TOKEN, chatId, 'Отправьте ссылку на видео YouTube');
        return new Response('ok');
      }
      // отправляем "в обработке"
      await telegramSendMessage(TELEGRAM_BOT_TOKEN, chatId, 'Ищу субтитры и делаю TLDR...');

      // делаем запрос к /api/summarize локально
      const base = new URL(request.url);
      base.pathname = '/api/summarize';
      base.searchParams.set('url', `https://www.youtube.com/watch?v=${vid}`);
      const apiRes = await fetch(base.toString());
      const j = await apiRes.json();
      if (j.error) {
        await telegramSendMessage(TELEGRAM_BOT_TOKEN, chatId, `Ошибка: ${j.error}`);
        return new Response('ok');
      }
      // Формируем сообщение: заголовки глав и краткое резюме
      const lines = [];
      lines.push(`<b>${j.meta?.title || 'Video'}</b>`);
      lines.push('');
      lines.push('<b>TLDR</b>');
      lines.push(escapeHtml(j.summary));
      lines.push('');
      lines.push('<b>Chapters</b>');
      for (const ch of j.chapters.slice(0, 10)) {
        lines.push(`${formatTime(ch.start)} — ${escapeHtml(ch.title)}`);
      }
      await telegramSendMessage(TELEGRAM_BOT_TOKEN, chatId, lines.join('\n'));
      return new Response('ok');
    }

    // default
    return new Response('Not found', { status: 404 });
  }
};

function escapeHtml(s = '') {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatTime(sec) {
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor((sec / 60) % 60).toString().padStart(2, '0');
  const h = Math.floor(sec / 3600).toString();
  return (h !== '0' ? h + ':' : '') + m + ':' + s;
}