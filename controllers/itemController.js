import mongoose from "mongoose";
import Item from "../models/Item.js";
import User from "../models/User.js";
import { supabase } from "../config/supabase.js";
import { getBucket } from "../config/db.js";

export const createItem = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const fileName = `${Date.now()}-${req.file.originalname}`;

    const { error } = await supabase.storage
      .from("marketplace")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (error) {
      console.error("Supabase upload error:", error);
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
      imagePath: imageUrl,
    });

    await newItem.save();

    await User.findOneAndUpdate(
      { phone_number: req.body.phone },
      { $push: { posts: newItem._id } },
      { new: true }
    );

    return res.redirect("/items");
  } catch (error) {
    console.error("Error uploading item:", error);
    return res.status(500).send("Error uploading item");
  }
};

export const getAllItems = async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    return res.render("posts", { items });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).send("Error fetching items");
  }
};

export const getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).send("Item not found");
    }

    return res.render("item", { item });
  } catch (error) {
    console.error("Error fetching item:", error);
    return res.status(500).send("Item not found");
  }
};

export const streamUploadedFile = async (req, res) => {
  try {
    const bucket = getBucket();

    if (!bucket) {
      return res.status(500).send("Storage bucket not ready");
    }

    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on("error", () => {
      return res.status(404).send("File not found");
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error retrieving file:", error);
    return res.status(500).send("Error retrieving file");
  }
};