import React, { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ResearcherResponse, ResearcherRequest } from '../../services/researcherService';
import { updateMyResearcher } from '../../services/researcherService';
import { useResearcher } from '../../context/useResearcher';
import { changeProfilePhoto, removeProfilePhoto, useProfilePhoto } from '../../hooks/useProfilePhoto';
import ResearcherEditModal from './ResearcherEditModal';
import AccountSettings from './AccountSettings';
import { toast } from 'react-hot-toast';
import {
  User,
  Building2,
  MapPin,
  Sparkles,
  Wallet,
  CalendarPlus,
  LogOut,
  Camera,
  Check,
  Edit3,
  ExternalLink,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { buttonClasses } from '../common/buttonStyles';
import { PAGE_WIDTH_WIDE } from '../common/PageLayout';
import { loadSession } from '../../services/authService';
import { Link } from 'react-router-dom';
import { formatFundingRange } from '../../utils/formatFunding';
import {
  EDUCATION_LEVEL_OPTIONS,
  GRANT_TYPE_OPTIONS,
  POSITION_OPTIONS,
  RESEARCH_FIELD_OPTIONS,
  USER_TYPE_OPTIONS,
  optionLabel,
  type ProfileOption,
} from '../../utils/profileOptions';

interface ResearcherProfileProps {
  researcher: ResearcherResponse;
  onLogout?: () => void;
}

const NOT_PROVIDED = 'Not provided';

const formatEnum = (value: string | null | undefined): string => {
  if (!value) return NOT_PROVIDED;
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatYears = (years: number | null | undefined): string => {
  if (years === null || years === undefined) return NOT_PROVIDED;
  return `${years} ${years === 1 ? 'year' : 'years'}`;
};

/** What the researcher typed, unchanged. */
const formatText = (value: string | null | undefined): string => {
  return value && value.trim().length > 0 ? value.trim() : NOT_PROVIDED;
};

/** The same label onboarding and Edit profile show for a choice. */
const formatOption = (options: ProfileOption[], value: string | null | undefined): string =>
  optionLabel(options, value) ?? formatEnum(value);

/** "₹5 lakh – ₹50 lakh", "Up to ₹50 lakh", or "Any amount" when no budget was given (0 counts as none). */
const formatBudget = (min: number | null | undefined, max: number | null | undefined): string => {
  const lo = typeof min === 'number' && min > 0 ? min : undefined;
  const hi = typeof max === 'number' && max > 0 ? max : undefined;
  return lo === undefined && hi === undefined ? 'Any amount' : formatFundingRange(lo, hi, 'INR');
};

const formatBoolean = (value: boolean | null | undefined): string =>
  value === null || value === undefined ? NOT_PROVIDED : value ? 'Yes' : 'No';

const filled = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

/** Summaries longer than this start folded, with "Show all". */
const SUMMARY_FOLD = 420;

function ResearcherProfile({ researcher: initialResearcher, onLogout }: ResearcherProfileProps) {
  const { setResearcher } = useResearcher();
  const [researcher, setLocalResearcher] = useState<ResearcherResponse>(initialResearcher);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const openEditor = () => setIsEditModalOpen(true);

  useEffect(() => {
    setLocalResearcher(initialResearcher);
  }, [initialResearcher]);

  const profileImage = useProfilePhoto(researcher?.id);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = async (updatedData: ResearcherRequest) => {
    const updated = await updateMyResearcher(updatedData);
    setLocalResearcher(updated);
    setResearcher(updated);
    toast.success('Profile updated successfully!');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input so picking the same file again still fires a change.
    e.target.value = '';
    if (!file || !researcher?.id) return;
    setIsSavingPhoto(true);
    try {
      await changeProfilePhoto(researcher.id, file);
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save your photo');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!researcher?.id || !window.confirm('Remove your profile photo?')) return;
    setIsSavingPhoto(true);
    try {
      await removeProfilePhoto(researcher.id);
      toast.success('Profile photo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove your photo');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  if (!researcher) {
    return <div className="p-8 text-center text-brand-500">No profile data found.</div>;
  }

  // What counts toward completeness. Each one still missing is listed under the bar, with a way to add it.
  const completionChecks: { label: string; done: boolean }[] = [
    { label: 'Role', done: filled(researcher.userType) },
    { label: 'Institution', done: filled(researcher.institutionName) },
    { label: 'Department', done: filled(researcher.department) },
    { label: 'Position', done: filled(researcher.position) },
    { label: 'Primary field', done: filled(researcher.primaryField) },
    { label: 'Country', done: filled(researcher.country) },
    { label: 'Preferred grant type', done: filled(researcher.preferredGrantType) },
    { label: 'Education level', done: filled(researcher.educationLevel) },
    { label: 'Keywords', done: (researcher.keywords?.length ?? 0) > 0 },
    // Eligibility answers decide which calls are hidden, so they count too.
    { label: 'PhD completed', done: researcher.hasCompletedPhd !== null },
    { label: 'Years of experience', done: researcher.yearsOfExperience !== null },
  ];
  const missingChecks = completionChecks.filter((check) => !check.done);
  const completionPercent = Math.round(((completionChecks.length - missingChecks.length) / completionChecks.length) * 100);

  const summary = researcher.researchSummary?.trim() ?? '';
  const summaryFolds = summary.length > SUMMARY_FOLD;
  const otherFields = (researcher.additionalFields ?? []).filter((field) => field && field !== researcher.primaryField);
  const orcidId = researcher.orcidId?.trim() ?? '';

  const userTypeStr = formatOption(USER_TYPE_OPTIONS, researcher.userType);
  const positionStr = researcher.position ? formatOption(POSITION_OPTIONS, researcher.position) : null;
  const isDuplicateRole = positionStr && positionStr.toLowerCase() === userTypeStr.toLowerCase();
  const affiliationStr = researcher.institutionName?.trim() || null;
  const profileSubtitle = [
    userTypeStr,
    !isDuplicateRole && positionStr ? positionStr : null,
    affiliationStr ? affiliationStr : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const session = loadSession();
  const displayName = session?.user.fullName?.trim() || 'Your profile';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">Profile</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none tabular-nums truncate">{completionPercent}% complete</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsEditModalOpen(true)} className={buttonClasses('primary', 'sm')}>
          <Edit3 className="w-4 h-4" aria-hidden="true" />
          Edit profile
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            className={buttonClasses('ghost', 'sm', 'text-red-600 hover:text-red-700 hover:bg-red-50')}
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        )}
      </div>

      <div className={`flex-1 ${PAGE_WIDTH_WIDE} py-6 sm:py-8 space-y-5`}>
        {/* Who this is */}
        <section className="rounded-xl border border-brand-200 bg-white p-5 md:p-6 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative shrink-0 self-start sm:self-auto">
              <div className="h-16 w-16 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center overflow-hidden border border-primary-200">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User className="w-8 h-8" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSavingPhoto}
                className="absolute -bottom-1.5 -right-1.5 bg-white p-1.5 rounded-full border border-brand-200 shadow-xs text-brand-600 hover:text-primary-600 hover:border-primary-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                title={isSavingPhoto ? 'Saving photo…' : 'Change profile picture'}
                aria-label="Change profile picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              {profileImage && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isSavingPhoto}
                  className="absolute -top-1.5 -right-1.5 bg-white p-1.5 rounded-full border border-brand-200 shadow-xs text-brand-600 hover:text-red-600 hover:border-red-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  title="Remove profile picture"
                  aria-label="Remove profile picture"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-brand-900 tracking-tight truncate">{displayName}</h2>
              {session?.user.email && <p className="text-sm text-brand-500 truncate">{session.user.email}</p>}
              {profileSubtitle && <p className="mt-1.5 text-sm font-medium text-brand-700">{profileSubtitle}</p>}
            </div>
            <div className="sm:w-72 shrink-0">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-brand-600">Profile completeness</span>
                <span className="font-semibold tabular-nums text-brand-900">{completionPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-brand-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-600 rounded-full" style={{ width: `${completionPercent}%` }} />
              </div>
              {missingChecks.length > 0 ? (
                <div className="mt-2.5">
                  <p className="text-xs text-brand-500">Add these for better matches:</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missingChecks.map((check) => (
                      <button
                        key={check.label}
                        type="button"
                        onClick={openEditor}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary-300 bg-primary-50/60 px-2 py-0.5 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-400 hover:bg-primary-50"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        {check.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Complete
                </p>
              )}
            </div>
          </div>
        </section>

        {/* What AI Match searches with: the summary leads, then the fields, department and keywords. */}
        <DetailCard icon={<Sparkles className="w-4 h-4" />} title="Research profile" hint="What AI Match compares with every open call">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-5">
            <div className="lg:col-span-2">
              <p className="text-brand-500 font-medium text-xs mb-1.5">Research summary</p>
              {summary ? (
                <>
                  <p className={`max-w-prose whitespace-pre-line leading-relaxed text-brand-800 ${summaryFolds && !summaryOpen ? 'line-clamp-6' : ''}`}>
                    {summary}
                  </p>
                  {summaryFolds && (
                    <button
                      type="button"
                      onClick={() => setSummaryOpen((open) => !open)}
                      aria-expanded={summaryOpen}
                      className="mt-1 text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                      {summaryOpen ? 'Show less' : 'Show all'}
                    </button>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/60 p-4">
                  <p className="text-brand-700">
                    A few sentences on what you work on, in your own words. It's the first thing AI Match reads.
                  </p>
                  <div className="mt-2">
                    <AddLink label="Add a research summary" onClick={openEditor} />
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-brand-500">
                AI Match searches with this summary, then your department, fields and keywords. Research fit is half of
                every match score.
              </p>
            </div>

            <div className="lg:border-l lg:border-brand-100 lg:pl-8">
              <ProfileRow label="Primary field" value={formatOption(RESEARCH_FIELD_OPTIONS, researcher.primaryField)} isBadge onAdd={openEditor} />
              {otherFields.length > 0 && (
                <div className="py-2 border-b border-brand-100">
                  <p className="text-brand-500 font-medium text-xs mb-1.5">Other fields</p>
                  <div className="flex flex-wrap gap-1.5">
                    {otherFields.map((field) => (
                      <span key={field} className="px-2 py-0.5 rounded-md text-xs font-medium bg-brand-100 text-brand-700">
                        {formatOption(RESEARCH_FIELD_OPTIONS, field)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <ProfileRow label="Preferred grant type" value={formatOption(GRANT_TYPE_OPTIONS, researcher.preferredGrantType)} isBadge onAdd={openEditor} />
              <div className="py-2 border-b border-brand-100">
                <p className="text-brand-500 font-medium text-xs mb-1.5">Keywords</p>
                {researcher.keywords && researcher.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {researcher.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-2.5 py-1 rounded-lg text-xs bg-primary-50 text-primary-800 border border-primary-200 font-semibold"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : (
                  <AddLink label="Add keywords" onClick={openEditor} />
                )}
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-brand-500 font-medium text-xs shrink-0">ORCID iD</span>
                {orcidId ? (
                  <a
                    href={`https://orcid.org/${orcidId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-primary-700 hover:text-primary-800"
                  >
                    {orcidId}
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <AddLink label="Add" ariaLabel="Add your ORCID iD" onClick={openEditor} />
                )}
              </div>
            </div>
          </div>
        </DetailCard>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <DetailCard icon={<Building2 className="w-4 h-4" />} title="Background">
            <ProfileRow label="Institution" value={formatText(researcher.institutionName)} onAdd={openEditor} />
            <ProfileRow label="Department" value={formatText(researcher.department)} onAdd={openEditor} />
            <ProfileRow label="Education level" value={formatOption(EDUCATION_LEVEL_OPTIONS, researcher.educationLevel)} isBadge onAdd={openEditor} />
            <ProfileRow label="Research experience" value={formatYears(researcher.yearsOfExperience)} onAdd={openEditor} />
          </DetailCard>

          <DetailCard icon={<MapPin className="w-4 h-4" />} title="Location">
            <ProfileRow label="Country" value={formatText(researcher.country)} onAdd={openEditor} />
            <ProfileRow label="State" value={formatText(researcher.state)} onAdd={openEditor} />
            <ProfileRow label="City" value={formatText(researcher.city)} onAdd={openEditor} />
            <ProfileRow label="Citizenship" value={formatText(researcher.citizenship)} onAdd={openEditor} />
          </DetailCard>

          <DetailCard icon={<Wallet className="w-4 h-4" />} title="Funding and eligibility">
            <ProfileRow label="Budget you're looking for" value={formatBudget(researcher.minFundingAmount, researcher.maxFundingAmount)} onAdd={openEditor} />
            <ProfileRow label="PhD completed" value={formatBoolean(researcher.hasCompletedPhd)} onAdd={openEditor} />
            <ProfileRow label="Previous grants received" value={formatBoolean(researcher.previousGrantsReceived)} onAdd={openEditor} />
          </DetailCard>
        </section>

        {/* FundSphere sends no emails, so reminders come from the calendar feed. */}
        <DetailCard icon={<CalendarPlus className="w-4 h-4" />} title="Reminders">
          <p className="text-brand-700 leading-relaxed">
            FundSphere doesn't send emails. To get reminders on your phone, add your deadlines to Google Calendar from{' '}
            <Link to="/my-grants" className="font-semibold text-primary-700 hover:text-primary-800 hover:underline">My grants</Link>
            {' '}or from any application.
          </p>
        </DetailCard>

        <DetailCard icon={<ShieldCheck className="w-4 h-4" />} title="Account" hint="Your password, a copy of your data, or deleting your account">
          <AccountSettings />
        </DetailCard>

        <ResearcherEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          researcher={researcher}
          onSave={handleSaveProfile}
        />
      </div>
    </div>
  );
}

interface DetailCardProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}

function DetailCard({ icon, title, hint, children }: DetailCardProps) {
  return (
    <section className="rounded-xl border border-brand-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-brand-100">
        <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-200 flex items-center justify-center text-primary-600 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-brand-900 tracking-tight">{title}</h2>
          {hint && <p className="text-xs text-brand-500">{hint}</p>}
        </div>
      </div>
      <div className="text-sm">{children}</div>
    </section>
  );
}

/** Opens Edit profile from an empty field, so a gap is one click from being filled. */
function AddLink({ label, ariaLabel, onClick }: { label: string; ariaLabel?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline underline-offset-2"
    >
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

interface ProfileRowProps {
  label: string;
  value: string;
  isBadge?: boolean;
  /** Shown as "+ Add" in place of "Not provided". */
  onAdd?: () => void;
}

function ProfileRow({ label, value, isBadge, onAdd }: ProfileRowProps) {
  const missing = value === NOT_PROVIDED;
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-brand-100 last:border-b-0">
      <span className="text-brand-500 font-medium text-xs shrink-0">{label}</span>
      {missing ? (
        onAdd ? (
          <AddLink label="Add" ariaLabel={`Add ${label.toLowerCase()}`} onClick={onAdd} />
        ) : (
          <span className="text-sm font-medium text-brand-500">{value}</span>
        )
      ) : isBadge ? (
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-50 text-primary-800 border border-primary-200">
          {value}
        </span>
      ) : (
        <span className="text-brand-900 font-semibold text-right text-sm">{value}</span>
      )}
    </div>
  );
}

export default ResearcherProfile;
