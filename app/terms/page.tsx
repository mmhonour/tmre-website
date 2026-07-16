import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME, BROKERAGE_NAME } from "@/lib/business-info";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms that govern your use of the ${BRAND_NAME} website.`,
  alternates: { canonical: "/terms" },
};

const EFFECTIVE_DATE = "July 15, 2026";

export default function TermsPage() {
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Legal
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl text-white leading-[1.05]">
            Terms of Use
          </h1>
          <p className="mt-3 font-mono text-[11px] tracking-[0.16em] uppercase text-white/50">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-10">
          <div className="space-y-10 text-charcoal leading-relaxed">
            <p className="text-lg">
              These Terms of Use govern your access to and use of this website.
              By using the site, you agree to these terms. If you do not agree,
              please do not use the site. This site is operated by {BRAND_NAME},
              a licensed agent of {BROKERAGE_NAME}.
            </p>

            <LegalSection title="Informational purposes only">
              <p>
                The content on this site — including market intelligence,
                property scores, valuations, estimates, and investment analyses
                — is provided for general informational purposes only. It does
                not constitute legal, financial, tax, or investment advice, and
                it is not a guarantee of value, condition, or outcome. Always
                consult qualified professionals and independently verify any
                information before making a real estate decision.
              </p>
            </LegalSection>

            <LegalSection title="Listing & market data">
              <p>
                Property, listing, and market data are sourced from multiple
                listing service (MLS) feeds and public records and may be
                delayed, incomplete, or inaccurate. Availability, pricing, and
                status change frequently. Nothing on this site is an offer to
                buy or sell real property.
              </p>
            </LegalSection>

            <LegalSection title="Equal Housing Opportunity">
              <p>
                {BRAND_NAME} is committed to the letter and spirit of U.S.
                policy for the achievement of equal housing opportunity. We
                support and comply with the Fair Housing Act and do not
                discriminate on the basis of race, color, religion, sex,
                handicap, familial status, national origin, or any other
                protected class.
              </p>
            </LegalSection>

            <LegalSection title="Intellectual property">
              <p>
                The site&rsquo;s design, text, graphics, and original analyses
                are owned by {BRAND_NAME} or its licensors and are protected by
                applicable laws. You may view and share content for personal,
                non-commercial use, but may not reproduce, republish, or
                redistribute it without permission.
              </p>
            </LegalSection>

            <LegalSection title="Third-party links">
              <p>
                The site may link to third-party websites or services that we do
                not control. We are not responsible for their content, policies,
                or practices.
              </p>
            </LegalSection>

            <LegalSection title="Limitation of liability">
              <p>
                The site is provided &ldquo;as is&rdquo; without warranties of
                any kind. To the fullest extent permitted by law, {BRAND_NAME}
                will not be liable for any damages arising from your use of, or
                inability to use, the site or its content.
              </p>
            </LegalSection>

            <LegalSection title="Governing law">
              <p>
                These terms are governed by the laws of the State of
                Connecticut, without regard to its conflict-of-laws principles.
              </p>
            </LegalSection>

            <LegalSection title="Changes">
              <p>
                We may update these terms from time to time. Continued use of
                the site after changes take effect constitutes acceptance of the
                revised terms.
              </p>
            </LegalSection>

            <LegalSection title="Contact">
              <p>
                Questions about these terms? Reach us through our{" "}
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
