// ===================================================================
// USL-ERP EXAM SCHEDULER - COMPLETE REWRITE V4.0
// ===================================================================
// Complete rewrite to achieve 98%+ scheduling coverage
// Strategy: Process ALL exams, not just Gen Eds
// ===================================================================

import { Exam, ScheduledExam, ConflictMatrix, SchedulingState } from '../subject-code';

// ===================================================================
// CONSTANTS
// ===================================================================

const TIME_SLOTS = [
  '7:30-9:00', '9:00-10:30', '10:30-12:00', '12:00-1:30',
  '1:30-3:00', '3:00-4:30', '4:30-6:00', '6:00-7:30'
];

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function isGenEdSubject(subjectId: string): boolean {
  if (!subjectId) return false;
  const upper = subjectId.toUpperCase();
  return ['CFED', 'PHED', 'ENGL', 'CONW', 'LANG', 'JAPN', 'CHIN', 'SPAN', 'LITR', 'ETHC', 'RESM'].some(p => upper.startsWith(p));
}

function getBuildingFromRoom(room: string): string {
  const match = room.match(/^([A-Z]+)-/);
  return match ? match[1] : '';
}

function getAvailableBuildings(dept: string, subjectId: string): string[] {
  if (subjectId.toUpperCase().includes('ARCH')) {
    return ['C', 'K'];
  }
  
  const deptUpper = dept.toUpperCase();
  
  if (deptUpper.includes('SECAP') || deptUpper.includes('ACCT') || deptUpper.includes('ECON') || deptUpper.includes('BSBA')) {
    return ['A', 'J', 'B'];
  }
  
  if (deptUpper.includes('SABH') || deptUpper.includes('NURS') || deptUpper.includes('SBH')) {
    return ['A'];
  }
  
  if (deptUpper.includes('SACE') || deptUpper.includes('SCE') || deptUpper.includes('CENG') || deptUpper.includes('ENG')) {
    return ['N', 'K', 'C'];
  }
  
  if (deptUpper.includes('SHAS') || deptUpper.includes('HUMSS') || deptUpper.includes('HUM')) {
    return ['L', 'M', 'N', 'K', 'J'];
  }
  
  return ['A', 'N', 'K', 'L', 'M', 'J', 'B', 'C'];
}

// ===================================================================
// CONFLICT DETECTION
// ===================================================================

function buildConflictMatrix(exams: Exam[]): ConflictMatrix {
  const matrix: ConflictMatrix = {};
  
  // Group by course-year
  const courseYearGroups: { [key: string]: Exam[] } = {};
  
  exams.forEach(exam => {
    if (!exam.course || !exam.yearLevel) return;
    
    const key = `${exam.course.trim()}-${exam.yearLevel}`;
    if (!courseYearGroups[key]) {
      courseYearGroups[key] = [];
    }
    courseYearGroups[key].push(exam);
  });
  
  // Build conflict relationships
  Object.entries(courseYearGroups).forEach(([courseYear, groupExams]) => {
    if (!matrix[courseYear]) {
      matrix[courseYear] = {};
    }
    
    groupExams.forEach(exam1 => {
      const subj1 = exam1.subjectId.toUpperCase().trim();
      if (!matrix[courseYear][subj1]) {
        matrix[courseYear][subj1] = new Set();
      }
      
      groupExams.forEach(exam2 => {
        const subj2 = exam2.subjectId.toUpperCase().trim();
        if (exam1.code !== exam2.code && subj1 !== subj2) {
          matrix[courseYear][subj1].add(subj2);
        }
      });
    });
  });
  
  return matrix;
}

function hasConflict(
  exam: Exam,
  day: number,
  slot: number,
  state: SchedulingState,
  conflictMatrix: ConflictMatrix
): boolean {
  if (!exam.course || !exam.yearLevel) return false;
  
  const courseYear = `${exam.course.trim()}-${exam.yearLevel}`;
  const dayKey = `Day ${day + 1}`;
  const slotKey = TIME_SLOTS[slot];
  const subjId = exam.subjectId.toUpperCase().trim();
  
  if (!conflictMatrix[courseYear] || !conflictMatrix[courseYear][subjId]) {
    return false;
  }
  
  const conflicts = conflictMatrix[courseYear][subjId];
  
  // Check if any conflicting subject is at this slot
  for (const conflictSubj of conflicts) {
    const existing = state.subjectScheduled.get(conflictSubj);
    if (existing && existing.day === dayKey && existing.slot === slotKey) {
      return true;
    }
  }
  
  return false;
}

// ===================================================================
// ROOM SELECTION
// ===================================================================

function getAvailableRooms(
  exam: Exam,
  day: number,
  slot: number,
  allRooms: string[],
  state: SchedulingState
): string[] {
  const dayKey = `Day ${day + 1}`;
  const slotKey = TIME_SLOTS[slot];
  
  // Filter by building
  const allowedBuildings = getAvailableBuildings(exam.dept, exam.subjectId);
  let available = allRooms.filter(room => {
    const building = getBuildingFromRoom(room);
    return allowedBuildings.includes(building);
  });
  
  // Remove occupied rooms
  const occupied = new Set<string>();
  if (state.roomUsage.has(dayKey)) {
    const dayUsage = state.roomUsage.get(dayKey)!;
    if (dayUsage.has(slotKey)) {
      dayUsage.get(slotKey)!.forEach(room => occupied.add(room));
    }
  }
  
  available = available.filter(room => !occupied.has(room));
  
  return available;
}

// ===================================================================
// SCHEDULING LOGIC
// ===================================================================

function scheduleExam(
  exam: Exam,
  day: number,
  slot: number,
  room: string,
  state: SchedulingState,
  scheduled: Map<string, ScheduledExam>
): void {
  const dayKey = `Day ${day + 1}`;
  const slotKey = TIME_SLOTS[slot];
  
  const scheduledExam: ScheduledExam = {
    CODE: exam.code,
    SUBJECT_ID: exam.subjectId,
    DESCRIPTIVE_TITLE: exam.title,
    COURSE: exam.course,
    YEAR_LEVEL: exam.yearLevel,
    INSTRUCTOR: exam.instructor,
    DEPT: exam.dept,
    OE: exam.oe,
    DAY: dayKey,
    SLOT: slotKey,
    ROOM: room,
    UNITS: exam.lec,
    STUDENT_COUNT: exam.studentCount,
    PRIORITY: 0,
    IS_REGULAR: exam.isRegular,
    LECTURE_ROOM: exam.lectureRoom
  };
  
  // Update state
  if (!state.roomUsage.has(dayKey)) {
    state.roomUsage.set(dayKey, new Map());
  }
  if (!state.roomUsage.get(dayKey)!.has(slotKey)) {
    state.roomUsage.get(dayKey)!.set(slotKey, new Set());
  }
  state.roomUsage.get(dayKey)!.get(slotKey)!.add(room);
  
  state.subjectScheduled.set(exam.subjectId.toUpperCase().trim(), { day: dayKey, slot: slotKey });
  
  scheduled.set(exam.code + '-' + slotKey, scheduledExam);
}

function tryScheduleExam(
  exam: Exam,
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): boolean {
  // Try every day and slot
  for (let day = 0; day < numDays; day++) {
    for (let slot = 0; slot < TIME_SLOTS.length; slot++) {
      // Check for conflicts
      if (hasConflict(exam, day, slot, state, conflictMatrix)) {
        continue;
      }
      
      // Get available rooms
      const availableRooms = getAvailableRooms(exam, day, slot, allRooms, state);
      
      if (availableRooms.length > 0) {
        // Schedule it!
        scheduleExam(exam, day, slot, availableRooms[0], state, scheduled);
        return true;
      }
    }
  }
  
  return false;
}

// ===================================================================
// GROUP SCHEDULING (for same subject_id coordination)
// ===================================================================

function groupExamsBySubject(exams: Exam[]): Map<string, Exam[]> {
  const groups = new Map<string, Exam[]>();
  
  exams.forEach(exam => {
    const subjectId = exam.subjectId.toUpperCase().trim();
    if (!groups.has(subjectId)) {
      groups.set(subjectId, []);
    }
    groups.get(subjectId)!.push(exam);
  });
  
  return groups;
}

function tryScheduleGroup(
  examGroup: Exam[],
  day: number,
  slot: number,
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>
): boolean {
  if (examGroup.length === 0) return true;
  
  // Check conflicts for all exams
  for (const exam of examGroup) {
    if (hasConflict(exam, day, slot, state, conflictMatrix)) {
      return false;
    }
  }
  
  // Get available rooms
  const availableRooms = getAvailableRooms(examGroup[0], day, slot, allRooms, state);
  
  if (availableRooms.length < examGroup.length) {
    return false;
  }
  
  // Schedule all sections
  for (let i = 0; i < examGroup.length; i++) {
    scheduleExam(examGroup[i], day, slot, availableRooms[i], state, scheduled);
  }
  
  return true;
}

function tryScheduleGroupAnywhere(
  examGroup: Exam[],
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): boolean {
  // Split into smaller batches if needed
  const maxBatchSize = 35; // Conservative batch size
  
  if (examGroup.length <= maxBatchSize) {
    // Try to schedule as one group
    for (let day = 0; day < numDays; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length; slot++) {
        if (tryScheduleGroup(examGroup, day, slot, allRooms, state, conflictMatrix, scheduled)) {
          return true;
        }
      }
    }
    return false;
  }
  
  // Split into batches
  let allScheduled = true;
  
  for (let i = 0; i < examGroup.length; i += maxBatchSize) {
    const batch = examGroup.slice(i, Math.min(i + maxBatchSize, examGroup.length));
    let batchScheduled = false;
    
    for (let day = 0; day < numDays && !batchScheduled; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length && !batchScheduled; slot++) {
        if (tryScheduleGroup(batch, day, slot, allRooms, state, conflictMatrix, scheduled)) {
          batchScheduled = true;
        }
      }
    }
    
    if (!batchScheduled) {
      allScheduled = false;
    }
  }
  
  return allScheduled;
}

// ===================================================================
// MAIN ALGORITHM - SIMPLE 2-PHASE APPROACH
// ===================================================================

export function generateExamSchedule(
  exams: Exam[],
  rooms: string[],
  numDays: number
): ScheduledExam[] {
  console.log('🚀 Starting Complete Exam Scheduler Algorithm v4.0...');
  console.log(`  Total exams: ${exams.length}`);
  console.log(`  Rooms: ${rooms.length}`);
  console.log(`  Days: ${numDays}`);
  
  // Initialize
  const state: SchedulingState = {
    assignments: new Map(),
    roomUsage: new Map(),
    studentLoad: new Map(),
    campusUsage: new Map(),
    subjectScheduled: new Map(),
    consecutiveCheck: new Map()
  };
  
  const scheduled = new Map<string, ScheduledExam>();
  const unscheduled: Exam[] = [];
  
  // Filter SAS
  const eligible = exams.filter(e => e.dept.toUpperCase() !== 'SAS');
  console.log(`  Eligible: ${eligible.length} (filtered ${exams.length - eligible.length} SAS)`);
  
  // Build conflict matrix
  console.log('📊 Building conflict matrix...');
  const conflictMatrix = buildConflictMatrix(eligible);
  
  // ===================================================================
  // PHASE 1: SCHEDULE BY SUBJECT GROUPS (coordinated scheduling)
  // ===================================================================
  console.log('\n📚 PHASE 1: Scheduling subjects with section coordination...');
  
  const subjectGroups = groupExamsBySubject(eligible);
  console.log(`  Found ${subjectGroups.size} unique subjects`);
  
  let phase1Success = 0;
  let phase1Fail: Exam[] = [];
  
  // Sort by group size (smaller groups first - easier to place)
  const sortedGroups = Array.from(subjectGroups.entries()).sort((a, b) => a[1].length - b[1].length);
  
  sortedGroups.forEach(([subjectId, examGroup]) => {
    const isGenEd = isGenEdSubject(subjectId);
    const prefix = isGenEd ? '📗' : '📘';
    
    if (tryScheduleGroupAnywhere(examGroup, rooms, state, conflictMatrix, scheduled, numDays)) {
      console.log(`  ${prefix} ✅ ${subjectId} (${examGroup.length} sections)`);
      phase1Success += examGroup.length;
    } else {
      console.log(`  ${prefix} ⚠️ ${subjectId} (${examGroup.length} sections) - trying individual scheduling`);
      phase1Fail.push(...examGroup);
    }
  });
  
  console.log(`\n✅ Phase 1 complete: ${phase1Success}/${eligible.length} scheduled`);
  
  // ===================================================================
  // PHASE 2: SCHEDULE REMAINING INDIVIDUALLY (no coordination constraint)
  // ===================================================================
  console.log('\n🔧 PHASE 2: Scheduling remaining exams individually...');
  
  let phase2Success = 0;
  
  phase1Fail.forEach(exam => {
    if (tryScheduleExam(exam, rooms, state, conflictMatrix, scheduled, numDays)) {
      phase2Success++;
    } else {
      unscheduled.push(exam);
    }
  });
  
  console.log(`  ✅ Scheduled ${phase2Success} additional exams`);
  
  // ===================================================================
  // RESULTS
  // ===================================================================
  const scheduledArray = Array.from(scheduled.values());
  const totalScheduled = phase1Success + phase2Success;
  const coverage = ((totalScheduled / eligible.length) * 100).toFixed(2);
  
  console.log('\n✅ ======================== FINAL RESULTS ========================');
  console.log(`  Total eligible exams: ${eligible.length}`);
  console.log(`  Successfully scheduled: ${totalScheduled} (${scheduledArray.length} entries)`);
  console.log(`  Unscheduled: ${unscheduled.length}`);
  console.log(`  Coverage: ${coverage}%`);
  console.log('================================================================');
  
  if (unscheduled.length > 0) {
    console.warn('\n⚠️  UNSCHEDULED EXAMS:');
    unscheduled.slice(0, 20).forEach(exam => {
      console.warn(`  - ${exam.subjectId} (${exam.code}): ${exam.course} Yr ${exam.yearLevel}`);
    });
    if (unscheduled.length > 20) {
      console.warn(`  ... and ${unscheduled.length - 20} more`);
    }
  }
  
  return scheduledArray;
}