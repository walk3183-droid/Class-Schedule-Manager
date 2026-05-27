// =============================================
// CLASS SCHEDULE MANAGER — Main App Logic
// Dashboard initialization, UI management
// =============================================

(async () => {
  // ── Guard: must be logged in or demo ──
  const user = CSMDb.getCurrentUser();
  const isDemo = CSMDb.isDemo();

  if (!user && !isDemo) {
    window.location.href = 'index.html';
    return;
  }

  // ── Seed demo data ──
  if (isDemo) CSMDb.seedDemoData();

  // ── State ──
  let _classes     = [];
  let _assignments = [];
  let _reminders   = [];
  let _editingClassId  = null;
  let _editingAsgnId   = null;
  let _currentSection  = 'dashboard';
  let _chatOpen        = true;
  let _reminderTimers  = [];

  // ── DOM refs ──
  const $ = id => document.getElementById(id);

  // ===========================
  // THEME
  // ===========================
  const savedTheme = localStorage.getItem('csm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  function updateThemeIcon(theme) {
    const btn = $('theme-toggle');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  $('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('csm_theme', next);
    updateThemeIcon(next);
  });

  // ===========================
  // EAT CLOCK
  // ===========================
  function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const dateStr = now.toLocaleDateString('en-US', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short', month: 'short', day: 'numeric'
    });
    const timeEl = $('topbar-time');
    const dateEl = $('topbar-date');
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr + ' · EAT';
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ===========================
  // USER DISPLAY
  // ===========================
  const displayName = user?.firstName || user?.email?.split('@')[0] || 'Student';
  const avatarEl = $('user-avatar');
  const nameEl   = $('user-name');
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = displayName;
  if (isDemo) {
    const demoTag = document.querySelector('.demo-badge');
    if (demoTag) demoTag.style.display = 'inline-flex';
  }

  // ===========================
  // DATA LOADING
  // ===========================
  async function loadData() {
    const [clsRes, asgnRes, remRes] = await Promise.all([
      CSMDb.getClasses(),
      CSMDb.getAssignments(),
      CSMDb.getReminders(),
    ]);
    _classes     = clsRes.data  || [];
    _assignments = asgnRes.data || [];
    _reminders   = remRes.data  || [];
    renderAll();
    scheduleReminders();
  }

  // ===========================
  // NAVIGATION
  // ===========================
  function switchSection(section) {
    _currentSection = section;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section);
    });
    document.querySelectorAll('.section-panel').forEach(el => {
      el.classList.toggle('active', el.id === `section-${section}`);
    });
    renderSection(section);
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchSection(el.dataset.section));
  });

  function renderSection(section) {
    switch (section) {
      case 'dashboard':   renderDashboard(); break;
      case 'schedule':    renderScheduleGrid(); break;
      case 'assignments': renderAssignmentsPage(); break;
      case 'reminders':   renderRemindersPage(); break;
      case 'settings':    renderSettingsPage(); break;
    }
  }

  function renderAll() {
    renderDashboard();
    renderScheduleGrid();
    renderAssignmentsPage();
    renderRemindersPage();
    updateStats();
  }

  // ===========================
  // STATS BAR
  // ===========================
  function updateStats() {
    const todayClasses = CSMSchedule.getTodayClasses(_classes);
    const pending = _assignments.filter(a => !a.completed);
    const upcoming = CSMSchedule.getUpcomingDeadlines(_assignments, 7);
    const overdue  = _assignments.filter(a => !a.completed && CSMSchedule.daysUntilDue(a.dueDate) < 0);

    setEl('stat-today',    todayClasses.length);
    setEl('stat-total',    _classes.length);
    setEl('stat-pending',  pending.length);
    setEl('stat-overdue',  overdue.length);
    setEl('stat-upcoming', upcoming.length);
  }

  function setEl(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  // ===========================
  // DASHBOARD
  // ===========================
  function renderDashboard() {
    // Today's classes
    const todayEl = $('today-classes-list');
    const todayClasses = CSMSchedule.getTodayClasses(_classes);
    if (todayEl) {
      if (todayClasses.length === 0) {
        todayEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div><h3>No classes today!</h3><p>Enjoy your free day or use it to get ahead on assignments.</p></div>`;
      } else {
        todayEl.innerHTML = todayClasses.map(c => CSMSchedule.renderClassCard(c, true)).join('');
      }
    }

    // Next class card
    const nextEl = $('next-class-info');
    const next = CSMSchedule.getNextClass(_classes);
    const current = CSMSchedule.getCurrentClass(_classes);
    if (nextEl) {
      if (current) {
        const color = CSMConfig.getColorById(current.color);
        nextEl.innerHTML = `
          <div class="next-class-badge in-class" style="color:${color.hex}">🔴 IN CLASS NOW</div>
          <div class="next-class-name">${current.name}</div>
          <div class="next-class-meta">Ends ${CSMSchedule.formatDisplayTime(current.endTime)} EAT · ${current.location || 'No location'}</div>`;
      } else if (next) {
        const color = CSMConfig.getColorById(next.class.color);
        const when = next.daysAway === 0 ? 'Today' : next.daysAway === 1 ? 'Tomorrow' : next.day;
        nextEl.innerHTML = `
          <div class="next-class-badge" style="color:${color.hex}">⏭ NEXT CLASS</div>
          <div class="next-class-name">${next.class.name}</div>
          <div class="next-class-meta">${when} · ${CSMSchedule.formatDisplayTime(next.class.startTime)} EAT · ${next.class.location || 'No location'}</div>`;
      } else {
        nextEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><h3>No upcoming classes</h3><p>Add your first class to get started!</p></div>`;
      }
    }

    // Upcoming deadlines
    const deadlinesEl = $('upcoming-deadlines');
    const upcoming = CSMSchedule.getUpcomingDeadlines(_assignments, 7);
    if (deadlinesEl) {
      if (upcoming.length === 0) {
        deadlinesEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><h3>No deadlines this week</h3><p>You're all caught up!</p></div>`;
      } else {
        deadlinesEl.innerHTML = upcoming.slice(0, 5).map(a => CSMSchedule.renderAssignmentCard(a)).join('');
        attachAssignmentListeners(deadlinesEl);
      }
    }

    // Study blocks
    const studyEl = $('study-blocks');
    if (studyEl) {
      const blocks = CSMSchedule.suggestStudyBlocks(_classes);
      if (blocks.length === 0) {
        studyEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><h3>Schedule is full today</h3><p>Short breaks between classes count too!</p></div>`;
      } else {
        studyEl.innerHTML = blocks.map(b => {
          const hrs = Math.floor(b.duration / 60);
          const mins = b.duration % 60;
          const dur = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;
          return `<div class="study-block-item">
            <div class="study-block-icon">💡</div>
            <div>
              <div class="study-block-time">${CSMSchedule.formatDisplayTime(b.start)} – ${CSMSchedule.formatDisplayTime(b.end)} <span class="tz-tiny">EAT</span></div>
              <div class="study-block-dur">${dur} available</div>
            </div>
          </div>`;
        }).join('');
      }
    }
  }

  // ===========================
  // WEEKLY SCHEDULE GRID
  // ===========================
  function renderScheduleGrid() {
    const gridEl = $('schedule-grid');
    if (!gridEl) return;

    const grid  = CSMSchedule.buildWeekGrid(_classes);
    const days  = CSMConfig.academic.weekDays;
    const today = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][CSMConfig.todayIndex()];

    if (_classes.length === 0) {
      gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📅</div><h3>No classes yet</h3><p>Click <strong>+ Add Class</strong> to build your schedule.</p></div>`;
      return;
    }

    gridEl.innerHTML = days.map(day => {
      const isToday = day === today;
      const dayClasses = grid[day] || [];
      return `
        <div class="schedule-day ${isToday ? 'today' : ''}">
          <div class="schedule-day-header">
            <span class="day-name">${day}</span>
            ${isToday ? '<span class="today-pill">Today</span>' : ''}
            <span class="day-count">${dayClasses.length}</span>
          </div>
          <div class="schedule-day-body">
            ${dayClasses.length === 0
              ? `<div class="day-empty">Free day 🎉</div>`
              : dayClasses.map(cls => {
                  const color = CSMConfig.getColorById(cls.color);
                  return `
                    <div class="schedule-class-pill" style="border-left:3px solid ${color.hex};background:${color.hex}18"
                      data-id="${cls.id}">
                      <div class="pill-name">${cls.name}</div>
                      <div class="pill-time">${CSMSchedule.formatDisplayTime(cls.startTime)}<span class="tz-tiny">EAT</span></div>
                      <div class="pill-loc">${cls.location || ''}</div>
                    </div>`;
                }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // ===========================
  // ALL CLASSES PAGE
  // ===========================
  function renderClassesPage() {
    const listEl = $('classes-list');
    if (!listEl) return;
    if (_classes.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><h3>No classes added yet</h3><p>Click <strong>+ Add Class</strong> to start building your schedule.</p><button class="btn btn-primary" onclick="openClassModal()">+ Add Class</button></div>`;
      return;
    }
    listEl.innerHTML = _classes.map(c => CSMSchedule.renderClassCard(c)).join('');
    attachClassListeners(listEl);
  }

  // ===========================
  // ASSIGNMENTS PAGE
  // ===========================
  function renderAssignmentsPage() {
    const listEl = $('assignments-list');
    if (!listEl) return;

    const pending   = _assignments.filter(a => !a.completed);
    const completed = _assignments.filter(a =>  a.completed);

    if (_assignments.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No assignments yet</h3><p>Click <strong>+ Add Assignment</strong> to track your work.</p></div>`;
      return;
    }

    let html = '';
    if (pending.length > 0) {
      html += `<div class="asgn-group-label">Pending (${pending.length})</div>`;
      html += pending.map(a => CSMSchedule.renderAssignmentCard(a)).join('');
    }
    if (completed.length > 0) {
      html += `<div class="asgn-group-label" style="margin-top:20px">Completed (${completed.length})</div>`;
      html += completed.map(a => CSMSchedule.renderAssignmentCard(a)).join('');
    }
    listEl.innerHTML = html;
    attachAssignmentListeners(listEl);
  }

  // ===========================
  // REMINDERS PAGE
  // ===========================
  function renderRemindersPage() {
    const listEl = $('reminders-list');
    if (!listEl) return;
    if (_reminders.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔔</div><h3>No reminders set</h3><p>Add reminders to stay on top of your classes and deadlines.</p></div>`;
      return;
    }
    listEl.innerHTML = _reminders.map(r => `
      <div class="reminder-card" data-id="${r.id}">
        <div class="reminder-icon">🔔</div>
        <div class="reminder-content">
          <div class="reminder-title">${r.title}</div>
          <div class="reminder-time">⏰ ${CSMConfig.formatTime(r.fireAt)} EAT · ${CSMConfig.formatDateShort(r.fireAt)}</div>
        </div>
        <button class="btn btn-ghost btn-icon delete-reminder-btn" data-id="${r.id}">🗑️</button>
      </div>`).join('');

    listEl.querySelectorAll('.delete-reminder-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await CSMDb.deleteReminder(btn.dataset.id);
        _reminders = _reminders.filter(r => r.id !== btn.dataset.id);
        renderRemindersPage();
        showToast('Reminder removed', 'info');
      });
    });
  }

  // ===========================
  // SETTINGS PAGE
  // ===========================
  function renderSettingsPage() {
    const supa_url = $('settings-supa-url');
    const supa_key = $('settings-supa-key');
    const gemini_key = $('settings-gemini-key');
    if (supa_url)   supa_url.value   = localStorage.getItem('csm_supabase_url') || '';
    if (supa_key)   supa_key.value   = localStorage.getItem('csm_supabase_key') || '';
    if (gemini_key) gemini_key.value = localStorage.getItem('csm_gemini_key')   || '';
  }

  // ===========================
  // LISTENER HELPERS
  // ===========================
  function attachClassListeners(container) {
    container.querySelectorAll('.edit-class-btn').forEach(btn => {
      btn.addEventListener('click', () => openClassModal(btn.dataset.id));
    });
    container.querySelectorAll('.delete-class-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteClass(btn.dataset.id));
    });
  }

  function attachAssignmentListeners(container) {
    container.querySelectorAll('.asgn-check').forEach(chk => {
      chk.addEventListener('change', async () => {
        const id = chk.dataset.id;
        await CSMDb.updateAssignment(id, { completed: chk.checked });
        const idx = _assignments.findIndex(a => a.id === id);
        if (idx !== -1) _assignments[idx].completed = chk.checked;
        renderAssignmentsPage();
        renderDashboard();
        updateStats();
        showToast(chk.checked ? '✅ Assignment completed!' : 'Assignment reopened', 'success');
      });
    });
    container.querySelectorAll('.delete-asgn-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteAssignment(btn.dataset.id));
    });
  }

  // ===========================
  // ADD / EDIT CLASS MODAL
  // ===========================
  window.openClassModal = function(editId = null) {
    _editingClassId = editId;
    const modal = $('class-modal');
    const title = $('class-modal-title');
    const form  = $('class-form');

    form.reset();
    // Uncheck all day checkboxes
    form.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);

    if (editId) {
      const cls = _classes.find(c => c.id === editId);
      if (!cls) return;
      title.textContent = 'Edit Class';
      $('class-name').value       = cls.name       || '';
      $('class-code').value       = cls.code       || '';
      $('class-instructor').value = cls.instructor || '';
      $('class-location').value   = cls.location   || '';
      $('class-start').value      = cls.startTime  || '';
      $('class-end').value        = cls.endTime    || '';
      $('class-notes').value      = cls.notes      || '';
      $('class-recurring').value  = cls.recurring  || 'weekly';
      $('class-color').value      = cls.color      || 'purple';
      (cls.days || []).forEach(d => {
        const cb = form.querySelector(`.day-checkbox[value="${d}"]`);
        if (cb) cb.checked = true;
      });
    } else {
      title.textContent = 'Add New Class';
    }

    openModal('class-modal');
  };

  $('class-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = [...document.querySelectorAll('.day-checkbox:checked')].map(cb => cb.value);
    if (days.length === 0) { showToast('Please select at least one day', 'warning'); return; }

    const startTime = $('class-start').value;
    const endTime   = $('class-end').value;
    if (startTime >= endTime) { showToast('End time must be after start time', 'warning'); return; }

    const classData = {
      name:       $('class-name').value.trim(),
      code:       $('class-code').value.trim(),
      instructor: $('class-instructor').value.trim(),
      location:   $('class-location').value.trim(),
      startTime,
      endTime,
      days,
      color:      $('class-color').value,
      recurring:  $('class-recurring').value,
      notes:      $('class-notes').value.trim(),
    };

    if (!classData.name) { showToast('Class name is required', 'warning'); return; }

    // Conflict check
    const conflicts = CSMSchedule.detectConflicts(classData, _classes, _editingClassId);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const confirmed = await confirmAction(
        `⚠️ Scheduling Conflict`,
        `Conflict detected: **${classData.name}** overlaps with **${c.class.name}** on ${c.days.join(', ')}.\n\nSave anyway?`
      );
      if (!confirmed) return;
    }

    let result;
    if (_editingClassId) {
      result = await CSMDb.updateClass(_editingClassId, classData);
      if (result.success) {
        const idx = _classes.findIndex(c => c.id === _editingClassId);
        if (idx !== -1) _classes[idx] = { ..._classes[idx], ...classData };
        showToast('Class updated successfully! ✏️', 'success');
      }
    } else {
      result = await CSMDb.addClass(classData);
      if (result.success) {
        _classes.push(result.data);
        showToast('Class added! 🎉', 'success');
      }
    }

    closeModal('class-modal');
    renderAll();
    _editingClassId = null;
  });

  // ===========================
  // ADD ASSIGNMENT MODAL
  // ===========================
  $('assignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const classId = $('asgn-class').value;
    const cls = _classes.find(c => c.id === classId);

    const data = {
      title:          $('asgn-title').value.trim(),
      class_id:       classId,
      className:      cls?.name || '',
      dueDate:        new Date($('asgn-due').value).toISOString(),
      priority:       $('asgn-priority').value,
      estimatedHours: parseFloat($('asgn-hours').value) || 0,
      notes:          $('asgn-notes').value.trim(),
    };
    if (!data.title) { showToast('Assignment title required', 'warning'); return; }

    const result = await CSMDb.addAssignment(data);
    if (result.success) {
      _assignments.push(result.data);
      showToast('Assignment added! 📝', 'success');
      closeModal('assignment-modal');
      renderAssignmentsPage();
      renderDashboard();
      updateStats();
    }
  });

  // ===========================
  // DELETE CONFIRMATIONS
  // ===========================
  async function confirmDeleteClass(id) {
    const cls = _classes.find(c => c.id === id);
    if (!cls) return;
    const ok = await confirmAction('Delete Class', `Are you sure you want to delete **${cls.name}**? This cannot be undone.`);
    if (!ok) return;
    await CSMDb.deleteClass(id);
    _classes = _classes.filter(c => c.id !== id);
    showToast('Class deleted', 'info');
    renderAll();
  }

  async function confirmDeleteAssignment(id) {
    const a = _assignments.find(x => x.id === id);
    if (!a) return;
    const ok = await confirmAction('Delete Assignment', `Delete **${a.title}**?`);
    if (!ok) return;
    await CSMDb.deleteAssignment(id);
    _assignments = _assignments.filter(x => x.id !== id);
    showToast('Assignment deleted', 'info');
    renderAssignmentsPage();
    renderDashboard();
    updateStats();
  }

  // Simple confirm using native confirm (can be replaced with custom modal)
  function confirmAction(title, message) {
    return Promise.resolve(window.confirm(`${title}\n\n${message.replace(/\*\*/g, '')}`));
  }

  // ===========================
  // REMINDERS
  // ===========================
  function scheduleReminders() {
    _reminderTimers.forEach(t => clearTimeout(t));
    _reminderTimers = [];

    _reminders.forEach(r => {
      const fireAt = new Date(r.fireAt).getTime();
      const now = Date.now();
      const delay = fireAt - now;
      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        const t = setTimeout(() => {
          fireReminder(r);
        }, delay);
        _reminderTimers.push(t);
      }
    });
  }

  function fireReminder(r) {
    showToast(`🔔 Reminder: ${r.title}`, 'info');
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ClassBot Reminder', {
        body: r.title,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎓</text></svg>'
      });
    }
  }

  // ===========================
  // SETTINGS SAVE
  // ===========================
  $('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const supaUrl = $('settings-supa-url')?.value.trim();
    const supaKey = $('settings-supa-key')?.value.trim();
    const gemKey  = $('settings-gemini-key')?.value.trim();

    if (supaUrl) localStorage.setItem('csm_supabase_url', supaUrl);
    if (supaKey) localStorage.setItem('csm_supabase_key', supaKey);
    if (gemKey)  localStorage.setItem('csm_gemini_key', gemKey);

    // Update config live
    CSMConfig.supabase.url     = supaUrl;
    CSMConfig.supabase.anonKey = supaKey;
    CSMConfig.gemini.apiKey    = gemKey;

    showToast('Settings saved! ✅', 'success');
  });

  $('settings-clear-btn')?.addEventListener('click', async () => {
    const ok = confirm('Clear ALL data? This will delete all classes and assignments.');
    if (!ok) return;
    ['csm_classes', 'csm_assignments', 'csm_reminders'].forEach(k => localStorage.removeItem(k));
    _classes = []; _assignments = []; _reminders = [];
    renderAll();
    showToast('All data cleared', 'warning');
  });

  $('signout-btn')?.addEventListener('click', () => CSMDb.signOut());

  // ===========================
  // REQUEST NOTIFICATION PERMS
  // ===========================
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // ===========================
  // POPULATE CLASS DROPDOWN in Assignment Form
  // ===========================
  function populateClassDropdown() {
    const sel = $('asgn-class');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Class —</option>' +
      _classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  document.addEventListener('click', e => {
    if (e.target.id === 'open-assignment-modal') {
      populateClassDropdown();
      openModal('assignment-modal');
    }
  });

  // ===========================
  // MODAL HELPERS
  // ===========================
  function openModal(id) {
    const overlay = $(`${id}-overlay`) || document.querySelector(`[data-modal="${id}"]`);
    const modal   = $(id) || document.getElementById(id);
    // We use a combined overlay approach
    const el = document.getElementById(`${id}-overlay`);
    if (el) {
      el.classList.add('open');
    }
  }

  function closeModal(id) {
    const el = document.getElementById(`${id}-overlay`);
    if (el) el.classList.remove('open');
  }

  // Close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay')?.classList.remove('open');
    });
  });

  // Expose globally
  window.openModal  = openModal;
  window.closeModal = closeModal;

  // ===========================
  // CLASSBOT CHAT
  // ===========================
  const chatToggleBtn  = $('chat-toggle');
  const chatPanel      = $('chat-panel');
  const chatInput      = $('chat-input');
  const chatSend       = $('chat-send');
  const chatMessages   = $('chat-messages');
  const chatClear      = $('chat-clear');

  // Toggle chat panel
  chatToggleBtn?.addEventListener('click', () => {
    _chatOpen = !_chatOpen;
    chatPanel?.classList.toggle('closed', !_chatOpen);
    chatToggleBtn.textContent = _chatOpen ? '💬' : '🤖';
    chatToggleBtn.title = _chatOpen ? 'Close ClassBot' : 'Open ClassBot';
  });

  // Send message
  async function sendChatMessage() {
    const msg = chatInput?.value.trim();
    if (!msg) return;

    appendChatBubble(msg, 'user');
    chatInput.value = '';
    chatInput.focus();

    // Typing indicator
    const typingId = appendTypingIndicator();

    try {
      const reply = await ClassBot.send(msg);
      removeTypingIndicator(typingId);
      appendChatBubble(reply, 'bot');
    } catch (e) {
      removeTypingIndicator(typingId);
      appendChatBubble('Sorry, I ran into an error. Please try again! 😅', 'bot');
    }
  }

  chatSend?.addEventListener('click', sendChatMessage);
  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  chatClear?.addEventListener('click', () => {
    if (chatMessages) chatMessages.innerHTML = '';
    ClassBot.clearHistory();
    appendChatBubble(`Chat cleared! How can I help you? 😊`, 'bot');
  });

  function appendChatBubble(text, role) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    const now = CSMConfig.nowEAT();
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: true });

    div.innerHTML = `
      <div class="bubble-content">${role === 'bot' ? ClassBot.renderHTML(text) : `<p>${escapeHtml(text)}</p>`}</div>
      <div class="bubble-time">${timeStr} EAT</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendTypingIndicator() {
    if (!chatMessages) return null;
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-bubble bot typing-bubble';
    div.innerHTML = `<div class="bubble-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    if (id) document.getElementById(id)?.remove();
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Welcome message
  const user2 = CSMDb.getCurrentUser();
  const wName = user2?.firstName || 'there';
  const now2  = CSMConfig.nowEAT();
  const hour  = now2.getHours();
  const wGreet = hour < 12 ? '🌅 Good morning' : hour < 17 ? '☀️ Good afternoon' : '🌙 Good evening';
  appendChatBubble(
    `${wGreet}, **${wName}**! I'm **ClassBot**, your academic assistant.\n\nI can help you with your schedule, assignments, study blocks, and more — all in **East African Time (EAT)**.\n\nTry asking: *"What are my classes today?"* or *"What's due soon?"* 📚`,
    'bot'
  );

  // ===========================
  // TOAST
  // ===========================
  window.showToast = function(message, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // ===========================
  // KEYBOARD SHORTCUTS
  // ===========================
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      chatInput?.focus();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open'));
    }
  });

  // ===========================
  // BOOT
  // ===========================
  await loadData();
  switchSection('dashboard');

  console.log('%c🎓 ClassBot loaded!', 'color:#7c3aed;font-weight:bold;font-size:14px');
})();
