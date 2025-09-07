/**
 * Сервис работы с YouTube API
 */
export class YouTubeService {
  constructor(env) {
    this.youtubeApiKey = env.YT_API_KEY;
  }

  /**
   * Получение oEmbed данных
   */
  async fetchOEmbed(videoUrl) {
    try {
      const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`;
      const response = await fetch(endpoint, {
        cf: {
          cacheTtl: 3600,
          cacheEverything: true
        }
      });
      
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn('oEmbed fetch error:', error.message);
      return null;
    }
  }

  /**
   * Получение данных видео через YouTube Data API
   */
  async fetchVideoData(videoId) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${this.youtubeApiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('Video not found');
      }

      return data.items[0].snippet;
    } catch (error) {
      console.error('YouTube data fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Попытка получения транскрипта через timedtext
   */
  async tryTimedText(videoId, preferredLangs = ['ru', 'en']) {
    // Реализация парсинга player_response → captionTracks
    // Возвращаем заглушку для примера
    return {
      segments: [],
      reason: 'timedtext_not_implemented'
    };
  }

  /**
   * Попытка получения транскрипта через YouTube Data API
   */
  async tryYouTubeDataApi(videoId, preferredLangs = ['ru', 'en']) {
    // Реализация через captions.list API
    // Возвращаем заглушку для примера
    return {
      segments: [],
      reason: 'data_api_not_implemented'
    };
  }

  /**
   * Основной метод получения транскрипта
   */
  async getTranscript(videoId, preferredLangs = ['ru', 'en']) {
    try {
      // 1. Пытаемся через timedtext
      const timedTextResult = await this.tryTimedText(videoId, preferredLangs);
      if (timedTextResult.segments?.length) {
        return timedTextResult;
      }

      // 2. Пытаемся через Data API
      const dataApiResult = await this.tryYouTubeDataApi(videoId, preferredLangs);
      if (dataApiResult.segments?.length) {
        return dataApiResult;
      }

      // 3. Возвращаем пустой результат
      return {
        segments: [],
        reason: 'no_subtitles_or_protected'
      };
    } catch (error) {
      console.error('Transcript fetch error:', error.message);
      return {
        segments: [],
        reason: 'fetch_error'
      };
    }
  }
}