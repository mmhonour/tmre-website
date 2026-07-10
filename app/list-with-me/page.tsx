import ContactFormPanel from "@/components/ContactFormPanel";

export const metadata = {
  title: "List With Me — TMRE",
  description:
    "Thinking of selling? Share your property details and Timothy will follow up about listing with TMRE.",
};

export default function ListWithMePage() {
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Sellers
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            List With Me
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Tell me about your property — street address, town, or any notes —
            and I&apos;ll follow up.
          </p>
        </div>
      </section>

      <section className="bg-cream pt-10 pb-16 lg:pt-14 lg:pb-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="mx-auto max-w-md rounded-2xl bg-navy border border-charcoal/10 shadow-xl shadow-charcoal/10 p-5 sm:p-6">
            <ContactFormPanel
              source="list-with-me"
              title="List With Me"
              showAddress
              requireAddress
              addressLabel="Your property"
              addressPlaceholder="123 Main St, Fairfield — or describe the property and any timing notes…"
              submitLabel="Send listing inquiry"
            />
          </div>
        </div>
      </section>
    </>
  );
}
