import mongoose from "mongoose";

const { Schema } = mongoose;
const sub = { _id: false };

const themeSchema = new Schema(
  {
    accentColor: { type: String, default: "#00E0F2" },
    logoText: { type: String, default: "Portfolio" },
    pageTransition: {
      type: String,
      enum: ["stairs", "curtains"],
      default: "stairs",
    },
  },
  sub
);

const infoItemSchema = new Schema(
  { fieldName: String, fieldValue: String },
  sub
);

const homeSchema = new Schema(
  {
    role: String,
    name: String,
    typewriter: [String],
    resumeUrl: String,
    photoUrl: String,
  },
  sub
);

const aboutSchema = new Schema(
  { title: String, description: String, info: [infoItemSchema] },
  sub
);

const experienceItemSchema = new Schema(
  { company: String, position: String, duration: String },
  sub
);

const educationItemSchema = new Schema(
  { institute: String, degree: String, duration: String },
  sub
);

const sectionWithItems = (itemSchema) =>
  new Schema({ title: String, description: String, items: [itemSchema] }, sub);

const skillSchema = new Schema({ iconKey: String, name: String }, sub);

const skillsSchema = new Schema(
  { title: String, description: String, skillList: [skillSchema] },
  sub
);

const statSchema = new Schema({ num: Number, text: String }, sub);

const stackItemSchema = new Schema({ name: String }, sub);

const projectSchema = new Schema(
  {
    num: String,
    category: String,
    title: String,
    description: String,
    stack: [stackItemSchema],
    image: String,
    live: String,
    github: String,
  },
  sub
);

const achievementSchema = new Schema(
  {
    num: String,
    category: String,
    title: String,
    description: String,
    tags: [String],
    image: String,
  },
  sub
);

const certificateSchema = new Schema(
  { num: String, category: String, description: String, image: String },
  sub
);

const serviceSchema = new Schema(
  { num: String, title: String, description: String, href: String },
  sub
);

const contactSchema = new Schema(
  {
    heading: String,
    description: String,
    phone: String,
    email: String,
    address: String,
    services: [String],
  },
  sub
);

const socialSchema = new Schema({ platform: String, url: String }, sub);

// Per-page visibility on the public site. Keys mirror the public nav routes
// (Projects is served at /work). A false value hides the page from the nav
// and 404s its route on the public link; the owner's dashboard is unaffected.
const visibilitySchema = new Schema(
  {
    resume: { type: Boolean, default: true },
    work: { type: Boolean, default: true },
    achievements: { type: Boolean, default: true },
    certificates: { type: Boolean, default: true },
    contact: { type: Boolean, default: true },
  },
  sub
);

const portfolioSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true, // allow null until the user picks one
      lowercase: true,
      trim: true,
      index: true,
    },
    published: { type: Boolean, default: false },
    theme: { type: themeSchema, default: () => ({}) },
    home: homeSchema,
    about: aboutSchema,
    experience: sectionWithItems(experienceItemSchema),
    education: sectionWithItems(educationItemSchema),
    skills: skillsSchema,
    stats: [statSchema],
    projects: [projectSchema],
    achievements: [achievementSchema],
    certificates: [certificateSchema],
    services: [serviceSchema],
    contact: contactSchema,
    socials: [socialSchema],
    visibility: { type: visibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("Portfolio", portfolioSchema);
