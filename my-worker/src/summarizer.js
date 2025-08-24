// Вызов OpenAI Chat API. Код написан универсально, можно заменить провайдера.
// Требуется переменная окружения OPENAI_API_KEY
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-3.5-turbo';

export async function summarizeTranscript(transcriptText, lang = 'en') {
  // Чанкуем при большом тексте
  const chunks = chunkText(transcriptText, 3000);
  const summaries = [];
  for (const chunk of chunks) {
    const prompt = buildPrompt(chunk, lang);
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });
    if (!res.ok) {

      const txt = await res.text();
      throw new Error('LLM error ' + txt);
    }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content || '';
    summaries.push(content.trim());
  }
  // Агрегируем
  if (summaries.length === 1) return { summary: summaries[0] };
  const aggPrompt = `У тебя есть ${summaries.length} кратких резюме. Объедини их в одно короткое резюме (3-5 предложений) на языке ${lang}:\n\n${summaries.join('\n\n')}`;
  const aggRes = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: aggPrompt }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  const aggJson = await aggRes.json();
  const final = aggJson.choices?.[0]?.message?.content || summaries.join('\n');
  return { summary: final.trim() };
}

function buildPrompt(text, lang) {
  if (lang.startsWith('ru')) {
    return `Сделай краткое резюме 4-6 предложений и предложи 3 тезиса, каждый в одну строку.\n\nТекст:\n${text}`;
  }
  return `Write a short summary (4-6 sentences) and list 3 bullet takeaways, one per line.\n\nText:\n${text}`;
}

// локальная функция чанкинга — можно импортировать из utils
function chunkText(text, max = 3000) {
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    out.push(text.slice(pos, pos + max));
    pos += max;
  }
  return out;
}
