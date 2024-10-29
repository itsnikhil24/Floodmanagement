import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone_number: { type: String, required: true }, // Ensure phone_number is a string
    address: { type: String, required: true },
    item: { type: String, required: true },
    quantity: { type: Number, required: true },
    priceRange: { type: String, required: true },
    imagePath: { type: String, required: true } // Use imagePath instead of imageId
});

const Item = mongoose.model('Item', itemSchema);
export default Item;
