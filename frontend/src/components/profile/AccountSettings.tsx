import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Download, KeyRound, Trash2 } from 'lucide-react';
import { buttonClasses } from '../common/buttonStyles';
import { changePassword, deleteAccount, downloadMyData } from '../../services/accountService';
import { clearSession } from '../../services/authService';
import { useResearcher } from '../../context/useResearcher';

const INPUT =
  'block w-full px-3 py-2 border border-brand-200 rounded-lg bg-white text-sm text-brand-900 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
const LABEL = 'block text-xs font-medium text-brand-600 mb-1';
const DANGER = buttonClasses('primary', 'sm', 'bg-red-600 hover:bg-red-700');

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Password, a copy of the user's data, and deleting the account. */
export default function AccountSettings() {
  return (
    <div className="divide-y divide-brand-100">
      <ChangePassword />
      <DownloadData />
      <DeleteAccount />
    </div>
  );
}

function ChangePassword() {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const close = () => {
    setIsOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      toast.error('The new password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      toast.error("The new passwords don't match");
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(current, next);
      toast.success('Password changed. Your other devices have been signed out.');
      close();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change your password'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="py-3 first:pt-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-brand-900">Password</p>
          <p className="text-xs text-brand-500">Changing it signs you out on your other devices.</p>
        </div>
        {!isOpen && (
          <button type="button" onClick={() => setIsOpen(true)} className={buttonClasses('secondary', 'sm')}>
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            Change password
          </button>
        )}
      </div>
      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:max-w-sm">
          <div>
            <label htmlFor="current-password" className={LABEL}>Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="new-password" className={LABEL}>New password (at least 8 characters)</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className={LABEL}>New password again</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSaving} className={buttonClasses('primary', 'sm')}>
              {isSaving ? 'Saving…' : 'Save new password'}
            </button>
            <button type="button" onClick={close} disabled={isSaving} className={buttonClasses('ghost', 'sm')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DownloadData() {
  const [isPreparing, setIsPreparing] = useState(false);

  const handleDownload = async () => {
    setIsPreparing(true);
    try {
      await downloadMyData();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not prepare your data'));
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className="py-3 flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold text-brand-900">Your data</p>
        <p className="text-xs text-brand-500">
          One file with your profile, saved grants, applications, proposal reviews and grants.
        </p>
      </div>
      <button type="button" onClick={handleDownload} disabled={isPreparing} className={buttonClasses('secondary', 'sm', 'shrink-0')}>
        <Download className="w-4 h-4" aria-hidden="true" />
        {isPreparing ? 'Preparing…' : 'Download my data'}
      </button>
    </div>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const { setResearcher } = useResearcher();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    setIsDeleting(true);
    try {
      await deleteAccount(password);
      // The server has already removed the sign-in tokens, so only the local copy is left to clear.
      clearSession();
      setResearcher(null);
      navigate('/auth', { replace: true });
      toast.success('Your account and all of its data have been deleted');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete your account'));
      setIsDeleting(false);
    }
  };

  return (
    <div className="py-3 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-brand-900">Delete account</p>
          <p className="text-xs text-brand-500">Removes your account and everything in it. This can't be undone.</p>
        </div>
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={buttonClasses('ghost', 'sm', 'shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Delete account
          </button>
        )}
      </div>
      {isOpen && (
        <form onSubmit={handleDelete} className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 grid gap-3">
          <p className="text-sm text-red-800">
            Your profile, saved grants, applications, checklists, proposal reviews and grants will be deleted for good.
            Download your data first if you want a copy.
          </p>
          <div className="sm:max-w-sm">
            <label htmlFor="delete-password" className={LABEL}>Enter your password to confirm</label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isDeleting || !password} className={DANGER}>
              {isDeleting ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setPassword('');
              }}
              disabled={isDeleting}
              className={buttonClasses('ghost', 'sm')}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
