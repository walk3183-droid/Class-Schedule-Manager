// =============================================
// CLASS SCHEDULE MANAGER — ClassBot AI
// Gemini API + rule-based fallback
// EAT timezone aware
// =============================================

const ClassBot = (() => {

  let _history = [];   // Gemini conversation history
  let _classes = [];
  let _assignments = [];

  // ── Build system context ──
  function _buildSystemPrompt() {
    const now = CSMConfig.nowEAT();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'Africa/Nairobi',
      weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
    const user = CSMDb.getCurrentUser();
    const userName = user?.firstName || 'Student';

    const classesText = _classes.length === 0
      ? 'No classes added yet.'
      : _classes.map(c =>
          `• ${c.name} (${c.code || 'N/A'}) | ${(c.days||[]).join(', ')} | ` +
          `${CSMSchedule.formatDisplayTime(c.startTime)}–${CSMSchedule.formatDisplayTime(c.endTime)} EAT | ` +
          `${c.location || 'No location'} | Instructor: ${c.instructor || 'N/A'}`
        ).join('\n');

    const assignmentsText = _assignments.filter(a => !a.completed).length === 0
      ? 'No pending assignments.'
      : _assignments
          .filter(a => !a.completed)
          .map(a => `• ${a.title} (${a.className}) — Due: ${CSMConfig.formatDateShort(a.dueDate)} — Priority: ${a.priority}`)
          .join('\n');

    const todayClasses = CSMSchedule.getTodayClasses(_classes);
    const nextClass    = CSMSchedule.getNextClass(_classes);
    const currentClass = CSMSchedule.getCurrentClass(_classes);

    return `You are ClassBot, an intelligent academic assistant built into the Class Schedule Manager app.

CURRENT CONTEXT:
- Student Name: ${userName}
- Current Date & Time (EAT): ${timeStr}
- Timezone: East African Time (EAT / UTC+3)
- Academic System: Semester

TODAY'S CLASSES:
${todayClasses.length === 0 ? 'No classes today.' : todayClasses.map(c => `• ${c.name} ${CSMSchedule.formatDisplayTime(c.startTime)}–${CSMSchedule.formatDisplayTime(c.endTime)} @ ${c.location || 'TBD'}`).join('\n')}

CURRENTLY IN CLASS: ${currentClass ? `${currentClass.name} (ends ${CSMSchedule.formatDisplayTime(currentClass.endTime)} EAT)` : 'No class right now.'}

NEXT CLASS: ${nextClass ? `${nextClass.class.name} on ${nextClass.day} at ${CSMSchedule.formatDisplayTime(nextClass.class.startTime)} EAT${nextClass.daysAway > 0 ? ` (in ${nextClass.daysAway} day(s))` : ''}` : 'None scheduled.'}

ALL CLASSES:
${classesText}

PENDING ASSIGNMENTS:
${assignmentsText}

IDENTITY & TONE:
- You are friendly, concise, and focused on academic productivity.
- Always reference EAT time when discussing schedules.
- Use encouraging and supportive language about deadlines and workload.
- Format schedule queries as structured lists.
- For conflicts, say: "Conflict detected: [Class A] overlaps with [Class B] on [Day]."
- For reminders, say: "Reminder set for [Class Name] on [Date] at [Time] EAT."

BOUNDARIES:
- Only answer questions about academic scheduling, productivity, and time management.
- Never access other users' data.
- Always warn before destructive actions.
- If no schedule exists, prompt the student to add their first class.

OUTPUT FORMAT:
- Use markdown where appropriate (bold, bullet lists).
- Keep responses concise but actionable.
- Always note times in EAT format.`;
  }

  // ── Gemini API call ──
  async function _callGemini(userMessage) {
    const apiKey = CSMConfig.gemini.apiKey;
    if (!apiKey) return null; // fall through to rule-based

    _history.push({ role: 'user', parts: [{ text: userMessage }] });

    const payload = {
      system_instruction: { parts: [{ text: _buildSystemPrompt() }] },
      contents: _history,
      generationConfig: {
        maxOutputTokens: CSMConfig.gemini.maxTokens,
        temperature: 0.7,
      }
    };

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${CSMConfig.gemini.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error('Empty response');

      _history.push({ role: 'model', parts: [{ text: reply }] });
      // Keep history lean (last 20 turns)
      if (_history.length > 40) _history = _history.slice(-40);
      return reply;
    } catch (e) {
      console.warn('Gemini API error:', e);
      _history.pop(); // remove the user message we added
      return null;
    }
  }

  // ── Rule-based fallback ──
  function _ruleBased(msg) {
    const lower = msg.toLowerCase().trim();
    const user = CSMDb.getCurrentUser();
    const name = user?.firstName || 'there';
    const now = CSMConfig.nowEAT();

    // ── Greetings ──
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|selam|salam)/.test(lower)) {
      const hour = now.getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: true });
      return `${greet}, **${name}**! 👋 It's currently **${timeStr} EAT**. I'm ClassBot, your academic assistant. How can I help you today?\n\nYou can ask me things like:\n• *"What are my classes today?"*\n• *"When is my next class?"*\n• *"What assignments are due soon?"*\n• *"Suggest study time for today"*`;
    }

    // ── Current time ──
    if (/what.*(time|clock)|current time/.test(lower)) {
      const timeStr = now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      return `🕐 It's currently **${timeStr} EAT** (East African Time, UTC+3).`;
    }

    // ── Today's schedule ──
    if (/today|schedule today|my classes today/.test(lower)) {
      const todayClasses = CSMSchedule.getTodayClasses(_classes);
      if (todayClasses.length === 0) {
        return `📅 You have **no classes today** — enjoy the free time! Consider using it for studying or reviewing upcoming assignments. 😊`;
      }
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayName = dayNames[now.getDay()];
      let resp = `📅 **${dayName}'s Schedule** *(${todayClasses.length} class${todayClasses.length > 1 ? 'es' : ''})*:\n\n`;
      for (const cls of todayClasses) {
        resp += `**${cls.name}** (${cls.code || 'N/A'})\n`;
        resp += `   🕐 ${CSMSchedule.formatDisplayTime(cls.startTime)} – ${CSMSchedule.formatDisplayTime(cls.endTime)} EAT\n`;
        if (cls.location)   resp += `   📍 ${cls.location}\n`;
        if (cls.instructor) resp += `   👤 ${cls.instructor}\n`;
        resp += '\n';
      }
      return resp.trim();
    }

    // ── Next class ──
    if (/next class|upcoming class|when.*class/.test(lower)) {
      const next = CSMSchedule.getNextClass(_classes);
      if (!next) return `📅 No upcoming classes found. Add your classes using the **+ Add Class** button!`;
      const { class: cls, day, daysAway } = next;
      const when = daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days (${day})`;
      return `📚 Your next class is **${when}**:\n\n**${cls.name}** (${cls.code || 'N/A'})\n🕐 ${CSMSchedule.formatDisplayTime(cls.startTime)} – ${CSMSchedule.formatDisplayTime(cls.endTime)} EAT\n📍 ${cls.location || 'No location set'}\n👤 ${cls.instructor || 'No instructor set'}`;
    }

    // ── Current class ──
    if (/am i in class|current class|in class now|what class/.test(lower)) {
      const current = CSMSchedule.getCurrentClass(_classes);
      if (!current) return `✅ You're **not in class right now**. ${CSMSchedule.getNextClass(_classes) ? "Check when your next class is!" : "No upcoming classes found."}`;
      return `📖 You're currently in **${current.name}** (${current.code || 'N/A'})\n🕐 Ends at **${CSMSchedule.formatDisplayTime(current.endTime)} EAT**\n📍 ${current.location || 'No location set'}\n👤 ${current.instructor || 'N/A'}`;
    }

    // ── All classes ──
    if (/all classes|my classes|show classes|list classes/.test(lower)) {
      if (_classes.length === 0) return `📋 You haven't added any classes yet. Click **+ Add Class** to get started!`;
      let resp = `📋 **All Classes** *(${_classes.length} total)*:\n\n`;
      for (const cls of _classes) {
        resp += `**${cls.name}** (${cls.code || 'N/A'})\n`;
        resp += `   📆 ${(cls.days||[]).join(', ')} | ${CSMSchedule.formatDisplayTime(cls.startTime)}–${CSMSchedule.formatDisplayTime(cls.endTime)} EAT\n`;
        if (cls.instructor) resp += `   👤 ${cls.instructor}\n`;
        if (cls.location)   resp += `   📍 ${cls.location}\n`;
        resp += '\n';
      }
      return resp.trim();
    }

    // ── Assignments / deadlines ──
    if (/assignment|homework|due|deadline|task/.test(lower)) {
      const pending = _assignments.filter(a => !a.completed);
      if (pending.length === 0) return `🎉 **No pending assignments!** You're all caught up. Well done, ${name}!`;
      const sorted = pending.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
      let resp = `📝 **Pending Assignments** *(${pending.length} total)*:\n\n`;
      for (const a of sorted) {
        const { text } = CSMSchedule.dueDateLabel(a.dueDate);
        const pri = { high: '🔴', medium: '🟡', low: '🟢' }[a.priority] || '🔵';
        resp += `${pri} **${a.title}**\n`;
        resp += `   📚 ${a.className} | ⏰ ${text}`;
        if (a.estimatedHours) resp += ` | ~${a.estimatedHours}h`;
        resp += '\n\n';
      }
      return resp.trim();
    }

    // ── Study block suggestions ──
    if (/study|free time|study block|when.*study|study.*when/.test(lower)) {
      const blocks = CSMSchedule.suggestStudyBlocks(_classes);
      if (blocks.length === 0) return `📅 No free blocks found today — your schedule is quite full! Consider studying over the weekend or reviewing during short breaks between classes.`;
      let resp = `💡 **Suggested Study Blocks for Today:**\n\n`;
      for (const b of blocks) {
        const hrs = Math.floor(b.duration / 60);
        const mins = b.duration % 60;
        const durStr = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'm' : ''}`.trim() : `${mins}m`;
        resp += `⏰ **${CSMSchedule.formatDisplayTime(b.start)} – ${CSMSchedule.formatDisplayTime(b.end)} EAT** *(${durStr})*\n`;
      }
      resp += `\nTip: Use the **Pomodoro technique** — 25 min focused study + 5 min break. 🍅`;
      return resp;
    }

    // ── Overdue / urgent ──
    if (/overdue|urgent|late|miss/.test(lower)) {
      const overdue = _assignments.filter(a => !a.completed && CSMSchedule.daysUntilDue(a.dueDate) < 0);
      if (overdue.length === 0) return `✅ Great news — **no overdue assignments**! Keep it up, ${name}! 🎉`;
      let resp = `⚠️ **Overdue Assignments** *(${overdue.length})*:\n\n`;
      for (const a of overdue) {
        const days = Math.abs(CSMSchedule.daysUntilDue(a.dueDate));
        resp += `🔴 **${a.title}** — ${a.className}\n   Overdue by **${days} day${days > 1 ? 's' : ''}**!\n\n`;
      }
      resp += `Please contact your instructors as soon as possible. 💪`;
      return resp;
    }

    // ── Instructors ──
    if (/instructor|professor|teacher|lecturer/.test(lower)) {
      if (_classes.length === 0) return `No classes found. Add your classes to see instructor info.`;
      let resp = `👤 **Your Instructors:**\n\n`;
      for (const cls of _classes) {
        resp += `• **${cls.name}**: ${cls.instructor || 'Not set'}\n`;
      }
      return resp;
    }

    // ── Locations ──
    if (/location|room|where|venue/.test(lower)) {
      if (_classes.length === 0) return `No classes found. Add your classes to see location info.`;
      let resp = `📍 **Class Locations:**\n\n`;
      for (const cls of _classes) {
        resp += `• **${cls.name}**: ${cls.location || 'Not set'}\n`;
      }
      return resp;
    }

    // ── Help ──
    if (/help|what can you|commands|features/.test(lower)) {
      return `🤖 **ClassBot — What I Can Do:**\n\n` +
        `📅 **Schedule**\n• "What are my classes today?"\n• "When is my next class?"\n• "Am I in class right now?"\n\n` +
        `📝 **Assignments**\n• "What assignments are due soon?"\n• "Show overdue tasks"\n\n` +
        `💡 **Study Help**\n• "Suggest study time for today"\n• "How much free time do I have?"\n\n` +
        `📋 **Info**\n• "Show all my classes"\n• "Who teaches [subject]?"\n• "Where is [class]?"\n\n` +
        `💬 You can also ask naturally — I understand plain English! (Gemini AI key needed for full NLP)`;
    }

    // ── Fallback ──
    return `🤔 I'm not sure about that. Try asking:\n• *"What are my classes today?"*\n• *"Show upcoming assignments"*\n• *"Suggest study blocks"*\n\nOr type **"help"** to see everything I can do!\n\n*(Tip: Add your Gemini API key in Settings for enhanced AI responses.)*`;
  }

  // ── Markdown renderer (simple) ──
  function _renderMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^• /gm, '&bull; ')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  // ── Main send ──
  async function send(userMessage) {
    if (!userMessage.trim()) return '';

    // Refresh data before responding
    const { data: classes } = await CSMDb.getClasses();
    const { data: assignments } = await CSMDb.getAssignments();
    _classes = classes || [];
    _assignments = assignments || [];

    // Try Gemini first, fall back to rule-based
    let reply = await _callGemini(userMessage);
    if (!reply) {
      reply = _ruleBased(userMessage);
    }

    return reply;
  }

  function renderHTML(text) {
    return `<p>${_renderMarkdown(text)}</p>`;
  }

  function clearHistory() {
    _history = [];
  }

  return { send, renderHTML, clearHistory };
})();
