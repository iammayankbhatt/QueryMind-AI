const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateWithGemini(systemPrompt, userPrompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });
  const fullPrompt = `${systemPrompt}\n\nUser request: ${userPrompt}`;
  const result = await model.generateContent(fullPrompt);
  return result.response.text();
}

module.exports = { generateWithGemini };