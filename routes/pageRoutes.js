import express from "express";
import {
  renderHomePage,
  renderChatbotPage,
  renderCommunityPage,
  renderGovtSchemePage,
} from "../controllers/pageController.js";
import { isLoggedIn } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/home", isLoggedIn, renderHomePage);
router.get("/chatbot", isLoggedIn, renderChatbotPage);
router.get("/interaction", isLoggedIn, renderCommunityPage);
router.get("/govtscheme", isLoggedIn, renderGovtSchemePage);

export default router;