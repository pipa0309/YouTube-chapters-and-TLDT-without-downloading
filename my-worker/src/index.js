import { CacheService } from './cache-service.js';
import { AnalyticsService } from './analytics-service.js';
import { YouTubeService } from './youtube-service.js';
import { LLMService } from './llm-service.js';
import { TelegramService } from './telegram-service.js';
import { okResponse, errorResponse, corsResponse, sha256 } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);

    // Обработка CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    // Отдаем из edge cache если есть
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log('Serving from edge cache');
      return cachedResponse;
    }

    try {
      // API endpoint для генерации TLDR
      if (url.pathname === '/api/build') {
        if (request.method !== 'GET') {
          return errorResponse(405, 'Method not allowed');
        }

        const videoUrl = url.searchParams.get('url');
        if (!videoUrl) {
          return errorResponse(400, 'Missing video URL parameter');
        }

        const videoId = this.extractVideoId(videoUrl);
        const lang = url.searchParams.get('lang') || 'ru';
        const model = url.searchParams.get('model') || env.DEFAULT_MODEL;

        const startTime = Date.now();
        
        // Инициализация сервисов
        const cacheService = new CacheService(env);
        const analytics = new AnalyticsService(env);
        const youtubeService = new YouTubeService(env);
        const llmService = new LLMService(env);

        // Получаем метаданные видео
        const meta = await youtubeService.fetchOEmbed(videoUrl);
        
        // Получаем транскрипт
        const transcript = await youtubeService.getTranscript(videoId, [lang, 'ru', 'en']);
        const transcriptText = transcript.segments.map(s => s.text).join('\n') || '';

        // Генерируем ключ для кэша
        const cacheKey = await cacheService.buildKey(videoId, lang, model, transcriptText);
        
        // Проверяем кэш
        const cachedData = await cacheService.getCachedResponse(cacheKey);
        if (cachedData) {
          console.log('Serving from KV cache');
          const response = okResponse({ ...cachedData, cached: true });
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }

        // Если нет транскрипта - возвращаем fallback
        if (!transcriptText) {
          const fallbackData = cacheService.generateFallbackResponse(
            videoId, 
            meta, 
            transcript.reason
          );
          
          await cacheService.cacheResponse(cacheKey, fallbackData);
          await analytics.logNoSubtitles({
            videoId,
            lang,
            model,
            reason: transcript.reason,
            duration: Date.now() - startTime
          });

          const response = okResponse(fallbackData);
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }

        // Генерируем TLDR через LLM
        const llmResult = await llmService.callLLM(model, transcriptText, lang);
        
        const responseData = {
          success: true,
          videoId,
          videoTitle: meta?.title || null,
          tldr: llmResult.tldr || 'Не удалось сгенерировать краткое содержание',
          chapters: llmResult.chapters || [],
          model,
          processedAt: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          transcriptLength: transcriptText.length
        };

        // Сохраняем в кэш и логируем
        await cacheService.cacheResponse(cacheKey, responseData);
        await analytics.logSuccess({
          videoId,
          lang,
          model,
          duration: responseData.responseTime,
          transcriptLength: transcriptText.length,
          responseLength: responseData.tldr?.length || 0,
          cacheStatus: 'miss'
        });

        const response = okResponse(responseData);
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }

      // Telegram webhook endpoint
      if (url.pathname === '/tg/webhook') {
        const telegramService = new TelegramService(env);
        
        // Валидация webhook секрета
        if (!telegramService.validateWebhookSecret(request)) {
          return errorResponse(401, 'Unauthorized');
        }

        const update = await request.json();
        return await this.handleTelegramUpdate(update, env, ctx, telegramService);
      }

      return errorResponse(404, 'Not found');

    } catch (error) {
      console.error('Global error handler:', error);
      return errorResponse(500, 'Internal server error', {
        details: error.message
      });
    }
  },

  /**
   * Извлечение videoId из URL
   */
  extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : null;
  },

  /**
   * Обработка Telegram updates
   */
  async handleTelegramUpdate(update, env, ctx, telegramService) {
    try {
      // Обработка успешной оплаты
      if (update.message?.successful_payment) {
        const videoUrl = update.message.successful_payment.invoice_payload;
        const chatId = update.message.chat.id;

        // Запускаем генерацию TLDR
        const apiUrl = new URL(`https://${env.WORKER_DOMAIN}/api/build`);
        apiUrl.searchParams.set('url', videoUrl);
        apiUrl.searchParams.set('lang', 'ru');

        const response = await fetch(apiUrl.toString());
        const data = await response.json();

        // Отправляем результат пользователю
        const message = telegramService.formatResultForTelegram(data);
        ctx.waitUntil(telegramService.sendMessage(chatId, message));

        return okResponse({ ok: true });
      }

      // Обработка команды /tldr
      if (update.message?.text?.startsWith('/tldr ')) {
        const videoUrl = update.message.text.split(' ')[1];
        const chatId = update.message.chat.id;

        // Валидация URL
        if (!videoUrl || !this.extractVideoId(videoUrl)) {
          ctx.waitUntil(telegramService.sendMessage(
            chatId, 
            '❌ Пожалуйста, укажите корректную ссылку на YouTube видео после команды /tldr'
          ));
          return okResponse({ ok: true });
        }

        // Отправляем инвойс на оплату
        ctx.waitUntil(telegramService.sendInvoice(chatId, videoUrl));
        return okResponse({ ok: true });
      }

      // Обработка pre-checkout запроса
      if (update.pre_checkout_query) {
        ctx.waitUntil(telegramService.answerPreCheckout(
          update.pre_checkout_query.id, 
          true
        ));
        return okResponse({ ok: true });
      }

      // Обработка стартовой команды
      if (update.message?.text === '/start') {
        const chatId = update.message.chat.id;
        const welcomeMessage = `👋 Добро пожаловать! Я помогу вам получить краткое содержание и главы YouTube видео.\n\n` +
                              `Просто отправьте команду:\n` +
                              `<code>/tldr https://youtube.com/watch?v=...</code>\n\n` +
                              `Стоимость: 100 Stars за видео 💫`;

        ctx.waitUntil(telegramService.sendMessage(chatId, welcomeMessage));
        return okResponse({ ok: true });
      }

      return okResponse({ ok: true });

    } catch (error) {
      console.error('Telegram update error:', error);
      return errorResponse(500, 'Telegram handler error');
    }
  }
};


