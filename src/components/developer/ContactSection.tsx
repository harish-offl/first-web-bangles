"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function ContactSection() {
  return (
    <section
      id="contact"
      className="mt-20 sm:mt-28 lg:mt-36"
    >
      <motion.div
        className="max-w-5xl mx-auto space-y-10"
      >
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium tracking-[0.22em] uppercase text-dev-accent">
            07 / Let&apos;s Connect
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-medium text-foreground tracking-tight">
            Have an Idea? Let’s Build It.
          </h2>
        </div>

        <p className="max-w-xl mx-auto sm:mx-0 text-secondary-foreground leading-relaxed sm:text-base">
          I’m always interested in meaningful projects, creative collaborations
          and opportunities to build something valuable.
        </p>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-8">
            <div>
              <h4 className="font-display text-xl font-medium text-foreground mb-3">
                Portfolio
              </h4>
              <a
                href="https://annamalaiportfolio.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Visit M. R. M. Annamalai portfolio (opens in a new tab)"
              >
                https://annamalaiportfolio.vercel.app/
              </a>
            </div>
            <div>
              <h4 className="font-display text-xl font-medium text-foreground mb-3">
                Agency
              </h4>
              <a
                href="https://arrisedigital.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Visit Arrise Digital website (opens in a new tab)"
              >
                https://arrisedigital.vercel.app/
              </a>
            </div>
            <div>
              <h4 className="font-display text-xl font-medium text-foreground mb-3">
                LinkedIn
              </h4>
              <a
                href="https://linkedin.com/in/mrmannamalai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Connect on LinkedIn (opens in a new tab)"
              >
                https://linkedin.com/in/mrmannamalai
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <Link
              href="https://annamalaiportfolio.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Visit Portfolio (opens in a new tab)"
            >
              Visit Portfolio
            </Link>
            <Link
              href="https://arrisedigital.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-transparent px-6 py-3 text-sm font-medium text-primary transition-all hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Explore Arrise Digital (opens in a new tab)"
            >
              Explore Arrise Digital
            </Link>
            <a
              href="https://linkedin.com/in/mrmannamalai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gold bg-transparent px-6 py-3 text-sm font-medium text-gold transition-all hover:bg-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Connect on LinkedIn (opens in a new tab)"
            >
              Connect on LinkedIn
            </a>
          </div>
        </div>

        <div className="mt-16 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold bg-transparent px-8 py-4 text-base font-medium text-gold transition-all hover:bg-gold hover:text-white hover:shadow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← Back to Bangles by Beauty
          </Link>
        </div>
      </motion.div>
    </section>
  );
}





