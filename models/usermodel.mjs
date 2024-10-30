import mongoose from 'mongoose';

// mongoose.connect("mongodb://localhost:27017/floodmanagement");
// mongoose.connect(`mongodb://localhost:27017/floodmanagement`); 


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

export default mongoose.model('user', userSchema);
