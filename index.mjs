import express from 'express';
import cors from 'cors';
import path from 'path';
import bodyParser from 'body-parser';
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import mongoose from "mongoose";
import Item from './models/model.mjs'; // Item model path
import user from './models/usermodel.mjs'; // User model path
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config(); // Correctes


const apiKey = process.env.apiKey;
const mongoURI = process.env.mongoURI;
const PORT = process.env.PORT || 5000
const app = express();
let bucket;

// Set EJS as the view engine
app.set('views', path.resolve(process.cwd(), 'views'));

// Middleware setup
app.use(cookieParser()); // Corrected: Use cookie-parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public'))); // Serve static files
app.use(cors());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// MongoDB connection URI


// Connect to MongoDB using Mongoose and set up GridFSBucket
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log(`Connected to MongoDB database: floodmanagement`);
        bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    })
    .catch(err => console.error("MongoDB connection error:", err));

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware to check if user is logged in
function isloggedIn(req, res, next) {
    const token = req.cookies.token;
    if (!token) { // Check if token is missing
        return res.redirect("/"); // Redirect to the login page if token is missing
    }

    try {
        const data = jwt.verify(token, "secretkey"); // Consistent secret key
        req.user = data; // Attach user data to the request for further use
        next(); // Move to the next middleware or route handler
    } catch (err) {
        console.error("JWT verification error:", err);
        res.redirect("/"); // Redirect to login if verification fails
    }
}

// Routes
app.get("/home", isloggedIn, (req, res) => {
    res.render("Home.ejs");
});

app.get("/chatbot", isloggedIn, (req, res) => {
    res.render("chatbot.ejs");
});

app.get("/", (req, res) => {
    res.render("login-page.ejs");
});

app.get("/interaction", isloggedIn, (req, res) => {
    res.render("communitypage.ejs");
});

app.post('/register', async (req, res) => {
    try {
        const { name, username, password, phone_number } = req.body;

        if (!name || !username || !password || !phone_number) {
            return res.status(400).send("All fields are required.");
        }

        let existingUser = await user.findOne({ username });
        if (existingUser) {
            return res.status(400).send("User already exists.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new user({
            Name: name,
            username,
            password: hashedPassword,
            phone_number
        });

        await newUser.save();

        // Redirect to the login page after successful registration
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
        if (!userRecord) {
            return res.send("User not found.");
        }

        const match = await bcrypt.compare(req.body.password, userRecord.password);
        if (match) {
            const token = jwt.sign({ username: userRecord.username }, 'secretkey');
            res.cookie("token", token);
            res.redirect("/home"); // Redirect to home page after login
        } else {
            res.send("Incorrect Password");
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Login failed.");
    }
});

// Chatbot route with GoogleGenerativeAI
app.post("/chatbot", isloggedIn, async (req, res) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = req.body.query;


    try {
        const result = await model.generateContent(prompt);
        const responseText = await result.response.text(); // Await to ensure text extraction

        res.send(responseText); // Send response as plain text
    } catch (error) {
        console.error("Error generating AI response:", error);
        res.status(500).send("An error occurred with the AI service.");
    }
});

// Interaction route with file upload and item creation
app.post("/interaction", isloggedIn, upload.single("picture"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        const readableFileStream = new Readable();
        readableFileStream.push(req.file.buffer);
        readableFileStream.push(null);

        const uploadStream = bucket.openUploadStream(req.file.originalname, {
            contentType: req.file.mimetype
        });

        readableFileStream.pipe(uploadStream)
            .on('error', (err) => {
                console.error("File upload error:", err);
                res.status(500).json({ message: 'Error uploading file' });
            })
            .on('finish', async () => {
                const newItem = new Item({
                    name: req.body.name,
                    phone_number: req.body.phone,
                    address: req.body.address,
                    item: req.body.item,
                    quantity: req.body.quantity,
                    priceRange: req.body['price-range'],
                    imagePath: uploadStream.id.toString() // Store GridFS file ID here
                });

                await newItem.save();

                await user.findOneAndUpdate(
                    { phone_number: req.body.phone },
                    { $push: { posts: newItem._id } },
                    { new: true, useFindAndModify: false }
                );

                res.redirect("/items");
            });
    } catch (error) {
        console.error("Error uploading data:", error);
        res.status(500).send("Error uploading data");
    }
});

// Route to display all items on the frontend
app.get('/items', isloggedIn, async (req, res) => {
    try {
        const items = await Item.find(); // Fetch all items from MongoDB
        res.render('posts.ejs', { items });
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
        downloadStream.on('error', () => res.status(404).send("File not found"));
        downloadStream.on('end', () => res.end());
    } catch (error) {
        console.error("Error retrieving file:", error);
        res.status(500).send("Error retrieving file");
    }
});

app.get('/item/:id', isloggedIn, async (req, res) => {
    try {
        const itemId = req.params.id;
        const item = await Item.findById(itemId); // Fetch item from the database
        res.render('item.ejs', { item });
    } catch (error) {
        console.error(error);
        res.status(500).send('Item not found');
    }
});

app.get("/govtscheme", isloggedIn, (req, res) => {
    res.render("govtscheme.ejs");
});

// Logout route
app.get('/logout', (req, res) => {
    res.clearCookie("token"); // Clear the token cookie
    res.redirect("/"); // Redirect to login page after logout
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
