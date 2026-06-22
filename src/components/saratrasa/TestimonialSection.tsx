'use client';

import { RevealOnScroll } from '@/components/saratrasa/RevealOnScroll';

/* -------------------------------------------------------------------------- */
/* Data — 6 authentic-sounding Indonesian volunteer testimonials               */
/* -------------------------------------------------------------------------- */

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  event: string;
  initials: string;
  color: string; // tailwind bg class for avatar circle
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    quote:
      'Pertama kali ikut bersih pantai, kagum sama semangat anak-anak. Dari yang awalnya cuma liat Instagram, sekarang jadi rutin. Saratrasaa beneran bikin relawan itu gampang.',
    name: 'Dinda Aulia',
    event: 'Bersih Pantai Pangandaran #2',
    initials: 'DA',
    color: 'bg-primary/20 text-primary',
  },
  {
    id: 2,
    quote:
      'Donor darah tapi seru? Ya di Saratrasaa. Panitianya ramah, suasananya hangat, dan setelah donor dikasih snack + tiket QR. Gila, modern banget.',
    name: 'Farid Rahman',
    event: 'Donor Darah Merah Muda',
    initials: 'FR',
    color: 'bg-[var(--amber)]/20 text-[var(--amber)]',
  },
  {
    id: 3,
    quote:
      'Aku bawa teman 3 orang, mereka pada ketagihan. Sekarang tiap ada event baru, yang nanyain malah mereka. Komunitas ini bikin kebaikan itu kayak habit, bukan burden.',
    name: 'Nadira Putri',
    event: 'Sungai Bersih Cikapundung #2',
    initials: 'NP',
    color: 'bg-[var(--success)]/20 text-[var(--success)]',
  },
  {
    id: 4,
    quote:
      'Sempat ragu karena sendirian, tapi di lapangan langsung Kenalan sama banyak orang. Pulang bawa teman baru DAN karung plastik. Win-win!',
    name: 'Rizky Aditya',
    event: 'Bersih Pantai Pangandaran #2',
    initials: 'RA',
    color: 'bg-secondary text-primary',
  },
  {
    id: 5,
    quote:
      'Web-nya gampang banget dipakai. Daftar, bayar QRIS, cek status — semua dari HP. Nggak perlu chat-chat manual lagi. Proper.',
    name: 'Tania Saputra',
    event: 'Donor Darah Merah Muda',
    initials: 'TS',
    color: 'bg-primary/20 text-primary',
  },
  {
    id: 6,
    quote:
      'Yang paling suka tuh recap setelah event. Baca ceritanya, liat foto-foto, langsung semangat buat daftar event selanjutnya. Saratrasaa nggak cuma event, tapi cerita.',
    name: 'Arief Wibisono',
    event: 'Sungai Bersih Cikapundung #2',
    initials: 'AW',
    color: 'bg-[var(--amber)]/20 text-[var(--amber)]',
  },
];

/* -------------------------------------------------------------------------- */
/* TestimonialCard                                                             */
/* -------------------------------------------------------------------------- */

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="flex min-w-[280px] snap-start flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md md:min-w-0">
      {/* Decorative quote mark */}
      <span
        aria-hidden
        className="font-display text-4xl leading-none text-primary/40 select-none"
      >
        &ldquo;
      </span>

      {/* Quote text */}
      <p className="flex-1 text-sm italic leading-relaxed text-foreground/90 sm:text-base">
        {t.quote}
      </p>

      {/* Separator */}
      <div className="h-px w-full bg-border" />

      {/* Author row */}
      <div className="flex items-center gap-3">
        {/* Avatar circle with initials */}
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.color}`}
        >
          {t.initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{t.name}</p>
          <p className="truncate text-xs text-muted-foreground">{t.event}</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TestimonialSection — "Kata Relawan"                                         */
/* -------------------------------------------------------------------------- */

export function TestimonialSection() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="relative overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background py-16 sm:py-20 lg:py-24"
    >
      {/* Decorative oversized quotation marks — two huge, very-faded glyphs
          that frame the section like a pull-quote in a magazine. Top-left
          (opening ") and bottom-right (closing ") for diagonal balance.
          The font-display family (Bricolage Grotesque) gives them weight.
          pointer-events-none + aria-hidden — purely decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 left-2 select-none font-display text-[12rem] leading-none text-primary/[0.05] sm:text-[16rem] lg:text-[20rem]"
      >
        &ldquo;
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-2 select-none font-display text-[12rem] leading-none text-[var(--amber)]/[0.05] sm:text-[16rem] lg:text-[20rem]"
      >
        &rdquo;
      </span>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <RevealOnScroll className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Kata Relawan
          </p>
          <h2
            id="testimonials-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Mereka Sudah Turun, Ini Ceritanya
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Testimoni jujur dari relawan yang sudah ikut aksi Saratrasaa.
          </p>
        </RevealOnScroll>

        {/* Testimonial cards — horizontal scroll on mobile, 3-col grid on desktop */}
        <RevealOnScroll delay={0.15}>
          {/* Mobile: horizontal scroll with snap */}
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide md:hidden">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>

          {/* Desktop: 3-column grid */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-6">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

export default TestimonialSection;
