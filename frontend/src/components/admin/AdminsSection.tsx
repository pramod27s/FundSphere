import { useEffect, useId, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, UserPlus } from 'lucide-react';
import { buttonClasses, ROW_ACTION } from '../common/buttonStyles';
import { addAdmin, listAdmins, removeAdmin, type AdminUser } from '../../services/adminService';

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';

function byOwnerThenName(a: AdminUser, b: AdminUser) {
  if (a.owner !== b.owner) return a.owner ? -1 : 1;
  return a.fullName.localeCompare(b.fullName);
}

/**
 * Who can use the admin area (2nd.md, Part A). Shown to the owner only:
 * other admins don't see each other's emails, and the server enforces that too.
 */
export default function AdminsSection() {
  const emailId = useId();
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdmins()
      .then((list) => {
        if (!cancelled) setAdmins(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the admins');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const added = await addAdmin(trimmed);
      setAdmins((current) => [...(current ?? []), added].sort(byOwnerThenName));
      setEmail('');
      toast.success(`${added.fullName} is now an admin`);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Could not add the admin');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (admin: AdminUser) => {
    setRemovingId(admin.id);
    try {
      await removeAdmin(admin.id);
      setAdmins((current) => (current ?? []).filter((a) => a.id !== admin.id));
      toast.success(`${admin.fullName} is no longer an admin`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the admin');
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <section aria-labelledby={`${emailId}-heading`} className="bg-white border border-brand-200 rounded-lg shadow-xs">
      <div className="px-5 pt-5 pb-4 border-b border-brand-100">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={`${emailId}-heading`} className="text-base font-bold text-brand-900 tracking-tight">Admins</h2>
          {admins && <span className="text-xs text-brand-500 tabular-nums">{admins.length}</span>}
        </div>
        <p className="text-sm text-brand-600 mt-1">
          Admins can add grants by hand. Only you, the owner, can see this list and choose who they are.
        </p>
      </div>

      {loadError ? (
        <p className="px-5 py-4 text-sm text-red-700" role="alert">{loadError}</p>
      ) : admins === null ? (
        <p className="px-5 py-4 text-sm text-brand-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      ) : (
        <ul className="divide-y divide-brand-100">
          {admins.map((admin) => (
            <li key={admin.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-900 truncate">
                  {admin.fullName}
                  {admin.owner && (
                    <span className="ml-2 align-middle text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2 py-0.5">
                      Owner
                    </span>
                  )}
                </p>
                <p className="text-xs text-brand-500 truncate">{admin.email}</p>
              </div>
              {!admin.owner && (
                confirmingId === admin.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-brand-600 hidden sm:inline">Remove?</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(admin)}
                      disabled={removingId === admin.id}
                      className={ROW_ACTION.danger}
                    >
                      {removingId === admin.id ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button" onClick={() => setConfirmingId(null)} className={ROW_ACTION.secondary}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmingId(admin.id)} className={ROW_ACTION.secondary}>
                    Remove
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="px-5 py-4 border-t border-brand-100 flex flex-col gap-2">
        <label htmlFor={emailId} className="text-xs font-semibold text-brand-700">Add an admin</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id={emailId}
            type="email"
            className={INPUT}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAddError(null);
            }}
            placeholder="Their FundSphere account's email"
            aria-describedby={`${emailId}-help`}
            autoComplete="off"
          />
          <button type="submit" disabled={adding || !email.trim()} className={buttonClasses('primary', 'sm', 'shrink-0')}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Add admin
          </button>
        </div>
        <p id={`${emailId}-help`} className="text-xs text-brand-500">
          They must already have an account. Ask them to sign up first.
        </p>
        {addError && <p className="text-sm text-red-700" role="alert">{addError}</p>}
      </form>
    </section>
  );
}
