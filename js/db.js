// =============================================
// CLASS SCHEDULE MANAGER — Database Layer
// Supports: Supabase (cloud) + localStorage (offline/demo)
// =============================================

const CSMDb = (() => {
  // ── Internal state ──
  let _supabaseClient = null;
  let _isDemo = false;
  let _currentUser = null;

  // ── Supabase loader ──
  function _initSupabase() {
    const { url, anonKey } = CSMConfig.supabase;
    if (!url || !anonKey) return null;
    if (_supabaseClient) return _supabaseClient;
    try {
      // Supabase is loaded via CDN in app.html
      if (typeof supabase !== 'undefined') {
        _supabaseClient = supabase.createClient(url, anonKey);
      }
    } catch (e) {
      console.warn('Supabase init failed:', e);
    }
    return _supabaseClient;
  }

  // ── LocalStorage helpers ──
  const LS = {
    KEY_CLASSES:     'csm_classes',
    KEY_ASSIGNMENTS: 'csm_assignments',
    KEY_REMINDERS:   'csm_reminders',
    KEY_USER:        'csm_user',

    get(key) {
      try { return JSON.parse(localStorage.getItem(key) || '[]'); }
      catch { return []; }
    },
    getOne(key) {
      try { return JSON.parse(localStorage.getItem(key) || 'null'); }
      catch { return null; }
    },
    set(key, data) {
      localStorage.setItem(key, JSON.stringify(data));
    },
    generateId() {
      return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  };

  // ── Auth Functions ──
  async function signIn(email, password) {
    const sb = _initSupabase();
    if (!sb) {
      // Offline fallback — store minimal user
      const user = { id: 'offline_' + email, email, firstName: 'User', demo: false };
      localStorage.setItem(LS.KEY_USER, JSON.stringify(user));
      _currentUser = user;
      return { success: true, user };
    }
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };
      _currentUser = data.user;
      localStorage.setItem(LS.KEY_USER, JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Network error' };
    }
  }

  async function signUp(email, password, profile = {}) {
    const sb = _initSupabase();
    if (!sb) {
      const user = { id: 'offline_' + email, email, ...profile, demo: false };
      localStorage.setItem(LS.KEY_USER, JSON.stringify(user));
      _currentUser = user;
      return { success: true, user };
    }
    try {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: profile }
      });
      if (error) return { success: false, error: error.message };
      _currentUser = data.user;
      localStorage.setItem(LS.KEY_USER, JSON.stringify({ ...data.user, ...profile }));
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Network error' };
    }
  }

  async function signOut() {
    const sb = _initSupabase();
    if (sb) await sb.auth.signOut().catch(() => {});
    localStorage.removeItem(LS.KEY_USER);
    localStorage.removeItem('csm_demo');
    _currentUser = null;
    window.location.href = 'index.html';
  }

  function getCurrentUser() {
    if (_currentUser) return _currentUser;
    const stored = LS.getOne(LS.KEY_USER);
    _currentUser = stored;
    return stored;
  }

  function isDemo() {
    return localStorage.getItem('csm_demo') === 'true';
  }

  // ── CLASSES CRUD ──

  async function getClasses() {
    const sb = _initSupabase();
    if (!sb || isDemo()) {
      return { success: true, data: LS.get(LS.KEY_CLASSES) };
    }
    try {
      const user = getCurrentUser();
      const { data, error } = await sb
        .from('classes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // Sync to localStorage for offline access
      LS.set(LS.KEY_CLASSES, data);
      return { success: true, data };
    } catch (e) {
      // Fallback to cached
      return { success: true, data: LS.get(LS.KEY_CLASSES) };
    }
  }

  async function addClass(classData) {
    const newClass = {
      ...classData,
      id: LS.generateId(),
      user_id: getCurrentUser()?.id || 'demo',
      created_at: new Date().toISOString(),
    };

    // Always update localStorage
    const classes = LS.get(LS.KEY_CLASSES);
    classes.push(newClass);
    LS.set(LS.KEY_CLASSES, classes);

    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try {
        const { data, error } = await sb.from('classes').insert(newClass).select().single();
        if (!error) {
          // Replace local id with server id
          const updated = classes.map(c => c.id === newClass.id ? data : c);
          LS.set(LS.KEY_CLASSES, updated);
          return { success: true, data };
        }
      } catch (e) { /* offline mode */ }
    }

    return { success: true, data: newClass };
  }

  async function updateClass(id, updates) {
    const classes = LS.get(LS.KEY_CLASSES);
    const idx = classes.findIndex(c => c.id === id);
    if (idx === -1) return { success: false, error: 'Class not found' };

    classes[idx] = { ...classes[idx], ...updates, updated_at: new Date().toISOString() };
    LS.set(LS.KEY_CLASSES, classes);

    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try {
        await sb.from('classes').update(updates).eq('id', id);
      } catch (e) { /* offline */ }
    }

    return { success: true, data: classes[idx] };
  }

  async function deleteClass(id) {
    const classes = LS.get(LS.KEY_CLASSES);
    const filtered = classes.filter(c => c.id !== id);
    LS.set(LS.KEY_CLASSES, filtered);

    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try {
        await sb.from('classes').delete().eq('id', id);
      } catch (e) { /* offline */ }
    }

    return { success: true };
  }

  // ── ASSIGNMENTS CRUD ──

  async function getAssignments() {
    const sb = _initSupabase();
    if (!sb || isDemo()) {
      return { success: true, data: LS.get(LS.KEY_ASSIGNMENTS) };
    }
    try {
      const user = getCurrentUser();
      const { data, error } = await sb
        .from('assignments')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: true });
      if (error) throw error;
      LS.set(LS.KEY_ASSIGNMENTS, data);
      return { success: true, data };
    } catch (e) {
      return { success: true, data: LS.get(LS.KEY_ASSIGNMENTS) };
    }
  }

  async function addAssignment(aData) {
    const newA = {
      ...aData,
      id: LS.generateId(),
      user_id: getCurrentUser()?.id || 'demo',
      completed: false,
      created_at: new Date().toISOString(),
    };

    const assignments = LS.get(LS.KEY_ASSIGNMENTS);
    assignments.push(newA);
    LS.set(LS.KEY_ASSIGNMENTS, assignments);

    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try { await sb.from('assignments').insert(newA); } catch (e) {}
    }

    return { success: true, data: newA };
  }

  async function updateAssignment(id, updates) {
    const assignments = LS.get(LS.KEY_ASSIGNMENTS);
    const idx = assignments.findIndex(a => a.id === id);
    if (idx === -1) return { success: false, error: 'Assignment not found' };
    assignments[idx] = { ...assignments[idx], ...updates };
    LS.set(LS.KEY_ASSIGNMENTS, assignments);
    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try { await sb.from('assignments').update(updates).eq('id', id); } catch (e) {}
    }
    return { success: true, data: assignments[idx] };
  }

  async function deleteAssignment(id) {
    const assignments = LS.get(LS.KEY_ASSIGNMENTS).filter(a => a.id !== id);
    LS.set(LS.KEY_ASSIGNMENTS, assignments);
    const sb = _initSupabase();
    if (sb && !isDemo()) {
      try { await sb.from('assignments').delete().eq('id', id); } catch (e) {}
    }
    return { success: true };
  }

  // ── REMINDERS ──

  async function getReminders() {
    return { success: true, data: LS.get(LS.KEY_REMINDERS) };
  }

  async function addReminder(rData) {
    const newR = {
      ...rData,
      id: LS.generateId(),
      created_at: new Date().toISOString(),
    };
    const reminders = LS.get(LS.KEY_REMINDERS);
    reminders.push(newR);
    LS.set(LS.KEY_REMINDERS, reminders);
    return { success: true, data: newR };
  }

  async function deleteReminder(id) {
    const reminders = LS.get(LS.KEY_REMINDERS).filter(r => r.id !== id);
    LS.set(LS.KEY_REMINDERS, reminders);
    return { success: true };
  }

  // ── Demo Data Seeder ──
  function seedDemoData() {
    const existing = LS.get(LS.KEY_CLASSES);
    if (existing.length > 0) return; // already seeded

    const demoClasses = [
      {
        id: 'demo_1', user_id: 'demo-user',
        name: 'Introduction to Computer Science',
        code: 'CS101',
        instructor: 'Dr. Abebe Girma',
        location: 'Block A — Room 201',
        color: 'purple',
        days: ['Monday', 'Wednesday', 'Friday'],
        startTime: '08:00',
        endTime: '09:30',
        recurring: 'weekly',
        notes: 'Bring laptop every session',
        created_at: new Date().toISOString()
      },
      {
        id: 'demo_2', user_id: 'demo-user',
        name: 'Calculus II',
        code: 'MATH201',
        instructor: 'Prof. Tigist Alemu',
        location: 'Science Hall — Room 105',
        color: 'cyan',
        days: ['Tuesday', 'Thursday'],
        startTime: '10:00',
        endTime: '11:30',
        recurring: 'weekly',
        notes: '',
        created_at: new Date().toISOString()
      },
      {
        id: 'demo_3', user_id: 'demo-user',
        name: 'Technical Writing',
        code: 'ENG202',
        instructor: 'Ms. Bethlehem Tadesse',
        location: 'Humanities Block — Room 302',
        color: 'green',
        days: ['Monday', 'Wednesday'],
        startTime: '14:00',
        endTime: '15:30',
        recurring: 'weekly',
        notes: 'Assignment submission via email',
        created_at: new Date().toISOString()
      },
      {
        id: 'demo_4', user_id: 'demo-user',
        name: 'Physics Laboratory',
        code: 'PHY102L',
        instructor: 'Dr. Solomon Bekele',
        location: 'Physics Lab — Block C',
        color: 'orange',
        days: ['Saturday'],
        startTime: '09:00',
        endTime: '12:00',
        recurring: 'weekly',
        notes: 'Safety goggles required',
        created_at: new Date().toISOString()
      },
      {
        id: 'demo_5', user_id: 'demo-user',
        name: 'Data Structures & Algorithms',
        code: 'CS301',
        instructor: 'Dr. Mekdes Haile',
        location: 'Computer Lab — Block B',
        color: 'pink',
        days: ['Tuesday', 'Thursday', 'Saturday'],
        startTime: '13:00',
        endTime: '14:30',
        recurring: 'weekly',
        notes: 'Online Judge problems due weekly',
        created_at: new Date().toISOString()
      }
    ];

    const demoAssignments = [
      {
        id: 'da_1', user_id: 'demo-user',
        title: 'Algorithm Analysis Report',
        class_id: 'demo_5',
        className: 'Data Structures & Algorithms',
        dueDate: (() => {
          const d = new Date(); d.setDate(d.getDate() + 3);
          return d.toISOString();
        })(),
        priority: 'high',
        estimatedHours: 4,
        completed: false,
        notes: 'Compare Big-O for sorting algorithms',
        created_at: new Date().toISOString()
      },
      {
        id: 'da_2', user_id: 'demo-user',
        title: 'Calculus Problem Set 7',
        class_id: 'demo_2',
        className: 'Calculus II',
        dueDate: (() => {
          const d = new Date(); d.setDate(d.getDate() + 5);
          return d.toISOString();
        })(),
        priority: 'medium',
        estimatedHours: 2,
        completed: false,
        notes: 'Chapter 8 — Integration by Parts',
        created_at: new Date().toISOString()
      },
      {
        id: 'da_3', user_id: 'demo-user',
        title: 'Technical Essay Draft',
        class_id: 'demo_3',
        className: 'Technical Writing',
        dueDate: (() => {
          const d = new Date(); d.setDate(d.getDate() + 7);
          return d.toISOString();
        })(),
        priority: 'medium',
        estimatedHours: 3,
        completed: false,
        notes: '1500 words, IEEE format',
        created_at: new Date().toISOString()
      }
    ];

    LS.set(LS.KEY_CLASSES, demoClasses);
    LS.set(LS.KEY_ASSIGNMENTS, demoAssignments);
  }

  // ── Public API ──
  return {
    signIn, signUp, signOut,
    getCurrentUser, isDemo,
    getClasses, addClass, updateClass, deleteClass,
    getAssignments, addAssignment, updateAssignment, deleteAssignment,
    getReminders, addReminder, deleteReminder,
    seedDemoData,
    LS
  };
})();
