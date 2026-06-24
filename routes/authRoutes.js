import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
} from "../controllers/authController.js";
import {
  renderLoginPage,
} from "../controllers/pageController.js";

const router = express.Router();

router.get("/", renderLoginPage);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/logout", logoutUser);

export default router;