const DICT: Record<string, string> = {
  eng: 'Tiếng Anh',
  fre: 'Tiếng Pháp',
  fra: 'Tiếng Pháp',
  ger: 'Tiếng Đức',
  deu: 'Tiếng Đức',
  spa: 'Tiếng Tây Ban Nha',
  por: 'Tiếng Bồ Đào Nha',
  ita: 'Tiếng Ý',
  rus: 'Tiếng Nga',
  chi: 'Tiếng Trung',
  zho: 'Tiếng Trung',
  jpn: 'Tiếng Nhật',
  kor: 'Tiếng Hàn',
  vie: 'Tiếng Việt',
  ind: 'Tiếng Indonesia',
  tha: 'Tiếng Thái',
  msa: 'Tiếng Mã Lai',
  may: 'Tiếng Mã Lai',
  ara: 'Tiếng Ả Rập',
  pol: 'Tiếng Ba Lan',
  tur: 'Tiếng Thổ Nhĩ Kỳ',
  nld: 'Tiếng Hà Lan',
  dut: 'Tiếng Hà Lan',
};

export function langName(code: string): string {
  const lower = code.toLowerCase();
  return DICT[lower] ?? code.toUpperCase();
}
