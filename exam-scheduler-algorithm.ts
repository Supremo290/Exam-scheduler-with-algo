// ===================================================================
// USL-ERP EXAM SCHEDULER - ENHANCED ALGORITHM V5.0
// ===================================================================
// Based on USL-ERP Complete Requirements v2.0
// Implements: Gen Ed Time Blocks, Priority System, 6-Unit Handling
// ===================================================================

import { Exam, ScheduledExam, ConflictMatrix, SchedulingState } from '../subject-code';

// ===================================================================
// CONSTANTS & CONFIGURATION
// ===================================================================

const TIME_SLOTS = [
  '7:30-9:00', '9:00-10:30', '10:30-12:00', '12:00-1:30',
  '1:30-3:00', '3:00-4:30', '4:30-6:00', '6:00-7:30'
];

// Gen Ed Time Block Mapping (from Section 6 of requirements)
const GEN_ED_TIME_BLOCKS: { [key: string]: { day: number, slot: number, capacity: number }[] } = {
  'ETHC': [
    { day: 0, slot: 0, capacity: 14 } // Day 1, 7:30-9:00 AM
  ],
  'ENGL': [
    { day: 0, slot: 2, capacity: 23 }, // Day 1, 10:30-12:00 PM
    { day: 2, slot: 0, capacity: 34 }  // Day 3, 7:30-9:00 AM
  ],
  'PHED': [
    { day: 0, slot: 3, capacity: 27 }, // Day 1, 12:00-1:30 PM
    { day: 1, slot: 0, capacity: 46 }  // Day 2, 7:30-9:00 AM
  ],
  'CFED': [
    { day: 0, slot: 4, capacity: 46 }, // Day 1, 1:30-3:00 PM
    { day: 1, slot: 1, capacity: 36 }, // Day 2, 9:00-10:30 AM
    { day: 1, slot: 2, capacity: 44 }  // Day 2, 10:30-12:00 PM
  ],
  'CONW': [
    { day: 1, slot: 5, capacity: 33 }  // Day 2, 3:00-4:30 PM
  ],
  'LANG': [
    { day: 2, slot: 3, capacity: 15 }  // Day 3, 12:00-1:30 PM
  ],
  'LITR': [
    { day: 2, slot: 4, capacity: 9 }   // Day 3, 1:30-3:00 PM
  ]
};

// Priority levels (Section 4)
const PRIORITY_LEVELS = {
  GEN_ED: 100000,
  MATH: 50000,
  ARCH: 40000,
  MAJOR: 10000
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function getGenEdType(subjectId: string): string | null {
  if (!subjectId) return null;
  const upper = subjectId.toUpperCase();
  
  if (upper.startsWith('ETHC')) return 'ETHC';
  if (upper.startsWith('ENGL')) return 'ENGL';
  if (upper.startsWith('PHED')) return 'PHED';
  if (upper.startsWith('CFED')) return 'CFED';
  if (upper.startsWith('CONW')) return 'CONW';
  if (upper.startsWith('LANG') || upper.startsWith('JAPN') || upper.startsWith('CHIN') || upper.startsWith('SPAN')) return 'LANG';
  if (upper.startsWith('LITR')) return 'LITR';
  
  return null;
}

function isGenEdSubject(subjectId: string): boolean {
  return getGenEdType(subjectId) !== null;
}

function isMathSubject(exam: Exam): boolean {
  return exam.subjectId.toUpperCase().startsWith('MATH') && exam.dept.toUpperCase() === 'SACE';
}

function isArchSubject(subjectId: string): boolean {
  return subjectId.toUpperCase().includes('ARCH');
}

function calculatePriority(exam: Exam): number {
  if (isGenEdSubject(exam.subjectId)) return PRIORITY_LEVELS.GEN_ED;
  if (isMathSubject(exam)) return PRIORITY_LEVELS.MATH;
  if (isArchSubject(exam.subjectId)) return PRIORITY_LEVELS.ARCH;
  return PRIORITY_LEVELS.MAJOR;
}

function getBuildingFromRoom(room: string): string {
  const match = room.match(/^([A-Z]+)-/);
  return match ? match[1] : '';
}

function getAvailableBuildings(dept: string, subjectId: string): string[] {
  // CRITICAL: ARCH subjects MUST use Building C (Section 3)
  if (isArchSubject(subjectId)) {
    return ['C', 'K']; // C is mandatory, K is fallback
  }
  
  const deptUpper = dept.toUpperCase();
  
  // Department-Building mapping (Section 3)
  if (deptUpper.includes('SECAP')) return ['A', 'J', 'B'];
  if (deptUpper.includes('SABH')) return ['A'];
  if (deptUpper.includes('SACE')) return ['N', 'K', 'C'];
  if (deptUpper.includes('SHAS')) return ['L', 'M', 'N', 'K', 'J'];
  
  return ['A', 'N', 'K', 'L', 'M', 'J', 'B', 'C'];
}

function is6UnitSubject(exam: Exam): boolean {
  return exam.lec === 6;
}

// ===================================================================
// CONFLICT DETECTION
// ===================================================================

function buildConflictMatrix(exams: Exam[]): ConflictMatrix {
  const matrix: ConflictMatrix = {};
  const courseYearGroups: { [key: string]: Exam[] } = {};
  
  exams.forEach(exam => {
    if (!exam.course || !exam.yearLevel) return;
    const key = `${exam.course.trim()}-${exam.yearLevel}`;
    if (!courseYearGroups[key]) courseYearGroups[key] = [];
    courseYearGroups[key].push(exam);
  });
  
  Object.entries(courseYearGroups).forEach(([courseYear, groupExams]) => {
    if (!matrix[courseYear]) matrix[courseYear] = {};
    
    groupExams.forEach(exam1 => {
      const subj1 = exam1.subjectId.toUpperCase().trim();
      if (!matrix[courseYear][subj1]) matrix[courseYear][subj1] = new Set();
      
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
  
  if (!conflictMatrix[courseYear] || !conflictMatrix[courseYear][subjId]) return false;
  
  const conflicts = conflictMatrix[courseYear][subjId];
  
  for (const conflictSubj of conflicts) {
    const existing = state.subjectScheduled.get(conflictSubj);
    if (existing && existing.day === dayKey && existing.slot === slotKey) {
      return true;
    }
  }
  
  return false;
}

// ===================================================================
// ROOM MANAGEMENT
// ===================================================================

function getAvailableRooms(
  exam: Exam,
  day: number,
  slot: number,
  allRooms: string[],
  state: SchedulingState,
  requireConsecutive: boolean = false
): string[] {
  const dayKey = `Day ${day + 1}`;
  const slotKey = TIME_SLOTS[slot];
  
  // Filter by building constraints
  const allowedBuildings = getAvailableBuildings(exam.dept, exam.subjectId);
  let available = allRooms.filter(room => {
    const building = getBuildingFromRoom(room);
    return allowedBuildings.includes(building);
  });
  
  // Get occupied rooms for current slot
  const occupied = new Set<string>();
  if (state.roomUsage.has(dayKey)) {
    const dayUsage = state.roomUsage.get(dayKey)!;
    if (dayUsage.has(slotKey)) {
      dayUsage.get(slotKey)!.forEach(room => occupied.add(room));
    }
  }
  
  // For 6-unit subjects, check next slot availability too
  if (requireConsecutive && slot < TIME_SLOTS.length - 1) {
    const nextSlotKey = TIME_SLOTS[slot + 1];
    if (state.roomUsage.has(dayKey)) {
      const dayUsage = state.roomUsage.get(dayKey)!;
      if (dayUsage.has(nextSlotKey)) {
        dayUsage.get(nextSlotKey)!.forEach(room => occupied.add(room));
      }
    }
  }
  
  available = available.filter(room => !occupied.has(room));
  
  return available;
}

// ===================================================================
// SCHEDULING OPERATIONS
// ===================================================================

function scheduleExam(
  exam: Exam,
  day: number,
  slot: number,
  room: string,
  state: SchedulingState,
  scheduled: Map<string, ScheduledExam>,
  isSecondSlotOf6Unit: boolean = false
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
    PRIORITY: calculatePriority(exam),
    IS_REGULAR: exam.isRegular,
    LECTURE_ROOM: exam.lectureRoom
  };
  
  // Update room usage
  if (!state.roomUsage.has(dayKey)) {
    state.roomUsage.set(dayKey, new Map());
  }
  if (!state.roomUsage.get(dayKey)!.has(slotKey)) {
    state.roomUsage.get(dayKey)!.set(slotKey, new Set());
  }
  state.roomUsage.get(dayKey)!.get(slotKey)!.add(room);
  
  // Update subject tracking (only for first slot of 6-unit)
  if (!isSecondSlotOf6Unit) {
    state.subjectScheduled.set(exam.subjectId.toUpperCase().trim(), { day: dayKey, slot: slotKey });
  }
  
  scheduled.set(exam.code + '-' + slotKey, scheduledExam);
}

function schedule6UnitExam(
  exam: Exam,
  day: number,
  slot: number,
  room: string,
  state: SchedulingState,
  scheduled: Map<string, ScheduledExam>
): boolean {
  if (slot >= TIME_SLOTS.length - 1) return false; // Need 2 consecutive slots
  
  // Schedule first slot
  scheduleExam(exam, day, slot, room, state, scheduled, false);
  
  // Schedule second slot
  scheduleExam(exam, day, slot + 1, room, state, scheduled, true);
  
  return true;
}

// ===================================================================
// GROUP SCHEDULING (Same Subject ID Coordination)
// ===================================================================

function groupExamsBySubject(exams: Exam[]): Map<string, Exam[]> {
  const groups = new Map<string, Exam[]>();
  
  exams.forEach(exam => {
    const subjectId = exam.subjectId.toUpperCase().trim();
    if (!groups.has(subjectId)) groups.set(subjectId, []);
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
  
  // Check if any exam in group is 6-unit
  const has6Unit = examGroup.some(e => is6UnitSubject(e));
  
  // Check conflicts for all exams
  for (const exam of examGroup) {
    if (hasConflict(exam, day, slot, state, conflictMatrix)) return false;
  }
  
  // Get available rooms
  const availableRooms = getAvailableRooms(examGroup[0], day, slot, allRooms, state, has6Unit);
  
  if (availableRooms.length < examGroup.length) return false;
  
  // Schedule all sections
  for (let i = 0; i < examGroup.length; i++) {
    const exam = examGroup[i];
    
    if (is6UnitSubject(exam)) {
      if (!schedule6UnitExam(exam, day, slot, availableRooms[i], state, scheduled)) {
        return false;
      }
    } else {
      scheduleExam(exam, day, slot, availableRooms[i], state, scheduled);
    }
  }
  
  return true;
}

// ===================================================================
// PHASE 1: GEN ED TIME BLOCKS
// ===================================================================

function scheduleGenEdTimeBlocks(
  exams: Exam[],
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): { scheduled: number, failed: Exam[] } {
  console.log('\n📚 PHASE 1: Gen Ed Time Block Scheduling...');
  
  let scheduledCount = 0;
  const failed: Exam[] = [];
  
  // Group Gen Eds by type
  const genEdsByType = new Map<string, Exam[]>();
  
  exams.forEach(exam => {
    const genEdType = getGenEdType(exam.subjectId);
    if (genEdType) {
      if (!genEdsByType.has(genEdType)) genEdsByType.set(genEdType, []);
      genEdsByType.get(genEdType)!.push(exam);
    }
  });
  
  // Schedule each Gen Ed type in its dedicated time blocks
  genEdsByType.forEach((genEdExams, genEdType) => {
    console.log(`  📗 Scheduling ${genEdType} (${genEdExams.length} sections)...`);
    
    // Group by subject ID for coordination
    const subjectGroups = groupExamsBySubject(genEdExams);
    
    // Get time blocks for this Gen Ed type
    const timeBlocks = GEN_ED_TIME_BLOCKS[genEdType] || [];
    
    if (timeBlocks.length === 0) {
      console.warn(`    ⚠️  No time blocks defined for ${genEdType}, scheduling flexibly`);
      subjectGroups.forEach((group, subjectId) => {
        let placed = false;
        
        for (let day = 0; day < numDays && !placed; day++) {
          for (let slot = 0; slot < TIME_SLOTS.length && !placed; slot++) {
            if (tryScheduleGroup(group, day, slot, allRooms, state, conflictMatrix, scheduled)) {
              scheduledCount += group.length;
              placed = true;
              console.log(`    ✅ ${subjectId} (${group.length} sections)`);
            }
          }
        }
        
        if (!placed) {
          failed.push(...group);
          console.log(`    ⚠️  ${subjectId} (${group.length} sections) - deferred`);
        }
      });
      return;
    }
    
    // Try to place each subject group in dedicated time blocks
    subjectGroups.forEach((group, subjectId) => {
      let placed = false;
      
      // Try each time block for this Gen Ed type
      for (const block of timeBlocks) {
        if (block.day < numDays && !placed) {
          if (tryScheduleGroup(group, block.day, block.slot, allRooms, state, conflictMatrix, scheduled)) {
            scheduledCount += group.length;
            placed = true;
            console.log(`    ✅ ${subjectId} (${group.length} sections) → Day ${block.day + 1}, ${TIME_SLOTS[block.slot]}`);
          }
        }
      }
      
      if (!placed) {
        failed.push(...group);
        console.log(`    ⚠️  ${subjectId} (${group.length} sections) - time blocks full, deferred`);
      }
    });
  });
  
  console.log(`  ✅ Phase 1 complete: ${scheduledCount} Gen Eds scheduled`);
  return { scheduled: scheduledCount, failed };
}

// ===================================================================
// PHASE 2: HIGH PRIORITY SUBJECTS (MATH & ARCH)
// ===================================================================

function scheduleHighPriority(
  exams: Exam[],
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): { scheduled: number, failed: Exam[] } {
  console.log('\n🎯 PHASE 2: High Priority Subjects (MATH & ARCH)...');
  
  let scheduledCount = 0;
  const failed: Exam[] = [];
  
  // Separate MATH and ARCH
  const mathExams = exams.filter(e => isMathSubject(e));
  const archExams = exams.filter(e => isArchSubject(e.subjectId));
  
  console.log(`  📐 MATH subjects: ${mathExams.length}`);
  console.log(`  🏛️  ARCH subjects: ${archExams.length}`);
  
  // Schedule MATH first
  const mathGroups = groupExamsBySubject(mathExams);
  mathGroups.forEach((group, subjectId) => {
    let placed = false;
    
    for (let day = 0; day < numDays && !placed; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length && !placed; slot++) {
        if (tryScheduleGroup(group, day, slot, allRooms, state, conflictMatrix, scheduled)) {
          scheduledCount += group.length;
          placed = true;
          console.log(`    ✅ MATH: ${subjectId} (${group.length} sections)`);
        }
      }
    }
    
    if (!placed) {
      failed.push(...group);
      console.log(`    ⚠️  MATH: ${subjectId} (${group.length} sections) - deferred`);
    }
  });
  
  // Schedule ARCH (must use Building C)
  const archGroups = groupExamsBySubject(archExams);
  archGroups.forEach((group, subjectId) => {
    let placed = false;
    
    for (let day = 0; day < numDays && !placed; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length && !placed; slot++) {
        if (tryScheduleGroup(group, day, slot, allRooms, state, conflictMatrix, scheduled)) {
          scheduledCount += group.length;
          placed = true;
          console.log(`    ✅ ARCH: ${subjectId} (${group.length} sections) → Building C`);
        }
      }
    }
    
    if (!placed) {
      failed.push(...group);
      console.log(`    ⚠️  ARCH: ${subjectId} (${group.length} sections) - Building C full, deferred`);
    }
  });
  
  console.log(`  ✅ Phase 2 complete: ${scheduledCount} high-priority subjects scheduled`);
  return { scheduled: scheduledCount, failed };
}

// ===================================================================
// PHASE 3: MAJOR SUBJECTS
// ===================================================================

function scheduleMajorSubjects(
  exams: Exam[],
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): { scheduled: number, failed: Exam[] } {
  console.log('\n📘 PHASE 3: Major Subjects...');
  
  let scheduledCount = 0;
  const failed: Exam[] = [];
  
  const subjectGroups = groupExamsBySubject(exams);
  
  // Sort by group size (smaller first)
  const sortedGroups = Array.from(subjectGroups.entries())
    .sort((a, b) => a[1].length - b[1].length);
  
  sortedGroups.forEach(([subjectId, group]) => {
    let placed = false;
    
    for (let day = 0; day < numDays && !placed; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length && !placed; slot++) {
        if (tryScheduleGroup(group, day, slot, allRooms, state, conflictMatrix, scheduled)) {
          scheduledCount += group.length;
          placed = true;
        }
      }
    }
    
    if (!placed) {
      failed.push(...group);
    }
  });
  
  console.log(`  ✅ Phase 3 complete: ${scheduledCount} major subjects scheduled`);
  return { scheduled: scheduledCount, failed };
}

// ===================================================================
// PHASE 4: INDIVIDUAL SCHEDULING (Relaxed)
// ===================================================================

function scheduleIndividually(
  exams: Exam[],
  allRooms: string[],
  state: SchedulingState,
  conflictMatrix: ConflictMatrix,
  scheduled: Map<string, ScheduledExam>,
  numDays: number
): number {
  console.log('\n🔧 PHASE 4: Individual Scheduling (Relaxed Mode)...');
  
  let scheduledCount = 0;
  
  exams.forEach(exam => {
    let placed = false;
    
    for (let day = 0; day < numDays && !placed; day++) {
      for (let slot = 0; slot < TIME_SLOTS.length && !placed; slot++) {
        if (hasConflict(exam, day, slot, state, conflictMatrix)) continue;
        
        const availableRooms = getAvailableRooms(exam, day, slot, allRooms, state, is6UnitSubject(exam));
        
        if (availableRooms.length > 0) {
          if (is6UnitSubject(exam)) {
            if (schedule6UnitExam(exam, day, slot, availableRooms[0], state, scheduled)) {
              scheduledCount++;
              placed = true;
            }
          } else {
            scheduleExam(exam, day, slot, availableRooms[0], state, scheduled);
            scheduledCount++;
            placed = true;
          }
        }
      }
    }
  });
  
  console.log(`  ✅ Phase 4 complete: ${scheduledCount} additional exams scheduled`);
  return scheduledCount;
}

// ===================================================================
// MAIN ALGORITHM ENTRY POINT
// ===================================================================

export function generateExamSchedule(
  exams: Exam[],
  rooms: string[],
  numDays: number
): ScheduledExam[] {
  console.log('🚀 Starting Enhanced Exam Scheduler Algorithm v5.0...');
  console.log(`  Total exams: ${exams.length}`);
  console.log(`  Rooms: ${rooms.length}`);
  console.log(`  Days: ${numDays}`);
  
  // Initialize state
  const state: SchedulingState = {
    assignments: new Map(),
    roomUsage: new Map(),
    studentLoad: new Map(),
    campusUsage: new Map(),
    subjectScheduled: new Map(),
    consecutiveCheck: new Map()
  };
  
  const scheduled = new Map<string, ScheduledExam>();
  
  // Filter SAS department
  const eligible = exams.filter(e => e.dept.toUpperCase() !== 'SAS');
  console.log(`  Eligible: ${eligible.length} (filtered ${exams.length - eligible.length} SAS)`);
  
  // Build conflict matrix
  console.log('📊 Building conflict matrix...');
  const conflictMatrix = buildConflictMatrix(eligible);
  
  // Separate by category
  const genEds = eligible.filter(e => isGenEdSubject(e.subjectId));
  const mathSubjects = eligible.filter(e => isMathSubject(e));
  const archSubjects = eligible.filter(e => isArchSubject(e.subjectId));
  const majorSubjects = eligible.filter(e => 
    !isGenEdSubject(e.subjectId) && 
    !isMathSubject(e) && 
    !isArchSubject(e.subjectId)
  );
  
  console.log(`\n📋 Exam Categories:`);
  console.log(`  Gen Eds: ${genEds.length}`);
  console.log(`  MATH: ${mathSubjects.length}`);
  console.log(`  ARCH: ${archSubjects.length}`);
  console.log(`  Major: ${majorSubjects.length}`);
  
  // Execute scheduling phases
  let totalScheduled = 0;
  let unscheduled: Exam[] = [];
  
  // PHASE 1: Gen Ed Time Blocks
  const phase1 = scheduleGenEdTimeBlocks(genEds, rooms, state, conflictMatrix, scheduled, numDays);
  totalScheduled += phase1.scheduled;
  
  // PHASE 2: High Priority (MATH & ARCH)
  const phase2 = scheduleHighPriority(
    [...mathSubjects, ...archSubjects],
    rooms,
    state,
    conflictMatrix,
    scheduled,
    numDays
  );
  totalScheduled += phase2.scheduled;
  
  // PHASE 3: Major Subjects
  const phase3 = scheduleMajorSubjects(majorSubjects, rooms, state, conflictMatrix, scheduled, numDays);
  totalScheduled += phase3.scheduled;
  
  // PHASE 4: Retry failed exams individually
  const allFailed = [...phase1.failed, ...phase2.failed, ...phase3.failed];
  const phase4Count = scheduleIndividually(allFailed, rooms, state, conflictMatrix, scheduled, numDays);
  totalScheduled += phase4Count;
  
  // Calculate final results
  const scheduledArray = Array.from(scheduled.values());
  const coverage = ((totalScheduled / eligible.length) * 100).toFixed(2);
  
  console.log('\n✅ ======================== FINAL RESULTS ========================');
  console.log(`  Total eligible exams: ${eligible.length}`);
  console.log(`  Successfully scheduled: ${totalScheduled}`);
  console.log(`  Unscheduled: ${eligible.length - totalScheduled}`);
  console.log(`  Coverage: ${coverage}%`);
  console.log('================================================================');
  
  // Show unscheduled if any
  if (totalScheduled < eligible.length) {
    console.warn('\n⚠️  UNSCHEDULED EXAMS:');
    const unscheduledExams = eligible.filter(e => 
      !scheduledArray.some(s => s.CODE === e.code)
    );
    unscheduledExams.slice(0, 20).forEach(exam => {
      console.warn(`  - ${exam.subjectId} (${exam.code}): ${exam.course} Yr ${exam.yearLevel}`);
    });
    if (unscheduledExams.length > 20) {
      console.warn(`  ... and ${unscheduledExams.length - 20} more`);
    }
  }
  
  return scheduledArray;
}