// Helper utility to convert any non-Latin numerals (such as Arabic-Indic digits ٠-٩) to standard Latin numerals (0-9)
export const toLatinNumerals = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
  const easternPersianDigits = '۰۱۲۳۴۵۶۷۸۹';
  
  return str
    .replace(/[٠-٩]/g, (d) => String(arabicIndicDigits.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(easternPersianDigits.indexOf(d)));
};
