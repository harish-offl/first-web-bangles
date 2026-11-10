import type { Metadata } from "next";

import { DeveloperHero } from "@/components/developer/DeveloperHero";
import { AboutDeveloper } from "@/components/developer/AboutDeveloper";
import { DeveloperSkills } from "@/components/developer/DeveloperSkills";
import { ExperienceSection } from "@/components/developer/ExperienceSection";
import { SelectedProjects } from "@/components/developer/SelectedProjects";
import { AgencySection } from "@/components/developer/AgencySection";
import { DeveloperApproach } from "@/components/developer/DeveloperApproach";
import { ContactSection } from "@/components/developer/ContactSection";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title:
    "M. R. M. Annamalai | Full-Stack Developer & Founder of Arrise Digital",
  description:
    "Meet M. R. M. Annamalai, a Full-Stack Web Developer and Founder of Arrise Digital. Explore web development projects, technical skills and creative digital experiences.",
  alternates: { canonical: "/developer" },
  openGraph: {
    type: "profile",
    title:
      "M. R. M. Annamalai | Full-Stack Developer & Founder of Arrise Digital",
    description:
      "Meet M. R. M. Annamalai, a Full-Stack Web Developer and Founder of Arrise Digital.",
    url: `${SITE_URL}/developer`,
  },
  twitter: {
    card: "summary_large_image",
    title:
      "M. R. M. Annamalai | Full-Stack Developer & Founder of Arrise Digital",
    description:
      "Meet M. R. M. Annamalai, a Full-Stack Web Developer and Founder of Arrise Digital.",
  },
  robots: { index: true, follow: true },
};

export default function DeveloperPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-page py-12 sm:py-16 lg:py-20">
        <DeveloperHero />
        <AboutDeveloper />
        <DeveloperSkills />
        <ExperienceSection />
        <SelectedProjects />
        <AgencySection />
        <DeveloperApproach />
        <ContactSection />
      </div>
    </div>
  );
}
