import express from 'express';
import cors from 'cors';
import path from 'path';
import bodyParser from 'body-parser';
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import mongoose from "mongoose";
import Item from './models/model.mjs'; // Item model path
import User from './models/usermodel.mjs'; // User model path
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";

const apiKey = "AIzaSyBmst3O5RD4WjR_d6UnTPR6GXgj5E5gaTY"; // Replace with your actual API key
const app = express();
const PORT = 3000;
let bucket;

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public'))); // Serve static files
app.use(cors());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// MongoDB connection URI
const mongoURI = "mongodb://localhost:27017/floodmanagement"; // Replace with your database name

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

// Routes
app.get("/home", (req, res) => {
    res.render("Home.ejs");
});

app.get("/chatbot", (req, res) => {
    res.render("chatbot.ejs");
});

app.get("/", (req, res) => {
    res.render("login-page.ejs");
});

app.get("/interaction", (req, res) => {
    res.render("communitypage.ejs");
});

// Register route with bcrypt hashing and JWT generation
app.post('/register', async (req, res) => {
    try {
        if (!req.body.password) {
            return res.status(400).send("Password is required");
        }

        let user = await User.findOne({ username: req.body.username });
        if (user) {
            return res.status(404).send("User already exists");
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        const createdUser = await User.create({
            Name: req.body.name,
            username: req.body.username,
            password: hashedPassword,
            phone_number: req.body.phone
        });

        const token = jwt.sign({ username: req.body.username }, "shhhhh");
        res.cookie("token", token);
        res.render("home", { createdUser });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send("Error registering user");
    }
});

// Login route
app.post('/login', async (req, res) => {
    let user = await User.findOne({ username: req.body.username });
    if (!user) {
        return res.send('User not found');
    }

    bcrypt.compare(req.body.password, user.password, (err, result) => {
        if (result) {
            let token = jwt.sign({ email: user.email, userid: user._id }, 'ssssssg');
            res.cookie('token', token);
            res.render("home", { user });
        } else {
            res.send("Incorrect Password");
        }
    });
});

// Chatbot route with GoogleGenerativeAI
app.post("/chatbot", async (req, res) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
    const prompt = req.body.query;
    try {
        const result = await model.generateContent(prompt);
        res.send(result.data.choices[0].text);
    } catch (error) {
        console.error("Error generating AI response:", error);
        res.status(500).send("An error occurred with the AI service.");
    }
});

// Interaction route with file upload and item creation
app.post("/interaction", upload.single("picture"), async (req, res) => {
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
                    imagePath: uploadStream.id.toString()  // Store GridFS file ID here
                });

                await newItem.save();

                await User.findOneAndUpdate(
                    { phone_number: req.body.phone },
                    { $push: { posts: newItem._id } },
                    { new: true, useFindAndModify: false }
                );

                res.send("Form data and file uploaded successfully to MongoDB");
            });
    } catch (error) {
        console.error("Error uploading data:", error);
        res.status(500).send("Error uploading data");
    }
});

// Route to see all posts
// Route to display all items on the frontend
// Route to see all posts
app.get('/items', async (req, res) => {
    try {
        const items = await Item.find(); // Fetch all items from MongoDB
        res.render('posts.ejs', { items }); // Render the 'posts' view with fetched items
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).send("Error fetching items");
    }
});


// Route to serve images from GridFS by ID
// Route to serve images from GridFS by ID
app.get('/uploads/:id', async (req, res) => {
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
// Assuming you're using Express
app.get('/item/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const item = await Item.findById(itemId); // Fetch item from the database
        res.render('item.ejs', { item }); // Render a detailed view with item data
    } catch (error) {
        console.error(error);
        res.status(500).send('Item not found');
    }
});




// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
