'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Instagram, Plus, MessageCircleQuestion, HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "Apakah harus bayar untuk ikut event?",
    a: "Ya, setiap event punya harga kontribusi per orang. Dana ini untuk operasional (transport, konsumsi, alat). Tapi kalau kamu benar-benar tak bisa, silakan DM kami karena kami punya slot keringanan.",
  },
  {
    q: "Kenapa harus transfer sampai 3 digit terakhir?",
    a: "Tiga digit itu adalah 'kode unik' untuk membantu sistem kami mengenali pembayaranmu secara otomatis. Pastikan nominal transfer persis sesuai agar pendaftaranmu langsung terkonfirmasi tanpa harus menunggu manual.",
  },
  {
    q: "Berapa lama verifikasi pembayaran?",
    a: "Biasanya 1–5 menit setelah dana masuk. Kalau lewat 30 menit belum terverifikasi, cek apakah nominal yang kamu transfer sudah PERSIS. Kalau sudah, DM bukti transfer ke @saratrasaaa.",
  },
  {
    q: "Bagaimana kalau kuota sudah penuh?",
    a: "Tombol daftar akan nonaktif dan muncul pesan 'Kuota penuh'. Pantau Instagram untuk event berikutnya — kami buka pendaftaran baru tiap bulan.",
  },
  {
    q: "Apakah tiket QR bisa dipindai di lokasi?",
    a: "Tiket QR berfungsi sebagai bukti pendaftaran. Tim panitia akan mencocokkan kode referensi kamu di lokasi. Simpan tiket di HP atau screenshot.",
  },
  {
    q: "Bisa membatalkan pendaftaran?",
    a: "Pembayaran yang sudah masuk tidak bisa di-refund. Tapi kalau belum transfer, kamu bisa abaikan saja karena pendaftaran yang statusnya 'menunggu pembayaran' lebih dari 3 hari akan otomatis dibersihkan.",
  },
];

/** Custom trigger: Plus icon in a circular bg that changes on expand.
 *  We hide the shadcn default chevron via `[&>svg:not(.faq-icon)]:hidden`. */
function FaqTrigger({ question }: { question: string }) {
  return (
    <AccordionTrigger
      className={cn(
        "items-center gap-3 py-4 text-left text-base font-medium text-ink",
        "hover:bg-secondary/30 hover:no-underline rounded-lg transition-colors",
        "px-2",
        "[&>svg:not(.faq-icon)]:hidden",
        "[&[data-state=open]>svg.faq-icon]:rotate-45"
      )}
    >
      <span className="pr-4 flex-1">{question}</span>
      <span
        className={cn(
          "faq-icon flex size-8 shrink-0 items-center justify-center rounded-full",
          "bg-secondary text-muted-foreground transition-all duration-200",
          // When expanded, change to primary bg with white icon
          "[&[data-state=open]]:bg-primary [&[data-state=open]]:text-white",
          "group-[[data-state=open]]/item:bg-primary group-[[data-state=open]]/item:text-white"
        )}
        aria-hidden
      >
        <Plus className="size-4 transition-transform duration-200" />
      </span>
    </AccordionTrigger>
  );
}

export function FAQ() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative overflow-hidden bg-gradient-to-b from-background to-secondary/20 px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      {/* Decorative QuestionMark icon floating in the background of the
          section header. Large (size-40 / 10rem), very low opacity, rotated
          slightly so it reads as a "stamp" rather than a literal icon.
          pointer-events-none + aria-hidden — purely cosmetic. Only the one
          mark sits up top-right; the section already has plenty of content
          below so we don't want to clutter it. */}
      <HelpCircle
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-8 size-40 rotate-12 text-primary/[0.06] sm:size-56 lg:size-64"
      />
      {/* A second, smaller question mark mirroring the first on the bottom-left
          for compositional balance. */}
      <HelpCircle
        aria-hidden
        className="pointer-events-none absolute -left-10 bottom-10 size-24 -rotate-6 text-[var(--amber)]/[0.06] sm:size-32"
      />

      <div className="relative mx-auto w-full max-w-3xl">
        <RevealOnScroll>
          {/* Decorative accent above heading */}
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-block h-1 w-8 rounded-full bg-primary" />
            <span className="inline-block h-1 w-3 rounded-full bg-primary/50" />
            <span className="inline-block h-1 w-1.5 rounded-full bg-primary/25" />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            FAQ
          </p>
          <h2
            id="faq-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Pertanyaan yang Sering Ditanyakan
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Belum nemu jawaban? DM ke{" "}
            <a
              href="https://instagram.com/saratrasaaa"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <Instagram className="size-4" aria-hidden />
              @saratrasaaa
            </a>{" "}
            di Instagram.
          </p>
        </RevealOnScroll>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-8"
        >
          <Accordion type="single" collapsible className="w-full space-y-3">
            {FAQS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className={cn(
                  "rounded-xl bg-card/50 border border-border/50 mb-3 px-5 overflow-hidden",
                  "transition-all duration-200",
                  // Left border accent when expanded
                  "[&[data-state=open]]:border-l-2 [&[data-state=open]]:border-l-primary",
                  // Subtle hover bg on the whole item
                  "hover:bg-card/80",
                  "border-0 border-b"
                )}
              >
                <FaqTrigger question={item.q} />
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-5">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        {/* Contact CTA Card */}
        <RevealOnScroll delay={0.2}>
          <div className="mt-8 rounded-2xl bg-gradient-to-r from-primary/10 via-secondary/30 to-[var(--amber)]/10 p-6 border border-primary/10">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <MessageCircleQuestion className="size-6 text-primary" aria-hidden />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-foreground">
                  Masih punya pertanyaan?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Jangan ragu untuk hubungi kami langsung di Instagram. Tim kami siap bantu!
                </p>
              </div>
              <a
                href="https://instagram.com/saratrasaaa"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5",
                  "text-sm font-semibold text-white shadow-md",
                  "transition-all duration-200 hover:bg-primary/90 hover:shadow-lg hover:scale-105",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                )}
              >
                <Instagram className="size-4" aria-hidden />
                DM @saratrasaaa
              </a>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

export default FAQ;
