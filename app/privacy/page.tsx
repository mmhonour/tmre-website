import type { Metadata } from "next";
import Link from "next/link";
import { AGENT_MLS_ID, BRAND_NAME } from "@/lib/business-info";
import { getBrokerageNameFresh } from "@/lib/brokerage-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND_NAME} collects, uses, and protects your information.`,
  alternates: { canonical: "/privacy" },
};

const EFFECTIVE_DATE = "July 15, 2026";

export default async function PrivacyPage() {
  const brokerageName = await getBrokerageNameFresh();
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Legal
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl text-white leading-[1.05]">
            Privacy Policy
          </h1>
          <p className="mt-3 font-mono text-[11px] tracking-[0.16em] uppercase text-white/50">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-10">
          <div className="prose-legal space-y-10 text-charcoal leading-relaxed">
            <p className="text-lg">
              {BRAND_NAME} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo;) respects your privacy. This policy explains what
              information we collect when you use this website, how we use it,
              and the choices you have. {BRAND_NAME} is operated by a licensed
              agent of {brokerageName} (MLS #{AGENT_MLS_ID}).
            </p>

            <LegalSection title="Information we collect">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Information you provide.</strong> When you submit a
                  contact, inquiry, or &ldquo;list with me&rdquo; form, we
                  collect the name, email address, phone number, and any
                  property details or message you choose to share.
                </li>
                <li>
                  <strong>Usage information.</strong> To understand how the site
                  is used and to improve it, we record basic, non-identifying
                  visit information such as pages viewed and general activity.
                </li>
                <li>
                  <strong>Cookies.</strong> We use a small number of functional
                  cookies — for example, to remember that you&rsquo;ve unlocked
                  a protected area of the site. We do not use advertising
                  cookies.
                </li>
              </ul>
            </LegalSection>

            <LegalSection title="How we use your information">
              <ul className="list-disc pl-5 space-y-2">
                <li>To respond to your inquiries and provide the services you request.</li>
                <li>To send you information you&rsquo;ve asked for about properties or the market.</li>
                <li>To operate, maintain, and improve the website.</li>
                <li>To comply with legal and regulatory obligations.</li>
              </ul>
            </LegalSection>

            <LegalSection title="How we share information">
              <p>
                We do <strong>not</strong> sell your personal information. We
                share it only with service providers that help us operate the
                site and communicate with you — for example, our email delivery
                provider and our hosting provider — and only to the extent
                needed to perform those services. We may also disclose
                information where required by law.
              </p>
            </LegalSection>

            <LegalSection title="Property data">
              <p>
                Listing and property information displayed on this site is
                derived from multiple listing service (MLS) and public records
                data and is provided for general informational purposes. It may
                not always be current or complete and should be independently
                verified.
              </p>
            </LegalSection>

            <LegalSection title="Data retention & security">
              <p>
                We keep the information you submit for as long as needed to
                respond to you and to meet our legal and business obligations,
                and we take reasonable measures to protect it. No method of
                transmission or storage is completely secure, so we cannot
                guarantee absolute security.
              </p>
            </LegalSection>

            <LegalSection title="Your choices">
              <p>
                You may request access to, correction of, or deletion of the
                personal information you&rsquo;ve provided, and you may opt out
                of further communications at any time. To make a request, reach
                us through our{" "}
                <Link
                  href="/contact"
                  className="text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold"
                >
                  contact page
                </Link>
                .
              </p>
            </LegalSection>

            <LegalSection title="Children">
              <p>
                This site is intended for adults and is not directed to children
                under 13. We do not knowingly collect information from children.
              </p>
            </LegalSection>

            <LegalSection title="Changes to this policy">
              <p>
                We may update this policy from time to time. When we do, we will
                revise the effective date above.
              </p>
            </LegalSection>

            <LegalSection title="Contact us">
              <p>
                Questions about this policy? Reach us through our{" "}
                <Link
                  href="/contact"
                  className="text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold"
                >
                  contact page
                </Link>
                .
              </p>
            </LegalSection>
          </div>
        </div>
      </section>
    </>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-serif text-2xl lg:text-3xl text-navy mb-4 leading-tight">
        {title}
      </h2>
      <div className="space-y-3 text-slate">{children}</div>
    </div>
  );
}
