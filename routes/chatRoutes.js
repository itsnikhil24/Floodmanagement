import express from "express";
import { isLoggedIn } from "../middleware/authMiddleware.js";
import {
  chatbotResponse,
  getChatHistory,
  getConversation,
  deleteConversation,
  getCacheStats,        
} from "../controllers/chatController.js";

const router = express.Router();

router.use(isLoggedIn);

router.post("/message",        chatbotResponse);
router.get("/history",         getChatHistory);
router.get("/history/:id",     getConversation);
router.delete("/history/:id",  deleteConversation);
router.get("/cache-stats",     getCacheStats);  

export default router;