import type { Metadata } from "next";
import ContactFormPanel from "@/components/ContactFormPanel";
import ObfuscatedEmail from "@/components/ObfuscatedEmail";
import {
  BRAND_NAME,
  AGENT_NAME,
  BROKERAGE_NAME,
  BASED_IN,
  SERVED_AREAS,
  OFFICE_ADDRESS,
} from "@/lib/business-info";
import { getContactPhone } from "@/lib/phone-config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${AGENT_NAME} of ${BRAND_NAME} — data-driven real estate for ${SERVED_AREAS[0]} and beyond.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const phone = getContactPhone();
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Contact
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl">
            Let&rsquo;s talk.
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed">
            Buying, selling, or just want the real numbers on a property? Send a
            note and {AGENT_NAME.split(" ")[0]} will get back to you.
          </p>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            {/* Business identity — the trust-building details */}
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-6">
                Reach out
              </p>
              <dl className="space-y-6">
                <ContactRow label="Agent">
                  {AGENT_NAME}
                </ContactRow>
                <ContactRow label="Brokerage">
                  {BROKERAGE_NAME}
                </ContactRow>
                <ContactRow label="Email">
                  <ObfuscatedEmail />
                </ContactRow>
                <ContactRow label="Phone">
                  <span className="select-all tabular-nums">{phone.display}</span>
                </ContactRow>
                {OFFICE_ADDRESS ? (
                  <ContactRow label="Office">{OFFICE_ADDRESS}</ContactRow>
                ) : null}
                <ContactRow label="Based in">{BASED_IN}</ContactRow>
                <ContactRow label="Markets served">
                  {SERVED_AREAS.join(" · ")}
                </ContactRow>
              </dl>
            </div>

            {/* Contact form — reuses the site-wide panel (styled for navy) */}
            <div className="rounded-3xl navy-gradient p-6 lg:p-8 text-white relative overflow-hidden">
              <div className="absolute inset-0 hero-grid opacity-20" aria-hidden />
              <div className="relative">
                <ContactFormPanel
                  source="contact-page"
                  title="Send a message"
                  showAddress
                  addressLabel="Property or message"
                  addressPlaceholder="Tell me what you're looking for — an address, a neighborhood, or a question…"
                  submitLabel="Send message"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-charcoal/[0.08] pb-4">
      <dt className="font-mono text-[10px] tracking-[0.18em] uppercase text-charcoal/45 mb-1">
        {label}
      </dt>
      <dd className="text-base text-charcoal">{children}</dd>
    </div>
  );
}
