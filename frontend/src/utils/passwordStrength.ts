/**
 * Lightweight password-strength evaluator. Custom (no zxcvbn dep) because
 * the full library is ~50 KB gzipped just for the dictionaries, and we
 * only need ~80% of its catch rate to block the obvious mistakes (short,
 * common, predictable, contains email/name).
 *
 * Returns a 0–4 score and human-readable feedback the UI renders as a
 * strength bar + tips. The Register form blocks submission below score 2.
 *
 * Trade-offs: we don't try to estimate crack time, don't catch l33t-speak
 * variants of dictionary words, and our common-password list is small.
 * Good enough for signup gating; reach for zxcvbn-ts if we ever build a
 * "change password" flow with tougher requirements.
 */

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrengthResult {
  score: PasswordScore;
  /** "Very weak" / "Weak" / "Fair" / "Good" / "Strong" */
  label: string;
  /** Tailwind color for the meter segment (matches design tokens). */
  color: string;
  /** Optional single-line warning when the password is dangerous. */
  warning: string | null;
  /** Up to two actionable improvement tips. */
  suggestions: string[];
}

export interface PasswordContext {
  email?: string;
  fullName?: string;
}

// ~80 of the world's most-used passwords. Sourced from breach
// compilations (rockyou top hits) + FundSphere-specific guesses people
// might pick (fundsphere*, research*, grant*, phd*).
const COMMON_PASSWORDS = new Set<string>([
  '123456', '123456789', '12345678', '1234567', '12345', '1234567890', '111111',
  '000000', '666666', '654321', 'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl',
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  'admin', 'admin123', 'administrator', 'root', 'toor',
  'welcome', 'welcome1', 'welcome123', 'letmein', 'letmein123',
  'iloveyou', 'monkey', 'dragon', 'master', 'shadow', 'sunshine', 'princess',
  'football', 'baseball', 'starwars', 'pokemon', 'superman', 'batman',
  'trustno1', 'abc123', 'abcd1234', 'qazwsx', 'zaq12wsx', '1q2w3e4r', '1q2w3e',
  'hello', 'hello123', 'test123', 'changeme',
  // India-context guesses
  'india123', 'india@123', 'bharat123', 'mumbai123', 'delhi123', 'bangalore',
  // Project-context guesses
  'fundsphere', 'fundsphere123', 'fundsphere@123', 'research', 'research123',
  'researcher', 'researcher123', 'grant123', 'grants123', 'phd', 'phd123',
  'phdstudent', 'professor', 'professor123',
]);

const SCORE_META: Record<PasswordScore, { label: string; color: string }> = {
  0: { label: 'Very weak', color: 'bg-red-500' },
  1: { label: 'Weak', color: 'bg-orange-500' },
  2: { label: 'Fair', color: 'bg-amber-400' },
  3: { label: 'Good', color: 'bg-lime-500' },
  4: { label: 'Strong', color: 'bg-emerald-500' },
};

export function evaluatePasswordStrength(
  password: string,
  context: PasswordContext = {},
): PasswordStrengthResult {
  if (!password) {
    return { score: 0, ...SCORE_META[0], warning: null, suggestions: [] };
  }

  const normalized = password.toLowerCase().trim();
  const warning = detectFatalWarning(normalized, context);
  const suggestions: string[] = [];

  // Hard cap to 0 if the password is in our common list or matches user
  // identity — these are guessed in seconds regardless of length.
  if (warning) {
    return {
      score: 0,
      ...SCORE_META[0],
      warning,
      suggestions: warning.includes('common')
        ? ['Pick a password no one else is likely using.']
        : ['Use a phrase unrelated to your name or email.'],
    };
  }

  // Length is the single biggest factor. Below 8 is unacceptable and we
  // hard-cap to 1; from there each tier adds a point up to 16+.
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  if (password.length < 8) {
    suggestions.push(`Use at least 8 characters (${password.length}/8 so far).`);
  } else if (password.length < 12) {
    suggestions.push('Add a few more characters — 12+ is much harder to crack.');
  }

  // Character variety. We count classes used, not "must have one of each"
  // — three classes is plenty if length is good.
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (classes >= 3) score += 1;
  if (classes === 4 && password.length >= 12) score += 1;

  if (classes < 3 && suggestions.length < 2) {
    suggestions.push('Mix in upper-case, numbers, or symbols.');
  }

  // Penalize obvious patterns even on long passwords. "aaaaaaaaaaaa" is
  // long but trivial; "abcdefgh1234" is long but predictable.
  if (isRepeatingOrSequential(password)) {
    score = Math.max(0, score - 2);
    if (suggestions.length < 2) suggestions.push('Avoid sequences like "abcd" or "1111".');
  }

  // Final clamp.
  const clamped = Math.max(0, Math.min(4, score)) as PasswordScore;
  return {
    score: clamped,
    ...SCORE_META[clamped],
    warning: null,
    suggestions: suggestions.slice(0, 2),
  };
}

/**
 * Returns a warning string when the password is dangerous regardless of
 * length/complexity. These trigger a hard score of 0.
 */
function detectFatalWarning(
  normalizedPassword: string,
  context: PasswordContext,
): string | null {
  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    return 'This is one of the most common passwords on the internet.';
  }
  // Strip the digit suffix and re-check ("password1" → "password").
  const stripped = normalizedPassword.replace(/\d+$/, '');
  if (stripped.length >= 4 && COMMON_PASSWORDS.has(stripped)) {
    return 'This is a known common password with numbers appended — guessed quickly.';
  }
  if (context.email) {
    const local = context.email.split('@')[0]?.toLowerCase().trim();
    if (local && local.length >= 3 && normalizedPassword.includes(local)) {
      return 'Your password contains your email — easy to guess.';
    }
  }
  if (context.fullName) {
    const firstName = context.fullName.split(/\s+/)[0]?.toLowerCase().trim();
    if (firstName && firstName.length >= 3 && normalizedPassword.includes(firstName)) {
      return 'Your password contains your name — easy to guess.';
    }
  }
  return null;
}

function isRepeatingOrSequential(password: string): boolean {
  if (/^(.)\1{3,}$/.test(password)) return true; // "aaaaaaaa"
  if (/(.)\1{4,}/.test(password)) return true;   // any 5+ char run
  if (isSequentialRun(password)) return true;
  return false;
}

function isSequentialRun(password: string): boolean {
  const lower = password.toLowerCase();
  const sequences = [
    'abcdefghijklmnopqrstuvwxyz',
    '01234567890',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
  ];
  // Flag passwords that are >=50% a sliding 5-char window of a known
  // sequence (forward or reverse).
  for (const seq of sequences) {
    const reversed = [...seq].reverse().join('');
    for (let i = 0; i <= seq.length - 5; i += 1) {
      const window = seq.slice(i, i + 5);
      const windowReversed = reversed.slice(i, i + 5);
      if (lower.includes(window) || lower.includes(windowReversed)) return true;
    }
  }
  return false;
}
