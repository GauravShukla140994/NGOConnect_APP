/**
 * Shared country list used by LoginScreen and ContactUpdateModal.
 * minLen / maxLen = expected digit count for the subscriber number (without dial code).
 */

export interface Country {
  code:        string;
  flag:        string;
  name:        string;
  dial:        string;
  minLen:      number;
  maxLen:      number;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  // ── Asia / Pacific / Americas / Africa / Middle East ───────────────────────
  { code: 'IN', flag: '🇮🇳', name: 'India',           dial: '+91',  minLen: 10, maxLen: 10, placeholder: '98765 43210' },
  { code: 'US', flag: '🇺🇸', name: 'United States',   dial: '+1',   minLen: 10, maxLen: 10, placeholder: '(555) 000-0000' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE',             dial: '+971', minLen: 9,  maxLen: 9,  placeholder: '50 123 4567' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia',       dial: '+61',  minLen: 9,  maxLen: 9,  placeholder: '412 345 678' },
  { code: 'BD', flag: '🇧🇩', name: 'Bangladesh',      dial: '+880', minLen: 10, maxLen: 10, placeholder: '1812 345678' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada',          dial: '+1',   minLen: 10, maxLen: 10, placeholder: '(555) 000-0000' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia',       dial: '+62',  minLen: 9,  maxLen: 12, placeholder: '812-3456-7890' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan',           dial: '+81',  minLen: 10, maxLen: 10, placeholder: '90-1234-5678' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya',           dial: '+254', minLen: 9,  maxLen: 9,  placeholder: '712 345 678' },
  { code: 'LK', flag: '🇱🇰', name: 'Sri Lanka',       dial: '+94',  minLen: 9,  maxLen: 9,  placeholder: '712 345 678' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia',        dial: '+60',  minLen: 9,  maxLen: 10, placeholder: '12-345 6789' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria',         dial: '+234', minLen: 10, maxLen: 10, placeholder: '802 123 4567' },
  { code: 'NP', flag: '🇳🇵', name: 'Nepal',           dial: '+977', minLen: 10, maxLen: 10, placeholder: '98412 34567' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines',     dial: '+63',  minLen: 10, maxLen: 10, placeholder: '917 123 4567' },
  { code: 'PK', flag: '🇵🇰', name: 'Pakistan',        dial: '+92',  minLen: 10, maxLen: 10, placeholder: '300 1234567' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore',       dial: '+65',  minLen: 8,  maxLen: 8,  placeholder: '8123 4567' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa',    dial: '+27',  minLen: 9,  maxLen: 9,  placeholder: '71 234 5678' },

  // ── Europe ──────────────────────────────────────────────────────────────────
  { code: 'AL', flag: '🇦🇱', name: 'Albania',               dial: '+355', minLen: 9,  maxLen: 9,  placeholder: '67 123 4567' },
  { code: 'AD', flag: '🇦🇩', name: 'Andorra',               dial: '+376', minLen: 6,  maxLen: 9,  placeholder: '312 345' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria',               dial: '+43',  minLen: 10, maxLen: 11, placeholder: '664 123456' },
  { code: 'BY', flag: '🇧🇾', name: 'Belarus',               dial: '+375', minLen: 9,  maxLen: 9,  placeholder: '29 123 4567' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium',               dial: '+32',  minLen: 9,  maxLen: 9,  placeholder: '470 12 34 56' },
  { code: 'BA', flag: '🇧🇦', name: 'Bosnia & Herzegovina',  dial: '+387', minLen: 8,  maxLen: 9,  placeholder: '61 123 456' },
  { code: 'BG', flag: '🇧🇬', name: 'Bulgaria',              dial: '+359', minLen: 9,  maxLen: 9,  placeholder: '87 123 4567' },
  { code: 'HR', flag: '🇭🇷', name: 'Croatia',               dial: '+385', minLen: 8,  maxLen: 9,  placeholder: '91 123 4567' },
  { code: 'CY', flag: '🇨🇾', name: 'Cyprus',                dial: '+357', minLen: 8,  maxLen: 8,  placeholder: '96 123456' },
  { code: 'CZ', flag: '🇨🇿', name: 'Czech Republic',        dial: '+420', minLen: 9,  maxLen: 9,  placeholder: '601 123 456' },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark',               dial: '+45',  minLen: 8,  maxLen: 8,  placeholder: '20 12 34 56' },
  { code: 'EE', flag: '🇪🇪', name: 'Estonia',               dial: '+372', minLen: 7,  maxLen: 8,  placeholder: '5123 4567' },
  { code: 'FI', flag: '🇫🇮', name: 'Finland',               dial: '+358', minLen: 9,  maxLen: 10, placeholder: '41 123 4567' },
  { code: 'FR', flag: '🇫🇷', name: 'France',                dial: '+33',  minLen: 9,  maxLen: 9,  placeholder: '6 12 34 56 78' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany',               dial: '+49',  minLen: 10, maxLen: 11, placeholder: '151 1234 5678' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece',                dial: '+30',  minLen: 10, maxLen: 10, placeholder: '697 123 4567' },
  { code: 'HU', flag: '🇭🇺', name: 'Hungary',               dial: '+36',  minLen: 9,  maxLen: 9,  placeholder: '20 123 4567' },
  { code: 'IS', flag: '🇮🇸', name: 'Iceland',               dial: '+354', minLen: 7,  maxLen: 7,  placeholder: '611 2345' },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland',               dial: '+353', minLen: 9,  maxLen: 9,  placeholder: '85 123 4567' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy',                 dial: '+39',  minLen: 9,  maxLen: 10, placeholder: '312 345 6789' },
  { code: 'XK', flag: '🇽🇰', name: 'Kosovo',                dial: '+383', minLen: 8,  maxLen: 8,  placeholder: '44 123 456' },
  { code: 'LV', flag: '🇱🇻', name: 'Latvia',                dial: '+371', minLen: 8,  maxLen: 8,  placeholder: '21 234 567' },
  { code: 'LI', flag: '🇱🇮', name: 'Liechtenstein',         dial: '+423', minLen: 7,  maxLen: 9,  placeholder: '777 1234' },
  { code: 'LT', flag: '🇱🇹', name: 'Lithuania',             dial: '+370', minLen: 8,  maxLen: 8,  placeholder: '61 234 567' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg',            dial: '+352', minLen: 9,  maxLen: 9,  placeholder: '621 123 456' },
  { code: 'MT', flag: '🇲🇹', name: 'Malta',                 dial: '+356', minLen: 8,  maxLen: 8,  placeholder: '9912 3456' },
  { code: 'MD', flag: '🇲🇩', name: 'Moldova',               dial: '+373', minLen: 8,  maxLen: 8,  placeholder: '60 123 456' },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco',                dial: '+377', minLen: 8,  maxLen: 9,  placeholder: '6 12 34 56 78' },
  { code: 'ME', flag: '🇲🇪', name: 'Montenegro',            dial: '+382', minLen: 8,  maxLen: 8,  placeholder: '67 123 456' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands',           dial: '+31',  minLen: 9,  maxLen: 9,  placeholder: '6 12 34 56 78' },
  { code: 'MK', flag: '🇲🇰', name: 'North Macedonia',       dial: '+389', minLen: 8,  maxLen: 8,  placeholder: '70 123 456' },
  { code: 'NO', flag: '🇳🇴', name: 'Norway',                dial: '+47',  minLen: 8,  maxLen: 8,  placeholder: '40 12 34 56' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland',                dial: '+48',  minLen: 9,  maxLen: 9,  placeholder: '512 345 678' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',              dial: '+351', minLen: 9,  maxLen: 9,  placeholder: '912 345 678' },
  { code: 'RO', flag: '🇷🇴', name: 'Romania',               dial: '+40',  minLen: 9,  maxLen: 9,  placeholder: '712 345 678' },
  { code: 'RU', flag: '🇷🇺', name: 'Russia',                dial: '+7',   minLen: 10, maxLen: 10, placeholder: '912 345-67-89' },
  { code: 'SM', flag: '🇸🇲', name: 'San Marino',            dial: '+378', minLen: 6,  maxLen: 9,  placeholder: '66 66 12 34' },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia',                dial: '+381', minLen: 8,  maxLen: 9,  placeholder: '60 123 4567' },
  { code: 'SK', flag: '🇸🇰', name: 'Slovakia',              dial: '+421', minLen: 9,  maxLen: 9,  placeholder: '912 345 678' },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenia',              dial: '+386', minLen: 8,  maxLen: 9,  placeholder: '31 234 567' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain',                 dial: '+34',  minLen: 9,  maxLen: 9,  placeholder: '612 345 678' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden',                dial: '+46',  minLen: 9,  maxLen: 10, placeholder: '70 123 4567' },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland',           dial: '+41',  minLen: 9,  maxLen: 9,  placeholder: '76 123 45 67' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey',                dial: '+90',  minLen: 10, maxLen: 10, placeholder: '532 123 4567' },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine',               dial: '+380', minLen: 9,  maxLen: 9,  placeholder: '50 123 4567' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom',        dial: '+44',  minLen: 10, maxLen: 10, placeholder: '7911 123456' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
