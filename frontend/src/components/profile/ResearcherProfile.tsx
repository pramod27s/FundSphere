import React, { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ResearcherResponse } from '../../services/researcherService';
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
} from 'lucide-react';

interface ResearcherProfileProps {
  researcher: ResearcherResponse;
  onBack?: () => void;
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

const formatText = (value: string | null | undefined): string => {
  return value && value.trim().length > 0 ? value : NOT_PROVIDED;
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

function ResearcherProfile({ researcher, onBack, onLogout }: ResearcherProfileProps) {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (researcher?.id) {
      const savedImage = localStorage.getItem(`profile_image_${researcher.id}`);
      if (savedImage) setProfileImage(savedImage);
    }
  }, [researcher?.id]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setProfileImage(base64String);
        if (researcher?.id) {
          localStorage.setItem(`profile_image_${researcher.id}`, base64String);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!researcher) {
    return <div className="p-8 text-center text-brand-500">No profile data found.</div>;
  }

  const location = [researcher.city, researcher.state, researcher.country]
    .map((item) => item?.trim())
    .filter(Boolean)
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

  return (
    <div className="min-h-screen bg-brand-50 px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-2xl border border-primary-100 bg-linear-to-r from-white to-primary-50 p-5 md:p-7 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="relative group">
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 overflow-hidden border-2 border-primary-200">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 md:w-10 md:h-10" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full border border-brand-200 shadow-sm text-brand-600 hover:text-primary-600 transition-colors"
                  title="Change profile picture"
                >
                  <Camera className="w-4 h-4" />
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
                <h1 className="text-2xl md:text-3xl font-bold text-brand-900">Researcher Profile</h1>
                <p className="text-brand-600 mt-1">
                  {formatEnum(researcher.userType)}{researcher.position ? ` · ${formatEnum(researcher.position)}` : ''}
                </p>
                <p className="text-sm text-brand-500 mt-1">Profile completion: {completionPercent}%</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Discovery
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-brand-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-brand-500">Experience</p>
            <p className="text-xl font-bold text-brand-900 mt-1">{researcher.yearsOfExperience ?? 0} years</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-brand-500">Funding Preference</p>
            <p className="text-base font-semibold text-brand-900 mt-1">
              {formatCurrency(researcher.minFundingAmount)} - {formatCurrency(researcher.maxFundingAmount)}
            </p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-brand-500">Notifications Enabled</p>
            <p className="text-xl font-bold text-brand-900 mt-1">{notificationCount}/3</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-brand-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-brand-900">Organization</h2>
            </div>
            <div className="space-y-3 text-sm">
              <ProfileRow label="Institution" value={formatText(researcher.institutionName)} />
              <ProfileRow label="Department" value={formatText(researcher.department)} />
              <ProfileRow label="Education Level" value={formatEnum(researcher.educationLevel)} icon={<GraduationCap className="w-4 h-4 text-brand-400" />} />
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-brand-900">Location</h2>
            </div>
            <div className="space-y-3 text-sm">
              <ProfileRow label="Current Location" value={location || NOT_PROVIDED} />
              <ProfileRow label="Country" value={formatText(researcher.country)} />
              <ProfileRow label="State / City" value={`${formatText(researcher.state)} / ${formatText(researcher.city)}`} />
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-brand-900">Research Focus</h2>
            </div>
            <div className="space-y-3 text-sm">
              <ProfileRow label="Primary Field" value={formatEnum(researcher.primaryField)} />
              <ProfileRow label="Preferred Grant Type" value={formatEnum(researcher.preferredGrantType)} />
              <div>
                <p className="text-brand-500 font-medium mb-2">Keywords</p>
                {researcher.keywords && researcher.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {researcher.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-2.5 py-1 rounded-full text-xs bg-primary-50 text-primary-700 border border-primary-200"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-brand-700">{NOT_PROVIDED}</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-brand-900">Funding & Eligibility</h2>
            </div>
            <div className="space-y-3 text-sm">
              <ProfileRow label="Min Amount" value={formatCurrency(researcher.minFundingAmount)} />
              <ProfileRow label="Max Amount" value={formatCurrency(researcher.maxFundingAmount)} />
              <ProfileRow label="Previous Grants Received" value={formatBoolean(researcher.previousGrantsReceived)} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-brand-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-brand-900">Notification Settings</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <NotificationItem label="New Grant Emails" enabled={researcher.emailNotifications} />
            <NotificationItem label="Deadline Reminders" enabled={researcher.deadlineReminders} />
            <NotificationItem label="Weekly Recommendations" enabled={researcher.weeklyGrantRecommendations} />
          </div>
        </section>
      </div>
    </div>
  );
}

interface ProfileRowProps {
  label: string;
  value: string;
  icon?: ReactNode;
}

function ProfileRow({ label, value, icon }: ProfileRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-brand-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-brand-500 font-medium">{label}</span>
      <span className="text-brand-900 font-medium text-right inline-flex items-center gap-1.5">
        {icon}
        {value}
      </span>
    </div>
  );
}

interface NotificationItemProps {
  label: string;
  enabled: boolean;
}

function NotificationItem({ label, enabled }: NotificationItemProps) {
  return (
    <div className="rounded-lg border border-brand-200 px-4 py-3 flex items-center justify-between bg-brand-50">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${enabled ? 'text-green-700' : 'text-brand-500'}`}>
        {enabled ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}

export default ResearcherProfile;

