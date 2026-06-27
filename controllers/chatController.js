import Conversation from "../models/Conversation.js";
import { generateFloodAdvice, cache } from "../services/aiService.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


function getUserId(req) {
  const user = req.user ?? null;
  if (user) return (user.userId || user.id)?.toString() ?? null;
  if (req.userId) return req.userId.toString();
  if (req.id) return req.id.toString();
  return null;
}

async function getOrCreateConversation(userId, conversationId) {
  if (conversationId) {
    const conv = await Conversation.findOne({ _id: conversationId, userId });
    if (!conv) {
      console.warn(
        `[getOrCreateConversation] conversationId=${conversationId} not found for userId=${userId}. Starting fresh.`
      );
      return new Conversation({ userId, messages: [] });
    }
    return conv;
  }
  return new Conversation({ userId, messages: [] });
}


async function generateTitle(userQuery, aiResponseText) {
  try {
    let summary = "Flood advice";
    try {
      const parsed = JSON.parse(aiResponseText);
      summary = parsed.summary || userQuery;
    } catch {
      summary = userQuery;
    }

    const prompt = `Create a short conversation title (4-6 words, no punctuation, sentence case) for a flood advice chat that started with this summary: "${summary}". Reply with ONLY the title, nothing else.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash-8b",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 20 },
    });

    const title = response.text?.trim();
    return title && title.length > 0 && title.length < 80 ? title : summary.slice(0, 60);
  } catch {
  
    return userQuery.slice(0, 60);
  }
}


export const chatbotResponse = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      console.error("[chatbotResponse] Could not resolve userId. req.user =", req.user);
      return res.status(401).json({ error: "Unauthorized. Please log in again." });
    }

    const { query, conversationId } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Query is required." });
    }
    if (query.trim().length > 500) {
      return res.status(400).json({ error: "Query must be under 500 characters." });
    }

    const trimmedQuery = query.trim();
    const conversation  = await getOrCreateConversation(userId, conversationId);
    const recentHistory = conversation.messages.slice(-10);

    const { text, fromCache, isFallback } = await generateFloodAdvice(
      userId,
      trimmedQuery,
      recentHistory
    );

    // Parse the AI response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: text, urgency: "low", steps: [], warning: null, followUp: [] };
    }

    if (!isFallback) {
      conversation.messages.push({ role: "user", text: trimmedQuery });

      if (!fromCache) {
        conversation.messages.push({ role: "model", text });
      }


      if (conversation.messages.length > 200) {
        conversation.messages = conversation.messages.slice(-200);
      }

      const isFirstResponse =
        conversation.title === "New conversation" &&
        !fromCache &&
        conversation.messages.length <= 2;

      await conversation.save();

      if (isFirstResponse) {
        generateTitle(trimmedQuery, text)
          .then((title) =>
            Conversation.findByIdAndUpdate(conversation._id, { title })
          )
          .catch((err) =>
            console.error("[chatbotResponse] Title generation failed:", err.message)
          );
      }
    }

    return res.status(200).json({
      conversationId: conversation._id,
      response: parsed,
      fromCache,
      isFallback,
    });

  } catch (error) {
    console.error("[chatbotResponse] Error:", error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: "AI service error. Please try again." });
  }
};


export const getChatHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    // Return metadata only — not the full messages array (too large for a list)
    const conversations = await Conversation.find({ userId })
      .select("title createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(20);

    return res.status(200).json({ conversations });
  } catch (error) {
    console.error("[getChatHistory] Error:", error);
    return res.status(500).json({ error: "Failed to fetch history." });
  }
};


export const getConversation = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const conversation = await Conversation.findOne({ _id: req.params.id, userId });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("[getConversation] Error:", error);
    return res.status(500).json({ error: "Failed to fetch conversation." });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const result = await Conversation.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: "Conversation not found." });

    await cache.invalidateUser(userId);

    return res.status(200).json({ message: "Conversation deleted." });
  } catch (error) {
    console.error("[deleteConversation] Error:", error);
    return res.status(500).json({ error: "Failed to delete conversation." });
  }
};

// GET /api/chat/cache-stats 
export const getCacheStats = async (req, res) => {
  try {
    const data = await cache.stats();
    if (!data) return res.status(503).json({ error: "Redis stats unavailable." });
    return res.status(200).json({ cache: data });
  } catch (error) {
    console.error("[getCacheStats] Error:", error);
    return res.status(500).json({ error: "Failed to fetch cache stats." });
  }
};