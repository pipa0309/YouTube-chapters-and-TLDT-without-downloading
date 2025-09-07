/**
 * Сервис метрик с Workers Analytics Engine
 */
export class AnalyticsService {
  constructor(env) {
    this.analytics = env.ANALYTICS;
  }

  /**
   * Логирование события
   */
  async logEvent(eventData) {
    try {
      this.analytics.writeDataPoint({
        indexes: [eventData.videoId || 'unknown'],
        blobs: [
          eventData.status || 'unknown',
          eventData.lang || 'ru',
          eventData.model || 'unknown',
          eventData.cacheStatus || 'miss',
          eventData.reason || 'success'
        ],
        doubles: [
          eventData.duration || 0,
          eventData.transcriptLength || 0,
          eventData.responseLength || 0
        ]
      });
      return true;
    } catch (error) {
      console.warn('Analytics write error:', error.message);
      return false;
    }
  }

  /**
   * Логирование успешного запроса
   */
  async logSuccess(eventData) {
    return this.logEvent({
      status: 'ok',
      ...eventData
    });
  }

  /**
   * Логирование ошибки
   */
  async logError(eventData) {
    return this.logEvent({
      status: 'fail',
      ...eventData
    });
  }

  /**
   * Логирование отсутствия субтитров
   */
  async logNoSubtitles(eventData) {
    return this.logEvent({
      status: 'no_subs',
      ...eventData
    });
  }
}