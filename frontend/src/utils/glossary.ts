/**
 * Indian-research-context glossary. Definitions sourced from
 * docs/RESEARCHER.md. Hover-tooltips render these throughout grant
 * descriptions, eligibility text, and AI rationales — the dominant
 * source of confusion for tier-2/3 university users and foreign
 * collaborators.
 *
 * Adding a term: just append to GLOSSARY. The <GlossaryText> component
 * auto-detects word-boundary matches with longer terms taking priority
 * (so UGC-CARE matches before UGC).
 */

export interface GlossaryEntry {
  /** Full expansion of the acronym. */
  full: string;
  /** One-sentence definition (under ~150 chars stays readable in tooltip). */
  definition: string;
  /** Category — for future grouping/filtering, not visible in tooltip. */
  category: 'reporting' | 'people' | 'agency' | 'scheme' | 'credibility' | 'identity';
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Funding / reporting ────────────────────────────────────────────
  UC: {
    full: 'Utilization Certificate',
    definition: 'Annual GFR Form 12-A showing how grant money was spent. Required before the next tranche is released.',
    category: 'reporting',
  },
  SE: {
    full: 'Statement of Expenditure',
    definition: 'Itemized breakdown of every line of spending under a grant, submitted alongside the UC.',
    category: 'reporting',
  },
  GFR: {
    full: 'General Financial Rules',
    definition: 'The Government of India\'s spending rulebook. All grant expenditure must comply with GFR norms.',
    category: 'reporting',
  },
  PFMS: {
    full: 'Public Financial Management System',
    definition: 'Central portal where grant money is routed and tracked. Major funding agencies disburse through PFMS.',
    category: 'reporting',
  },
  GeM: {
    full: 'Government e-Marketplace',
    definition: 'Mandatory procurement portal for buying equipment with government grant money.',
    category: 'reporting',
  },

  // ── People / career stages ─────────────────────────────────────────
  PI: {
    full: 'Principal Investigator',
    definition: 'The lead researcher on a grant — the named applicant who is accountable for delivery and reporting.',
    category: 'people',
  },
  'Co-PI': {
    full: 'Co-Principal Investigator',
    definition: 'A collaborator with shared responsibility on the grant. Some schemes allow multiple Co-PIs across institutions.',
    category: 'people',
  },
  JRF: {
    full: 'Junior Research Fellow',
    definition: 'Typical PhD years 1–2 stipend tier (~₹37k/month). Awarded after qualifying NET/GATE.',
    category: 'people',
  },
  SRF: {
    full: 'Senior Research Fellow',
    definition: 'PhD years 3+ stipend tier (~₹42k/month). Auto-upgrade from JRF after 2 years + assessment.',
    category: 'people',
  },
  PMRF: {
    full: 'Prime Minister\'s Research Fellow',
    definition: 'Elite PhD scheme for IIT / IISc / IISER students. ~₹70–80k/month plus ₹2L/year research grant.',
    category: 'people',
  },
  PA: {
    full: 'Project Associate',
    definition: 'Researcher hired against a specific grant rather than a national fellowship. Stipend comes from the PI\'s budget.',
    category: 'people',
  },

  // ── Funding agencies ───────────────────────────────────────────────
  DST: {
    full: 'Department of Science and Technology',
    definition: 'Central science ministry. Runs INSPIRE, WOS, PURSE, FIST, climate, and bilateral schemes.',
    category: 'agency',
  },
  DBT: {
    full: 'Department of Biotechnology',
    definition: 'Funds life sciences, biotech translational research, and the BIRAC startup ecosystem.',
    category: 'agency',
  },
  SERB: {
    full: 'Science and Engineering Research Board',
    definition: 'India\'s primary basic-research funder (now under ANRF). Runs CRG, SRG, MATRICS, SUPRA, IRPHA, N-PDF.',
    category: 'agency',
  },
  ANRF: {
    full: 'Anusandhan National Research Foundation',
    definition: 'Apex 2023 funding body modelled on the US NSF. Absorbed SERB and coordinates funding across ministries.',
    category: 'agency',
  },
  ICMR: {
    full: 'Indian Council of Medical Research',
    definition: 'Medical and public-health research funder. Runs ICMR Adhoc grants, fellowships, and clinical schemes.',
    category: 'agency',
  },
  CSIR: {
    full: 'Council of Scientific and Industrial Research',
    definition: 'Runs 38 national labs + fellowship schemes (CSIR-NET JRF). Mission-mode applied science.',
    category: 'agency',
  },
  ICAR: {
    full: 'Indian Council of Agricultural Research',
    definition: 'Agriculture, livestock, and food-science funder. Oversees 100+ institutes and state agricultural universities.',
    category: 'agency',
  },
  ICSSR: {
    full: 'Indian Council of Social Science Research',
    definition: 'Primary funder for social sciences and humanities research in India.',
    category: 'agency',
  },
  UGC: {
    full: 'University Grants Commission',
    definition: 'Apex body overseeing higher education. Maintains the UGC-CARE list of accredited journals.',
    category: 'agency',
  },
  MoE: {
    full: 'Ministry of Education',
    definition: 'Houses UGC, AICTE, and runs schemes like IMPRINT, SPARC, STARS for university research.',
    category: 'agency',
  },
  MeitY: {
    full: 'Ministry of Electronics & Information Technology',
    definition: 'Funds AI, semiconductor, and ICT research. Runs IndiaAI, NCoE, TIDE, SAMRIDH startup schemes.',
    category: 'agency',
  },
  BIRAC: {
    full: 'Biotechnology Industry Research Assistance Council',
    definition: 'DBT\'s startup-funding arm. Runs BIG, SBIRI, BIPP grants for biotech entrepreneurs.',
    category: 'agency',
  },
  DRDO: {
    full: 'Defence Research and Development Organisation',
    definition: 'Defence R&D body. Extramural research via ER&IPR; defence-startup grants via iDEX.',
    category: 'agency',
  },
  DPIIT: {
    full: 'Department for Promotion of Industry and Internal Trade',
    definition: 'Registers Indian startups. DPIIT recognition unlocks tax breaks, public procurement preference, and seed schemes.',
    category: 'agency',
  },

  // ── Specific schemes ───────────────────────────────────────────────
  CRG: {
    full: 'Core Research Grant',
    definition: 'SERB\'s flagship project grant for faculty PIs (₹30–50L over 3 years). Any career stage can apply.',
    category: 'scheme',
  },
  SRG: {
    full: 'Start-up Research Grant',
    definition: 'SERB\'s starter grant for brand-new Assistant Professors (up to ₹30L over 2 years, must apply within 2 years of joining).',
    category: 'scheme',
  },
  BIG: {
    full: 'Biotechnology Ignition Grant',
    definition: 'BIRAC\'s pre-seed grant (up to ₹50L) to take a biotech idea from concept to proof-of-concept.',
    category: 'scheme',
  },
  iDEX: {
    full: 'Innovations for Defence Excellence',
    definition: 'DRDO/MoD challenge programme funding startups working on defence problems (up to ₹1.5Cr per challenge).',
    category: 'scheme',
  },
  SISFS: {
    full: 'Startup India Seed Fund Scheme',
    definition: 'DPIIT\'s seed-stage scheme — up to ₹20L grant for proof-of-concept and ₹50L debt for commercialization.',
    category: 'scheme',
  },
  INSPIRE: {
    full: 'Innovation in Science Pursuit for Inspired Research',
    definition: 'DST\'s umbrella fellowship for top science students — covers PhD stipend plus a yearly research grant.',
    category: 'scheme',
  },
  IMPRINT: {
    full: 'IMPacting Research INnovation and Technology',
    definition: 'MoE + DST joint scheme funding technology research aligned with national priorities (up to ₹5Cr).',
    category: 'scheme',
  },

  // ── Credibility / promotion ────────────────────────────────────────
  'UGC-CARE': {
    full: 'UGC – Consortium for Academic and Research Ethics',
    definition: 'UGC\'s curated list of approved journals. Publications in non-CARE journals don\'t count for promotion.',
    category: 'credibility',
  },
  API: {
    full: 'Academic Performance Indicator',
    definition: 'Points-based score for academic promotion. Rewards grants, papers, citations, and teaching load.',
    category: 'credibility',
  },
  PBAS: {
    full: 'Performance Based Appraisal System',
    definition: 'UGC\'s framework that combines API points into a holistic promotion case.',
    category: 'credibility',
  },
  NAAC: {
    full: 'National Assessment and Accreditation Council',
    definition: 'Body that accredits Indian higher-education institutions. NAAC grade affects funding eligibility.',
    category: 'credibility',
  },

  // ── Identity / data ────────────────────────────────────────────────
  VIDWAN: {
    full: 'VIDWAN-ID',
    definition: 'India\'s researcher identity registry, maintained by INFLIBNET. Every Indian researcher should have a VIDWAN-ID.',
    category: 'identity',
  },
  ORCID: {
    full: 'Open Researcher and Contributor ID',
    definition: 'Global researcher identifier (orcid.org). Used by funders and journals worldwide to disambiguate authors.',
    category: 'identity',
  },
  DPDP: {
    full: 'Digital Personal Data Protection Act',
    definition: 'India\'s 2023 data-privacy law. Affects how researcher PII (e.g. reservation category) can be stored.',
    category: 'identity',
  },
};

/**
 * Terms sorted longest-first. Used by GlossaryText to ensure
 * "UGC-CARE" matches before "UGC". Computed once at module load.
 */
export const GLOSSARY_TERMS_BY_LENGTH = Object.keys(GLOSSARY).sort(
  (a, b) => b.length - a.length,
);
