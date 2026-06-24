import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { fileURLToPath } from "url";


import authRoutes from "./routes/authRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import { connectDB } from "./config/db.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); 

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());


app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// Database connection
connectDB(process.env.MONGO_URI);

// Routes
app.use("/", authRoutes);
app.use("/", pageRoutes);
app.use("/api/chat", chatRoutes);
app.use("/", itemRoutes);

// Server setup
const PORT = process.env.PORT || 5007;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;