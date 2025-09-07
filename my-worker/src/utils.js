/**
 * Утилиты для работы с HTTP ответами
 */

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/**
 * Успешный ответ с кэшированием
 */
export function okResponse(data, ttlSec = 7200) {
  return new Response(JSON.stringify(data), {
    headers: {
      ...JSON_HEADERS,
      'Cache-Control': `public, max-age=${ttlSec}`
    }
  });
}

/**
 * Ответ с ошибкой
 */
export function errorResponse(status, message, extra = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    ...extra
  }), {
    status,
    headers: JSON_HEADERS
  });
}

/**
 * CORS ответ для preflight запросов
 */
export function corsResponse() {
  return new Response(null, {
    headers: {
      ...JSON_HEADERS,
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Хэширование текста через SHA-256
 */
export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}