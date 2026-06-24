import express from 'express';
import cors from 'cors';
import path from 'path';
import bodyParser from 'body-parser';
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import mongoose from "mongoose";
import Item from './models/model.mjs';
import user from './models/usermodel.mjs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import { supabase } from "./supabaseClient.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5007;
const apiKey = process.env.apiKey;
const mongoURI = process.env.mongoURI;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let bucket;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware setup
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection setup with GridFSBucket
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log(`Connected to MongoDB database`);
        bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    })
    .catch(err => console.error("MongoDB connection error:", err));

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware to check if the user is logged in
function isloggedIn(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect("/");

    try {
        const data = jwt.verify(token, "secretKey");
        req.user = data;
        next();
    } catch (err) {
        console.error("JWT verification error:", err);
        res.redirect("/");
    }
}

// Routes
app.get("/", (req, res) => res.render("login-page"));

app.get("/home", isloggedIn, (req, res) => res.render("Home"));
app.get("/chatbot", isloggedIn, (req, res) => res.render("chatbot"));
app.get("/interaction", isloggedIn, (req, res) => res.render("communitypage"));
app.get("/govtscheme", isloggedIn, (req, res) => res.render("govtscheme"));

// Registration route
app.post('/register', async (req, res) => {
    try {
        const { name, username, password, phone_number } = req.body;
        if (!name || !username || !password || !phone_number) return res.status(400).send("All fields are required.");

        const existingUser = await user.findOne({ username });
        if (existingUser) return res.status(400).send("User already exists.");

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new user({ name, username, password: hashedPassword, phone_number });

        await newUser.save();
        res.redirect("/");
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send("Error registering user.");
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        const userRecord = await user.findOne({ username: req.body.username });
        if (!userRecord) return res.status(400).send("User not found.");

        const isPasswordMatch = await bcrypt.compare(req.body.password, userRecord.password);
        if (isPasswordMatch) {
            const token = jwt.sign({ username: userRecord.username }, "secretKey");
            res.cookie("token", token);
            res.redirect("/home");
        } else {
            res.status(400).send("Incorrect Password");
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Login failed.");
    }
});

// Chatbot route with GoogleGenerativeAI
app.post("/chatbot", isloggedIn, async (req, res) => {
   
    const ai = new GoogleGenAI({ apiKey: apiKey }); 

    try {
       
        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash", 
            contents: req.body.query
        });
        
        
        res.send(response.text);
    } catch (error) {
        console.error("Error generating AI response:", error);
        res.status(500).send("An error occurred with the AI service.");
    }
});

// Interaction route with file upload and item creation
app.post("/interaction", isloggedIn, upload.single("picture"), async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).send("No file uploaded");
        }

        const fileName = `${Date.now()}-${req.file.originalname}`;

        const { data, error } = await supabase.storage
            .from("marketplace")
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            });

        if (error) {
            console.error(error);
            return res.status(500).send("Upload failed");
        }

        const { data: publicUrlData } = supabase.storage
            .from("marketplace")
            .getPublicUrl(fileName);
        const imageUrl = publicUrlData.publicUrl;


        const newItem = new Item({
            name: req.body.name,
            phone_number: req.body.phone,
            address: req.body.address,
            item: req.body.item,
            quantity: req.body.quantity,
            priceRange: req.body["price-range"],
            imagePath: imageUrl
        });

        await newItem.save();

        await user.findOneAndUpdate(
            { phone_number: req.body.phone },
            { $push: { posts: newItem._id } },
            { new: true }
        );

        res.redirect("/items");

    } catch (error) {
        console.error(error);
        res.status(500).send("Error uploading item");
    }
});

// Route to display all items on the frontend
app.get('/items', isloggedIn, async (req, res) => {
    try {
        const items = await Item.find();
        res.render('posts', { items });
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).send("Error fetching items");
    }
});

// Route to serve images from GridFS by ID
app.get('/uploads/:id', isloggedIn, async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        const downloadStream = bucket.openDownloadStream(fileId);

        downloadStream.on('data', (chunk) => res.write(chunk));
        downloadStream.on('end', () => res.end());
        downloadStream.on('error', () => res.status(404).send("File not found"));
    } catch (error) {
        console.error("Error retrieving file:", error);
        res.status(500).send("Error retrieving file");
    }
});

// Route to display a specific item by ID
app.get('/item/:id', isloggedIn, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        res.render('item', { item });
    } catch (error) {
        console.error("Error fetching item:", error);
        res.status(500).send('Item not found');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    res.clearCookie("token");
    res.redirect("/");
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
