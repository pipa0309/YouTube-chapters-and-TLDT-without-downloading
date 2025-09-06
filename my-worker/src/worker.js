export default {
  async fetch(request, env, ctx) {
    // Обработка CORS предварительных запросов
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Разрешаем только GET запросы
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const videoId = url.searchParams.get('videoId');
      
      // Валидация параметров
      if (!videoId) {
        return new Response(JSON.stringify({ error: 'Missing videoId parameter' }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }

      // Проверяем наличие API ключей
      if (!env.YOUTUBE_API_KEY) {
        return new Response(JSON.stringify({ error: 'YouTube API key not configured' }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }

      if (!env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: 'Groq API key not configured' }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }

      console.log('Fetching YouTube data for video:', videoId);
      
      // Получаем данные о видео с YouTube
      const youtubeResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${env.YOUTUBE_API_KEY}`
      );
      
      if (!youtubeResponse.ok) {
        throw new Error(`YouTube API error: ${youtubeResponse.status}`);
      }
      
      const youtubeData = await youtubeResponse.json();
      
      if (!youtubeData.items || youtubeData.items.length === 0) {
        return new Response(JSON.stringify({ error: 'Video not found' }), {
          status: 404,
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          }
        });
      }
      
      const videoSnippet = youtubeData.items[0].snippet;
      const videoDescription = videoSnippet.description || '';

      // Формируем запрос к Groq API
      const prompt = `
Проанализируй описание YouTube видео и создай:
1. Краткое изложение (TL;DR) видео длиной 2-3 предложения
2. Главы с временными метками в формате MM:SS

Описание видео:
${videoDescription}

Верни ответ ТОЛЬКО в формате JSON без каких-либо дополнительных объяснений:
{
  "tldr": "краткое изложение здесь",
  "chapters": [
    {"time": "00:00", "title": "Название главы"},
    ...
  ]
}
`;

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: "json_object" }
        })
      });

      if (!groqResponse.ok) {
        const errorData = await groqResponse.text();
        console.error('Groq API error:', errorData);
        throw new Error(`Groq API error: ${groqResponse.status}`);
      }

      const groqData = await groqResponse.json();
      const content = groqData.choices[0].message.content;
      
      // Парсим JSON из ответа Groq
      let result;
      try {
        result = JSON.parse(content);
      } catch (e) {
        console.error('Failed to parse Groq response:', content);
        throw new Error('Failed to parse Groq response: ' + e.message);
      }

      // Форматируем финальный ответ
      const responseData = {
        videoId,
        videoTitle: videoSnippet.title,
        tldr: result.tldr,
        chapters: result.chapters || []
      };

      return new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      // Логируем ошибку для отладки
      console.error('Error:', error.message);
      
      return new Response(JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }
  }
};