import { AttendanceStatus } from './attendance-status.js';
import { AttendanceType } from './attendance-type.js';

export interface StartAttendanceInput {
  id: string;
  employeeId: string;
  workDate: string;
  type: AttendanceType;
  checkedInAt: Date;
}

export class AttendanceRecord {
  private checkedOutAt?: Date;

  private constructor(
    readonly id: string,
    readonly employeeId: string,
    readonly workDate: string,
    readonly type: AttendanceType,
    readonly checkedInAt: Date,
  ) {}

  static start(input: StartAttendanceInput): AttendanceRecord {
    if (input.checkedInAt.getTime() > Date.now()) {
      throw new Error('ATTENDANCE_CHECK_IN_CANNOT_BE_IN_FUTURE');
    }

    return new AttendanceRecord(
      input.id,
      input.employeeId,
      input.workDate,
      input.type,
      input.checkedInAt,
    );
  }

  get status(): AttendanceStatus {
    return this.checkedOutAt
      ? AttendanceStatus.CheckedOut
      : AttendanceStatus.CheckedIn;
  }

  get checkOutTime(): Date | undefined {
    return this.checkedOutAt;
  }

  checkOut(at: Date): void {
    if (this.checkedOutAt) {
      throw new Error('ATTENDANCE_ALREADY_CHECKED_OUT');
    }

    if (at.getTime() <= this.checkedInAt.getTime()) {
      throw new Error('ATTENDANCE_CHECK_OUT_MUST_BE_AFTER_CHECK_IN');
    }

    this.checkedOutAt = at;
  }
}

