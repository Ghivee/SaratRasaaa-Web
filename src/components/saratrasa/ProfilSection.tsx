'use client';

import * as React from "react";
import { Heart, Leaf, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "./RevealOnScroll";
import { BlobShape } from "./DecorativePatterns";

interface ValueCard {
  icon: React.ReactNode;
  title: string;
  body: string;
  iconWrap: string;
  /** RGB triplet for the icon's color — used to build the radial hover glow. */
  glow: string;
  /** Accent color for the decorative line at bottom of card */
  accentColor: string;
}

const VALUES: ValueCard[] = [
  {
    icon: <Heart className="size-6" aria-hidden />,
    title: "Hangat, bukan formal",
    body: "Relawan datang sebagai diri sendiri. Tidak ada seragam ego, hanya niat yang sama.",
    iconWrap: "bg-secondary text-primary",
    glow: "255, 45, 120", // --pink-primary
    accentColor: "#FF2D78",
  },
  {
    icon: <Leaf className="size-6" aria-hidden />,
    title: "Aksi nyata, bukan retorika",
    body: "Setiap event menghasilkan dampak terukur: karung plastik, kantong darah, pohon mangrove.",
    iconWrap: "bg-[var(--success)]/10 text-[var(--success)]",
    glow: "31, 138, 95", // --success
    accentColor: "#1F8A5F",
  },
  {
    icon: <Users className="size-6" aria-hidden />,
    title: "Komunitas yang tumbuh",
    body: "Dari 5 teman jadi ratusan relawan. Setiap orang bawa cerita dan teman baru.",
    iconWrap: "bg-[var(--amber)]/15 text-[var(--amber)]",
    glow: "255, 177, 0", // --amber
    accentColor: "#FFB100",
  },
];

/** Decorative dots divider component */
function DotsDivider() {
  return (
    <div aria-hidden className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="size-2 rounded-full bg-primary/25"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function ProfilSection() {
  return (
    <section
      id="profil"
      className="relative overflow-hidden bg-gradient-to-br from-secondary/20 via-background to-background px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
      aria-labelledby="profil-heading"
    >
      {/* Decorative blobs — two large organic shapes (pink + amber) drifting
          in the section background. Very low opacity (6-8%) + slow scale/
          rotate animation. pointer-events-none + aria-hidden so they never
          interfere with content. The pink blob sits top-left, the amber blob
          sits bottom-right — diagonal composition that draws the eye across
          the section. BlobShape handles prefers-reduced-motion internally. */}
      <BlobShape
        color="pink"
        className="-left-20 -top-16 size-80 sm:size-96"
        opacity={0.08}
        animate
      />
      <BlobShape
        color="amber"
        className="-right-16 bottom-10 size-72 sm:size-80"
        opacity={0.06}
        animate
      />

      <div className="relative mx-auto w-full max-w-7xl">
        <RevealOnScroll className="max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Tentang Kami
          </p>
          <h2
            id="profil-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Kenal Saratrasaa
          </h2>
          <div className="mt-5 relative">
            {/* Decorative opening quote mark */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-6 -left-3 font-display text-7xl leading-none text-primary/15 select-none sm:-top-8 sm:text-8xl"
            >
              &ldquo;
            </span>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              <p>
                Saratrasaa dimulai dari sekumpulan teman di Bandung yang capeh
                melihat sampah menumpuk di tepi sungai sambil ngerjain tugas
                kuliah. Suatu hari mereka putuskan: bukan cuma ngeluh, tapi
                turun. Undang lima teman, bawa karung, jalan kaki ke Cikapundung.
                Selesai hari itu, ada tujuh karung plastik dan satu perasaan
                baru — bahwa kebaikan itu ternyata ringan-ringan aja kalau
                dikerjakan bareng.
              </p>
              <p>
                Misi kami sederhana: bikin jadi relawan itu terasa mudah
                dijalani, bukan khotbah yang berat. Kita campur aduk event
                lingkungan (bersih sungai, tanam mangrove, beach cleanup) dan
                event sosial (donor darah, donor buku, panti asuhan) supaya
                setiap orang bisa nemuin cara pedulinya sendiri. Tidak ada
                minimum komitmen, tidak ada seragam kaku. Datang, bawa diri,
                pulang bawa cerita.
              </p>
            </div>
          </div>
        </RevealOnScroll>

        {/* Visual dots divider */}
        <RevealOnScroll delay={0.1}>
          <DotsDivider />
        </RevealOnScroll>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {VALUES.map((v, i) => (
            <RevealOnScroll key={v.title} delay={i * 0.1}>
              <Card className="group relative h-full overflow-hidden border-border transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:ring-2 hover:ring-primary/20">
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className="relative inline-block">
                    {/* Radial glow behind icon — fades in on hover, tinted with the icon's color */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -inset-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle at center, rgba(${v.glow}, 0.12), transparent 70%)`,
                      }}
                    />
                    {/* Double ring effect on hover */}
                    <div
                      className="relative inline-flex size-14 items-center justify-center rounded-xl transition-all duration-300 ease-out group-hover:scale-110"
                      style={{
                        boxShadow: "none",
                        transition: "box-shadow 300ms ease, transform 300ms ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${v.glow}, 0.15), 0 0 0 6px rgba(${v.glow}, 0.08)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div className={`inline-flex size-14 items-center justify-center rounded-xl ${v.iconWrap}`}>
                        {v.icon}
                      </div>
                    </div>
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {v.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {v.body}
                  </p>
                  {/* Decorative accent line at bottom of card */}
                  <div
                    aria-hidden
                    className="mt-auto h-1 w-12 rounded-full transition-all duration-300 group-hover:w-16"
                    style={{ backgroundColor: v.accentColor, opacity: 0.3 }}
                  />
                </CardContent>
                {/* Decorative 3x3 dot pattern in bottom-right corner — pink, 5% opacity */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 right-2 size-6 opacity-5"
                  style={{
                    backgroundImage: "radial-gradient(var(--pink-primary) 1px, transparent 1px)",
                    backgroundSize: "8px 8px",
                  }}
                />
                {/* Subtle animated background pattern on hover — radial gradient pulse */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(ellipse at top left, rgba(${v.glow}, 0.04), transparent 60%)`,
                  }}
                />
              </Card>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProfilSection;
