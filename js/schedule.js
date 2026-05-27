// =============================================
// CLASS SCHEDULE MANAGER — Schedule Logic
// Conflict detection, recurrence, study blocks
// =============================================

const CSMSchedule = (() => {

  // ── Time helpers ──
  function timeToMinutes(timeStr) {
    // "08:30" → 510
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  function formatDisplayTime(timeStr) {
    // "08:30" → "8:30 AM (EAT)"
    const [h, m] = timeStr.split(':').map(Number);
    const period = h < 12 ? 'AM' : 'PM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // ── Conflict detection ──
  function detectConflicts(newClass, allClasses, excludeId = null) {
    const conflicts = [];
    const newStart = timeToMinutes(newClass.startTime);
    const newEnd   = timeToMinutes(newClass.endTime);
    const newDays  = new Set(newClass.days);

    for (const cls of allClasses) {
      if (cls.id === excludeId) continue;
      const sharedDays = (cls.days || []).filter(d => newDays.has(d));
      if (sharedDays.length === 0) continue;

      const clsStart = timeToMinutes(cls.startTime);
      const clsEnd   = timeToMinutes(cls.endTime);

      // Overlap check: not (newEnd <= clsStart || newStart >= clsEnd)
      if (!(newEnd <= clsStart || newStart >= clsEnd)) {
        conflicts.push({
          class: cls,
          days: sharedDays,
          overlap: `${formatDisplayTime(newClass.startTime)}–${formatDisplayTime(newClass.endTime)}`
        });
      }
    }
    return conflicts;
  }

  // ── Build weekly schedule grid ──
  function buildWeekGrid(classes) {
    const days = CSMConfig.academic.weekDays;
    const grid = {};
    for (const day of days) {
      grid[day] = [];
    }

    for (const cls of classes) {
      for (const day of (cls.days || [])) {
        if (grid[day]) {
          grid[day].push(cls);
        }
      }
    }

    // Sort each day by start time
    for (const day of days) {
      grid[day].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }

    return grid;
  }

  // ── Today's classes (EAT) ──
  function getTodayClasses(classes) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[CSMConfig.todayIndex()];
    return classes
      .filter(cls => (cls.days || []).includes(todayName))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }

  // ── Next class (EAT) ──
  function getNextClass(classes) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = CSMConfig.nowEAT();
    const todayIdx = now.getDay();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Check today's remaining classes first
    const todayName = dayNames[todayIdx];
    const todayClasses = classes
      .filter(cls => (cls.days || []).includes(todayName) && timeToMinutes(cls.startTime) > currentMins)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    if (todayClasses.length > 0) {
      return { class: todayClasses[0], day: todayName, daysAway: 0 };
    }

    // Check upcoming days (up to 7)
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (todayIdx + i) % 7;
      const nextDayName = dayNames[nextIdx];
      const nextClasses = classes
        .filter(cls => (cls.days || []).includes(nextDayName))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (nextClasses.length > 0) {
        return { class: nextClasses[0], day: nextDayName, daysAway: i };
      }
    }
    return null;
  }

  // ── Currently ongoing class ──
  function getCurrentClass(classes) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = CSMConfig.nowEAT();
    const todayName = dayNames[now.getDay()];
    const currentMins = now.getHours() * 60 + now.getMinutes();

    return classes.find(cls => {
      if (!(cls.days || []).includes(todayName)) return false;
      return timeToMinutes(cls.startTime) <= currentMins && timeToMinutes(cls.endTime) > currentMins;
    }) || null;
  }

  // ── Suggest study blocks ──
  function suggestStudyBlocks(classes, date = null) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDate = date || CSMConfig.nowEAT();
    const dayName = dayNames[targetDate.getDay()];
    const dayClasses = classes
      .filter(cls => (cls.days || []).includes(dayName))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const dayStart = CSMConfig.academic.dayStartHour * 60;  // 7:00 AM
    const dayEnd   = CSMConfig.academic.dayEndHour * 60;    // 9:00 PM
    const minBlock = 45; // minimum study block in minutes

    const blocks = [];
    let cursor = dayStart;

    for (const cls of dayClasses) {
      const clsStart = timeToMinutes(cls.startTime);
      const buffer = 10; // 10 min buffer after class

      if (clsStart - cursor >= minBlock) {
        blocks.push({
          start: minutesToTime(cursor),
          end:   minutesToTime(clsStart),
          duration: clsStart - cursor,
          label: `Free study: ${minutesToTime(cursor)} – ${minutesToTime(clsStart)}`
        });
      }
      cursor = Math.max(cursor, timeToMinutes(cls.endTime) + buffer);
    }

    // After last class
    if (dayEnd - cursor >= minBlock) {
      blocks.push({
        start: minutesToTime(cursor),
        end:   minutesToTime(dayEnd),
        duration: dayEnd - cursor,
        label: `Free study: ${minutesToTime(cursor)} – ${minutesToTime(dayEnd)}`
      });
    }

    return blocks;
  }

  // ── Upcoming deadlines (sorted by due date) ──
  function getUpcomingDeadlines(assignments, days = 7) {
    const now = CSMConfig.nowEAT();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return assignments
      .filter(a => !a.completed && new Date(a.dueDate) <= cutoff)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  // ── Days until due ──
  function daysUntilDue(dueDateStr) {
    const now  = CSMConfig.nowEAT();
    const due  = new Date(dueDateStr);
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function dueDateLabel(dueDateStr) {
    const days = daysUntilDue(dueDateStr);
    if (days < 0)  return { text: `Overdue by ${Math.abs(days)}d`, cls: 'badge-red' };
    if (days === 0) return { text: 'Due today!', cls: 'badge-red' };
    if (days === 1) return { text: 'Due tomorrow', cls: 'badge-orange' };
    if (days <= 3)  return { text: `Due in ${days} days`, cls: 'badge-orange' };
    if (days <= 7)  return { text: `Due in ${days} days`, cls: 'badge-purple' };
    return { text: `Due ${CSMConfig.formatDateShort(dueDateStr)}`, cls: 'badge-cyan' };
  }

  // ── Render class card HTML ──
  function renderClassCard(cls, compact = false) {
    const color = CSMConfig.getColorById(cls.color);
    const daysStr = (cls.days || []).join(', ');
    const timeStr = `${formatDisplayTime(cls.startTime)} – ${formatDisplayTime(cls.endTime)}`;

    if (compact) {
      return `
        <div class="class-card-compact" data-id="${cls.id}" style="border-left-color:${color.hex}">
          <span class="color-dot" style="background:${color.hex}"></span>
          <div class="ccc-info">
            <span class="ccc-name">${cls.name}</span>
            <span class="ccc-time">${timeStr}</span>
          </div>
          ${cls.location ? `<span class="ccc-loc">📍 ${cls.location}</span>` : ''}
        </div>`;
    }

    return `
      <div class="class-card" data-id="${cls.id}" style="--card-color:${color.hex}">
        <div class="class-card-header">
          <div class="class-card-color-bar" style="background:${color.hex}"></div>
          <div class="class-card-top">
            <div>
              <span class="class-code badge badge-purple">${cls.code || ''}</span>
              <h3 class="class-name">${cls.name}</h3>
            </div>
            <div class="class-card-actions">
              <button class="btn btn-ghost btn-icon edit-class-btn" data-id="${cls.id}" title="Edit class">✏️</button>
              <button class="btn btn-ghost btn-icon delete-class-btn" data-id="${cls.id}" title="Delete class">🗑️</button>
            </div>
          </div>
        </div>
        <div class="class-card-body">
          <div class="class-meta">
            <span class="meta-item">🕐 ${timeStr} <span class="tz-tiny">EAT</span></span>
            ${cls.instructor ? `<span class="meta-item">👤 ${cls.instructor}</span>` : ''}
            ${cls.location   ? `<span class="meta-item">📍 ${cls.location}</span>`   : ''}
            <span class="meta-item">📆 ${daysStr}</span>
          </div>
          ${cls.notes ? `<p class="class-notes">${cls.notes}</p>` : ''}
        </div>
      </div>`;
  }

  // ── Render assignment card HTML ──
  function renderAssignmentCard(a) {
    const { text: dueText, cls: dueCls } = dueDateLabel(a.dueDate);
    const priorityColors = { high: 'badge-red', medium: 'badge-orange', low: 'badge-cyan' };

    return `
      <div class="assignment-card ${a.completed ? 'completed' : ''}" data-id="${a.id}">
        <div class="asgn-check-wrap">
          <input type="checkbox" class="asgn-check" id="asgn-${a.id}"
            data-id="${a.id}" ${a.completed ? 'checked' : ''} />
          <label for="asgn-${a.id}" class="asgn-check-label"></label>
        </div>
        <div class="asgn-content">
          <div class="asgn-top">
            <span class="asgn-title">${a.title}</span>
            <span class="badge ${priorityColors[a.priority] || 'badge-purple'}">${a.priority || 'medium'}</span>
          </div>
          <div class="asgn-meta">
            <span class="meta-item">📚 ${a.className || ''}</span>
            <span class="badge ${dueCls}">${dueText}</span>
            ${a.estimatedHours ? `<span class="meta-item">⏱️ ~${a.estimatedHours}h</span>` : ''}
          </div>
          ${a.notes ? `<p class="asgn-notes">${a.notes}</p>` : ''}
        </div>
        <button class="btn btn-ghost btn-icon delete-asgn-btn" data-id="${a.id}" title="Delete">🗑️</button>
      </div>`;
  }

  return {
    timeToMinutes,
    minutesToTime,
    formatDisplayTime,
    detectConflicts,
    buildWeekGrid,
    getTodayClasses,
    getNextClass,
    getCurrentClass,
    suggestStudyBlocks,
    getUpcomingDeadlines,
    daysUntilDue,
    dueDateLabel,
    renderClassCard,
    renderAssignmentCard,
  };
})();
