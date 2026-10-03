import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  Microscope,
  Rocket,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import AnimatedLogo from '../common/AnimatedLogo';
import InteractiveMatchDemo from './InteractiveMatchDemo';
import { buttonClasses } from '../common/buttonStyles';
import { loadSession } from '../../services/authService';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#proposal-review', label: 'Proposal review' },
  { href: '#faq', label: 'FAQ' },
];

const AGENCIES = ['NIH', 'NSF', 'Horizon Europe', 'SERB / DST', 'Wellcome Trust', 'Gates Foundation', 'ARPA-E'];

const STEPS = [
  {
    title: 'Tell us about your research',
    body: 'Describe your work, career stage and citizenship, or import everything from your ORCID record in one click.',
  },
  {
    title: 'Get ranked, explained matches',
    body: 'Every open call is scored against your profile. Each match says why it fits and flags anything you may not qualify for.',
  },
  {
    title: 'Polish your proposal',
    body: "Upload your draft with the call guidelines. Get a section-by-section review against the funder's own rubric.",
  },
];

const AUDIENCES = [
  {
    icon: Microscope,
    title: 'Early-career researchers',
    body: 'See only calls that fit your years since PhD, such as NIH ESI or ERC Starting Grant windows.',
  },
  {
    icon: Rocket,
    title: 'Deep-tech founders',
    body: 'Find non-dilutive innovation grants, commercialisation schemes and industry–academia consortia.',
  },
  {
    icon: Building2,
    title: 'PIs and research offices',
    body: 'Check large multi-investigator drafts for missing sections and budget conflicts before submission.',
  },
];

const TECH_DETAILS = [
  {
    term: 'Retrieval',
    detail: 'PostgreSQL keyword search and Pinecone vector search (with HyDE) fused by Reciprocal Rank Fusion, then re-ranked by a bge-reranker-v2-m3 cross-encoder.',
  },
  {
    term: 'Scoring',
    detail: 'Five calibrated signals: semantic fit, eligibility, keywords, budget fit and deadline freshness. Hard eligibility rules exclude or flag a grant outright.',
  },
  {
    term: 'Freshness',
    detail: 'Agency pages are fingerprinted with SHA-256 hashes; Firecrawl re-extracts only when a page actually changes. Expired calls are filtered automatically.',
  },
  {
    term: 'Evaluation',
    detail: 'An offline harness reports Recall@K, MRR and NDCG@K, with a weight sweeper that tunes scoring without extra LLM calls.',
  },
  {
    term: 'Stack',
    detail: 'React 19 + TypeScript, Spring Boot + PostgreSQL, and a FastAPI AI service.',
  },
];

const FAQS = [
  {
    q: 'How does FundSphere decide which grants match me?',
    a: 'It compares your research profile with every open call using both meaning and keywords, then scores each grant on five signals: how closely the research aligns, whether you meet the eligibility rules, keyword overlap, whether the budget fits, and how much time is left before the deadline. Every match comes with a short explanation, so you never have to guess why it was recommended.',
  },
  {
    q: "What happens if I'm not eligible for a grant?",
    a: 'When FundSphere ingests a call it extracts the hard requirements, such as a PhD, a post-PhD experience window, citizenship or organisation type. If you clearly fail a mandatory requirement, the grant is left out of your recommendations. If the call is ambiguous, it is shown with a "Check eligibility" flag and the reason.',
  },
  {
    q: 'How does the proposal review work?',
    a: "Upload your draft as a PDF along with the official guidelines. FundSphere extracts the funder's evaluation rubric and reviews your draft section by section, highlighting missing requirements, inconsistencies and specific wording improvements. Quick mode takes about 10 seconds; Deep mode takes about 45 seconds and scores against the full rubric.",
  },
  {
    q: 'How up to date are the deadlines?',
    a: 'Agency pages are checked regularly and re-processed as soon as their content changes. Every grant shows when it was last verified, and calls whose deadline has passed are removed from your recommendations automatically.',
  },
  {
    q: 'Can I import my profile from ORCID?',
    a: 'Yes. Connect your ORCID iD and FundSphere loads your biography, publications, keywords and affiliation into your profile. You can edit anything afterwards.',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: 'easeOut' },
} as const;

function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'text-center max-w-2xl mx-auto' : 'max-w-xl'}>
      <p className="text-sm font-semibold text-primary-700">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl sm:text-[2.75rem] sm:leading-[1.1] font-semibold tracking-tight text-brand-900 text-balance">{title}</h2>
      {body && <p className="mt-4 text-lg text-brand-600 leading-relaxed text-pretty">{body}</p>}
    </div>
  );
}

function Wordmark({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return (
    <span className={`${size === 'md' ? 'text-xl' : 'text-lg'} font-bold tracking-tight`}>
      <span className="text-primary-600">Fund</span>
      <span className="text-brand-900">Sphere</span>
    </span>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const isAuthenticated = !!loadSession();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const goToApp = () => navigate(isAuthenticated ? '/discovery' : '/auth');
  const primaryCtaLabel = isAuthenticated ? 'Open your matches' : 'Find my grants';

  return (
    <div className="min-h-screen text-brand-900 selection:bg-primary-100 selection:text-primary-900 overflow-x-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-medium"
      >
        Skip to content
      </a>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-brand-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <a href="#top" className="flex items-center gap-2.5 rounded-lg" aria-label="FundSphere home">
            <AnimatedLogo className="w-8 h-8" />
            <Wordmark />
          </a>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1 text-sm font-medium text-brand-600">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-lg hover:text-brand-900 hover:bg-brand-100/70 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <button onClick={() => navigate('/auth')} className={buttonClasses('ghost', 'sm', 'hidden sm:inline-flex')}>
                Sign in
              </button>
            )}
            <button onClick={goToApp} className={buttonClasses('primary', 'sm')}>
              {isAuthenticated ? 'Dashboard' : 'Get started'}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section id="top" className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
          <div className="absolute inset-0 -z-10 bg-grid-soft [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" aria-hidden="true" />

          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-brand-200 text-[13px] sm:text-sm font-medium text-brand-700 shadow-soft"
          >
            <Sparkles className="w-4 h-4 text-primary-600" aria-hidden="true" />
            For researchers, labs and deep-tech founders
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-6 mx-auto max-w-4xl font-display text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-balance"
          >
            Find the grants you can{' '}
            <span className="bg-gradient-to-r from-primary-600 to-cyan-600 bg-clip-text text-transparent">actually win</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 mx-auto max-w-2xl text-lg sm:text-xl text-brand-600 leading-relaxed text-pretty"
          >
            FundSphere matches you with open funding calls you're eligible for, explains why each one fits,
            and reviews your proposal against the funder's rubric before you submit.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button onClick={goToApp} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto px-8 shadow-lg shadow-primary-600/25')}>
              {primaryCtaLabel}
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
            <a href="#demo" className={buttonClasses('secondary', 'lg', 'w-full sm:w-auto')}>
              See a live match
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-brand-600"
          >
            {['One-click ORCID import', 'Ineligible calls filtered out', 'Closed deadlines never shown'].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-primary-600" aria-hidden="true" />
                {item}
              </li>
            ))}
          </motion.ul>
        </section>

        {/* ── Live demo, framed as the product ───────────────────── */}
        <section id="demo" aria-label="Live match preview" className="px-4 sm:px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="max-w-5xl mx-auto rounded-3xl border border-brand-200/80 bg-white/70 backdrop-blur-sm shadow-elevated overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 h-11 border-b border-brand-200/70 bg-brand-50/80">
              <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
              <span className="ml-3 text-xs font-medium text-brand-500">Try it: pick a researcher and see how a grant is matched</span>
            </div>
            <div className="p-4 sm:p-8 bg-brand-50/40">
              <InteractiveMatchDemo />
            </div>
          </motion.div>
        </section>

        {/* ── Agency strip ────────────────────────────────────────── */}
        <section aria-label="Funders covered" className="px-4 sm:px-6 pb-20">
          <p className="text-center text-sm font-medium text-brand-500">Tracks open calls from funders including</p>
          <ul className="mt-5 max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {AGENCIES.map((agency) => (
              <li key={agency} className="text-lg font-bold tracking-tight text-brand-500">
                {agency}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Features (bento) ────────────────────────────────────── */}
        <section id="features" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200/70">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              eyebrow="Features"
              title="Less searching. Fewer wasted applications."
              body="Everything you need to go from a blank search to a submission-ready proposal."
            />

            <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Ranked matches (wide) */}
              <motion.div {...fadeUp} className="lg:col-span-2 rounded-3xl border border-brand-200/80 bg-brand-50/60 p-8 flex flex-col">
                <h3 className="text-xl font-bold">Matches ranked by how well they fit you</h3>
                <p className="mt-2 text-brand-600 leading-relaxed max-w-lg">
                  FundSphere reads your research focus and ranks every open call. Each match comes with a plain-language reason, so you can decide in seconds.
                </p>
                <ul className="mt-8 space-y-3" aria-hidden="true">
                  {[
                    { title: 'ERC Starting Grant — Life Sciences', score: 94 },
                    { title: 'Wellcome Early-Career Award', score: 88 },
                    { title: 'NSF CAREER: Molecular Biosciences', score: 71 },
                  ].map((row) => (
                    <li key={row.title} className="flex items-center gap-4 rounded-2xl bg-white border border-brand-200/70 px-4 py-3 shadow-soft">
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-brand-800">{row.title}</span>
                      <span className="hidden sm:block w-28 h-2 rounded-full bg-brand-100 overflow-hidden">
                        <span className="block h-full rounded-full bg-primary-500" style={{ width: `${row.score}%` }} />
                      </span>
                      <span className="w-10 text-right text-sm font-bold tabular-nums text-primary-700">{row.score}%</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Eligibility */}
              <motion.div {...fadeUp} className="rounded-3xl border border-brand-200/80 bg-brand-50/60 p-8">
                <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                  <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-bold">No more ineligible applications</h3>
                <p className="mt-2 text-brand-600 leading-relaxed">
                  PhD requirements, career-stage windows, citizenship and organisation type are checked before a grant reaches you.
                </p>
                <ul className="mt-6 space-y-2 text-sm" aria-hidden="true">
                  <li className="flex items-center gap-2 text-brand-700"><Check className="w-4 h-4 text-primary-600" />PhD completed</li>
                  <li className="flex items-center gap-2 text-brand-700"><Check className="w-4 h-4 text-primary-600" />Within 7 years of PhD</li>
                  <li className="flex items-center gap-2 text-amber-700"><TriangleAlert className="w-4 h-4" />Host institution must be in the EU</li>
                </ul>
              </motion.div>

              {/* Freshness */}
              <motion.div {...fadeUp} className="rounded-3xl border border-brand-200/80 bg-brand-50/60 p-8">
                <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                  <CalendarCheck className="w-6 h-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-bold">Deadlines you can trust</h3>
                <p className="mt-2 text-brand-600 leading-relaxed">
                  Closed calls disappear automatically, and every grant shows when its details were last verified at the source.
                </p>
              </motion.div>

              {/* ORCID (wide) */}
              <motion.div {...fadeUp} className="lg:col-span-2 rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-white flex flex-col sm:flex-row sm:items-center gap-8">
                <div className="flex-1">
                  <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl bg-white/15">
                    <GraduationCap className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">Your profile in one click</h3>
                  <p className="mt-2 text-primary-50 leading-relaxed max-w-md">
                    Connect your ORCID iD and we load your biography, publications, keywords and affiliation. Edit anything afterwards.
                  </p>
                </div>
                <div className="sm:w-64 rounded-2xl bg-white/10 border border-white/20 p-4 text-sm space-y-2" aria-hidden="true">
                  <p className="font-mono text-xs text-primary-100">0000-0002-1825-0097</p>
                  {['Biography', '24 publications', '12 keywords', 'Affiliation'].map((item) => (
                    <p key={item} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary-200" />{item}</p>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how-it-works" className="px-4 sm:px-6 py-24">
          <div className="max-w-6xl mx-auto">
            <SectionHeading eyebrow="How it works" title="From profile to proposal in three steps" />
            <ol className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 relative">
              <span className="hidden md:block absolute top-6 left-[16%] right-[16%] h-px bg-brand-200" aria-hidden="true" />
              {STEPS.map((step, idx) => (
                <motion.li key={step.title} {...fadeUp} className="relative text-center">
                  <span className="relative mx-auto flex w-12 h-12 items-center justify-center rounded-full bg-white border-2 border-primary-500 text-lg font-bold text-primary-700 shadow-soft">
                    {idx + 1}
                  </span>
                  <h3 className="mt-6 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-brand-600 leading-relaxed max-w-xs mx-auto">{step.body}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Proposal review ──────────────────────────────────────── */}
        <section id="proposal-review" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200/70">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <SectionHeading
                align="left"
                eyebrow="Proposal review"
                title="Know what reviewers will flag before they do"
                body="Upload your draft and the call guidelines. FundSphere pulls out the funder's scoring rubric and checks your proposal against it, section by section."
              />
              <ul className="mt-8 space-y-4">
                {[
                  ['Rubric-based scoring', 'Each section is scored against the criteria the funder actually uses.'],
                  ['Specific fixes, not vague advice', 'See exact passages to revise and why they matter to reviewers.'],
                  ['Quick or deep', 'A 10-second check for formatting and requirements, or a 45-second full review.'],
                  ['Share with co-PIs', 'Export the report as PDF or Markdown for sign-off.'],
                ].map(([title, body]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      <Check className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-brand-900">{title}</p>
                      <p className="text-brand-600">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={goToApp} className={buttonClasses('primary', 'md', 'mt-10')}>
                Review a proposal
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <motion.div {...fadeUp} className="rounded-3xl border border-brand-200 bg-white p-6 shadow-elevated" aria-label="Example proposal review">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-brand-100">
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-800">
                  <FileText className="w-4 h-4 text-primary-600" aria-hidden="true" />
                  Proposal_Draft_v3.pdf
                </span>
                <span className="text-sm font-bold text-primary-700 tabular-nums">91 / 100</span>
              </div>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="rounded-2xl bg-brand-50 border border-brand-200/70 p-4">
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>Specific aims &amp; significance</span>
                    <span className="text-primary-700 tabular-nums">9.5</span>
                  </div>
                  <p className="mt-1 text-brand-600">Clear rationale and strong alignment with the call's stated priorities.</p>
                </li>
                <li className="rounded-2xl bg-brand-50 border border-brand-200/70 p-4">
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>Research strategy</span>
                    <span className="text-primary-700 tabular-nums">8.8</span>
                  </div>
                  <p className="mt-1 text-brand-600">Power calculation confirmed. Describe control-group parameters in Aim 2.</p>
                </li>
                <li className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                  <div className="flex justify-between gap-3 font-semibold text-amber-900">
                    <span>Budget justification</span>
                    <span className="flex items-center gap-1"><TriangleAlert className="w-4 h-4" aria-hidden="true" />Fix</span>
                  </div>
                  <p className="mt-1 text-amber-800">Travel budget exceeds the cap in guidelines section 4.2.</p>
                </li>
              </ul>
            </motion.div>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────── */}
        <section className="px-4 sm:px-6 py-24">
          <div className="max-w-6xl mx-auto">
            <SectionHeading eyebrow="Who it's for" title="Built for every kind of applicant" />
            <div className="mt-14 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-brand-200">
              {AUDIENCES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="py-8 first:pt-0 last:pb-0 md:py-0 md:px-8 md:first:pl-0 md:last:pr-0">
                  <Icon className="w-7 h-7 text-primary-600" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-brand-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Under the hood (for the technically curious) ─────────── */}
        <section id="technology" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200/70">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div>
              <SectionHeading
                align="left"
                eyebrow="Under the hood"
                title="Explainable by design"
                body="For the technically curious: how FundSphere finds and scores grants."
              />
            </div>
            <dl className="lg:col-span-2 divide-y divide-brand-200/80 border-y border-brand-200/80">
              {TECH_DETAILS.map(({ term, detail }) => (
                <div key={term} className="grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-6 py-5">
                  <dt className="font-semibold text-brand-900">{term}</dt>
                  <dd className="sm:col-span-3 text-brand-600 leading-relaxed">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="px-4 sm:px-6 py-24">
          <div className="max-w-3xl mx-auto">
            <SectionHeading eyebrow="FAQ" title="Questions researchers ask us" />
            <div className="mt-12 divide-y divide-brand-200 border-y border-brand-200">
              {FAQS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                const panelId = `faq-panel-${idx}`;
                return (
                  <div key={faq.q}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full py-5 flex items-center justify-between gap-6 text-left text-lg font-semibold text-brand-900 hover:text-primary-700 transition-colors"
                      >
                        {faq.q}
                        <ChevronDown
                          className={`w-5 h-5 shrink-0 text-brand-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary-600' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    </h3>
                    <div
                      id={panelId}
                      role="region"
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <div className="overflow-hidden" inert={!isOpen}>
                        <p className="pb-6 text-brand-600 leading-relaxed">{faq.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────── */}
        <section className="px-4 sm:px-6 pb-24">
          <div className="relative max-w-6xl mx-auto overflow-hidden rounded-3xl bg-brand-900 px-6 py-16 sm:px-16 sm:py-20 text-center">
            <div
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.25),transparent_60%)]"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-white text-balance">
                Your next grant is already out there.
              </h2>
              <p className="mt-4 text-lg text-brand-300 max-w-xl mx-auto">
                Build your profile once and see every open call you qualify for, ranked and explained.
              </p>
              <button onClick={goToApp} className={buttonClasses('inverse', 'lg', 'mt-10 px-8')}>
                {primaryCtaLabel}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-brand-200 bg-white px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <AnimatedLogo className="w-7 h-7" />
            <Wordmark size="sm" />
          </div>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-brand-600">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-primary-700 transition-colors">
                {link.label}
              </a>
            ))}
            {!isAuthenticated && (
              <button onClick={() => navigate('/auth')} className="hover:text-primary-700 transition-colors">
                Sign in
              </button>
            )}
          </nav>
          <p className="text-sm text-brand-500">© {new Date().getFullYear()} FundSphere</p>
        </div>
      </footer>
    </div>
  );
}
