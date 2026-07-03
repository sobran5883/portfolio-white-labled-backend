/**
 * Default content used to seed a brand-new user's portfolio.
 * Mirrors the original single-tenant portfolio so a fresh account
 * starts from a complete, editable example instead of a blank page.
 *
 * Skill icons are referenced by a stable `iconKey` string; the frontend
 * maps each key to a react-icon. Images use empty strings until the user
 * uploads their own (the frontend falls back to placeholders).
 */
function buildDefaultPortfolio(name = "Your Name") {
  return {
    theme: {
      accentColor: "#00E0F2",
      logoText: name.split(" ")[0] || "Portfolio",
    },
    home: {
      role: "Software Developer",
      name,
      typewriter: [
        "I specialize in creating elegant and user-centric digital experiences.",
        "I transform ideas into responsive, dynamic web applications that delight users.",
      ],
      resumeUrl: "",
      photoUrl: "",
    },
    about: {
      title: "About me",
      description:
        "I am a passionate developer with a talent for creating elegant and user-centric digital experiences. Edit this text from your dashboard to describe yourself.",
      info: [
        { fieldName: "Name", fieldValue: name },
        { fieldName: "Phone", fieldValue: "(+00) 000 000 0000" },
        { fieldName: "Experience", fieldValue: "2+" },
        { fieldName: "Nationality", fieldValue: "—" },
        { fieldName: "Languages", fieldValue: "English" },
        { fieldName: "Email", fieldValue: "" },
      ],
    },
    experience: {
      title: "My experience",
      description:
        "With a strong background in web development, I have consistently delivered high-quality digital solutions.",
      items: [
        { company: "Company name", position: "Full Stack Developer", duration: "2025 - Present" },
      ],
    },
    education: {
      title: "My education",
      description:
        "My academic foundation in computer science and engineering.",
      items: [
        { institute: "Your University", degree: "BTech. Computer Science", duration: "2021 - 2025" },
      ],
    },
    skills: {
      title: "My skills",
      description:
        "The technologies and tools I work with. Manage this list from your dashboard.",
      skillList: [
        { iconKey: "html5", name: "html 5" },
        { iconKey: "css3", name: "css 3" },
        { iconKey: "javascript", name: "javascript" },
        { iconKey: "react", name: "react.js" },
        { iconKey: "nextjs", name: "next.js" },
        { iconKey: "tailwind", name: "tailwind.css" },
        { iconKey: "nodejs", name: "node.js" },
        { iconKey: "figma", name: "figma" },
      ],
    },
    stats: [
      { num: 2, text: "Years of experience" },
      { num: 25, text: "Projects Completed" },
      { num: 12, text: "Technologies mastered" },
      { num: 1000, text: "Contributions" },
    ],
    projects: [
      {
        num: "01",
        category: "fullstack",
        title: "Project 1",
        description:
          "A sample project. Replace this with one of your own projects from the dashboard.",
        stack: [{ name: "React.js" }, { name: "Tailwind.css" }, { name: "Node.js" }],
        image: "",
        live: "",
        github: "",
      },
    ],
    achievements: [
      {
        num: "01",
        category: "Open Source",
        title: "Sample achievement",
        description:
          "Describe an achievement or contribution here. Upload a supporting image from the dashboard.",
        tags: ["highlight one", "highlight two"],
        image: "",
      },
    ],
    certificates: [
      {
        num: "01",
        category: "Sample Certificate",
        description:
          "Describe a certificate here and upload its image from the dashboard.",
        image: "",
      },
    ],
    services: [
      {
        num: "01",
        title: "Web Development",
        description: "Describe a service you offer.",
        href: "",
      },
    ],
    contact: {
      heading: "Let's work together",
      description:
        "Whether you have a project in mind, a job opportunity, or just want to chat, feel free to send a message.",
      phone: "",
      email: "",
      address: "",
      services: ["Full Stack Developer", "Frontend Developer", "Backend Developer"],
    },
    socials: [
      { platform: "github", url: "" },
      { platform: "linkedin", url: "" },
    ],
  };
}

export default buildDefaultPortfolio;
