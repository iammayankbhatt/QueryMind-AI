const OpenAI = require('openai');

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });
  return completion.choices[0].message.content;
}

module.exports = { generateWithOpenAI };
