"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const serviceVariants = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6, staggerChildren: 0.1},
    },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5},
    },
  },
};

export function AgencySection() {
  const services = [
    "Website Development",
    "Social Media Management",
    "Professional Video Editing",
    "Graphic Design",
    "Branding & Visual Identity",
    "Digital Marketing",
    "Creative Digital Solutions",
  ];

  return (
    <section
      id="agency"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        className="max-w-5xl mx-auto space-y-10"
      >
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium tracking-[0.22em] uppercase text-primary">
            05 / My Agency
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground tracking-tight">
            Building Digital Experiences Through Arrise Digital.
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-6">
            <h3 className="font-display text-2xl font-medium text-foreground">
              Arrise Digital
            </h3>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold">
              Founder & Creative Developer
            </p>
            <p className="mt-2 text-muted-foreground leading-relaxed sm:text-base">
              Arrise Digital is a creative digital agency focused on helping
              businesses establish, improve and grow their digital presence. We
              combine modern website development, creative branding, social
              media management and digital solutions to help businesses connect
              with their audiences.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold">
              Partners in Progress.
            </p>
          </div>

          <div>
            <h4 className="font-display text-xl font-medium text-foreground mb-6">
              Services
            </h4>
            <motion.div
              variants={serviceVariants.container}
              initial="hidden"
              animate="show"
              className="grid sm:grid-cols-2 gap-4"
            >
              {services.map((service) => (
                <motion.div
                  key={service}
                  variants={serviceVariants.item}
                  className="flex items-center gap-2 rounded-lg border border-gold/30 bg-accent px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-card"
                >
                  <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" />
                  {service}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="https://arrisedigital.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Explore Arrise Digital (opens in a new tab)"
          >
            Explore Arrise Digital
          </Link>
        </div>
      </motion.div>
    </section>
  );
}





