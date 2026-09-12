import ContactFormPanel from "@/components/ContactFormPanel";

export const metadata = {
  title: "Preview — List With Me — TMRE",
  robots: { index: false, follow: false },
};

export default function ListWithMePreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">List With Me</h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Same seller form as /list-with-me. Submit persists to Neon{" "}
          <code className="font-mono text-[12px]">contacts</code> — not a
          serverless JSON file. Address suggestions come from the property
          directory.
        </p>
        <div className="mx-auto max-w-md rounded-2xl border border-charcoal/10 bg-navy p-5 shadow-xl shadow-charcoal/10 sm:p-6">
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
    </div>
  );
}
