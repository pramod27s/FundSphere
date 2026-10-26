import React, { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ResearcherResponse, ResearcherRequest } from '../../services/researcherService';
import { updateMyResearcher } from '../../services/researcherService';
import { useResearcher } from '../../context/useResearcher';
import ResearcherEditModal from './ResearcherEditModal';
import { toast } from 'react-hot-toast';
import {
  User,
  Building2,
  MapPin,
  Target,
  Wallet,
  Bell,
  LogOut,
  Camera,
  Edit3,
} from 'lucide-react';
import { buttonClasses } from '../common/buttonStyles';
import { PAGE_WIDTH } from '../common/PageLayout';
import { loadSession } from '../../services/authService';

interface ResearcherProfileProps {
  researcher: ResearcherResponse;
  onLogout?: () => void;
}

const NOT_PROVIDED = 'Not provided';

const capitalizeWords = (str: string | null | undefined): string => {
  if (!str || !str.trim()) return NOT_PROVIDED;
  return str
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      // Keep acronyms like "B.M.S." or uppercase intact
      if (word.includes('.') || word.length <= 3 && word === word.toUpperCase()) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

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

const formatText = (value: string | null | undefined): string => {
  return value && value.trim().length > 0 ? capitalizeWords(value) : NOT_PROVIDED;
};

const formatCurrency = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return NOT_PROVIDED;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatBoolean = (value: boolean | null | undefined): string =>
  value === null || value === undefined ? NOT_PROVIDED : value ? 'Yes' : 'No';

function ResearcherProfile({ researcher: initialResearcher, onLogout }: ResearcherProfileProps) {
  const { setResearcher } = useResearcher();
  const [researcher, setLocalResearcher] = useState<ResearcherResponse>(initialResearcher);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setLocalResearcher(initialResearcher);
  }, [initialResearcher]);

  const [profileImage, setProfileImage] = useState<string | null>(() => {
    if (researcher?.id) {
      return localStorage.getItem(`profile_image_${researcher.id}`);
    }
    return null;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = async (updatedData: ResearcherRequest) => {
    const updated = await updateMyResearcher(updatedData);
    setLocalResearcher(updated);
    setResearcher(updated);
    toast.success('Profile updated successfully!');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setProfileImage(base64String);
        if (researcher?.id) {
          localStorage.setItem(`profile_image_${researcher.id}`, base64String);
          window.dispatchEvent(new Event('profile:image-updated'));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!researcher) {
    return <div className="p-8 text-center text-brand-500">No profile data found.</div>;
  }

  const completionFields = [
    researcher.userType,
    researcher.institutionName,
    researcher.department,
    researcher.position,
    researcher.primaryField,
    researcher.country,
    researcher.preferredGrantType,
    researcher.educationLevel,
    researcher.keywords?.length ? 'keywords' : '',
  ];

  const completionPercent = Math.round(
    (completionFields.filter((field) => typeof field === 'string' && field.trim().length > 0).length /
      completionFields.length) *
      100,
  );

  const userTypeStr = formatEnum(researcher.userType);
  const positionStr = researcher.position ? formatEnum(researcher.position) : null;
  const isDuplicateRole = positionStr && positionStr.toLowerCase() === userTypeStr.toLowerCase();
  const affiliationStr = researcher.institutionName ? capitalizeWords(researcher.institutionName) : null;
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

      <div className={`flex-1 ${PAGE_WIDTH} py-6 sm:py-8 space-y-5`}>
        {/* Who this is */}
        <section className="rounded-xl border border-brand-200 bg-white p-5 md:p-6 shadow-soft">
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
                className="absolute -bottom-1.5 -right-1.5 bg-white p-1.5 rounded-full border border-brand-200 shadow-xs text-brand-600 hover:text-primary-600 hover:border-primary-300 transition-colors cursor-pointer"
                title="Change profile picture"
                aria-label="Change profile picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
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
            <div className="sm:w-56 shrink-0">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-brand-600">Profile completeness</span>
                <span className="font-semibold tabular-nums text-brand-900">{completionPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-brand-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-600 rounded-full" style={{ width: `${completionPercent}%` }} />
              </div>
              {completionPercent < 100 && (
                <p className="mt-1.5 text-xs text-brand-500">A fuller profile gives better matches.</p>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DetailCard icon={<Building2 className="w-4 h-4" />} title="Background">
            <ProfileRow label="Institution" value={formatText(researcher.institutionName)} />
            <ProfileRow label="Department" value={formatText(researcher.department)} />
            <ProfileRow label="Education level" value={formatEnum(researcher.educationLevel)} isBadge />
            <ProfileRow label="Research experience" value={formatYears(researcher.yearsOfExperience)} />
          </DetailCard>

          <DetailCard icon={<MapPin className="w-4 h-4" />} title="Location">
            <ProfileRow label="Country" value={formatText(researcher.country)} />
            <ProfileRow label="State" value={formatText(researcher.state)} />
            <ProfileRow label="City" value={formatText(researcher.city)} />
            <ProfileRow label="Citizenship" value={formatText(researcher.citizenship)} />
          </DetailCard>

          <DetailCard icon={<Target className="w-4 h-4" />} title="Research focus">
            <ProfileRow label="Primary field" value={formatEnum(researcher.primaryField)} isBadge />
            <ProfileRow label="Preferred grant type" value={formatEnum(researcher.preferredGrantType)} isBadge />
            <div className="pt-2 pb-1">
              <p className="text-brand-500 font-medium mb-2 text-xs">Keywords</p>
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
                <span className="text-sm font-medium text-brand-400">{NOT_PROVIDED}</span>
              )}
            </div>
          </DetailCard>

          <DetailCard icon={<Wallet className="w-4 h-4" />} title="Funding and eligibility">
            <ProfileRow label="Minimum amount" value={formatCurrency(researcher.minFundingAmount)} />
            <ProfileRow label="Maximum amount" value={formatCurrency(researcher.maxFundingAmount)} />
            <ProfileRow label="PhD completed" value={formatBoolean(researcher.hasCompletedPhd)} />
            <ProfileRow label="Previous grants received" value={formatBoolean(researcher.previousGrantsReceived)} />
          </DetailCard>
        </section>

        <DetailCard icon={<Bell className="w-4 h-4" />} title="Notifications" hint="Change these with Edit profile.">
          <div className="grid grid-cols-1 md:grid-cols-3 md:gap-x-8">
            <NotificationRow label="New grant emails" enabled={researcher.emailNotifications} />
            <NotificationRow label="Deadline reminders" enabled={researcher.deadlineReminders} />
            <NotificationRow label="Weekly recommendations" enabled={researcher.weeklyGrantRecommendations} />
          </div>
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
    <section className="rounded-xl border border-brand-200 bg-white p-5 shadow-soft">
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

interface ProfileRowProps {
  label: string;
  value: string;
  isBadge?: boolean;
}

function ProfileRow({ label, value, isBadge }: ProfileRowProps) {
  const missing = value === NOT_PROVIDED;
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-brand-100 last:border-b-0">
      <span className="text-brand-500 font-medium text-xs shrink-0">{label}</span>
      {missing ? (
        <span className="text-sm font-medium text-brand-400">{value}</span>
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

/** A notification setting as read-only text, so it doesn't look like a toggle. */
function NotificationRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-brand-100 last:border-b-0 md:border-b-0">
      <span className="text-brand-700 text-sm">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${enabled ? 'text-primary-700' : 'text-brand-400'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-primary-500' : 'bg-brand-300'}`} aria-hidden="true" />
        {enabled ? 'On' : 'Off'}
      </span>
    </div>
  );
}

export default ResearcherProfile;
