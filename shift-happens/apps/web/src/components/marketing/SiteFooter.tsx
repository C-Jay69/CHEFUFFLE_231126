import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#060a13]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="flex flex-col gap-3">
          <img
            src="/whiteout-logo.png"
            alt="Whiteout"
            className="h-8 w-auto self-start object-contain"
          />
          <p className="max-w-sm font-body-sm text-body-sm leading-relaxed text-text-tertiary">
            One system for the floor, the kitchen, the check and the close. Built by
            HYDRAFORGE AI for restaurants that run on the shift.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-label-badge text-label-badge uppercase tracking-widest text-text-subtle">
            Product
          </span>
          <Link href="/serve" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Serve &amp; order
          </Link>
          <Link href="/kds" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Kitchen display
          </Link>
          <Link href="/floor-plan" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Floor plan
          </Link>
          <Link href="/voice-ai" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Voice AI
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-label-badge text-label-badge uppercase tracking-widest text-text-subtle">
            Get started
          </span>
          <Link href="/pricing" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Pricing
          </Link>
          <Link href="/login" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Sign in
          </Link>
          <Link href="/serve" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Open the terminal
          </Link>
          <Link href="/setup" className="font-body-sm text-body-sm text-text-secondary hover:text-text-primary">
            Setup &amp; diagnostics
          </Link>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-5 font-body-sm text-[12px] text-text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} HYDRAFORGE AI. Whiteout is a HYDRAFORGE AI product.</span>
          <span className="font-label-badge uppercase tracking-widest">Built for the whole shift</span>
        </div>
      </div>
    </footer>
  );
}
