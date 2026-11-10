"use client";

import { motion } from "framer-motion";

const aboutVariants = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6},
    },
  },
  label: {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.2, duration: 0.6},
    },
  },
  heading: {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.3, duration: 0.7},
    },
  },
  text: {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.5, duration: 0.7},
    },
  },
  stat: {
    hidden: { opacity: 0, scale: 0.9 },
    show: {
      opacity: 1,
      scale: 1,
      transition: { delay: 0.7, duration: 0.6},
    },
  },
};

export function AboutDeveloper() {
  return (
    <section
      id="about"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        variants={aboutVariants.container}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto space-y-12"
      >
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <motion.p
              variants={aboutVariants.label}
              className="text-xs font-medium tracking-[0.22em] uppercase text-primary"
            >
              01 / About Me
            </motion.p>
            <motion.h2
              variants={aboutVariants.heading}
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground tracking-tight"
            >
              Technology Meets Creativity.
            </motion.h2>
          </div>

          <div className="mt-6 lg:mt-0 grid grid-cols-2 gap-6 sm:gap-8">
            {[1, 2].map((n) => (
              <motion.div
                key={n}
                variants={aboutVariants.stat}
                className="p-4 bg-gradient-to-br from-primary to-gold-hover rounded-xl border border-gold/30 shadow-card"
              >
                <p className="text-sm font-medium text-primary-foreground">
                  {n === 1 ? "Madurai, India" : "3+ Years Experience"}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          variants={aboutVariants.text}
          className="max-w-2xl text-muted-foreground leading-relaxed sm:text-base"
        >
          <p className="mb-6">
            I’m M. R. M. Annamalai, a Full-Stack Web Developer and creative
            technologist from Madurai, Tamil Nadu.
          </p>
          <p className="mb-6">
            With over three years of experience working across web development,
            design and digital content creation, I enjoy transforming ideas
            into functional and visually engaging digital experiences.
          </p>
          <p className="mb-6">
            My approach combines technical problem-solving, user-focused design
            and creative thinking. Whether it’s developing an e-commerce
            platform, building a modern business website or designing a digital
            product, I focus on creating solutions that are practical, scalable
            and memorable.
          </p>
          <p>
            I also lead Arrise Digital, where I help businesses strengthen
            their digital presence through website development, branding and
            creative digital solutions.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}





