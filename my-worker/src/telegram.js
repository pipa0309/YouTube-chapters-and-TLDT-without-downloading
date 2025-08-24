// Простая отправка сообщений и обработка webhook
export async function telegramSendMessage(botToken, chatId, text, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...options };
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  return res.json();
}
