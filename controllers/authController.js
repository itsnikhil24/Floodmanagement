import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

export const registerUser = async (req, res) => {
  try {
    const { name, username, password, phone_number } = req.body;

    if (!name || !username || !password || !phone_number) {
      return res.status(400).send("All fields are required.");
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).send("User already exists.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      username,
      password: hashedPassword,
      phone_number,
    });

    await newUser.save();
    return res.redirect("/");
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).send("Error registering user.");
  }
};

export const loginUser = async (req, res) => {
  try {
    const userRecord = await User.findOne({ username: req.body.username });
    if (!userRecord) return res.status(400).send("User not found.");

    const isPasswordMatch = await bcrypt.compare(req.body.password, userRecord.password);
    if (isPasswordMatch) {
      const token = jwt.sign(
        {
          userId: userRecord._id,
          username: userRecord.username,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );
      res.cookie("token", token);
      res.redirect("/home");
    } else {
      res.status(400).send("Incorrect Password");
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Login failed.");
  }
};

export const logoutUser = (req, res) => {
  res.clearCookie("token");
  return res.redirect("/");
};