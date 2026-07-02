// Country code tables. The choropleth is keyed by the GeoJSON's ISO_A2_EH
// property, so no ISO2-to-feature-name mapping exists anywhere.

export const ISO3_TO_ISO2: Record<string, string> = {
  ABW: 'AW', AFG: 'AF', AGO: 'AO', AIA: 'AI', ALA: 'AX', ALB: 'AL', AND: 'AD',
  ARE: 'AE', ARG: 'AR', ARM: 'AM', ASM: 'AS', ATG: 'AG', AUS: 'AU', AUT: 'AT',
  AZE: 'AZ', BDI: 'BI', BEL: 'BE', BEN: 'BJ', BFA: 'BF', BGD: 'BD', BGR: 'BG',
  BHR: 'BH', BHS: 'BS', BIH: 'BA', BLR: 'BY', BLZ: 'BZ', BMU: 'BM', BOL: 'BO',
  BRA: 'BR', BRB: 'BB', BRN: 'BN', BTN: 'BT', BWA: 'BW', CAF: 'CF', CAN: 'CA',
  CHE: 'CH', CHL: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', COG: 'CG',
  COK: 'CK', COL: 'CO', CPV: 'CV', CRI: 'CR', CUB: 'CU', CUW: 'CW', CYM: 'KY',
  CYP: 'CY', CZE: 'CZ', DEU: 'DE', DJI: 'DJ', DMA: 'DM', DNK: 'DK', DOM: 'DO',
  DZA: 'DZ', ECU: 'EC', EGY: 'EG', ERI: 'ER', ESP: 'ES', EST: 'EE', ETH: 'ET',
  FIN: 'FI', FJI: 'FJ', FRA: 'FR', FRO: 'FO', FSM: 'FM', GAB: 'GA', GBR: 'GB',
  GEO: 'GE', GGY: 'GG', GHA: 'GH', GIB: 'GI', GIN: 'GN', GLP: 'GP', GMB: 'GM',
  GNB: 'GW', GNQ: 'GQ', GRC: 'GR', GRD: 'GD', GRL: 'GL', GTM: 'GT', GUF: 'GF',
  GUM: 'GU', GUY: 'GY', HKG: 'HK', HND: 'HN', HRV: 'HR', HTI: 'HT', HUN: 'HU',
  IDN: 'ID', IMN: 'IM', IND: 'IN', IRL: 'IE', IRN: 'IR', IRQ: 'IQ', ISL: 'IS',
  ISR: 'IL', ITA: 'IT', JAM: 'JM', JEY: 'JE', JOR: 'JO', JPN: 'JP', KAZ: 'KZ',
  KEN: 'KE', KGZ: 'KG', KHM: 'KH', KIR: 'KI', KNA: 'KN', KOR: 'KR', KWT: 'KW',
  LAO: 'LA', LBN: 'LB', LBR: 'LR', LBY: 'LY', LCA: 'LC', LIE: 'LI', LKA: 'LK',
  LSO: 'LS', LTU: 'LT', LUX: 'LU', LVA: 'LV', MAC: 'MO', MAR: 'MA', MCO: 'MC',
  MDA: 'MD', MDG: 'MG', MDV: 'MV', MEX: 'MX', MHL: 'MH', MKD: 'MK', MLI: 'ML',
  MLT: 'MT', MMR: 'MM', MNE: 'ME', MNG: 'MN', MOZ: 'MZ', MRT: 'MR', MTQ: 'MQ',
  MUS: 'MU', MWI: 'MW', MYS: 'MY', NAM: 'NA', NCL: 'NC', NER: 'NE', NGA: 'NG',
  NIC: 'NI', NLD: 'NL', NOR: 'NO', NPL: 'NP', NZL: 'NZ', OMN: 'OM', PAK: 'PK',
  PAN: 'PA', PER: 'PE', PHL: 'PH', PLW: 'PW', PNG: 'PG', POL: 'PL', PRI: 'PR',
  PRT: 'PT', PRY: 'PY', PSE: 'PS', PYF: 'PF', QAT: 'QA', REU: 'RE', ROU: 'RO',
  RUS: 'RU', RWA: 'RW', SAU: 'SA', SDN: 'SD', SEN: 'SN', SGP: 'SG', SLB: 'SB',
  SLE: 'SL', SLV: 'SV', SMR: 'SM', SOM: 'SO', SRB: 'RS', SSD: 'SS', STP: 'ST',
  SUR: 'SR', SVK: 'SK', SVN: 'SI', SWE: 'SE', SWZ: 'SZ', SXM: 'SX', SYC: 'SC',
  SYR: 'SY', TCA: 'TC', TCD: 'TD', TGO: 'TG', THA: 'TH', TJK: 'TJ', TKM: 'TM',
  TLS: 'TL', TON: 'TO', TTO: 'TT', TUN: 'TN', TUR: 'TR', TUV: 'TV', TWN: 'TW',
  TZA: 'TZ', UGA: 'UG', UKR: 'UA', URY: 'UY', USA: 'US', UZB: 'UZ', VAT: 'VA',
  VCT: 'VC', VEN: 'VE', VGB: 'VG', VIR: 'VI', VNM: 'VN', VUT: 'VU', WSM: 'WS',
  YEM: 'YE', ZAF: 'ZA', ZMB: 'ZM', ZWE: 'ZW',
  // Legacy codes that still show up in card acquirer data.
  ROM: 'RO', ANT: 'AN',
};

export const VALID_ISO2 = new Set(Object.values(ISO3_TO_ISO2));

export const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);

export const CA_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

const NAMES: Record<string, string> = {
  GB: 'United Kingdom', US: 'United States', FR: 'France', DE: 'Germany',
  ES: 'Spain', IT: 'Italy', PT: 'Portugal', IE: 'Ireland', PL: 'Poland',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', RO: 'Romania', CZ: 'Czechia',
  SK: 'Slovakia', HU: 'Hungary', GR: 'Greece', NL: 'Netherlands', BE: 'Belgium',
  LU: 'Luxembourg', CH: 'Switzerland', AT: 'Austria', DK: 'Denmark',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland', IS: 'Iceland', HR: 'Croatia',
  SI: 'Slovenia', BG: 'Bulgaria', CY: 'Cyprus', MT: 'Malta', GI: 'Gibraltar',
  UA: 'Ukraine', BY: 'Belarus', RU: 'Russia', TR: 'Turkey', GE: 'Georgia',
  AU: 'Australia', NZ: 'New Zealand', CA: 'Canada', MX: 'Mexico', BR: 'Brazil',
  AR: 'Argentina', CL: 'Chile', PE: 'Peru', CO: 'Colombia', BO: 'Bolivia',
  JP: 'Japan', KR: 'South Korea', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
  SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', ID: 'Indonesia',
  PH: 'Philippines', IN: 'India', LK: 'Sri Lanka', NP: 'Nepal', KH: 'Cambodia',
  LA: 'Laos', MM: 'Myanmar', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  QA: 'Qatar', BH: 'Bahrain', KW: 'Kuwait', OM: 'Oman', IL: 'Israel',
  JO: 'Jordan', LB: 'Lebanon', EG: 'Egypt', MA: 'Morocco', TN: 'Tunisia',
  ZA: 'South Africa', KE: 'Kenya', NG: 'Nigeria', ET: 'Ethiopia', TZ: 'Tanzania',
};

export function countryName(iso2: string): string {
  return NAMES[iso2] ?? iso2;
}
