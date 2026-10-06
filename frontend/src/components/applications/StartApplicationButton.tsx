import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import type { DiscoveryGrant } from '../../services/discoveryService';
import { createApplication } from '../../services/applicationsService';

interface StartApplicationButtonProps {
  grant: DiscoveryGrant;
  /** `sm` for saved-grant cards, `md` for the details modal footer. */
  size?: 'sm' | 'md';
}

/**
 * "Start application" on a grant: creates the application (or reopens the
 * one that already exists for this grant) and opens its workspace.
 */
export default function StartApplicationButton({ grant, size = 'md' }: StartApplicationButtonProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const { application, created } = await createApplication({ grantId: grant.id });
      toast.success(created ? 'Application started' : 'Opening your application');
      navigate(`/applications/${application.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the application');
      setBusy(false);
    }
  };

  const sizing = size === 'sm'
    ? 'px-2.5 py-1 rounded-md text-xs gap-1.5'
    : 'w-full sm:w-auto px-5 py-2.5 rounded-lg gap-2 shadow-xs active:scale-[0.98]';
  const icon = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`${sizing} inline-flex items-center justify-center font-semibold border text-primary-700 bg-white border-primary-200 hover:bg-primary-50 disabled:opacity-60 transition-all`}
    >
      {busy ? <Loader2 className={`${icon} animate-spin`} /> : <ClipboardCheck className={icon} />}
      Start application
    </button>
  );
}
