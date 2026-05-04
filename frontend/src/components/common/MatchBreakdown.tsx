/**
 * Visual per-criterion breakdown of a match score so users can see
 * *why* a grant is being recommended (or where the mismatch is).
 *
 * Shown only in AI-mode grant detail. Deliberately client-side: the
 * criteria are derivable from data we already have (researcher profile +
 * grant payload), so we don't pay an extra LLM call.
 *
 * Each criterion is one of:
 *   - "match"   (✓) — grant explicitly satisfies this profile field
 *   - "warn"    (⚠) — partial / could-not-verify
 *   - "miss"    (✗) — grant explicitly excludes this profile field
 *   - "n/a"     (—) — neither side has data, so we can't say
 *
 * The match logic is deliberately permissive (e.g. "Global" / "Any" /
 * "International" in eligibleCountries always passes) and never claims
 * a definitive ✗ unless the grant text contradicts the profile.
 */
import { Check, AlertTriangle, X, Minus } from 'lucide-react';
import type { DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';

interface MatchBreakdownProps {
  grant: DiscoveryGrant;
  profile: ResearcherResponse | null | undefined;
}

type Verdict = 'match' | 'warn' | 'miss' | 'n/a';

interface Criterion {
  label: string;
  verdict: Verdict;
  detail: string;
}

export default function MatchBreakdown({ grant, profile }: MatchBreakdownProps) {
  if (!profile) {
    return null;
  }

  const criteria = buildCriteria(grant, profile);
  if (criteria.length === 0) return null;

  return (
    <div className="rounded-xl border border-brand-200/70 bg-white/80 backdrop-blur-sm p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-500 mb-3">
        Why this match
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {criteria.map((c) => (
          <CriterionChip key={c.label} criterion={c} />
        ))}
      </div>
    </div>
  );
}

function CriterionChip({ criterion }: { criterion: Criterion }) {
  const tones: Record<Verdict, { bg: string; border: string; text: string; icon: typeof Check }> = {
    match: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: Check },
    warn: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle },
    miss: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: X },
    'n/a': { bg: 'bg-brand-50', border: 'border-brand-200', text: 'text-brand-500', icon: Minus },
  };
  const t = tones[criterion.verdict];
  const Icon = t.icon;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg ${t.bg} ${t.border} border px-3 py-2`}
      title={criterion.detail}
    >
      <span className={`shrink-0 mt-0.5 ${t.text}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${t.text} leading-tight`}>{criterion.label}</div>
        <div className="text-[11px] text-brand-600 leading-snug mt-0.5 line-clamp-2">
          {criterion.detail}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Match logic — pure functions, easy to unit test if we ever add tests
// =============================================================================

function buildCriteria(grant: DiscoveryGrant, profile: ResearcherResponse): Criterion[] {
  const out: Criterion[] = [];

  // Field / research interests
  const fieldText = [
    ...(grant.tags ?? []),
    ...(grant.researchThemes ?? []),
    grant.title,
    grant.description,
    grant.objectives,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const profileFieldTerms = [profile.primaryField, ...(profile.keywords ?? [])]
    .filter(Boolean)
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);

  if (profileFieldTerms.length === 0) {
    out.push({
      label: 'Research field',
      verdict: 'n/a',
      detail: 'Add keywords to your profile to enable field matching.',
    });
  } else {
    const hits = profileFieldTerms.filter((term) => fieldText.includes(term));
    if (hits.length > 0) {
      out.push({
        label: 'Research field',
        verdict: 'match',
        detail: `Aligns with: ${hits.slice(0, 3).join(', ')}`,
      });
    } else {
      out.push({
        label: 'Research field',
        verdict: 'warn',
        detail: 'No direct keyword overlap; AI matched on broader semantics.',
      });
    }
  }

  // Country
  const eligibilityText = (grant.eligibilityCriteria || '').toLowerCase();
  const countryHaystack = `${eligibilityText} ${grant.description?.toLowerCase() ?? ''}`;
  const userCountry = (profile.country || '').trim().toLowerCase();
  if (!userCountry) {
    out.push({
      label: 'Country',
      verdict: 'n/a',
      detail: 'Country not set in your profile.',
    });
  } else {
    const isGlobal = /\b(global|international|worldwide|open to all|any country)\b/.test(countryHaystack);
    if (isGlobal) {
      out.push({
        label: 'Country',
        verdict: 'match',
        detail: 'Open to applicants worldwide.',
      });
    } else if (countryHaystack.includes(userCountry)) {
      out.push({
        label: 'Country',
        verdict: 'match',
        detail: `Eligibility mentions ${profile.country}.`,
      });
    } else if (countryHaystack.length > 0) {
      out.push({
        label: 'Country',
        verdict: 'warn',
        detail: `Eligibility doesn't explicitly mention ${profile.country}. Verify on provider site.`,
      });
    } else {
      out.push({
        label: 'Country',
        verdict: 'n/a',
        detail: 'Eligibility criteria not specified by the grant.',
      });
    }
  }

  // Career stage / position / education
  const eligibilityForCareer = `${eligibilityText} ${(grant.tags ?? []).join(' ').toLowerCase()}`;
  const careerSignals = [profile.position, profile.educationLevel]
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase().trim());
  if (careerSignals.length === 0) {
    out.push({
      label: 'Career stage',
      verdict: 'n/a',
      detail: 'Position / education not set in your profile.',
    });
  } else {
    const careerHit = careerSignals.find((s) => eligibilityForCareer.includes(s));
    if (careerHit) {
      out.push({
        label: 'Career stage',
        verdict: 'match',
        detail: `Eligibility mentions ${careerHit}.`,
      });
    } else if (eligibilityForCareer.length > 0) {
      out.push({
        label: 'Career stage',
        verdict: 'warn',
        detail: 'Career stage not explicitly listed; check eligibility carefully.',
      });
    } else {
      out.push({
        label: 'Career stage',
        verdict: 'n/a',
        detail: 'Eligibility criteria not specified.',
      });
    }
  }

  // Funding amount fit
  const profileMin = profile.minFundingAmount;
  const profileMax = profile.maxFundingAmount;
  const grantMin = grant.fundingAmountMinRaw;
  const grantMax = grant.fundingAmountMaxRaw;
  if (
    typeof profileMin !== 'number' &&
    typeof profileMax !== 'number'
  ) {
    out.push({
      label: 'Funding amount',
      verdict: 'n/a',
      detail: 'Set a funding range in your profile to enable amount matching.',
    });
  } else if (typeof grantMax !== 'number' && typeof grantMin !== 'number') {
    out.push({
      label: 'Funding amount',
      verdict: 'n/a',
      detail: 'Grant amount not specified.',
    });
  } else {
    const min = grantMin ?? grantMax ?? 0;
    const max = grantMax ?? grantMin ?? 0;
    const wantMin = profileMin ?? 0;
    const wantMax = profileMax ?? Number.POSITIVE_INFINITY;
    const overlaps = max >= wantMin && min <= wantMax;
    if (overlaps) {
      out.push({
        label: 'Funding amount',
        verdict: 'match',
        detail: `Grant range overlaps your target.`,
      });
    } else {
      out.push({
        label: 'Funding amount',
        verdict: 'warn',
        detail: 'Grant amount falls outside your preferred range.',
      });
    }
  }

  return out;
}
