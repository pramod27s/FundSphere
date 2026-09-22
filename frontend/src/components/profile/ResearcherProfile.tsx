import React, { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ResearcherResponse, ResearcherRequest } from '../../services/researcherService';
import { updateMyResearcher } from '../../services/researcherService';
import { useResearcher } from '../../context/ResearcherContext';
import ResearcherEditModal from './ResearcherEditModal';
import { toast } from 'react-hot-toast';
import {
  User,
  Building2,
  MapPin,
  Target,
  Wallet,
  GraduationCap,
  Bell,
  ArrowLeft,
  LogOut,
  CheckCircle2,
  Circle,
  Camera,
  Edit3,
} from 'lucide-react';

interface ResearcherProfileProps {
  researcher: ResearcherResponse;
  onBack?: () => void;
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

const formatBoolean = (value: boolean): string => (value ? 'Yes' : 'No');

function ResearcherProfile({ researcher: initialResearcher, onBack, onLogout }: ResearcherProfileProps) {
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

  const formattedCity = researcher.city ? capitalizeWords(researcher.city) : '';
  const formattedState = researcher.state ? capitalizeWords(researcher.state) : '';
  const formattedCountry = researcher.country ? capitalizeWords(researcher.country) : '';
  const location = [formattedCity, formattedState, formattedCountry]
    .filter((item) => item && item !== NOT_PROVIDED)
    .join(', ');

  const notificationCount = [
    researcher.emailNotifications,
    researcher.deadlineReminders,
    researcher.weeklyGrantRecommendations,
  ].filter(Boolean).length;

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

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Hero header card */}
        <section className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-white via-white to-primary-50/40 p-5 md:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_30px_rgba(13,148,136,0.06)]">
          {/* Decorative accent blur */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-primary-100/40 to-transparent rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="relative group">
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 flex items-center justify-center shrink-0 overflow-hidden border-2 border-white shadow-[0_4px_16px_rgba(13,148,136,0.20)]">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 md:w-10 md:h-10" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1.5 -right-1.5 bg-white p-1.5 rounded-full border border-brand-200 shadow-md text-brand-600 hover:text-primary-600 hover:border-primary-300 transition-all hover:scale-110 cursor-pointer"
                  title="Change profile picture"
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
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-brand-900 tracking-tight">Researcher Profile</h1>
                <p className="text-brand-600 mt-1 text-sm md:text-base font-medium">
                  {profileSubtitle}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 max-w-[160px] h-1.5 bg-brand-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <span className="text-xs text-brand-600 font-semibold tabular-nums">{completionPercent}% complete</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold hover:from-primary-700 hover:to-primary-800 transition-all shadow-sm hover:shadow-md text-sm"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>

              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 font-medium hover:bg-brand-50 hover:border-brand-300 transition-all shadow-sm hover:shadow-md text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to Discovery</span>
                  <span className="sm:hidden">Back</span>
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 font-medium hover:bg-red-50 hover:border-red-300 transition-all shadow-sm hover:shadow-md text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Stat cards with colored accents */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Experience"
            value={`${researcher.yearsOfExperience ?? 0} years`}
            accent="primary"
            icon={<GraduationCap className="w-4 h-4" />}
          />
          <StatCard
            label="Funding Preference"
            value={`${formatCurrency(researcher.minFundingAmount)} – ${formatCurrency(researcher.maxFundingAmount)}`}
            accent="green"
            small
            icon={<Wallet className="w-4 h-4" />}
          />
          <StatCard
            label="Notifications Enabled"
            value={`${notificationCount}/3`}
            accent="brand"
            icon={<Bell className="w-4 h-4" />}
          />
        </section>

        {/* Detail cards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DetailCard icon={<Building2 className="w-4 h-4" />} title="Organization">
            <ProfileRow label="Institution" value={formatText(researcher.institutionName)} />
            <ProfileRow label="Department" value={formatText(researcher.department)} />
            <ProfileRow
              label="Education Level"
              value={formatEnum(researcher.educationLevel)}
              icon={<GraduationCap className="w-3.5 h-3.5 text-primary-600" />}
              isBadge
            />
          </DetailCard>

          <DetailCard icon={<MapPin className="w-4 h-4" />} title="Location">
            <ProfileRow label="Current Location" value={location || NOT_PROVIDED} />
            <ProfileRow label="Country" value={formatText(researcher.country)} />
            <ProfileRow
              label="State / City"
              value={`${formattedState || NOT_PROVIDED} / ${formattedCity || NOT_PROVIDED}`}
            />
          </DetailCard>

          <DetailCard icon={<Target className="w-4 h-4" />} title="Research Focus">
            <ProfileRow label="Primary Field" value={formatEnum(researcher.primaryField)} isBadge />
            <ProfileRow label="Preferred Grant Type" value={formatEnum(researcher.preferredGrantType)} isBadge />
            <div className="pt-2 pb-1">
              <p className="text-brand-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">Keywords</p>
              {researcher.keywords && researcher.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {researcher.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2.5 py-1 rounded-lg text-xs bg-primary-50 text-primary-800 border border-primary-200/80 font-semibold shadow-2xs"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs bg-brand-50 text-brand-500 border border-brand-200/70 font-medium">
                  {NOT_PROVIDED}
                </span>
              )}
            </div>
          </DetailCard>

          <DetailCard icon={<Wallet className="w-4 h-4" />} title="Funding & Eligibility">
            <ProfileRow label="Min Amount" value={formatCurrency(researcher.minFundingAmount)} />
            <ProfileRow label="Max Amount" value={formatCurrency(researcher.maxFundingAmount)} />
            <ProfileRow
              label="Previous Grants Received"
              value={formatBoolean(researcher.previousGrantsReceived)}
              isBadge
            />
          </DetailCard>
        </section>

        {/* Notifications */}
        <section className="rounded-2xl border border-brand-200/70 bg-white/80 backdrop-blur-sm p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100 border border-primary-200/70 flex items-center justify-center text-primary-600">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-900 tracking-tight leading-none">Notification Settings</h2>
              <p className="text-xs text-brand-500 mt-1 leading-none">Manage how you receive grant updates</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <NotificationItem label="New Grant Emails" enabled={researcher.emailNotifications} />
            <NotificationItem label="Deadline Reminders" enabled={researcher.deadlineReminders} />
            <NotificationItem label="Weekly Recommendations" enabled={researcher.weeklyGrantRecommendations} />
          </div>
        </section>

        {/* Edit Profile Modal */}
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

interface StatCardProps {
  label: string;
  value: string;
  accent: 'primary' | 'green' | 'brand';
  icon: ReactNode;
  small?: boolean;
}

function StatCard({ label, value, accent, icon, small }: StatCardProps) {
  const accentMap = {
    primary: {
      icon: 'bg-primary-50 text-primary-700 border-primary-200/80',
      value: 'text-brand-900',
    },
    green: {
      icon: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      value: 'text-brand-900',
    },
    brand: {
      icon: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
      value: 'text-brand-900',
    },
  }[accent];

  return (
    <div className="rounded-2xl border border-brand-200/80 bg-white p-4.5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.03)] hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`w-8 h-8 rounded-xl border ${accentMap.icon} flex items-center justify-center`}>{icon}</div>
        <p className="text-[11px] uppercase tracking-wider text-brand-500 font-bold">{label}</p>
      </div>
      <p className={`${small ? 'text-sm md:text-base' : 'text-xl'} font-bold ${accentMap.value} tabular-nums`}>{value}</p>
    </div>
  );
}

interface DetailCardProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function DetailCard({ icon, title, children }: DetailCardProps) {
  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white/80 backdrop-blur-sm p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_8px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.06)] transition-shadow duration-200">
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-brand-100/80">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100 border border-primary-200/70 flex items-center justify-center text-primary-600">
          {icon}
        </div>
        <h2 className="text-base font-bold text-brand-900 tracking-tight">{title}</h2>
      </div>
      <div className="space-y-1.5 text-sm">
        {children}
      </div>
    </div>
  );
}

interface ProfileRowProps {
  label: string;
  value: string;
  icon?: ReactNode;
  isBadge?: boolean;
}

function ProfileRow({ label, value, icon, isBadge }: ProfileRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-brand-100/70 last:border-b-0">
      <span className="text-brand-500 font-semibold text-[11px] uppercase tracking-wider shrink-0">{label}</span>
      {isBadge ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-50 text-primary-800 border border-primary-200/80 shadow-2xs">
          {icon}
          <span>{value}</span>
        </span>
      ) : (
        <span className="text-brand-900 font-semibold text-right inline-flex items-center gap-1.5 text-sm">
          {icon}
          <span>{value}</span>
        </span>
      )}
    </div>
  );
}

interface NotificationItemProps {
  label: string;
  enabled: boolean;
}

function NotificationItem({ label, enabled }: NotificationItemProps) {
  return (
    <div className={`relative rounded-xl border px-4 py-3 flex items-center justify-between transition-all overflow-hidden ${
      enabled
        ? 'border-green-200/70 bg-gradient-to-r from-green-50 to-emerald-50/40 shadow-sm'
        : 'border-brand-200/70 bg-white shadow-sm'
    }`}>
      {enabled && <div className="absolute top-0 left-0 w-0.5 h-full bg-gradient-to-b from-green-400 to-emerald-500" />}
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <span className={`inline-flex items-center gap-1 text-xs font-bold ${enabled ? 'text-green-700' : 'text-brand-400'}`}>
        {enabled ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}

export default ResearcherProfile;

