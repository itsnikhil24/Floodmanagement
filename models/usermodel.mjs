import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
    Name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone_number: { type: String, required: true }, // Change this to String
    posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Item'  // Ensure you reference the Item schema correctly
        }
    ]
});

export default mongoose.model('User', userSchema);
