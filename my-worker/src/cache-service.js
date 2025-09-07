/**
 * Сервис кэширования с KV Storage
 */
export class CacheService {
  constructor(env) {
    this.kv = env.TLDR_CACHE;
    this.defaultTTL = 7200; // 2 часа
  }

  /**
   * Генерация ключа для кэша
   */
  async buildKey(videoId, lang, model, transcriptText) {
    const text = [videoId, lang, model, transcriptText].join("|");
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `tldr:${videoId}:${lang}:${model}:${hashHex}`;
  }

  /**
   * Получение данных из кэша
   */
  async getCachedResponse(key) {
    try {
      const cached = await this.kv.get(key, 'json');
      return cached || null;
    } catch (error) {
      console.warn('Cache read error:', error.message);
      return null;
    }
  }

  /**
   * Сохранение данных в кэш
   */
  async cacheResponse(key, data, ttl = this.defaultTTL) {
    try {
      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: ttl
      });
      return true;
    } catch (error) {
      console.warn('Cache write error:', error.message);
      return false;
    }
  }

  /**
   * Генерация fallback ответа при отсутствии транскрипта
   */
  generateFallbackResponse(videoId, meta, reason = 'no_transcript') {
    return {
      success: true,
      videoId,
      videoTitle: meta?.title || null,
      tldr: "Не удалось сгенерировать краткое содержание",
      chapters: [],
      model: 'fallback',
      reason: reason,
      processedAt: new Date().toISOString(),
      cached: false
    };
  }
}