import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  FileCheck2,
  Cpu,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Zap,
  TrendingUp,
  FileText,
  Check,
  GraduationCap,
  Code2,
  ShieldCheck,
  Sliders,
  Database,
  Layers,
  Microscope,
  Rocket,
  Building2,
  CalendarCheck
} from 'lucide-react';
import AnimatedLogo from '../common/AnimatedLogo';
import InteractiveMatchDemo from './InteractiveMatchDemo';
import { loadSession } from '../../services/authService';

export default function LandingPage() {
  const navigate = useNavigate();
  const isAuthenticated = !!loadSession();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleCtaClick = () => {
    if (isAuthenticated) {
      navigate('/discovery');
    } else {
      navigate('/auth');
    }
  };

  const FAQS = [
    {
      q: 'How does FundSphere match grants using Hybrid RAG?',
      a: 'FundSphere combines full-text keyword retrieval from PostgreSQL with dense vector embeddings in Pinecone (expanded via HyDE). Both result sets are merged using Reciprocal Rank Fusion (RRF) and re-ranked using a cross-encoder model (bge-reranker-v2-m3). Candidates are scored across 5 signals: semantic similarity, eligibility criteria, keyword matching, budget fit, and deadline freshness.',
    },
    {
      q: 'How does the Eligibility Guard work?',
      a: 'During grant ingestion, FundSphere extracts structured constraints such as PhD requirements, post-PhD experience windows, citizenship restrictions, and applicant organization types. If a researcher does not meet a mandatory hard guard, the opportunity is excluded from recommendations or flagged with a clear reason.',
    },
    {
      q: 'How does the AI Proposal Assistant evaluate drafts?',
      a: 'You can upload your draft proposal PDF along with the official funding guidelines. The system parses both documents, extracts the funder’s specific evaluation rubric, and audits your proposal section by section (in Quick or Deep mode) to highlight missing requirements, inconsistencies, and line-by-line revision suggestions.',
    },
    {
      q: 'How are grant deadlines tracked and kept fresh?',
      a: 'The scraper pipeline computes SHA-256 content hashes of agency pages to detect updates without wasteful processing. When changes occur, structured grant schemas are updated. Expired grants are automatically filtered out so only active funding calls are recommended.',
    },
    {
      q: 'Can I prefill my profile using my ORCID iD?',
      a: 'Yes. FundSphere supports one-click ORCID import, allowing you to automatically load your research bio, verified publications, keywords, and affiliation data into your researcher profile.',
    },
  ];

  return (
    <div className="min-h-screen text-slate-900 font-sans selection:bg-teal-100 selection:text-teal-900 relative overflow-x-hidden">
      
      {/* ────────────────────────────────────────────────────────────
          1. Glass Navbar (White Theme)
      ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/85 border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <AnimatedLogo className="w-9 h-9" />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-teal-600 group-hover:text-teal-700 transition-colors">Fund</span>
              <span className="text-slate-900">Sphere</span>
            </span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-teal-600 transition-colors">Features</a>
            <a href="#simulator" className="hover:text-teal-600 transition-colors">Matching Engine</a>
            <a href="#how-it-works" className="hover:text-teal-600 transition-colors">How It Works</a>
            <a href="#use-cases" className="hover:text-teal-600 transition-colors">Use Cases</a>
            <a href="#proposal-ai" className="hover:text-teal-600 transition-colors">Proposal Assistant</a>
            <a href="#architecture" className="hover:text-teal-600 transition-colors">Architecture</a>
            <a href="#faq" className="hover:text-teal-600 transition-colors">FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/discovery')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm shadow-teal-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/auth')}
                  className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-all"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm shadow-teal-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Launch App</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────
          2. Hero Section (White Theme)
      ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-14 pb-20 sm:pt-20 sm:pb-28 lg:pt-28 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        
        {/* Real Architecture Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-6 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>Hybrid RAG & Vector Intelligence Platform</span>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
          <span className="text-teal-700 normal-case font-medium">Explainable Matching</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 max-w-5xl leading-[1.1]"
        >
          AI-Driven Grant Discovery with{' '}
          <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-600 bg-clip-text text-transparent">
            Explainable Matching
          </span>{' '}
          & Proposal Audits.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl leading-relaxed font-normal"
        >
          Designed for researchers, lab directors, and deep-tech founders. 
          Combines <strong className="text-teal-800 font-semibold">Pinecone vector search</strong>, keyword retrieval, and a <strong className="text-teal-800 font-semibold">Cross-Encoder reranker</strong> with hard eligibility guards and automated proposal rubric audits.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <button
            onClick={handleCtaClick}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-base shadow-lg shadow-teal-600/25 transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <span>{isAuthenticated ? 'Open Grant Discovery' : 'Start Exploring Grants'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <a
            href="#simulator"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-base shadow-sm transition-all"
          >
            <Sliders className="w-5 h-5 text-teal-600" />
            <span>Interactive Match Simulator</span>
          </a>
        </motion.div>

        {/* Technical Highlights Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 font-medium"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span>Cross-Encoder Re-Ranking (bge-reranker)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span>5-Signal Calibrated Scoring</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span>1-Click ORCID Sync</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span>Strict Eligibility Filtering</span>
          </div>
        </motion.div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          3. Live Interactive Simulator Section
      ──────────────────────────────────────────────────────────── */}
      <section id="simulator" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">Demonstration Sandbox</span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 mt-2">
            How The 5-Signal Matching Engine Evaluates Grants
          </h2>
          <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto mt-2">
            Select a sample research persona below to explore how semantic similarity, hard eligibility rules, keywords, budget fit, and deadlines are scored.
          </p>
        </div>

        <InteractiveMatchDemo />
      </section>

      {/* ────────────────────────────────────────────────────────────
          4. Technical Architecture Capabilities (Replacing Fake Stats)
      ──────────────────────────────────────────────────────────── */}
      <section className="py-16 bg-white/80 border-y border-slate-200/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-3">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900">3-Tier Hybrid RAG</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                PostgreSQL full-text retrieval merged with Pinecone dense vector embeddings using Reciprocal Rank Fusion.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900">5-Signal Guard</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Evaluates PhD requirements, career stage windows, citizenship, budget fit, and deadline freshness.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Zero Hallucinations</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Past deadlines are automatically filtered out from recommendations so you never apply to closed calls.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Rubric Compliance</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Extracts agency scoring rubrics from guidelines and performs section-by-section proposal compliance audits.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          5. Agency Ingestion Compatibility Strip
      ──────────────────────────────────────────────────────────── */}
      <section className="py-12 border-b border-slate-200/60 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">
            Ingestion & Schema Support for National and International Funding Calls
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14">
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🏛️ NIH (USA)</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🔭 NSF (USA)</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🇪🇺 Horizon Europe</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🇮🇳 SERB / DST</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🧬 Wellcome Trust</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">🌍 Gates Foundation</span>
            <span className="text-sm sm:text-base font-bold tracking-wider text-slate-700">⚡ ARPA-E</span>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          6. Core Features Deep-Dive (White Theme Grid)
      ──────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">Engineered For Accuracy</span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mt-3 leading-tight">
            Comprehensive Funding Discovery & Proposal Review
          </h2>
          <p className="text-slate-600 text-base sm:text-lg mt-4">
            A modular suite designed to eliminate missed opportunities, wasted applications, and proposal compliance errors.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* Card 1: Hybrid RAG & Vector Search */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-teal-300 hover:shadow-[0_8px_30px_rgba(13,148,136,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 mb-6 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  RAG Architecture
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Hybrid Vector & Keyword RRF</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Combines PostgreSQL keyword search with Pinecone dense vector embeddings and HyDE. Fused with Reciprocal Rank Fusion and re-ranked with a Cross-Encoder for precision retrieval.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-teal-700 font-semibold flex items-center gap-1.5">
              <span>bge-reranker-v2-m3 Cross-Encoder</span>
            </div>
          </div>

          {/* Card 2: 5-Signal Eligibility Guards */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-emerald-300 hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Eligibility Engine
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Hard & Soft Eligibility Guards</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Mandatory criteria (PhD requirements, career stage windows, citizenship constraints) act as hard pass/fail filters to prevent spending time on ineligible grants.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <span>Strict Constraint Verification</span>
            </div>
          </div>

          {/* Card 3: AI Proposal Compliance Assistant */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-cyan-300 hover:shadow-[0_8px_30px_rgba(6,182,212,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 mb-6 group-hover:scale-110 transition-transform">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                  Proposal Co-Pilot
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Rubric Extraction & Auditing</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Upload your draft proposal PDF along with funding guidelines. Get structured scoring, section-by-section breakdown, consistency checks, and Markdown/PDF exportable revision reports.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-cyan-700 font-semibold flex items-center gap-1.5">
              <span>Quick (~10s) and Deep (~45s) Modes</span>
            </div>
          </div>

          {/* Card 4: Two-Pass Delta Scraper */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-amber-300 hover:shadow-[0_8px_30px_rgba(245,158,11,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Data Pipeline
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Two-Pass Delta Web Ingestion</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Monitors agency web pages using SHA-256 content hashes (zero token burn). Dispatches Firecrawl with headless rendering only when content changes, extracting strict schemas.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-amber-700 font-semibold flex items-center gap-1.5">
              <span>Automatic Background Sweeper</span>
            </div>
          </div>

          {/* Card 5: 1-Click ORCID Sync */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-indigo-300 hover:shadow-[0_8px_30px_rgba(99,102,241,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Profile Sync
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">1-Click ORCID Profile Hydration</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Connect your 16-digit ORCID iD to automatically load your verified publications, biography, research interests, and affiliation data into your profile.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-indigo-700 font-semibold flex items-center gap-1.5">
              <span>Automatic Profile Population</span>
            </div>
          </div>

          {/* Card 6: Measurable Tuning & Evaluation */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:border-rose-300 hover:shadow-[0_8px_30px_rgba(244,63,94,0.08)] transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Evaluation Harness
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Benchmarking & Weight Sweeper</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Evaluation harness reporting Recall@K, MRR, and NDCG@K metrics. Includes an offline weight sweeper that tests scoring combinations without extra LLM token usage.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 text-xs text-rose-700 font-semibold flex items-center gap-1.5">
              <span>Offline Optimization Framework</span>
            </div>
          </div>

        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          7. How It Works (White Theme 4-Step Flow)
      ──────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 bg-slate-50/70 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">Workflow</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
              4-Step End-to-End Discovery Pipeline
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Step 1 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white font-bold flex items-center justify-center mb-4 text-lg shadow-sm">
                1
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Create Profile</h4>
              <p className="text-xs text-slate-600 leading-relaxed flex-1">
                Enter your research summary, career stage, and citizenship, or sync your profile automatically with your ORCID record.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-cyan-600 text-white font-bold flex items-center justify-center mb-4 text-lg shadow-sm">
                2
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Hybrid Retrieval</h4>
              <p className="text-xs text-slate-600 leading-relaxed flex-1">
                Vector and keyword searches run in parallel across active grant listings with HyDE query generation and cross-encoder re-ranking.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center mb-4 text-lg shadow-sm">
                3
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Explainable Scoring</h4>
              <p className="text-xs text-slate-600 leading-relaxed flex-1">
                View match scores broken down across semantic relevance, mandatory eligibility criteria, and deadline freshness.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center mb-4 text-lg shadow-sm">
                4
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Proposal Review</h4>
              <p className="text-xs text-slate-600 leading-relaxed flex-1">
                Upload your draft proposal and guidelines PDF to audit compliance, detect budget issues, and export revision diffs.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          8. Target Roles & Real Use Cases (Replacing Fake Testimonials)
      ──────────────────────────────────────────────────────────── */}
      <section id="use-cases" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">Use Cases</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
            Tailored For Academic & Industry Funding Needs
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            How different applicant types leverage FundSphere’s hybrid matching and eligibility engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-4">
                <Microscope className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Early Career & Postdocs</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Filter funding calls strictly by allowable years post-PhD (e.g. NIH ESI or ERC Starting Grant windows) so you only see opportunities tailored to early-career researchers.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-teal-700 font-semibold flex items-center gap-1.5">
              <span>Career Window Filtering</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center mb-4">
                <Rocket className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">DeepTech & Startups</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Discover non-dilutive government innovation grants, industry-academia consortiums, and technology commercialization schemes with startup entity validation.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-cyan-700 font-semibold flex items-center gap-1.5">
              <span>Commercial & Innovation Tracks</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">PIs & Research Offices</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Audit large multi-investigator grant draft PDFs against strict agency call rubrics, identifying section omissions and budget ratio conflicts before official submission.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <span>Rubric Compliance Audits</span>
            </div>
          </div>

        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          9. Proposal Assistant Deep-Dive Showcase (White Theme)
      ──────────────────────────────────────────────────────────── */}
      <section id="proposal-ai" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-slate-50/70 border-t border-slate-200/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column Text */}
          <div className="lg:col-span-6">
            <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">AI Proposal Assistant</span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mt-3 leading-tight">
              Pre-Submission Proposal Auditing
            </h2>
            <p className="text-slate-600 text-base sm:text-lg mt-4 leading-relaxed">
              Extract agency evaluation rubrics directly from call guidelines and audit draft proposals section by section before formal review.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Dual Audit Modes</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Quick mode (~10s) for formatting and requirements check; Deep mode (~45s) for full rubric scoring and cross-section validation.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Actionable Revision Diff Cards</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Displays specific text improvements and clarifications aligned with the funder's scoring criteria.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Exportable Compliance Reports</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Download Markdown or formatted PDF reports ready for co-PI review and institutional sign-off.</p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={handleCtaClick}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-sm shadow-teal-600/20 transition-all hover:scale-105"
              >
                <span>Try Proposal Assistant</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Visual Demo Mockup */}
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.06)] relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-800">Proposal_Draft_Review_Sample.pdf</span>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Compliance Score: 91 / 100
              </span>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="flex justify-between font-bold text-slate-900 mb-1">
                  <span>1. Specific Aims & Significance</span>
                  <span className="text-emerald-700">9.5 / 10</span>
                </div>
                <p className="text-slate-600 text-[11px]">Clear rationale, innovative hypothesis, and alignment with stated funding priorities.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="flex justify-between font-bold text-slate-900 mb-1">
                  <span>2. Research Strategy & Methodology</span>
                  <span className="text-emerald-700">8.8 / 10</span>
                </div>
                <p className="text-slate-600 text-[11px]">Statistical power calculations confirmed; consider detailing control group parameters in Aim 2.</p>
              </div>

              <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                <div className="flex justify-between font-bold text-amber-900 mb-1">
                  <span>3. Budget Justification & Timeline</span>
                  <span className="text-amber-700">Needs Adjustment</span>
                </div>
                <p className="text-amber-800 text-[11px]">Requested travel budget exceeds allowable cap specified in guidelines section 4.2.</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="text-teal-700 font-medium">⚡ Evaluated against extracted agency rubric criteria</span>
              <span className="text-slate-400">Automated Audit</span>
            </div>
          </div>

        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          10. Architecture & Engineering Discipline Showcase
      ──────────────────────────────────────────────────────────── */}
      <section id="architecture" className="py-20 bg-white border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">System Design</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
              Three-Tier Decoupled Architecture
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2">
              Clean separation between client UI, persistent business logic, and high-performance AI retrieval.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:border-teal-400 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-base">React 18 + TypeScript</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Vite-powered Single Page Application with Tailwind CSS, Framer Motion animations, optimistic UI updates for bookmarks, and custom scroll-restoration state memory.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:border-cyan-400 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-5 h-5 text-cyan-600" />
                <h3 className="font-bold text-slate-900 text-base">Spring Boot + PostgreSQL</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Java 17 backend providing JWT authentication, researcher profile persistence, strict grant schema normalization, and automated background indexing sweepers.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:border-emerald-400 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">FastAPI + Pinecone + Firecrawl</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                High-throughput Python AI service handling vector embeddings, HyDE query generation, cross-encoder reranking, and two-pass delta web scraping.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          11. FAQ Section (White Accordion)
      ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-slate-50/70 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-teal-600 font-semibold text-xs uppercase tracking-wider">Frequently Asked Questions</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-slate-900 hover:text-teal-600 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'rotate-180 text-teal-600' : ''
                  }`} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          12. Clean Bottom CTA Banner
      ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 p-8 sm:p-14 text-center text-white relative overflow-hidden shadow-xl shadow-teal-700/20">
          
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
              Discover Matched Grants & Audit Your Proposal Drafts.
            </h2>
            <p className="mt-4 text-teal-50 text-base sm:text-lg">
              Explore active research funding opportunities scored against your exact background, constraints, and priorities.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleCtaClick}
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-white hover:bg-slate-50 text-teal-800 font-bold text-base shadow-lg transition-all hover:scale-105"
              >
                <span>{isAuthenticated ? 'Open Grant Discovery' : 'Get Started'}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          13. Modern Footer (White/Light Theme)
      ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          
          <div className="flex items-center gap-3">
            <AnimatedLogo className="w-7 h-7" />
            <span className="text-lg font-bold">
              <span className="text-teal-600">Fund</span>
              <span className="text-slate-900">Sphere</span>
            </span>
            <span className="text-xs text-slate-500 ml-2">© {new Date().getFullYear()} FundSphere</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium text-slate-600">
            <a href="#features" className="hover:text-teal-600 transition-colors">Features</a>
            <a href="#simulator" className="hover:text-teal-600 transition-colors">Matching Engine</a>
            <a href="#how-it-works" className="hover:text-teal-600 transition-colors">How It Works</a>
            <a href="#use-cases" className="hover:text-teal-600 transition-colors">Use Cases</a>
            <a href="#faq" className="hover:text-teal-600 transition-colors">FAQ</a>
            <button onClick={() => navigate('/auth')} className="hover:text-teal-600 transition-colors">Sign In</button>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Hybrid Engine Active</span>
          </div>

        </div>
      </footer>

    </div>
  );
}
