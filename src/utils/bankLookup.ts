/**
 * Utility for UK Sort Code formatting and major clearing bank name identification.
 */

export function formatSortCode(sortCode: string): string {
  const digits = sortCode.replace(/\D/g, '').padStart(6, '0').slice(0, 6);
  if (digits.length === 6) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }
  return sortCode;
}

export function cleanSortCodeForXml(sortCode: string): string {
  return sortCode.replace(/\D/g, '').padStart(6, '0').slice(0, 6);
}

export function cleanAccountNoForXml(accountNo: string): string {
  // UK bank accounts are strictly 8 digits in ISO 20022 clearing
  let digits = (accountNo || '').replace(/\D/g, '');
  // If 9 digits with leading 0 (common export artifact, building society roll number, or typo), strip leading 0
  if (digits.length === 9 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length > 8) {
    // If more than 8 digits without leading zero, take the last 8 digits
    digits = digits.slice(-8);
  } else if (digits.length < 8) {
    digits = digits.padStart(8, '0');
  }
  return digits.slice(0, 8);
}

export function validateUkAccountNo(accountNo: string): {
  isValid: boolean;
  cleaned: string;
  isNineDigitsWithLeadingZero: boolean;
  rawDigitsCount: number;
} {
  const digits = (accountNo || '').replace(/\D/g, '');
  const cleaned = cleanAccountNoForXml(accountNo);
  const isNineDigitsWithLeadingZero = digits.length === 9 && digits.startsWith('0');
  return {
    isValid: digits.length === 8,
    cleaned,
    isNineDigitsWithLeadingZero,
    rawDigitsCount: digits.length,
  };
}

export function getBankNameFromSortCode(sortCode: string): string {
  const clean = sortCode.replace(/\D/g, '').padStart(6, '0').slice(0, 2);
  const prefix2 = parseInt(clean, 10);
  const prefix3 = parseInt(sortCode.replace(/\D/g, '').padStart(6, '0').slice(0, 3), 10);

  if (prefix2 === 1 || (prefix2 >= 30 && prefix2 <= 39) || (prefix2 >= 77 && prefix2 <= 77)) {
    return 'Lloyds Bank / Halifax / BoS';
  }
  if (prefix2 >= 20 && prefix2 <= 29) {
    return 'Barclays Bank';
  }
  if (prefix2 >= 40 && prefix2 <= 49) {
    return 'HSBC UK';
  }
  if (prefix2 >= 50 && prefix2 <= 69) {
    if (prefix3 >= 600 && prefix3 <= 609) return 'NatWest';
    if (prefix3 >= 830 && prefix3 <= 839) return 'Royal Bank of Scotland';
    return 'NatWest / Ulster Bank';
  }
  if (prefix2 === 8 || prefix2 === 9) {
    if (prefix3 >= 900 && prefix3 <= 909) return 'Santander UK';
    if (prefix3 >= 890 && prefix3 <= 899) return 'Co-operative Bank';
    return 'Santander / Co-operative';
  }
  if (prefix2 >= 11 && prefix2 <= 19) {
    return 'Halifax / Santander / Virgin';
  }
  if (prefix2 >= 80 && prefix2 <= 89) {
    return 'Bank of Scotland / Clydesdale';
  }
  if (prefix2 === 4 || prefix2 === 5) {
    return 'Starling / Monzo / Chase';
  }
  return 'UK Clearing Bank';
}
