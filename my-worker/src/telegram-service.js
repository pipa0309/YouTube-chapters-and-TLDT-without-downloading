// /**
//  * Сервис работы с Telegram API
//  */
// export class TelegramService {
//   constructor(env) {
//     this.botToken = env.TG_BOT_TOKEN;
//     this.webhookSecret = env.TG_WEBHOOK;
//   }

//   /**
//    * Отправка сообщения в Telegram
//    */
//   async sendMessage(chatId, text, parseMode = 'HTML') {
//     return this.tgApi('sendMessage', {
//       chat_id: chatId,
//       text: text,
//       parse_mode: parseMode
//     });
//   }

//   /**
//    * Отправка инвойса для оплаты
//    */
//   async sendInvoice(chatId, videoUrl) {
//     return this.tgApi('sendInvoice', {
//       chat_id: chatId,
//       title: '📹 TLDR + главы YouTube видео',
//       description: `Генерация краткого содержания и глав для видео: ${videoUrl.substring(0, 30)}...`,
//       payload: videoUrl,
//       currency: 'XTR',
//       prices: [{ label: '1 видео', amount: 100 }],
//       start_parameter: 'tldr1'
//     });
//   }

//   /**
//    * Ответ на pre-checkout запрос
//    */
//   async answerPreCheckout(preCheckoutQueryId, ok = true) {
//     return this.tgApi('answerPreCheckoutQuery', {
//       pre_checkout_query_id: preCheckoutQueryId,
//       ok: ok
//     });
//   }

//   /**
//    * Общий метод для вызовов Telegram API
//    */
//   async tgApi(method, body) {
//     try {
//       const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body)
//       });

//       if (!response.ok) {
//         throw new Error(`Telegram API error: ${response.status}`);
//       }

//       return await response.json();
//     } catch (error) {
//       console.error('Telegram API call error:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Форматирование результата для Telegram
//    */
//   formatResultForTelegram(data) {
//     if (!data.success || !data.tldr) {
//       return '😕 Не удалось сгенерировать TLDR для этого видео.';
//     }

//     const chaptersText = data.chapters && data.chapters.length > 0
//       ? data.chapters.slice(0, 10).map((ch, i) => 
//           `${i + 1}. ${ch.time || '00:00'} — ${ch.title || 'Без названия'}`
//         ).join('\n')
//       : '— Главы не найдены —';

//     return `🎬 <b>${data.videoTitle || data.videoId}</b>\n\n` +
//            `<b>📝 TL;DR</b>\n${data.tldr}\n\n` +
//            `<b>📖 Главы</b>\n${chaptersText}\n\n` +
//            `<i>⚡️ Сгенерировано за ${data.responseTime || 0}мс</i>`;
//   }

//   /**
//    * Валидация webhook секрета
//    */
//   validateWebhookSecret(request) {
//     const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
//     return secret === this.webhookSecret;
//   }
// }


/**
 * Сервис работы с Telegram API (Stars/XTR)
 * - Читает токен/секрет из env: TG_BOT_TOKEN, TG_WEBHOOK (с фолбэками)
 * - Проверяет заголовок X-Telegram-Bot-Api-Secret-Token
 * - Отправляет sendMessage / sendInvoice / answerPreCheckoutQuery
 * - Подрезает длинные сообщения под лимит Telegram (~4096 символов)
 */
export class TelegramService {
  constructor(env) {
    this.env = env;
    this.token  = (env.TG_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '').trim();
    this.secret = (env.TG_WEBHOOK   || env.TG_WEBHOOK_SECRET   || '').trim();

    // ➜ если кто-то положил в секрет строку вида "bot123:ABC", уберём "bot"
    if (this.token.toLowerCase().startsWith('bot')) {
      this.token = this.token.replace(/^bot/i, '');
    }

    this.API_BASE = 'https://api.telegram.org';
    this.MAX_MSG_LEN = 3800;
  }

  async getMe() {
    const url = `${this.API_BASE}/bot${this.token}/getMe`;
    const res = await fetch(url);
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`getMe HTTP ${res.status} ${text}`);
    return JSON.parse(text);
  }

  async tgApi(method, body) {
    const url = `${this.API_BASE}/bot${this.token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`Telegram API error: ${res.status} ${res.statusText} @${method} - ${text.slice(0,1000)}`);
    }
    return JSON.parse(text);
  }

  validateWebhookSecret(request) {
    const header = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    return Boolean(header) && Boolean(this.secret) && header === this.secret;
  }

  /** Утилита: безопасно обрезать слишком длинный текст */
  truncate(text, max = this.MAX_MSG_LEN) {
    if (!text) return '';
    const s = String(text);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  /** Утилита: отправка текста (с обрезкой под лимит) */
  async sendMessage(chatId, text, parseMode = 'HTML', options = {}) {
    const safe = this.truncate(text, this.MAX_MSG_LEN);
    return this.tgApi('sendMessage', {
      chat_id: chatId,
      text: safe,
      parse_mode: parseMode,
      ...options
    });
  }

  /** Выставление счёта в Stars/XTR (без provider_token для цифровых услуг) */
  async sendInvoice(chatId, videoUrl) {
    const shortUrl = (videoUrl || '').slice(0, 120); // для description
    return this.tgApi('sendInvoice', {
      chat_id: chatId,
      title: '📹 TLDR + главы YouTube',
      description: `Генерация краткого содержания и глав для: ${shortUrl}`,
      payload: videoUrl,           // вернётся в successful_payment.invoice_payload
      currency: 'XTR',             // Telegram Stars
      prices: [{ label: '1 видео', amount: 100 }], // 100 Stars
      start_parameter: 'tldr1'
      // provider_token НЕ указываем для Stars
    });
  }

  /** Ответ на pre-checkout (обязателен в течение 10 сек) */
  async answerPreCheckout(preCheckoutQueryId, ok = true) {
    return this.tgApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: preCheckoutQueryId,
      ok
    });
  }

  /** Форматирование результата для Telegram с учётом лимитов длины */
  formatResultForTelegram(data) {
    if (!data?.success || !data?.tldr) {
      return '😕 Не удалось сгенерировать TLDR для этого видео.';
    }

    const title = data.videoTitle || data.videoId || 'Видео';
    const tldrRaw = String(data.tldr || '').trim();

    // Подготовим главы
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    const lines = chapters.slice(0, 20).map((ch, i) => {
      const t = (ch?.time || '00:00').trim();
      const name = (ch?.title || 'Без названия').trim();
      return `${i + 1}. ${t} — ${name}`;
    });
    const chaptersText = lines.length ? lines.join('\n') : '— Главы не найдены —';

    // Сборка сообщения
    let message =
      `🎬 <b>${this.escapeHtml(title)}</b>\n\n` +
      `<b>📝 TL;DR</b>\n${this.escapeHtml(tldrRaw)}\n\n` +
      `<b>📖 Главы</b>\n${this.escapeHtml(chaptersText)}`;

    // Уложимся в лимит
    message = this.truncate(message, this.MAX_MSG_LEN);

    // Немного телеметрии по времени/длине — если прислана
    if (typeof data.responseTime === 'number') {
      message = this.truncate(`${message}\n\n<i>⚡️ Сгенерировано за ${data.responseTime} мс</i>`, this.MAX_MSG_LEN);
    }

    return message;
  }

  /** Мини-экранирование HTML для parse_mode=HTML */
  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
