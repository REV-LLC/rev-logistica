export type AttendanceJournalTiming = {
  enteredAt: string;
  leftAt: string | null;
  hours: number;
  corrected: boolean;
};

export function attendanceJournalTiming(journal: {
  enteredAt: string;
  leftAt: string | null;
  effective?: AttendanceJournalTiming;
}): AttendanceJournalTiming {
  return (
    journal.effective ?? {
      enteredAt: journal.enteredAt,
      leftAt: journal.leftAt,
      hours: journal.leftAt
        ? Math.max(
            0,
            (Date.parse(journal.leftAt) - Date.parse(journal.enteredAt)) /
              3600000,
          )
        : 0,
      corrected: false,
    }
  );
}
