const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Model priority list — tries each in order until one succeeds
const MODEL_PRIORITY = [
  'gemini-2.5-flash-lite',   // primary
  'gemini-2.0-flash-lite',   // fallback if 503
  'gemini-1.5-flash',        // last resort
];

const HEALTH_SYSTEM_PROMPT = `You are Doctor AI, a friendly and knowledgeable health companion assistant.
Your role is to:
- Listen carefully to user's health symptoms and concerns
- Provide general health information and guidance
- Recommend appropriate medical specialists when needed
- Encourage users to seek professional medical help for serious symptoms
- Keep responses concise, empathetic, and easy to understand
- Always clarify you are an AI and professional medical advice should be sought for serious issues
- Never diagnose conditions definitively or prescribe medications
- If the user mentions extreme pain, severe symptoms, or life-threatening situations, warn them to seek emergency care immediately and MUST start your response with exactly "[EMERGENCY]".`;

/** Attempt a Gemini call, retrying on 503/429 with fallback models */
async function withRetry(fn) {
  let lastErr;
  for (const modelName of MODEL_PRIORITY) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await fn(modelName);
      } catch (err) {
        lastErr = err;
        const is503 = err?.status === 503 || err?.message?.includes('503');
        const is429 = err?.status === 429 || err?.message?.includes('429');
        if (is503 || is429) {
          console.warn(`Gemini ${modelName} attempt ${attempt} returned ${is503 ? '503' : '429'}, retrying/fallback...`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err; // non-rate-limit/overload — propagate immediately
        }
      }
    }
  }
  throw lastErr; // if all fallback models failed, throw the final error
}

/**
 * Send a user message to Gemini and get a health assistant reply.
 * @param {string} userMessage
 * @param {Array}  history - [{role:'user'|'model', parts:[{text}]}]
 * @returns {Promise<string>} assistant reply text
 */
async function chatWithGemini(userMessage, history = []) {
  if (groq) {
    const messages = [{ role: 'system', content: HEALTH_SYSTEM_PROMPT }];
    for (const msg of history) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.parts[0].text });
    }
    messages.push({ role: 'user', content: userMessage });
    try {
      const completion = await groq.chat.completions.create({
        messages,
        model: 'llama-3.1-8b-instant',
      });
      return completion.choices[0].message.content;
    } catch (err) {
      console.warn('Groq API Error via Chat, falling back...', err.message);
    }
  }

  if (!genAI) throw new Error("No primary AI providers configured. Add GROQ_API_KEY or GEMINI_API_KEY.");

  try {
    return await withRetry(async (modelName) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: HEALTH_SYSTEM_PROMPT,
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    });
  } catch (err) {
    // If all Gemini models fail (e.g. 429 Quota Exhausted on the whole key), use the fallback API
    const isRateLimit = err?.status === 429 || err?.message?.includes('429');
    if (isRateLimit) {
      console.warn('Gemini API exhausted, falling back to remote LLM API...');
      const LLM_API_URL = "https://backend.buildpicoapps.com/aero/run/llm-api?pk=v1-Z0FBQUFBQnBuSXNPcFVMNlY5Q1czc0VsUVhJSjRHYWEwNlJmbmlSUV9uenZ6NlJHRUlFSTgxSkN0cTRqQXZGYTloUHpaaXBWNFVtUjI4S2dKYXVuQnhXVlQtTjZHdjNUWmc9PQ==";
      
      // format history into a single prompt for this simple endpoint
      let combinedPrompt = HEALTH_SYSTEM_PROMPT + '\n\n';
      history.forEach(m => {
        combinedPrompt += `${m.role === 'user' ? 'User' : 'Doctor AI'}: ${m.parts[0].text}\n`;
      });
      combinedPrompt += `User: ${userMessage}\nDoctor AI:`;

      const response = await fetch(LLM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: combinedPrompt })
      });
      const data = await response.json();
      if (data.status === 'success' && data.text) return data.text;
    }
    throw err; // cascade the error if fallback fails or wasn't a rate limit
  }
}

/**
 * Use Gemini to analyze symptoms and recommend a specialist.
 * @param {string} symptom
 * @returns {Promise<string>} recommendation text
 */
async function checkSymptomWithGemini(symptom) {
  const prompt = `A patient reports the following symptom(s): "${symptom}"

Please respond in this exact format:

Based on the symptom you've described:
[2-3 sentences explaining which specialist to consult, with the specialist name in **bold**, and what they can help with.]

In the meantime, here is some general wellness advice that might help:
- [Tip 1]
- [Tip 2]
- [Tip 3]
- [Tip 4]
- [Tip 5]

**It is crucial to remember that this information is for general guidance only and is not a substitute for professional medical advice. Please consult a real doctor to get an accurate assessment and personalized advice for your ${symptom}.**

Rules:
- Do NOT diagnose any condition definitively
- Be empathetic and supportive
- Keep the specialist name in bold using **specialist name** markdown
- Provide 4-6 practical, actionable self-care tips as bullet points`;

  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: HEALTH_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        model: 'llama-3.1-8b-instant',
      });
      return completion.choices[0].message.content;
    } catch (err) {
      console.warn('Groq API Error via Symptom Check, falling back...', err.message);
    }
  }

  if (!genAI) throw new Error("No primary AI providers configured. Add GROQ_API_KEY or GEMINI_API_KEY.");

  try {
    return await withRetry(async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  } catch (err) {
    const isRateLimit = err?.status === 429 || err?.message?.includes('429');
    if (isRateLimit) {
      console.warn('Gemini API exhausted, falling back to remote LLM API for symptom check...');
      const LLM_API_URL = "https://backend.buildpicoapps.com/aero/run/llm-api?pk=v1-Z0FBQUFBQnBuSXNPcFVMNlY5Q1czc0VsUVhJSjRHYWEwNlJmbmlSUV9uenZ6NlJHRUlFSTgxSkN0cTRqQXZGYTloUHpaaXBWNFVtUjI4S2dKYXVuQnhXVlQtTjZHdjNUWmc9PQ==";
      const response = await fetch(LLM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: HEALTH_SYSTEM_PROMPT + '\n\n' + prompt })
      });
      const data = await response.json();
      if (data.status === 'success' && data.text) return data.text;
    }
    throw err;
  }
}

module.exports = { chatWithGemini, checkSymptomWithGemini };

