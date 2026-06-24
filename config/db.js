import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

let bucket = null;

export const connectDB = async () => {
  try {
    const mongoURI = process.env.mongoURI;

    if (!mongoURI) {
      throw new Error(
        "mongoURI is undefined. Check your .env file."
      );
    }

    await mongoose.connect(mongoURI);

    console.log("Connected to MongoDB database");

    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    console.log("GridFS Bucket Initialized");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

export const getBucket = () => bucket;

export default connectDB;