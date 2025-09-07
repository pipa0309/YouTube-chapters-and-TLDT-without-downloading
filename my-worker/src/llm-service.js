/**
 * Сервис работы с LLM (Ollama)
 */
export class LLMService {
  constructor(env) {
    this.host = env.OLLAMA_HOST || 'http://localhost:11434';
    this.defaultModel = env.DEFAULT_MODEL || 'gemma3:1b';
  }

  /**
   * Вызов LLM для генерации TLDR и глав
   */
  async callLLM(model, transcriptText, lang = 'ru') {
    try {
      const prompt = this.buildPrompt(transcriptText, lang);
      
      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.defaultModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_ctx: 2048,
            num_predict: 500
          }
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('Empty response from LLM');
      }

      return this.parseLLMResponse(data.response);
    } catch (error) {
      console.error('LLM call error:', error.message);
      return {
        tldr: null,
        chapters: [],
        error: error.message
      };
    }
  }

  /**
   * Построение промпта для LLM
   */
  buildPrompt(transcriptText, lang) {
    return `Создай краткое содержание видео на русском языке (2-3 предложения) и список глав с временными метками.

Транскрипт видео:
${transcriptText.substring(0, 2000)}

Формат ответа:
TLDR: [краткое содержание]
Главы:
00:00 - [название главы]
02:30 - [название главы]`;
  }

  /**
   * Парсинг ответа LLM
   */
  parseLLMResponse(responseText) {
    try {
      const tldrMatch = responseText.match(/TLDR:\s*(.+?)(?=\nГлавы:|$)/is);
      const chaptersMatch = responseText.match(/Главы:\s*([\s\S]+)$/i);
      
      let tldr = tldrMatch ? tldrMatch[1].trim() : null;
      let chapters = [];

      if (chaptersMatch) {
        chapters = chaptersMatch[1]
          .split('\n')
          .filter(line => line.trim() && line.includes('-'))
          .map(line => {
            const [time, title] = line.split('-').map(s => s.trim());
            return { time, title };
          })
          .filter(ch => ch.time && ch.title);
      }

      // Fallback если не распарсилось
      if (!tldr && responseText.length > 50) {
        tldr = responseText.substring(0, 200).trim() + '...';
      }

      return { tldr, chapters };
    } catch (error) {
      console.warn('LLM response parse error:', error);
      return {
        tldr: responseText.substring(0, 150).trim() + '...',
        chapters: [],
        error: 'parse_error'
      };
    }
  }
}