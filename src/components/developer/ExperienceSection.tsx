"use client";

import { motion } from "framer-motion";

const statVariants = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6, staggerChildren: 0.2},
    },
  },
  item: {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6},
    },
  },
};

export function ExperienceSection() {
  const stats = [
    { value: "3+", label: "Years Experience in Digital & Creative Work" },
    { value: "75+", label: "Creative & Development Projects Delivered" },
    { value: "10+", label: "Clients & Businesses Served" },
    { value: "3", label: "Main Disciplines — Development, Design & Content" },
  ];

  return (
    <section
      id="experience"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        variants={statVariants.container}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto space-y-10"
      >
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium tracking-[0.22em] uppercase text-primary">
            03 / Experience
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground tracking-tight">
            Building, Learning & Creating.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <motion.div
              key={stat.value}
              variants={statVariants.item}
              className="p-6 rounded-xl border border-gold/30 bg-accent text-center sm:text-left transition-all hover:shadow-card"
            >
              <p className="font-display text-4xl font-semibold text-primary leading-none">
                {stat.value}
              </p>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg border border-gold/20 bg-brand-c100 text-sm text-muted-foreground">
          Verified details only. No invented employment history, client names, awards or certifications.
        </div>
      </motion.div>
    </section>
  );
}





