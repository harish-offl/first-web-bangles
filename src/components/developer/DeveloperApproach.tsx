"use client";

import { motion } from "framer-motion";

type Step = {
  number: string;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    title: "Discover",
    description: "Understand the problem, requirements, business goals and target audience.",
  },
  {
    number: "02",
    title: "Design",
    description: "Create intuitive user interfaces, visual systems and responsive layouts.",
  },
  {
    number: "03",
    title: "Develop",
    description: "Build reliable, maintainable and high-performance digital experiences.",
  },
  {
    number: "04",
    title: "Deliver",
    description: "Test, optimize and deploy production-ready solutions.",
  },
];

const stepVariants = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6, staggerChildren: 0.15},
    },
  },
  step: {
    hidden: { opacity: 0, x: -30 },
    show: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.6},
    },
  },
};

export function DeveloperApproach() {
  return (
    <section
      id="approach"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        variants={stepVariants.container}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto space-y-12"
      >
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium tracking-[0.22em] uppercase text-primary">
            06 / My Approach
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground tracking-tight">
            From Idea to Implementation.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step) => (
            <motion.div
              key={step.number}
              variants={stepVariants.step}
              className="p-6 rounded-xl border border-gold/30 bg-accent transition-all hover:shadow-card hover:border-gold/50"
            >
              <p className="font-display text-2xl font-semibold text-gold">
                {step.number}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}





