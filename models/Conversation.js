import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "model"],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New conversation",
    },
    messages: [messageSchema],
    lastQueryHash: {
      type: String,
      default: null,
    },
    lastResponseText: {
      type: String,
      default: null,
    },
    lastResponseAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);
conversationSchema.pre("save", function (next) {
  if (
    this.isNew &&
    this.messages.length > 0 &&
    this.title === "New conversation"
  ) {
    const firstMsg = this.messages[0].text;
    this.title =
      firstMsg.length > 50 ? firstMsg.substring(0, 50) + "..." : firstMsg;
  }
  next();
});

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;