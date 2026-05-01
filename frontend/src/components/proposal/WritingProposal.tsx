import { FileText, ArrowLeft } from 'lucide-react';

interface WritingProposalProps {
  onBack: () => void;
}

export default function WritingProposal({ onBack }: WritingProposalProps) {
  return (
    <div className="min-h-screen bg-brand-50 flex flex-col">
      <div className="p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-24">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
          <FileText className="w-8 h-8 text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-brand-900">Writing Proposal</h1>
        <p className="text-brand-400 text-sm">Your proposals will appear here.</p>
      </div>
    </div>
  );
}
