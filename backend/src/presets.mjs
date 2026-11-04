/**
 * Description and metadata presets for recurring broadcasts.
 */

export const PRESETS = {
  custom: {
    id: 'custom',
    label: 'Custom Lesson / Khutbah',
    formatTitle: (inputTitle) => inputTitle.trim(),
  },
  jumuah: {
    id: 'jumuah',
    label: "Jumu'ah Khutbah (خطبة الجمعة)",
    formatTitle: (inputTitle, dateStr) =>
      inputTitle ? `خطبة الجمعة: ${inputTitle.trim()}` : `خطبة الجمعة المباركة - ${dateStr}`,
  },
  fajr: {
    id: 'fajr',
    label: 'Fajr Reminder (درس الفجر)',
    formatTitle: (inputTitle, dateStr) =>
      inputTitle ? `درس الفجر: ${inputTitle.trim()}` : `درس الفجر وتلاوة الصباح - ${dateStr}`,
  },
  maghrib: {
    id: 'maghrib',
    label: 'Maghrib Lesson (درس المغرب)',
    formatTitle: (inputTitle, dateStr) =>
      inputTitle ? `درس المغرب: ${inputTitle.trim()}` : `درس المغرب الفقهي - ${dateStr}`,
  },
  isha: {
    id: 'isha',
    label: 'Isha Lesson / Tafsir (درس العشاء والتفسير)',
    formatTitle: (inputTitle, dateStr) =>
      inputTitle ? `درس العشاء والتفسير: ${inputTitle.trim()}` : `درس العشاء والتفسير - ${dateStr}`,
  },
};

/**
 * Builds standard description template populated with mosque social links and date.
 */
export function buildDescription({ title, presetId = 'custom', customNotes = '' }) {
  const mosqueName = process.env.MOSQUE_NAME || 'Mosque Live Stream';
  const fbUrl = process.env.MOSQUE_FACEBOOK_URL || '';
  const ytUrl = process.env.MOSQUE_YOUTUBE_URL || '';
  const donationUrl = process.env.MOSQUE_DONATION_URL || '';

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines = [
    `${title}`,
    `بث مباشر من ${mosqueName} | Live Broadcast from ${mosqueName}`,
    `التاريخ / Date: ${dateFormatted}`,
    '',
  ];

  if (customNotes && customNotes.trim()) {
    lines.push(customNotes.trim());
    lines.push('');
  }

  lines.push('--- روابط المتابعة والتواصل / Official Links ---');
  if (ytUrl) lines.push(`YouTube: ${ytUrl}`);
  if (fbUrl) lines.push(`Facebook: ${fbUrl}`);
  if (donationUrl) lines.push(`Support / التبرع: ${donationUrl}`);

  lines.push('');
  lines.push('#Mosque #Khutbah #LiveStream #Islam #Dars');

  return lines.join('\n');
}
