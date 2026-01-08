export type TeamDueSettings = {
  due_weekday: number | null;        // 0=Sun..6=Sat
  due_day_of_month: number | null;   // 1..31
  due_month_in_quarter: number | null; // 1..3
};

export type Interval = "week" | "month" | "quarter";

function clampDayOfMonthUTC(year: number, monthIndex0: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(day, lastDay));
}

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function computeNextDueAtUTC(now: Date, interval: Interval, team: TeamDueSettings): Date {
  const base = startOfDayUTC(now);

  if (interval === "week") {
    const anchor = team.due_weekday;
    if (anchor === null || anchor === undefined) throw new Error("Team due_weekday missing.");
    const today = base.getUTCDay();
    let add = (anchor - today + 7) % 7;
    if (add === 0) add = 7;
    return new Date(base.getTime() + add * 24 * 60 * 60 * 1000);
  }

  if (interval === "month") {
    const day = team.due_day_of_month;
    if (!day) throw new Error("Team due_day_of_month missing.");
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();

    const ny = y + Math.floor((m + 1) / 12);
    const nm = (m + 1) % 12;

    const dd = clampDayOfMonthUTC(ny, nm, day);
    return new Date(Date.UTC(ny, nm, dd, 0, 0, 0, 0));
  }

  const day = team.due_day_of_month;
  const miq = team.due_month_in_quarter ?? 1;
  if (!day) throw new Error("Team due_day_of_month missing for quarter.");
  if (![1, 2, 3].includes(miq)) throw new Error("Team due_month_in_quarter must be 1..3");

  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const quarterStart = Math.floor(m / 3) * 3;
  const nextQuarterStart = quarterStart + 3;

  const nqY = y + Math.floor(nextQuarterStart / 12);
  const nqM = nextQuarterStart % 12;

  const targetMonth = nqM + (miq - 1);
  const ty = nqY + Math.floor(targetMonth / 12);
  const tm = targetMonth % 12;

  const dd = clampDayOfMonthUTC(ty, tm, day);
  return new Date(Date.UTC(ty, tm, dd, 0, 0, 0, 0));
}
