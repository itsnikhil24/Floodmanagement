import Conversation from "../models/Conversation.js";
import {
  generateFloodAdvice,
  streamFloodAdvice,
} from "../services/aiService.js";

function getUserId(req) {
  const user =req.user 
    null;
  if (user) {
    return (user.userId || user.id)?.toString() ?? null;
  }
  

  // JWT middlewares sometimes decode straight onto req
  if (req.userId) return req.userId.toString();
  if (req.id)     return req.id.toString();

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getOrCreateConversation(userId, conversationId) {
  if (conversationId) {
    const conv = await Conversation.findOne({ _id: conversationId, userId });
    if (!conv) {
      const err = new Error("Conversation not found");
      err.status = 404;
      throw err;
    }
    return conv;
  }
  return new Conversation({ userId, messages: [] });
}

// ─── POST /api/chat/message  (non-streaming) ──────────────────────────────────
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
    if (query.length > 500) {
      return res.status(400).json({ error: "Query must be under 500 characters." });
    }

    const conversation = await getOrCreateConversation(userId, conversationId);
    const recentHistory = conversation.messages.slice(-10);

    const { text, fromCache } = await generateFloodAdvice(
      userId,
      query.trim(),
      recentHistory
    );

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: text };
    }

    if (!fromCache) {
      conversation.messages.push({ role: "user", text: query.trim() });
      conversation.messages.push({ role: "model", text });
      await conversation.save();
    }

    return res.status(200).json({
      conversationId: conversation._id,
      response: parsed,
      fromCache,
    });
  } catch (error) {
    console.error("[chatbotResponse] Error:", error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: "AI service error. Please try again." });
  }
};

// ─── POST /api/chat/stream  (SSE streaming) ───────────────────────────────────
export const chatbotStreamResponse = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      console.error("[chatbotStreamResponse] Could not resolve userId. req.user =", req.user);
      return res.status(401).json({ error: "Unauthorized. Please log in again." });
    }

    const { query, conversationId } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Query is required." });
    }
    if (query.length > 500) {
      return res.status(400).json({ error: "Query must be under 500 characters." });
    }

    // SSE headers — must be set before any write
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const conversation = await getOrCreateConversation(userId, conversationId);
    const recentHistory = conversation.messages.slice(-10);

    let fullResponseText = "";

    // Intercept writes to capture the full streamed text for saving
    const originalWrite = res.write.bind(res);
    res.write = (data) => {
      try {
        const jsonStr = data.toString().replace(/^data: /, "").trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.chunk) fullResponseText += parsed.chunk;
      } catch {
        // ignore SSE control messages that aren't JSON
      }
      return originalWrite(data);
    };

    await streamFloodAdvice(userId, query.trim(), recentHistory, res);

    if (fullResponseText) {
      conversation.messages.push({ role: "user", text: query.trim() });
      conversation.messages.push({ role: "model", text: fullResponseText });
      await conversation.save();
    }
  } catch (error) {
    console.error("[chatbotStreamResponse] Error:", error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Stream failed.", done: true })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "AI service error." });
    }
  }
};

// ─── GET /api/chat/history ────────────────────────────────────────────────────
export const getChatHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const conversations = await Conversation.find({ userId })
      .select("title createdAt updatedAt messages")
      .sort({ updatedAt: -1 })
      .limit(20);

    return res.status(200).json({ conversations });
  } catch (error) {
    console.error("[getChatHistory] Error:", error);
    return res.status(500).json({ error: "Failed to fetch history." });
  }
};

// ─── GET /api/chat/history/:id ────────────────────────────────────────────────
export const getConversation = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const conversation = await Conversation.findOne({ _id: req.params.id, userId });
    console.log(conversation);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("[getConversation] Error:", error);
    return res.status(500).json({ error: "Failed to fetch conversation." });
  }
};

// ─── DELETE /api/chat/history/:id ─────────────────────────────────────────────
export const deleteConversation = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const result = await Conversation.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: "Conversation not found." });

    return res.status(200).json({ message: "Conversation deleted." });
  } catch (error) {
    console.error("[deleteConversation] Error:", error);
    return res.status(500).json({ error: "Failed to delete conversation." });
  }
};