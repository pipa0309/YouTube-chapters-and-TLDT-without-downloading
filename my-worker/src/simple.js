// simple.js с Analytics Engine для метрик
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() });
    }
    
    if (url.pathname === '/tg/webhook') {
      return await this.handleTelegramWebhook(request, env, ctx);
    }
    
    return new Response('Not found', { status: 404 });
  },

  async handleTelegramWebhook(request, env, ctx) {
    try {
      // Проверка секрета
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (secret !== env.TG_WEBHOOK) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      const update = await request.json();
      console.log('Telegram update received:', update.update_id);
      
      // Логируем событие в Analytics Engine
      ctx.waitUntil(this.logTelegramEvent(env.ANALYTICS, 'webhook_received', {
        update_id: update.update_id,
        message_type: update.message ? 'message' : 'other',
        text_length: update.message?.text?.length || 0
      }));
      
      // Обработка команды /start
      if (update.message?.text === '/start') {
        const chatId = update.message.chat.id;
        const message = `👋 Привет! Отправь мне ссылку на YouTube видео для обработки.`;
        
        ctx.waitUntil(this.sendTelegramMessage(env.TG_BOT_TOKEN, chatId, message));
        ctx.waitUntil(this.logTelegramEvent(env.ANALYTICS, 'start_command', {
          chat_id: chatId,
          username: update.message.chat.username
        }));
      }
      
      // Обработка YouTube ссылок
      if (update.message?.text && this.isYouTubeUrl(update.message.text)) {
        const chatId = update.message.chat.id;
        const videoUrl = update.message.text;
        const videoId = this.extractVideoId(videoUrl);
        const message = `🎥 Видео получено! Обрабатываю: ${videoUrl}\n\nЭто тестовый режим - функциональность в разработке.`;
        
        ctx.waitUntil(this.sendTelegramMessage(env.TG_BOT_TOKEN, chatId, message));
        
        // Логируем получение YouTube ссылки
        ctx.waitUntil(this.logTelegramEvent(env.ANALYTICS, 'youtube_link_received', {
          chat_id: chatId,
          video_id: videoId,
          video_url: videoUrl,
          username: update.message.chat.username
        }));
      }
      
      return Response.json({ ok: true });
      
    } catch (error) {
      console.error('Webhook error:', error);
      
      // Логируем ошибку
      ctx.waitUntil(this.logTelegramEvent(env.ANALYTICS, 'webhook_error', {
        error: error.message,
        stack: error.stack
      }));
      
      return Response.json({ error: error.message }, { status: 500 });
    }
  },

  isYouTubeUrl(text) {
    return text.includes('youtube.com/') || text.includes('youtu.be/');
  },

  extractVideoId(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.slice(1);
      }
      return urlObj.searchParams.get('v');
    } catch (e) {
      return null;
    }
  },

  async sendTelegramMessage(botToken, chatId, text) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });
      
      const result = await response.json();
      console.log('Telegram API response:', result);
      
      return result;
      
    } catch (error) {
      console.error('Telegram API error:', error);
      throw error;
    }
  },

  async logTelegramEvent(analytics, eventType, data) {
    try {
      // Отправляем данные в Analytics Engine
      analytics.writeDataPoint({
        blobs: [
          eventType,
          data.username || 'unknown',
          data.video_id || 'none',
          data.error || 'none'
        ],
        doubles: [
          data.chat_id || 0,
          data.text_length || 0,
          Date.now()
        ],
        indexes: [
          eventType,
          data.video_id || 'none'
        ]
      });
      
      console.log(`Logged analytics event: ${eventType}`, data);
      
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }
}