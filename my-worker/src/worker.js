// Конфигурация
const OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma3:1b';
const MAX_DESCRIPTION_LENGTH = 1500;
const OLLAMA_TIMEOUT = 10000; // 10 секунд

export default {
  async fetch(request, env, ctx) {
    // Обработка CORS
    if (request.method === 'OPTIONS') {
      return this.corsResponse();
    }

    if (request.method !== 'GET') {
      return this.jsonResponse({ error: 'Method not allowed' }, 405);
    }

    try {
      const url = new URL(request.url);
      const videoId = url.searchParams.get('videoId');
      
      if (!videoId) {
        return this.jsonResponse({ error: 'Missing videoId parameter' }, 400);
      }

      // Проверка валидности videoId
      if (!this.isValidVideoId(videoId)) {
        return this.jsonResponse({ error: 'Invalid YouTube video ID' }, 400);
      }

      if (!env.YOUTUBE_API_KEY) {
        return this.jsonResponse({ error: 'YouTube API key not configured' }, 500);
      }

      console.log('Processing video:', videoId);
      
      // Кэширование - проверяем сначала KV
      const cachedResponse = await this.getCachedResponse(env, videoId);
      if (cachedResponse) {
        console.log('Serving from cache');
        return this.jsonResponse({ ...cachedResponse, cached: true });
      }

      // Получаем данные YouTube с таймаутом
      const youtubeData = await this.fetchYouTubeData(videoId, env.YOUTUBE_API_KEY);
      const videoSnippet = youtubeData.items[0].snippet;
      
      const { description, title } = this.prepareVideoData(videoSnippet);

      // Проверяем доступность Ollama
      if (!await this.checkOllamaHealth()) {
        return this.jsonResponse({ 
          error: 'Ollama service not available',
          suggestion: 'Make sure Ollama is running on http://localhost:11434'
        }, 503);
      }

      // Генерируем контент через Ollama
      const { tldr, chapters } = await this.generateContentWithOllama(title, description);

      // Формируем ответ
      const responseData = {
        success: true,
        videoId,
        videoTitle: title,
        tldr: tldr || 'Не удалось сгенерировать краткое содержание',
        chapters: chapters || [],
        model: DEFAULT_MODEL,
        processedAt: new Date().toISOString()
      };

      // Сохраняем в кэш (асинхронно, без ожидания)
      ctx.waitUntil(this.cacheResponse(env, videoId, responseData));

      return this.jsonResponse(responseData);

    } catch (error) {
      console.error('Error:', error.message);
      return this.jsonResponse({ 
        error: 'Internal server error',
        details: error.message 
      }, 500);
    }
  },

  // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

  /**
   * Проверяет валидность YouTube video ID
   */
  isValidVideoId(videoId) {
    const youtubeRegex = /^[a-zA-Z0-9_-]{11}$/;
    return youtubeRegex.test(videoId);
  },

  /**
   * Получает данные с YouTube API с таймаутом
   */
  async fetchYouTubeData(videoId, apiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('Video not found');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  /**
   * Подготавливает данные видео
   */
  prepareVideoData(snippet) {
    let description = snippet.description || '';
    const title = snippet.title || '';

    // Очищаем и ограничиваем описание
    description = description
      .replace(/[^\w\sа-яА-ЯёЁ.,!?-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }

    return { description, title };
  },

  /**
   * Проверяет доступность Ollama
   */
  async checkOllamaHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Ollama health check failed:', error.message);
      return false;
    }
  },

  /**
   * Генерирует контент через Ollama
   */
  async generateContentWithOllama(title, description) {
    const prompt = this.createOptimizedPrompt(title, description);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_ctx: 2048,
            num_predict: 600
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseModelResponse(data.message.content);

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Ollama generation error:', error.message);
      return { tldr: null, chapters: [] };
    }
  },

  /**
   * Создает оптимизированный промпт
   */
  createOptimizedPrompt(title, description) {
    return `Анализируй описание YouTube видео и создай на РУССКОМ языке:
1. Краткое изложение (TL;DR) видео длиной 2-3 предложения
2. Главы с временными метками в формате MM:SS

Название видео: "${title}"

Описание видео:
${description}

Важно: 
- Отвечай ТОЛЬКО на русском языке
- Используй реальные временные метки из описания
- Если глав нет, верни пустой массив
- Формат ответа ТОЛЬКО JSON:

{
  "tldr": "краткое изложение на русском",
  "chapters": [
    {"time": "00:00", "title": "Название главы"},
    {"time": "02:30", "title": "Следующая глава"}
  ]
}`;
  },

  /**
   * Парсит ответ модели
   */
  parseModelResponse(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON not found in response');
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // Валидация результата
      return {
        tldr: typeof result.tldr === 'string' ? result.tldr.trim() : null,
        chapters: Array.isArray(result.chapters) ? result.chapters.slice(0, 10) : []
      };
    } catch (error) {
      console.warn('Failed to parse model response:', error.message);
      return this.extractContentFromText(content);
    }
  },

  /**
   * Извлекает контент из текстового ответа
   */
  extractContentFromText(content) {
    const tldr = this.extractTLDR(content);
    const chapters = this.extractChapters(content);
    
    return { tldr, chapters };
  },

  /**
   * Извлекает TLDR из текста
   */
  extractTLDR(content) {
    const patterns = [
      /(?:TLDR|Краткое содержание|Суть)[:\s]*(.+?)(?=\n|$)/i,
      /^(.+?)(?=\n|$)/m
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1].trim().substring(0, 300);
    }
    
    return content.substring(0, 200).trim() + '...';
  },

  /**
   * Извлекает главы из текста
   */
  extractChapters(content) {
    const chapters = [];
    const patterns = [
      /(\d{1,2}:\d{2})\s*[-—]\s*(.+)/g,
      /(\d{1,2}:\d{2})\s+(.+)/g,
      /^(\d{1,2}:\d{2})\s*[-—]?\s*(.+)$/gm
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (chapters.length < 10) { // Ограничиваем количество глав
          chapters.push({
            time: match[1],
            title: match[2].trim().substring(0, 100)
          });
        }
      }
    }
    
    return chapters;
  },

  /**
   * Кэширование ответов
   */
  async getCachedResponse(env, videoId) {
    try {
      const cached = await env.KV_TRANSCRIPTS.get(videoId);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Cache read error:', error.message);
      return null;
    }
  },

  async cacheResponse(env, videoId, data) {
    try {
      await env.KV_TRANSCRIPTS.put(
        videoId, 
        JSON.stringify(data),
        { expirationTtl: 86400 } // 24 часа
      );
    } catch (error) {
      console.warn('Cache write error:', error.message);
    }
  },

  /**
   * Утилиты для ответов
   */
  corsResponse() {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  },

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
};