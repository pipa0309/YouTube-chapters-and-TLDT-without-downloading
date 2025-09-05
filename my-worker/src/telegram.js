export async function sendTelegramMessage(chatId, message) {
  const token = TELEGRAM_BOT_TOKEN // возьми из env
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message })
  })
  if (!res.ok) throw new Error('Failed to send Telegram message')
}
