import { FileText, ArrowLeft, Sparkles } from 'lucide-react';

interface WritingProposalProps {
  onBack: () => void;
}

export default function WritingProposal({ onBack }: WritingProposalProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-brand-100/80 px-4 sm:px-6 py-4 flex items-center gap-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/20">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-brand-900 tracking-tight leading-none">Writing Proposal</h1>
            <p className="text-[11px] text-brand-500 mt-1 leading-none">Draft and manage grant proposals</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <div className="rounded-2xl border border-brand-200/60 bg-white/60 backdrop-blur-sm p-12 flex flex-col items-center justify-center text-center mt-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/60 flex items-center justify-center mb-5 shadow-inner border border-primary-100">
            <FileText className="w-9 h-9 text-primary-400" />
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200/60 text-[10px] font-bold text-primary-700 uppercase tracking-widest mb-3">
            Coming Soon
          </div>
          <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">AI-Assisted Proposal Writing</h2>
          <p className="text-brand-500 text-sm text-center max-w-sm mb-6 leading-relaxed">
            Draft, refine, and submit grant proposals with AI guidance tailored to each funder's requirements. Your proposals will appear here.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2.5 rounded-xl bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-sm font-semibold shadow-sm hover:shadow-md transition-all"
          >
            Back to Discovery
          </button>
        </div>
      </div>
    </div>
  );
}
