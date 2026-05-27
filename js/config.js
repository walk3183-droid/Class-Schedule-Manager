// =============================================
// CLASS SCHEDULE MANAGER — Configuration
// East African Time (EAT / UTC+3)
// =============================================

const CSMConfig = {
  // ── App Info ──
  appName:    'ClassBot',
  appVersion: '1.0.0',
  timezone:   'Africa/Nairobi',  // EAT = UTC+3

  // ── Supabase (fill in your project credentials) ──
  supabase: {
    url:     localStorage.getItem('csm_supabase_url')    || '',
    anonKey: localStorage.getItem('csm_supabase_key')    || '',
  },

  // ── Gemini AI ──
  gemini: {
    apiKey:  localStorage.getItem('csm_gemini_key')      || '',
    model:   'gemini-2.0-flash',
    maxTokens: 1024,
  },

  // ── Academic Settings ──
  academic: {
    system:           'semester',
    semesterNames:    ['Semester 1', 'Semester 2'],
    currentSemester:  parseInt(localStorage.getItem('csm_semester') || '1'),
    weekDays:         ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    // EAT-formatted working hours
    dayStartHour:     7,    // 07:00 EAT
    dayEndHour:       21,   // 21:00 EAT
  },

  // ── Class Color Palette ──
  classColors: [
    { id: 'purple', hex: '#7c3aed', label: 'Purple'  },
    { id: 'cyan',   hex: '#06b6d4', label: 'Cyan'    },
    { id: 'green',  hex: '#10b981', label: 'Green'   },
    { id: 'orange', hex: '#f59e0b', label: 'Amber'   },
    { id: 'pink',   hex: '#ec4899', label: 'Pink'    },
    { id: 'red',    hex: '#ef4444', label: 'Red'     },
    { id: 'blue',   hex: '#3b82f6', label: 'Blue'    },
    { id: 'teal',   hex: '#14b8a6', label: 'Teal'    },
  ],

  // ── Reminder Lead Times ──
  reminderOptions: [
    { value: 5,   label: '5 minutes before'  },
    { value: 15,  label: '15 minutes before' },
    { value: 30,  label: '30 minutes before' },
    { value: 60,  label: '1 hour before'     },
    { value: 120, label: '2 hours before'    },
    { value: 1440,label: '1 day before'      },
  ],

  // ── Time formatting in EAT ──
  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      timeZone: this.timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },

  formatDateShort(date) {
    return new Date(date).toLocaleDateString('en-US', {
      timeZone: this.timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  },

  nowEAT() {
    // Returns a Date object representing current time in EAT
    return new Date(new Date().toLocaleString('en-US', { timeZone: this.timezone }));
  },

  // Day index in EAT (0 = Sunday)
  todayIndex() {
    return this.nowEAT().getDay();
  },

  getColorById(id) {
    return this.classColors.find(c => c.id === id) || this.classColors[0];
  }
};

// Freeze config so it's not accidentally mutated
Object.freeze(CSMConfig.academic);
