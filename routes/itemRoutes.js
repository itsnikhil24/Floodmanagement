import express from "express";
import {
  createItem,
  getAllItems,
  getItemById,
  streamUploadedFile,
} from "../controllers/itemController.js";
import { isLoggedIn } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.post("/interaction", isLoggedIn, upload.single("picture"), createItem);
router.get("/items", isLoggedIn, getAllItems);
router.get("/item/:id", isLoggedIn, getItemById);
router.get("/uploads/:id", isLoggedIn, streamUploadedFile);

export default router;