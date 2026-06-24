import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  phone_number: {
    type: String,
    required: true,
  },

  address: {
    type: String,
    required: true,
  },

  item: {
    type: String,
    required: true,
  },

  quantity: {
    type: Number,
    required: true,
  },

  priceRange: {
    type: String,
    required: true,
  },

  imagePath: {
    type: String,
    required: true,
  },
});

const Item = mongoose.model("Item", itemSchema);

export default Item;