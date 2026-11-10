"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

type SkillCategory = {
  title: string;
  skills: string[];
};

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    title: "Frontend Development",
    skills: ["HTML5", "CSS3", "JavaScript", "TypeScript", "React.js", "Next.js", "Tailwind CSS"],
  },
  {
    title: "Backend & Database",
    skills: ["Node.js", "Supabase", "PostgreSQL", "REST APIs", "Authentication", "Database Integration"],
  },
  {
    title: "Design & Creative",
    skills: ["UI/UX Design", "Figma", "Canva", "Responsive Design", "Visual Design", "Motion & Interaction Design"],
  },
  {
    title: "Development Tools",
    skills: ["VS Code", "Git", "GitHub", "Vercel", "AI-Assisted Development"],
  },
];

const skillVariants = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6, staggerChildren: 0.15},
    },
  },
  category: {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6},
    },
  },
  skill: {
    hidden: { opacity: 0, scale: 0.9 },
    show: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4},
    },
  },
};

export function DeveloperSkills() {
  return (
    <section
      id="skills"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        variants={skillVariants.container}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto space-y-12"
      >
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium tracking-[0.22em] uppercase text-primary">
            02 / Expertise
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground tracking-tight">
            Tools I Use to Build Digital Experiences.
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {SKILL_CATEGORIES.map((category) => (
            <motion.div
              key={category.title}
              variants={skillVariants.category}
              className="space-y-6"
            >
              <h3 className="font-display text-lg font-medium text-foreground">
                {category.title}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {category.skills.map((skill) => (
                  <motion.span
                    key={skill}
                    whileHover={{ scale: 1.05 }}
                    variants={skillVariants.skill}
                    className="px-3 py-2 rounded-lg border border-gold/30 bg-accent text-xs font-medium text-foreground transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-card"
                  >
                    {skill}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Plus className="size-4 text-gold" aria-hidden="true" />
          Open to learning new tools and technologies
        </div>
      </motion.div>
    </section>
  );
}





