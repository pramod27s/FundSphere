import React from 'react';
import type { ResearcherResponse } from '../../services/researcherService';
import { User, Building2, MapPin, Target, Wallet, GraduationCap, Bell } from 'lucide-react';

interface ResearcherProfileProps {
  researcher: ResearcherResponse;
  onBack?: () => void;
}

const ResearcherProfile: React.FC<ResearcherProfileProps> = ({ researcher, onBack }) => {
  if (!researcher) return <div className="p-8 text-center text-gray-500">No profile data found</div>;

  // Helper to format enum-like strings (e.g., RESEARCH_ASSISTANT -> Research Assistant)
  const formatEnum = (str: string | null | undefined) => {
    if (!str) return "N/A";
    return str.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const sections = [
    {
      title: "Identity",
      icon: User,
      items: [
        { label: "User Type", value: formatEnum(researcher.userType) },
        { label: "Position", value: formatEnum(researcher.position) }
      ]
    },
    {
      title: "Organization",
      icon: Building2,
      items: [
        { label: "Institution", value: researcher.institutionName },
        { label: "Department", value: researcher.department }
      ]
    },
    {
      title: "Research Area",
      icon: Target,
      items: [
        { label: "Primary Field", value: formatEnum(researcher.primaryField) },
        { label: "Keywords", value: researcher.keywords?.join(", ") }
      ]
    },
    {
      title: "Location",
      icon: MapPin,
      items: [
        { label: "Location", value: `${researcher.city}, ${researcher.state}, ${researcher.country}` }
      ]
    },
    {
      title: "Funding Preferences",
      icon: Wallet,
      items: [
        { label: "Preferred Grant Type", value: formatEnum(researcher.preferredGrantType) },
        { label: "Funding Range", value: `$${researcher.minFundingAmount?.toLocaleString()} - $${researcher.maxFundingAmount?.toLocaleString()}` }
      ]
    },
    {
      title: "Experience",
      icon: GraduationCap,
      items: [
        { label: "Education Level", value: formatEnum(researcher.educationLevel) },
        { label: "Years Experience", value: researcher.yearsOfExperience },
        { label: "Previous Grants", value: researcher.previousGrantsReceived ? "Yes" : "No" }
      ]
    },
    {
      title: "Notifications",
      icon: Bell,
      items: [
        { label: "New Grants", value: researcher.emailNotifications ? "Enabled" : "Disabled" },
        { label: "Deadlines", value: researcher.deadlineReminders ? "Enabled" : "Disabled" },
        { label: "Recommendations", value: researcher.weeklyGrantRecommendations ? "Enabled" : "Disabled" }
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Researcher Profile</h1>
        {onBack && (
            <button 
                onClick={onBack}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
                Back to Discovery
            </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <section.icon className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">{section.title}</h2>
            </div>
            
            <div className="space-y-3">
              {section.items.map((item, itemIdx) => (
                <div key={itemIdx} className="flex flex-col sm:flex-row sm:justify-between text-sm border-b border-dashed border-gray-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-gray-500 font-medium">{item.label}</span>
                  <span className="text-gray-900 font-medium text-right">{item.value?.toString() || "-"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResearcherProfile;

