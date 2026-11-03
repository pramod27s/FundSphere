import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Hourglass } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import type { AlmostEligibleGrant, DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';
import { useSavedGrants } from '../../hooks/useSavedGrants';
import { DEADLINE_TEXT_CLASSES, formatRelativeDeadline } from '../../utils/formatDeadline';

interface AlmostEligibleProps {
  items: AlmostEligibleGrant[];
  profile?: ResearcherResponse | null;
}

/**
 * Grants on the researcher's topic that AI Match left out because they need
 * a PhD or more experience. Each says what stands in the way and how to get
 * past it, so a hidden grant becomes something to plan for.
 */
export default function AlmostEligible({ items, profile }: AlmostEligibleProps) {
  const [selected, setSelected] = useState<DiscoveryGrant | null>(null);
  const { isSaved, toggleSave } = useSavedGrants();

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="almost-eligible-heading" className="mt-8">
      <h2 id="almost-eligible-heading" className="text-sm font-semibold text-brand-900">
        Almost eligible
      </h2>
      <p className="mt-1 mb-3 text-sm text-brand-600 text-pretty">
        These are about your research, but you can't apply yet. Here's what it would take.
      </p>

      <ul className="flex flex-col gap-3">
        {items.map(({ grant, gaps }) => {
          const deadline = formatRelativeDeadline(grant.deadlineRaw, grant.deadlineType);
          const fixable = gaps.filter((gap) => gap.requirement);
          return (
            <li key={grant.id}>
              <article className="group relative bg-white border border-brand-200 border-dashed rounded-xl p-4 sm:p-5 hover:border-primary-300 has-[.card-link:focus-visible]:ring-2 has-[.card-link:focus-visible]:ring-primary-500 transition-colors">
                <p className="text-sm text-brand-600 truncate">
                  <span className="font-semibold text-brand-700">{grant.funder}</span>
                </p>
                <h3 className="mt-0.5 text-base font-bold text-brand-900 tracking-tight leading-snug line-clamp-2 wrap-break-word text-pretty">
                  <button
                    type="button"
                    onClick={() => setSelected(grant)}
                    className="card-link text-left group-hover:text-primary-700 transition-colors focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                  >
                    {grant.title}
                  </button>
                </h3>
                <p className={`mt-1.5 flex items-center gap-1.5 text-sm ${DEADLINE_TEXT_CLASSES[deadline.tone]}`} title={deadline.tooltip || undefined}>
                  <Calendar className="w-4 h-4 opacity-70" aria-hidden="true" />
                  <span className="whitespace-nowrap">{deadline.label}</span>
                </p>

                <ul className="mt-3 flex flex-col gap-2">
                  {fixable.map((gap) => (
                    <li key={gap.kind} className="flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed">
                      <Hourglass className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <span className="font-semibold text-amber-900">{gap.requirement}.</span>{' '}
                        <span className="text-brand-700">{gap.howToQualify}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-sm text-brand-600">
        Finished your PhD or have more experience than this?{' '}
        <Link to="/profile" className="font-semibold text-primary-700 hover:text-primary-800 underline-offset-2 hover:underline">
          Update your profile
        </Link>
      </p>

      {selected && (
        <GrantDetailsModal
          grant={selected}
          onClose={() => setSelected(null)}
          source="core"
          isSaved={isSaved(selected.id)}
          onToggleSave={toggleSave}
          profile={profile}
        />
      )}
    </section>
  );
}
