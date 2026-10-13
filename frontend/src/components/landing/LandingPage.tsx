import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValueEvent, useScroll, useSpring } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarSync,
  ChevronDown,
  ClipboardCheck,
  Compass,
  FilePenLine,
  FileSearch,
  FileText,
  FileUp,
  Flag,
  Landmark,
  MessageCircle,
  Microscope,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import AnimatedLogo from '../common/AnimatedLogo';
import Hero from './Hero';
import DiscoverBento from './DiscoverBento';
import ChecklistPreview from './ChecklistPreview';
import ProposalReviewPreview from './ProposalReviewPreview';
import GrantManagerPreview from './GrantManagerPreview';
import MatchPipeline from './MatchPipeline';
import StagesTimeline, { type Stage } from './StagesTimeline';
import { CountUp, Eyebrow, FeatureList, SectionHeading, SpotlightCard } from './MotionPrimitives';
import { buttonClasses } from '../common/buttonStyles';
import { cn } from '../../utils/cn';
import { fadeUp, inViewOnce, listItem, reveal, stagger } from './motion';
import { loadSession } from '../../services/authService';

const NAV_LINKS = [
  { href: '#discover', label: 'Discover' },
  { href: '#apply', label: 'Apply' },
  { href: '#review', label: 'Review' },
  { href: '#manage', label: 'Manage' },
  { href: '#faq', label: 'FAQ' },
];

const AGENCIES = [
  'ANRF (formerly SERB)',
  'DST',
  'DBT',
  'ICMR',
  'BIRAC',
  'CSIR',
  'TDB',
  'DAE',
  'MeitY',
  'UGC',
  'AICTE',
  'INSA',
  'IUSSTF',
  'DRDO',
];

const STATS = [
  { to: 5, label: 'signals behind every match score' },
  { to: 6, label: 'kinds of requirement read from each call' },
  { to: 4, label: 'kinds of reporting deadline tracked' },
  { to: 0, from: 40, label: 'closed calls in your matches' },
];

const STAGES: Stage[] = [
  {
    id: 'discover',
    icon: Compass,
    title: 'Discover',
    body: 'Get open calls ranked against your profile, with ineligible and closed ones left out.',
  },
  {
    id: 'apply',
    icon: ClipboardCheck,
    title: 'Apply',
    body: "Turn the call's guidelines into a checklist with owners and due dates.",
  },
  {
    id: 'review',
    icon: FileText,
    title: 'Review',
    body: "Check each draft against the call's rules and evaluation criteria before you submit.",
  },
  {
    id: 'manage',
    icon: Landmark,
    title: 'Manage',
    body: 'Track reporting deadlines, outputs and spending once the grant is sanctioned.',
  },
];

const APPLY_FEATURES = [
  {
    icon: FileSearch,
    title: 'Six kinds of requirement',
    body: 'Documents and annexures, format limits, eligibility proofs, budget rules, submission details and key dates.',
  },
  {
    icon: Users,
    title: 'Owners and due dates',
    body: 'Give each item an owner and a due date counted back from the call deadline, and watch readiness climb.',
  },
  {
    icon: MessageCircle,
    title: 'Share and remind',
    body: 'Send each person their pending items over WhatsApp, and add the due dates to Google Calendar or any calendar app.',
  },
  {
    icon: Flag,
    title: 'From preparing to awarded',
    body: 'Track the status of every application, including calls you found outside FundSphere.',
  },
];

const REVIEW_FEATURES = [
  {
    icon: Zap,
    title: 'Instant check',
    body: 'Page count, word limits, fonts, paper size, line spacing, required sections and budget rules, measured from the PDF by code.',
  },
  {
    icon: Sparkles,
    title: 'Full AI review',
    body: "A quality score marked against the call's evaluation criteria, with contradictions between sections and the top fixes to make.",
  },
  {
    icon: TrendingUp,
    title: 'Every version kept',
    body: "See whether each revision helps. A broken rule that would get the proposal returned holds the score at 49 until it's fixed.",
  },
];

const MANAGE_FEATURES = [
  {
    icon: FileUp,
    title: 'Set up from the sanction order',
    body: 'Upload the sanction order PDF and FundSphere fills in the dates, amounts and budget heads.',
  },
  {
    icon: CalendarClock,
    title: 'Deadlines from agency rules',
    body: "UCs, statements of expenditure, progress and final reports, worked out from ANRF, DST or ICMR rules. Edit any of them.",
  },
  {
    icon: CalendarSync,
    title: 'A live calendar feed',
    body: "Subscribe once in Google Calendar and every grant's deadlines stay in sync.",
  },
  {
    icon: BookOpen,
    title: 'Outputs in one place',
    body: 'Record papers (imported from ORCID), students trained, equipment, patents and milestones.',
  },
  {
    icon: FilePenLine,
    title: 'Progress report drafts',
    body: 'Drafted from your objectives and outputs, with every claim checked against them. Edit in the browser, export to Word.',
  },
  {
    icon: Wallet,
    title: 'Spend check',
    body: "Compare each budget head with its budget for the financial year, and get warned before money lapses.",
  },
];

const AUDIENCES = [
  {
    icon: Microscope,
    title: 'Early-career researchers',
    body: 'See only the calls that fit your years since PhD and your position, with a checklist ready for each one.',
  },
  {
    icon: Rocket,
    title: 'Deep-tech founders',
    body: 'Find BIRAC, TDB and other innovation grants, and catch budget-rule problems before you submit.',
  },
  {
    icon: Building2,
    title: 'PIs and research offices',
    body: "Keep every award's UCs, progress reports, outputs and spending in one place, synced to your calendar.",
  },
];

const TECH_DETAILS = [
  {
    term: 'Retrieval',
    detail: 'Pinecone hybrid search (dense and sparse vectors) and PostgreSQL full-text search run in parallel, with query expansion and optional HyDE, merged by Reciprocal Rank Fusion.',
  },
  {
    term: 'Scoring',
    detail: 'A bge-reranker-v2-m3 cross-encoder re-ranks candidates, which are scored on five signals: semantic fit 50%, eligibility 20%, keywords 10%, funding fit 10% and deadline 10%. Hard eligibility conflicts are removed first.',
  },
  {
    term: 'Freshness',
    detail: 'A daily scraper hashes agency pages. Only changed pages are re-extracted with Firecrawl; unchanged ones just refresh their verified date.',
  },
  {
    term: 'Documents',
    detail: 'Guidelines, sanction orders and drafts are read into checklists, deadlines and rubric checks. Format rules are measured from the PDF by code, not guessed.',
  },
  {
    term: 'AI gateway',
    detail: 'Every AI call goes through one gateway that falls back across Gemini models and then Groq, respects rate limits and records token use per review.',
  },
  {
    term: 'Evaluation',
    detail: 'An offline harness reports Recall@K, MRR and NDCG@K, and tunes the scoring weights against a labelled benchmark.',
  },
  {
    term: 'Stack',
    detail: 'React 19 and TypeScript, Spring Boot 4 and PostgreSQL, and a FastAPI AI service, joined by short-lived RS256-signed service tokens.',
  },
];

const FAQS = [
  {
    q: 'How does FundSphere decide which grants match me?',
    a: 'It compares your research profile with every open call using both meaning and keywords, then scores each grant on five signals: how closely the research aligns, whether you meet the eligibility rules, keyword overlap, whether the budget fits, and how much time is left before the deadline. Every match comes with a short explanation, so you never have to guess why it was recommended.',
  },
  {
    q: 'Which funding agencies does it cover?',
    a: 'FundSphere is built for researchers in India. It tracks calls from agencies such as ANRF (formerly SERB), DST, DBT, ICMR, BIRAC, CSIR and TDB, and shows amounts in lakh and crore.',
  },
  {
    q: "What happens if I'm not eligible for a grant?",
    a: 'When FundSphere reads a call it extracts the hard requirements, such as a PhD, years of experience, citizenship or institution type. If you clearly fail a mandatory requirement, the call is left out of your matches. If the call is ambiguous, it is shown with a "Check eligibility" flag and the reason.',
  },
  {
    q: 'How does the application checklist work?',
    a: "Start an application from any grant and upload its guidelines. FundSphere lists every document, format limit, eligibility proof, budget rule, submission detail and key date, each with the quote and page it came from. Give items owners and due dates, track readiness, and send the pending list to your team over WhatsApp.",
  },
  {
    q: 'How does the proposal review work?',
    a: "Upload your draft as a PDF. The instant check measures pages, word limits, fonts, sections and budget rules from the PDF itself. The full AI review adds a quality score marked against the call's evaluation criteria, flags contradictions between sections and lists the top fixes. Every version is kept, so you can see whether each revision helps.",
  },
  {
    q: 'Can FundSphere help after my grant is awarded?',
    a: "Yes. Upload the sanction order and FundSphere sets up the grant's dates, amounts and budget heads, works out UC, progress and final report deadlines from the agency's rules, and keeps them in your calendar. Record outputs as they happen, get progress report drafts you can export to Word, and use the spend check to catch money that might lapse.",
  },
  {
    q: 'How up to date are the deadlines?',
    a: 'Agency pages are checked daily and re-processed as soon as their content changes. Every call shows when it was last verified, and calls whose deadline has passed are removed from your matches automatically.',
  },
  {
    q: 'Can I import my profile from ORCID?',
    a: 'Yes. Connect your ORCID iD and FundSphere loads your biography, publications, keywords and affiliation into your profile. You can also import papers from ORCID as outputs of a grant you hold.',
  },
];

/** Rings that orbit behind the closing call to action, each carrying a small light. */
const ORBITS = [
  { size: 340, duration: 28, reverse: false },
  { size: 560, duration: 44, reverse: true },
  { size: 800, duration: 64, reverse: false },
];

function Wordmark({ size = 'md', onDark = false }: { size?: 'md' | 'sm'; onDark?: boolean }) {
  return (
    <span className={`${size === 'md' ? 'text-xl' : 'text-lg'} font-bold tracking-tight`}>
      <span className={cn('transition-colors duration-300', onDark ? 'text-primary-400' : 'text-primary-600')}>Fund</span>
      <span className={cn('transition-colors duration-300', onDark ? 'text-white' : 'text-brand-900')}>Sphere</span>
    </span>
  );
}

function NavBar({ isAuthenticated, onPrimary, onSignIn }: { isAuthenticated: boolean; onPrimary: () => void; onSignIn: () => void }) {
  const { scrollY, scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  const onDark = !scrolled;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled ? 'border-brand-200/80 bg-white/90 shadow-soft backdrop-blur-xl' : 'border-transparent bg-transparent',
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2.5 rounded-lg" aria-label="FundSphere home">
          <AnimatedLogo className="w-8 h-8" onDark={onDark} />
          <Wordmark onDark={onDark} />
        </a>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1 text-sm font-medium">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-2 rounded-lg transition-colors',
                onDark ? 'text-brand-300 hover:text-white hover:bg-white/10' : 'text-brand-600 hover:text-brand-900 hover:bg-brand-100',
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!isAuthenticated && (
            <button
              onClick={onSignIn}
              className={buttonClasses('ghost', 'sm', cn('hidden sm:inline-flex', onDark && 'text-brand-200 hover:text-white hover:bg-white/10'))}
            >
              Sign in
            </button>
          )}
          <button onClick={onPrimary} className={buttonClasses('primary', 'sm', 'btn-shine group')}>
            {isAuthenticated ? 'Dashboard' : 'Get started'}
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <motion.div
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-linear-to-r from-primary-400 to-primary-600"
        style={{ scaleX: progress }}
        aria-hidden="true"
      />
    </header>
  );
}

function ChapterHeading({ number, stage, title, body }: { number: string; stage: string; title: string; body: string }) {
  return (
    <motion.div {...fadeUp} className="max-w-xl">
      <Eyebrow>
        {number} · {stage}
      </Eyebrow>
      <h2 className="mt-4 font-display text-3xl sm:text-[2.75rem] sm:leading-[1.1] font-semibold tracking-[-0.015em] text-brand-900 text-balance">
        {title}
      </h2>
      <p className="mt-4 text-lg text-brand-600 leading-relaxed text-pretty">{body}</p>
    </motion.div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const isAuthenticated = !!loadSession();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const goToApp = () => navigate(isAuthenticated ? '/discovery' : '/auth');
  const primaryCtaLabel = isAuthenticated ? 'Open your matches' : 'Find my grants';

  return (
    <div className="min-h-screen text-brand-900 selection:bg-primary-100 selection:text-primary-900 overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-medium"
      >
        Skip to content
      </a>

      <NavBar isAuthenticated={isAuthenticated} onPrimary={goToApp} onSignIn={() => navigate('/auth')} />

      <main id="main">
        <Hero onPrimary={goToApp} primaryLabel={primaryCtaLabel} />

        {/* ── Agency marquee ───────────────────────────────────────── */}
        <section aria-label="Funders covered" className="pb-16">
          <p className="px-4 text-center text-sm font-medium text-brand-500">Tracks open calls from Indian funding agencies including</p>
          <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <ul className="flex w-max animate-marquee">
              {[...AGENCIES, ...AGENCIES].map((agency, index) => (
                <li
                  key={`${agency}-${index}`}
                  aria-hidden={index >= AGENCIES.length || undefined}
                  className="pr-12 sm:pr-16 text-lg font-bold tracking-tight text-brand-400 whitespace-nowrap transition-colors hover:text-brand-700"
                >
                  {agency}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Numbers ──────────────────────────────────────────────── */}
        <section aria-label="FundSphere in numbers" className="px-4 sm:px-6 pb-24">
          <motion.dl
            {...fadeUp}
            className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-brand-200 bg-white shadow-soft lg:divide-x divide-brand-200"
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse px-6 py-8 text-center">
                <dt className="mt-2 text-sm text-brand-600 text-balance">{stat.label}</dt>
                <dd className="font-display text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight bg-linear-to-b from-brand-900 to-brand-600 bg-clip-text text-transparent">
                  <CountUp to={stat.to} from={stat.from} duration={2} />
                </dd>
              </div>
            ))}
          </motion.dl>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how-it-works" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              eyebrow="How it works"
              title="One workspace for the whole life of a grant"
              body="From the first search to the final utilisation certificate, every step lives in one place."
            />
            <StagesTimeline stages={STAGES} />
          </div>
        </section>

        {/* ── 01 Discover ──────────────────────────────────────────── */}
        <section id="discover" className="px-4 sm:px-6 py-24">
          <div className="max-w-6xl mx-auto">
            <ChapterHeading
              number="01"
              stage="Discover"
              title="Less searching. Fewer wasted applications."
              body="FundSphere reads your research focus and ranks every open call you can apply for. Save the ones you like to a shortlist with private notes."
            />
            <DiscoverBento />
          </div>
        </section>

        {/* ── 02 Apply ─────────────────────────────────────────────── */}
        <section id="apply" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <ChapterHeading
                number="02"
                stage="Apply"
                title="Don't get rejected for a missing annexure"
                body="Upload a call's guidelines and FundSphere lists everything the agency asks for, each item with the quote and page it came from."
              />
              <FeatureList items={APPLY_FEATURES} />
            </div>
            <motion.div {...reveal(0.15)}>
              <ChecklistPreview />
            </motion.div>
          </div>
        </section>

        {/* ── 03 Review ────────────────────────────────────────────── */}
        <section id="review" className="px-4 sm:px-6 py-24">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div {...reveal(0.15)} className="order-last lg:order-first">
              <ProposalReviewPreview />
            </motion.div>
            <div>
              <ChapterHeading
                number="03"
                stage="Review"
                title="Know what reviewers will flag before they do"
                body="Check every draft against the call's own rules before you submit, with or without an application."
              />
              <FeatureList items={REVIEW_FEATURES} />
              <button onClick={goToApp} className={buttonClasses('primary', 'md', 'btn-shine group mt-10')}>
                Review a proposal
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ── 04 Manage ────────────────────────────────────────────── */}
        <section id="manage" className="px-4 sm:px-6 py-24 bg-white border-y border-brand-200">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
              <ChapterHeading
                number="04"
                stage="Manage"
                title="Never miss a UC or report deadline"
                body="Once a grant is sanctioned, FundSphere keeps its dates, budget heads, outputs and reports in one place, worked out from the agency's own rules."
              />
              <motion.div {...reveal(0.15)}>
                <GrantManagerPreview />
              </motion.div>
            </div>

            <ul className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {MANAGE_FEATURES.map(({ icon: Icon, title, body }, index) => (
                <li key={title}>
                  <SpotlightCard delay={(index % 3) * 0.08} className="h-full border-brand-200 bg-brand-50/60 p-6">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-brand-200 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-bold text-brand-900">{title}</h3>
                    <p className="mt-1.5 text-sm text-brand-600 leading-relaxed">{body}</p>
                  </SpotlightCard>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────── */}
        <section className="px-4 sm:px-6 py-24">
          <div className="max-w-6xl mx-auto">
            <SectionHeading eyebrow="Who it's for" title="Built for every kind of applicant" />
            <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
              {AUDIENCES.map(({ icon: Icon, title, body }, index) => (
                <SpotlightCard key={title} delay={index * 0.1} className="border-brand-200 bg-white p-8">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white shadow-[0_8px_20px_-6px_rgba(13,148,136,0.6)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-brand-600 leading-relaxed">{body}</p>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── Under the hood (for the technically curious) ─────────── */}
        <section id="technology" className="relative isolate overflow-hidden px-4 sm:px-6 py-24 bg-brand-950 text-white">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute inset-0 bg-grid-dark [mask-image:radial-gradient(ellipse_60%_70%_at_20%_40%,black,transparent)]" />
            <div className="absolute -left-40 top-10 h-[30rem] w-[30rem] rounded-full bg-primary-600/20 blur-[110px] animate-aurora" />
          </div>
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-14">
            <div className="lg:col-span-2">
              <SectionHeading
                align="left"
                tone="dark"
                eyebrow="Under the hood"
                title="Explainable by design"
                body="For the technically curious: how FundSphere finds, scores and checks."
              />
              <MatchPipeline />
            </div>
            <motion.dl
              {...inViewOnce}
              variants={stagger(0.08, 0.1)}
              className="lg:col-span-3 divide-y divide-white/10 border-y border-white/10"
            >
              {TECH_DETAILS.map(({ term, detail }) => (
                <motion.div key={term} variants={listItem} className="grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-6 py-5">
                  <dt className="font-semibold text-white">{term}</dt>
                  <dd className="sm:col-span-3 text-brand-300 leading-relaxed">{detail}</dd>
                </motion.div>
              ))}
            </motion.dl>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="px-4 sm:px-6 py-24">
          <div className="max-w-3xl mx-auto">
            <SectionHeading eyebrow="FAQ" title="Questions researchers ask us" />
            <motion.div {...fadeUp} className="mt-12 divide-y divide-brand-200 border-y border-brand-200">
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
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
                            isOpen ? 'border-primary-200 bg-primary-50' : 'border-brand-200 bg-white',
                          )}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary-600' : 'text-brand-500'}`}
                            aria-hidden="true"
                          />
                        </span>
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
            </motion.div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────── */}
        <section className="px-4 sm:px-6 pb-24">
          <motion.div
            {...fadeUp}
            className="relative isolate max-w-6xl mx-auto overflow-hidden rounded-3xl bg-brand-950 px-6 py-20 sm:px-16 sm:py-28 text-center"
          >
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
              <div className="absolute left-1/2 top-0 h-[26rem] w-[44rem] max-w-[150%] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary-500/25 blur-[100px] animate-aurora" />
              <div className="absolute inset-0 bg-grid-dark [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
              {ORBITS.map((orbit) => (
                <div
                  key={orbit.size}
                  className="absolute left-1/2 top-1/2 rounded-full border border-white/10 animate-orbit"
                  style={{
                    width: orbit.size,
                    height: orbit.size,
                    marginLeft: -orbit.size / 2,
                    marginTop: -orbit.size / 2,
                    animationDuration: `${orbit.duration}s`,
                    animationDirection: orbit.reverse ? 'reverse' : 'normal',
                  }}
                >
                  <span className="absolute left-1/2 -top-1 -ml-1 h-2 w-2 rounded-full bg-primary-400 shadow-[0_0_12px_3px_rgba(45,212,191,0.6)]" />
                </div>
              ))}
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-[-0.015em] text-white text-balance">
              Your next grant is already out there.
            </h2>
            <p className="mt-4 text-lg text-brand-300 max-w-xl mx-auto text-pretty">
              Build your profile once. FundSphere finds the calls, checks the paperwork and watches the deadlines.
            </p>
            <button onClick={goToApp} className={buttonClasses('inverse', 'lg', 'btn-shine group mt-10 px-8')}>
              {primaryCtaLabel}
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
            </button>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-brand-200 bg-white px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2.5">
              <AnimatedLogo className="w-7 h-7" />
              <Wordmark size="sm" />
            </div>
            <p className="text-xs text-brand-500">Built for researchers in India.</p>
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
