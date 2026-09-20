import mongoose from "mongoose";

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and configure it.");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("[db] connected to MongoDB");
}

export default connectDB;
