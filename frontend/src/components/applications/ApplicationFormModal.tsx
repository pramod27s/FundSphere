import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Loader2, Trash2, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import {
  createApplication,
  deleteApplication,
  updateApplication,
  type Application,
} from '../../services/applicationsService';

interface ApplicationFormModalProps {
  /** Omit to add a call that isn't in FundSphere; pass to edit its details. */
  application?: Application;
  onClose: () => void;
  onSaved: (application: Application) => void;
  onDeleted?: () => void;
}

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';

export default function ApplicationFormModal({ application, onClose, onSaved, onDeleted }: ApplicationFormModalProps) {
  const editing = Boolean(application);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(dialogRef, onClose);

  const [title, setTitle] = useState(application?.title ?? '');
  const [agency, setAgency] = useState(application?.agency ?? '');
  const [deadline, setDeadline] = useState(application?.deadline ?? '');
  const [callUrl, setCallUrl] = useState(application?.callUrl ?? '');
  const [notes, setNotes] = useState(application?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give the call a title');
      return;
    }
    setSaving(true);
    try {
      if (application) {
        const saved = await updateApplication(application.id, {
          title: title.trim(),
          agency: agency.trim(),
          callUrl: callUrl.trim(),
          notes: notes.trim(),
          ...(deadline ? { deadline } : { clearDeadline: true }),
        });
        onSaved(saved);
      } else {
        const { application: created } = await createApplication({
          title: title.trim(),
          agency: agency.trim() || undefined,
          callUrl: callUrl.trim() || undefined,
          deadline: deadline || undefined,
          notes: notes.trim() || undefined,
        });
        onSaved(created);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!application) return;
    if (!window.confirm(`Delete "${application.title}" and its checklist? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteApplication(application.id);
      toast.success('Application deleted');
      onDeleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto relative z-10 ring-1 ring-brand-200/50"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4 p-5 border-b border-brand-100">
            <div>
              <h2 id={titleId} className="text-lg font-bold text-brand-900 tracking-tight">
                {editing ? 'Edit application details' : 'Add a call not in FundSphere'}
              </h2>
              {!editing && (
                <p className="text-xs text-brand-500 mt-1">
                  For calls you heard about elsewhere, e.g. from your department or a state council.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-brand-500 hover:text-brand-700 hover:bg-brand-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div>
              <label htmlFor={`${titleId}-title`} className={LABEL}>Call title *</label>
              <input
                id={`${titleId}-title`}
                data-autofocus
                className={INPUT}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. ANRF Core Research Grant 2026"
                maxLength={500}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${titleId}-agency`} className={LABEL}>Agency</label>
                <input
                  id={`${titleId}-agency`}
                  className={INPUT}
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="e.g. ANRF, DST, VGST"
                  maxLength={300}
                />
              </div>
              <div>
                <label htmlFor={`${titleId}-deadline`} className={LABEL}>Submission deadline</label>
                <input
                  id={`${titleId}-deadline`}
                  type="date"
                  className={INPUT}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${titleId}-url`} className={LABEL}>Link to the call</label>
              <input
                id={`${titleId}-url`}
                type="url"
                inputMode="url"
                className={INPUT}
                value={callUrl}
                onChange={(e) => setCallUrl(e.target.value)}
                placeholder="https://"
                maxLength={2000}
              />
            </div>
            <div>
              <label htmlFor={`${titleId}-notes`} className={LABEL}>Notes</label>
              <textarea
                id={`${titleId}-notes`}
                className={`${INPUT} resize-y`}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Co-PI from Mechanical; ask Registrar's office about the endorsement format"
                maxLength={4000}
              />
            </div>
            {editing && application?.deadline && deadline !== application.deadline && (
              <p className="text-xs text-brand-600 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                Due dates counted from the deadline will move with it.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 p-5 border-t border-brand-100">
            {editing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save' : 'Start application'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}
