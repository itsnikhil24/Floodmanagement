import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { responseCache } from "./cacheService.js";

dotenv.config();
console.log(process.env.API_KEY);

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ─── Prompt Engineering ────────────────────────────────────────────────────────
//
// Changes from the old prompt:
//  1. Explicit persona → Gemini stays on-topic (flood/crop only)
//  2. Structured output → frontend can parse urgency, steps, warnings
//  3. Few-shot examples → teaches the model the exact format we want
//  4. Hard refusal rule → model won't answer off-topic questions
//  5. Language instruction → responds in the user's language
//
const SYSTEM_PROMPT = `
You are FloodGuard AI, an emergency advisor specialising exclusively in:
  - Flood prevention and management
  - Crop and livestock protection during floods
  - Drainage and water removal techniques
  - Post-flood recovery for farmland

RULES:
1. ONLY answer questions related to the topics above.
2. If the question is unrelated, respond with exactly:
   {"error": "I can only assist with flood and crop protection topics."}
3. Always respond in the same language the user writes in.
4. Be practical, specific, and safety-conscious.
5. For urgent situations, mark urgency as "high".

RESPONSE FORMAT — always return valid JSON, no extra text:
{
  "urgency": "high" | "medium" | "low",
  "summary": "<one-sentence summary>",
  "steps": ["<step 1>", "<step 2>", "..."],
  "warning": "<optional safety warning or null>",
  "followUp": ["<suggested follow-up question 1>", "<suggested follow-up question 2>"]
}

FEW-SHOT EXAMPLES:

User: "Water is entering my field, what do I do immediately?"
Response:
{
  "urgency": "high",
  "summary": "Create emergency barriers and redirect water away from crops immediately.",
  "steps": [
    "Move livestock to higher ground right away",
    "Build temporary earthen berms or sandbag barriers on the water's entry side",
    "Open or create drainage channels leading water away from the field",
    "If possible, use a pump to remove standing water",
    "Document the flooding with photos for insurance claims"
  ],
  "warning": "Do not enter fast-moving floodwater — it can be dangerous even when shallow.",
  "followUp": [
    "How do I protect my wheat crop from waterlogging?",
    "What drainage system should I install to prevent future flooding?"
  ]
}

User: "How can I protect my wheat after flooding?"
Response:
{
  "urgency": "medium",
  "summary": "Drain water quickly and assess root damage to save waterlogged wheat.",
  "steps": [
    "Drain water within 24 hours to prevent root rot",
    "Do not apply fertiliser until the crop has recovered",
    "Check for yellowing leaves — a sign of nitrogen loss",
    "Apply a foliar fertiliser spray once water recedes",
    "Monitor for fungal diseases over the next 2 weeks"
  ],
  "warning": "Wheat left waterlogged for more than 48 hours may suffer permanent yield loss.",
  "followUp": [
    "What fertiliser should I use after a flood?",
    "How do I treat fungal disease in flooded wheat?"
  ]
}
`.trim();

// ─── Build Gemini contents array from conversation history ─────────────────────
function buildContents(history, newQuery) {
  // Gemini expects: [{role:"user", parts:[{text:"..."}]}, {role:"model", parts:[...]}]
  const contents = history.map((msg) => ({
    role: msg.role, // "user" | "model"
    parts: [{ text: msg.text }],
  }));

  // Append the new message
  contents.push({ role: "user", parts: [{ text: newQuery }] });
  return contents;
}

// ─── Non-streaming response (for fallback / cache population) ─────────────────
export async function generateFloodAdvice(userId, query, history = []) {
  // 1. Check cache first
  const cached = responseCache.get(userId, query);
  if (cached) {
    console.log(`[Cache HIT] userId=${userId}`);
    return { text: cached, fromCache: true };
  }

  // 2. Call Gemini with full history
  const contents = buildContents(history, query);

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json", // ask for JSON output
      temperature: 0.3, // lower = more consistent/factual responses
      maxOutputTokens: 1024,
    },
  });

  const text = response.text || '{"error": "No response generated."}';

  // 3. Store in cache
  responseCache.set(userId, query, text);

  return { text, fromCache: false };
}

// ─── Streaming response ────────────────────────────────────────────────────────
// Streams tokens to the client via Server-Sent Events (SSE).
// The caller (controller) is responsible for setting SSE headers.
//
// Usage in the controller:
//   res.setHeader("Content-Type", "text/event-stream")
//   await streamFloodAdvice(userId, query, history, res)
//
export async function streamFloodAdvice(userId, query, history = [], res) {
  // Check cache — if hit, send the cached response as a single SSE event
  const cached = responseCache.get(userId, query);
  if (cached) {
    console.log(`[Cache HIT - stream] userId=${userId}`);
    res.write(`data: ${JSON.stringify({ chunk: cached, done: false })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, fromCache: true })}\n\n`);
    res.end();
    return;
  }

  const contents = buildContents(history, query);

  // Collect full text so we can cache it after streaming completes
  let fullText = "";

  try {
    const streamResult = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    for await (const chunk of streamResult) {
      const chunkText = chunk.text ?? "";
      fullText += chunkText;

      // Send each chunk to the client
      res.write(
        `data: ${JSON.stringify({ chunk: chunkText, done: false })}\n\n`
      );
    }

    // Signal stream end
    res.write(`data: ${JSON.stringify({ done: true, fromCache: false })}\n\n`);
    res.end();

    // Cache the full assembled response
    if (fullText) {
      responseCache.set(userId, query, fullText);
    }
  } catch (err) {
    // Send error over the stream so the client knows what happened
    res.write(
      `data: ${JSON.stringify({ error: err.message, done: true })}\n\n`
    );
    res.end();
    throw err;
  }
}