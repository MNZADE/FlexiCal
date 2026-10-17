export type ParsedScheduleItem = {
  title: string;
  startMinute: number;
  endMinute: number;
};

export type ParseResult = {
  items: ParsedScheduleItem[];
  rejectedLines: string[];
};

function toMinute(hourText: string, minuteText: string | undefined, meridiem: string | undefined) {
  const hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (minute > 59) return undefined;

  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    return ((hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute;
  }
  if (hour > 23) return undefined;
  return hour * 60 + minute;
}

export function parseScheduleText(text: string): ParseResult {
  const items: ParsedScheduleItem[] = [];
  const rejectedLines: string[] = [];
  const pattern = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[:,-]?\s+(.+?)\s*$/i;

  for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    const match = pattern.exec(line);
    if (!match) {
      rejectedLines.push(line);
      continue;
    }
    const [, startHour, startMinuteText, startMeridiem, endHour, endMinuteText, endMeridiem, title] = match;
    const startMinute = toMinute(startHour, startMinuteText, startMeridiem ?? endMeridiem);
    const endMinute = toMinute(endHour, endMinuteText, endMeridiem ?? startMeridiem);
    if (!title || startMinute === undefined || endMinute === undefined || endMinute <= startMinute) {
      rejectedLines.push(line);
      continue;
    }
    items.push({ title, startMinute, endMinute });
  }

  return { items, rejectedLines };
}
