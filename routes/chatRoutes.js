import express from "express";
import { isLoggedIn } from "../middleware/authMiddleware.js";
import {
  chatbotResponse,
  chatbotStreamResponse,
  getChatHistory,
  getConversation,
  deleteConversation,
} from "../controllers/chatController.js";

const router = express.Router();

// All chat routes require authentication
router.use(isLoggedIn);



router.post("/message", chatbotResponse);


router.post("/stream", chatbotStreamResponse);


router.get("/history", getChatHistory);


router.get("/history/:id", getConversation);


router.delete("/history/:id", deleteConversation);

export default router;