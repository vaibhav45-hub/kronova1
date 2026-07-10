/* ============================================
   CHRONIX — App Logic
   ============================================ */

(() => {
  'use strict';

  /* ---------- Storage helpers ---------- */
  const STORE_KEYS = {
    alarms: 'chronix_alarms',
    cities: 'chronix_cities',
    notes: 'chronix_notes'
  };

  const loadJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };
  const saveJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  };

  /* ---------- Toast ---------- */
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- Navigation ---------- */
  const navItems = document.querySelectorAll('.nav-item');
  const screens = document.querySelectorAll('.screen');

  function switchScreen(target) {
    screens.forEach(s => s.classList.toggle('active', s.dataset.screen === target));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.target === target));
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.target));
  });

  /* ============================================
     ALARM SOUND ENGINE (Web Audio API)
     ============================================ */
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  let alarmSoundInterval = null;
  let alarmSoundNodes = [];

  function stopAlarmSound() {
    if (alarmSoundInterval) { clearInterval(alarmSoundInterval); alarmSoundInterval = null; }
    alarmSoundNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    alarmSoundNodes = [];
  }

  function beep(freq, duration, type = 'sine', delay = 0, gainVal = 0.28) {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainVal, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
    alarmSoundNodes.push(osc);
  }

  const SOUND_PATTERNS = {
    classic: () => {
      beep(880, 0.18, 'square', 0);
      beep(880, 0.18, 'square', 0.28);
    },
    digital: () => {
      beep(1200, 0.1, 'square', 0);
      beep(1600, 0.1, 'square', 0.14);
      beep(1200, 0.1, 'square', 0.28);
    },
    chime: () => {
      beep(660, 0.5, 'sine', 0, 0.22);
      beep(990, 0.5, 'sine', 0.1, 0.16);
      beep(1320, 0.6, 'sine', 0.2, 0.12);
    },
    siren: () => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0.18;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.5);
      osc.frequency.linearRampToValueAtTime(440, now + 1.0);
      osc.start(now);
      osc.stop(now + 1.05);
      alarmSoundNodes.push(osc);
    }
  };

  function playAlarmSound(kind = 'classic') {
    stopAlarmSound();
    const pattern = SOUND_PATTERNS[kind] || SOUND_PATTERNS.classic;
    pattern();
    alarmSoundInterval = setInterval(pattern, 1400);
  }

  // A short preview beep, used when saving/testing
  function previewSound(kind) {
    const pattern = SOUND_PATTERNS[kind] || SOUND_PATTERNS.classic;
    pattern();
  }

  /* ============================================
     LIVE CLOCK
     ============================================ */
  const clockTimeEl = document.getElementById('clockTime');
  const clockPeriodEl = document.getElementById('clockPeriod');
  const clockSecondsEl = document.getElementById('clockSeconds');
  const clockDateEl = document.getElementById('clockDate');
  const ringSecondsEl = document.getElementById('ringSeconds');
  const localTzEl = document.getElementById('localTz');
  const dayOfYearEl = document.getElementById('dayOfYear');
  const weekNumberEl = document.getElementById('weekNumber');

  const RING_CIRCUMFERENCE = 2 * Math.PI * 138;
  ringSecondsEl.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

  function pad(n) { return n.toString().padStart(2, '0'); }

  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function getDayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start;
    return Math.floor(diff / 86400000);
  }

  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;

    clockTimeEl.textContent = `${pad(h12)}:${pad(minutes)}`;
    clockPeriodEl.textContent = period;
    clockSecondsEl.textContent = pad(seconds);

    const offset = seconds / 60 * RING_CIRCUMFERENCE;
    ringSecondsEl.style.strokeDashoffset = `${RING_CIRCUMFERENCE - offset}`;

    clockDateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    dayOfYearEl.textContent = getDayOfYear(now);
    weekNumberEl.textContent = `W${getWeekNumber(now)}`;

    checkAlarms(now);
    renderUpcomingAlarm(now);
  }

  try {
    localTzEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ');
  } catch (e) { localTzEl.textContent = '—'; }

  /* ============================================
     ALARMS
     ============================================ */
  let alarms = loadJSON(STORE_KEYS.alarms, []);
  let editingAlarmId = null;
  let firedThisMinute = {}; // guards against double-fire within same minute

  const alarmListEl = document.getElementById('alarmList');
  const alarmEmptyState = document.getElementById('alarmEmptyState');
  const alarmModalOverlay = document.getElementById('alarmModalOverlay');
  const btnAddAlarm = document.getElementById('btnAddAlarm');
  const btnCancelAlarm = document.getElementById('btnCancelAlarm');
  const btnSaveAlarm = document.getElementById('btnSaveAlarm');
  const btnDeleteAlarm = document.getElementById('btnDeleteAlarm');
  const alarmModalTitle = document.getElementById('alarmModalTitle');
  const alarmLabelInput = document.getElementById('alarmLabelInput');
  const alarmSoundSelect = document.getElementById('alarmSoundSelect');
  const daySelector = document.getElementById('daySelector');
  const tpHour = document.getElementById('tpHour');
  const tpMinute = document.getElementById('tpMinute');
  const tpMeridiem = document.getElementById('tpMeridiem');

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let tp = { hour: 7, minute: 0, meridiem: 'AM' };
  let selectedDays = new Set();

  function persistAlarms() { saveJSON(STORE_KEYS.alarms, alarms); }

  function openAlarmModal(alarm = null) {
    editingAlarmId = alarm ? alarm.id : null;
    alarmModalTitle.textContent = alarm ? 'Edit Alarm' : 'New Alarm';
    btnDeleteAlarm.style.display = alarm ? 'block' : 'none';

    if (alarm) {
      let h = alarm.hour % 12; if (h === 0) h = 12;
      tp.hour = h;
      tp.minute = alarm.minute;
      tp.meridiem = alarm.hour >= 12 ? 'PM' : 'AM';
      alarmLabelInput.value = alarm.label || '';
      alarmSoundSelect.value = alarm.sound || 'classic';
      selectedDays = new Set(alarm.days || []);
    } else {
      tp = { hour: 7, minute: 0, meridiem: 'AM' };
      alarmLabelInput.value = '';
      alarmSoundSelect.value = 'classic';
      selectedDays = new Set();
    }
    renderTimePicker();
    renderDaySelector();
    alarmModalOverlay.classList.add('open');
  }

  function closeAlarmModal() {
    alarmModalOverlay.classList.remove('open');
    editingAlarmId = null;
  }

  function renderTimePicker() {
    tpHour.textContent = pad(tp.hour);
    tpMinute.textContent = pad(tp.minute);
    tpMeridiem.textContent = tp.meridiem;
  }

  function renderDaySelector() {
    [...daySelector.children].forEach(chip => {
      const day = parseInt(chip.dataset.day, 10);
      chip.classList.toggle('active', selectedDays.has(day));
    });
  }

  daySelector.addEventListener('click', (e) => {
    const chip = e.target.closest('.day-chip');
    if (!chip) return;
    const day = parseInt(chip.dataset.day, 10);
    if (selectedDays.has(day)) selectedDays.delete(day); else selectedDays.add(day);
    renderDaySelector();
  });

  document.querySelectorAll('.tp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const dir = parseInt(btn.dataset.dir, 10);
      if (target === 'hour') {
        tp.hour += dir;
        if (tp.hour > 12) tp.hour = 1;
        if (tp.hour < 1) tp.hour = 12;
      } else if (target === 'minute') {
        tp.minute += dir;
        if (tp.minute > 59) tp.minute = 0;
        if (tp.minute < 0) tp.minute = 59;
      } else if (target === 'meridiem') {
        tp.meridiem = tp.meridiem === 'AM' ? 'PM' : 'AM';
      }
      renderTimePicker();
    });
  });

  btnAddAlarm.addEventListener('click', () => openAlarmModal());
  btnCancelAlarm.addEventListener('click', closeAlarmModal);
  alarmModalOverlay.addEventListener('click', (e) => { if (e.target === alarmModalOverlay) closeAlarmModal(); });

  btnSaveAlarm.addEventListener('click', () => {
    let hour24 = tp.hour % 12;
    if (tp.meridiem === 'PM') hour24 += 12;

    const alarmData = {
      id: editingAlarmId || `alarm_${Date.now()}`,
      hour: hour24,
      minute: tp.minute,
      label: alarmLabelInput.value.trim() || 'Alarm',
      days: [...selectedDays],
      sound: alarmSoundSelect.value,
      enabled: true
    };

    if (editingAlarmId) {
      const idx = alarms.findIndex(a => a.id === editingAlarmId);
      if (idx > -1) alarmData.enabled = alarms[idx].enabled;
      alarms = alarms.map(a => a.id === editingAlarmId ? alarmData : a);
      showToast('Alarm updated');
    } else {
      alarms.push(alarmData);
      showToast('Alarm created');
    }

    persistAlarms();
    renderAlarms();
    closeAlarmModal();
  });

  btnDeleteAlarm.addEventListener('click', () => {
    alarms = alarms.filter(a => a.id !== editingAlarmId);
    persistAlarms();
    renderAlarms();
    closeAlarmModal();
    showToast('Alarm deleted');
  });

  function formatAlarmTime(hour, minute) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return { time: `${pad(h12)}:${pad(minute)}`, period };
  }

  function renderAlarms() {
    alarmListEl.innerHTML = '';
    if (alarms.length === 0) {
      alarmEmptyState.classList.add('show');
    } else {
      alarmEmptyState.classList.remove('show');
    }

    // Sort by time
    const sorted = [...alarms].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

    sorted.forEach(alarm => {
      const { time, period } = formatAlarmTime(alarm.hour, alarm.minute);
      const li = document.createElement('li');
      li.className = 'alarm-item' + (alarm.enabled ? '' : ' disabled');

      const daysHtml = DAY_LABELS.map((label, i) =>
        `<span class="alarm-day-dot ${alarm.days.includes(i) ? 'active' : ''}">${label}</span>`
      ).join('');

      li.innerHTML = `
        <div class="alarm-info" data-edit="${alarm.id}">
          <div class="alarm-time">${time}<span class="mer">${period}</span></div>
          <div class="alarm-label">${escapeHtml(alarm.label)}</div>
          <div class="alarm-days">${daysHtml}</div>
        </div>
        <div class="toggle-switch ${alarm.enabled ? 'on' : ''}" data-toggle="${alarm.id}"></div>
      `;
      alarmListEl.appendChild(li);
    });

    // Bind events
    alarmListEl.querySelectorAll('[data-edit]').forEach(el => {
      el.addEventListener('click', () => {
        const alarm = alarms.find(a => a.id === el.dataset.edit);
        if (alarm) openAlarmModal(alarm);
      });
    });
    alarmListEl.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const alarm = alarms.find(a => a.id === el.dataset.toggle);
        if (alarm) {
          alarm.enabled = !alarm.enabled;
          persistAlarms();
          renderAlarms();
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---- Upcoming alarm on Clock screen ---- */
  const upcomingAlarmCard = document.getElementById('upcomingAlarmCard');
  const upcomingEmpty = document.getElementById('upcomingEmpty');
  const nextAlarmLabel = document.getElementById('nextAlarmLabel');

  function getNextAlarmOccurrence(alarm, now) {
    // Returns a Date for the next time this alarm should fire, or null if disabled/no valid day
    if (!alarm.enabled) return null;
    for (let addDays = 0; addDays < 8; addDays++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + addDays);
      candidate.setHours(alarm.hour, alarm.minute, 0, 0);
      const dow = candidate.getDay();
      const daysOk = alarm.days.length === 0 ? addDays === 0 || true : alarm.days.includes(dow);
      if (alarm.days.length === 0) {
        // one-off: only valid if it's today and still upcoming, or tomorrow
        if (addDays === 0 && candidate > now) return candidate;
        if (addDays === 1) return candidate;
        continue;
      }
      if (daysOk && candidate > now) return candidate;
    }
    return null;
  }

  function renderUpcomingAlarm(now) {
    const enabledAlarms = alarms.filter(a => a.enabled);
    if (enabledAlarms.length === 0) {
      upcomingEmpty.style.display = 'block';
      const existing = upcomingAlarmCard.querySelector('.upcoming-alarm-item');
      if (existing) existing.remove();
      nextAlarmLabel.textContent = 'No alarms set';
      return;
    }

    let soonest = null;
    enabledAlarms.forEach(a => {
      const next = getNextAlarmOccurrence(a, now);
      if (next && (!soonest || next < soonest.time)) soonest = { alarm: a, time: next };
    });

    if (!soonest) {
      upcomingEmpty.style.display = 'block';
      nextAlarmLabel.textContent = 'No alarms set';
      return;
    }

    upcomingEmpty.style.display = 'none';
    const { time, period } = formatAlarmTime(soonest.alarm.hour, soonest.alarm.minute);
    const diffMs = soonest.time - now;
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const countdownText = diffH > 0 ? `in ${diffH}h ${diffM}m` : `in ${diffM}m`;

    let existing = upcomingAlarmCard.querySelector('.upcoming-alarm-item');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'upcoming-alarm-item';
      upcomingAlarmCard.appendChild(existing);
    }
    existing.innerHTML = `
      <span class="u-time">${time}<span style="font-size:14px;color:var(--text-secondary);margin-left:4px;">${period}</span></span>
      <span class="u-meta">
        <span class="u-label">${escapeHtml(soonest.alarm.label)}</span>
        <span class="u-countdown">${countdownText}</span>
      </span>
    `;
    nextAlarmLabel.textContent = `Next: ${time} ${period}`;
  }

  /* ---- Alarm firing check ---- */
  const ringingOverlay = document.getElementById('ringingOverlay');
  const ringingTime = document.getElementById('ringingTime');
  const ringingLabel = document.getElementById('ringingLabel');
  const btnSnooze = document.getElementById('btnSnooze');
  const btnDismiss = document.getElementById('btnDismiss');
  let activeAlarmId = null;
  let snoozeTimeouts = {};

  function checkAlarms(now) {
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    alarms.forEach(alarm => {
      if (!alarm.enabled) return;
      const matchesDay = alarm.days.length === 0 || alarm.days.includes(now.getDay());
      if (alarm.hour === now.getHours() && alarm.minute === now.getMinutes() && now.getSeconds() === 0 && matchesDay) {
        const guardKey = alarm.id + '_' + minuteKey;
        if (firedThisMinute[guardKey]) return;
        firedThisMinute[guardKey] = true;
        triggerAlarm(alarm);
        if (alarm.days.length === 0) {
          alarm.enabled = false;
          persistAlarms();
          renderAlarms();
        }
      }
    });
  }

  function triggerAlarm(alarm) {
    activeAlarmId = alarm.id;
    const { time, period } = formatAlarmTime(alarm.hour, alarm.minute);
    ringingTime.textContent = `${time} ${period}`;
    ringingLabel.textContent = alarm.label;
    ringingOverlay.classList.add('show');
    playAlarmSound(alarm.sound);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
  }

  btnDismiss.addEventListener('click', () => {
    ringingOverlay.classList.remove('show');
    stopAlarmSound();
    activeAlarmId = null;
  });

  btnSnooze.addEventListener('click', () => {
    ringingOverlay.classList.remove('show');
    stopAlarmSound();
    const alarm = alarms.find(a => a.id === activeAlarmId);
    if (alarm) {
      clearTimeout(snoozeTimeouts[alarm.id]);
      snoozeTimeouts[alarm.id] = setTimeout(() => {
        triggerAlarm(alarm);
      }, 5 * 60 * 1000);
      showToast('Snoozed for 5 minutes');
    }
    activeAlarmId = null;
  });

  /* ============================================
     TIMER
     ============================================ */
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStateLabel = document.getElementById('timerStateLabel');
  const timerRing = document.getElementById('timerRing');
  const timerInputs = document.getElementById('timerInputs');
  const timerHoursInput = document.getElementById('timerHours');
  const timerMinutesInput = document.getElementById('timerMinutes');
  const timerSecondsInputEl = document.getElementById('timerSecondsInput');
  const timerPresets = document.getElementById('timerPresets');
  const btnTimerStart = document.getElementById('btnTimerStart');
  const btnTimerReset = document.getElementById('btnTimerReset');

  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 130;
  timerRing.style.strokeDasharray = `${TIMER_CIRCUMFERENCE}`;
  timerRing.style.strokeDashoffset = '0';

  let timerTotalSeconds = 300;
  let timerRemaining = 300;
  let timerRunning = false;
  let timerInterval = null;

  function formatHMS(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatHMS(timerRemaining);
    const progress = timerTotalSeconds > 0 ? (timerRemaining / timerTotalSeconds) : 0;
    timerRing.style.strokeDashoffset = `${TIMER_CIRCUMFERENCE * (1 - progress)}`;
  }

  function readTimerInputs() {
    const h = parseInt(timerHoursInput.value, 10) || 0;
    const m = parseInt(timerMinutesInput.value, 10) || 0;
    const s = parseInt(timerSecondsInputEl.value, 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  [timerHoursInput, timerMinutesInput, timerSecondsInputEl].forEach(inp => {
    inp.addEventListener('input', () => {
      if (!timerRunning) {
        timerTotalSeconds = readTimerInputs();
        timerRemaining = timerTotalSeconds;
        updateTimerDisplay();
        [...timerPresets.children].forEach(c => c.classList.remove('active'));
      }
    });
  });

  timerPresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip || timerRunning) return;
    [...timerPresets.children].forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const secs = parseInt(chip.dataset.secs, 10);
    timerTotalSeconds = secs;
    timerRemaining = secs;
    timerHoursInput.value = Math.floor(secs / 3600);
    timerMinutesInput.value = Math.floor((secs % 3600) / 60);
    timerSecondsInputEl.value = secs % 60;
    updateTimerDisplay();
  });

  function startTimer() {
    if (timerRemaining <= 0) {
      timerTotalSeconds = readTimerInputs();
      timerRemaining = timerTotalSeconds;
    }
    if (timerRemaining <= 0) { showToast('Set a duration first'); return; }
    timerRunning = true;
    btnTimerStart.textContent = 'Pause';
    btnTimerStart.classList.add('is-active');
    timerStateLabel.textContent = 'Running';
    timerInputs.style.opacity = '0.4';
    timerInputs.style.pointerEvents = 'none';

    const endTime = Date.now() + timerRemaining * 1000;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const msLeft = endTime - Date.now();
      timerRemaining = Math.max(0, Math.round(msLeft / 1000));
      updateTimerDisplay();
      if (msLeft <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        btnTimerStart.textContent = 'Start';
        btnTimerStart.classList.remove('is-active');
        timerStateLabel.textContent = 'Complete';
        playAlarmSound('digital');
        ringingTime.textContent = formatHMS(0);
        ringingLabel.textContent = 'Timer Complete';
        ringingOverlay.classList.add('show');
        activeAlarmId = 'TIMER';
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      }
    }, 200);
  }

  function pauseTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    btnTimerStart.textContent = 'Resume';
    btnTimerStart.classList.remove('is-active');
    timerStateLabel.textContent = 'Paused';
    timerInputs.style.opacity = '1';
    timerInputs.style.pointerEvents = 'auto';
  }

  btnTimerStart.addEventListener('click', () => {
    if (timerRunning) pauseTimer(); else startTimer();
  });

  btnTimerReset.addEventListener('click', () => {
    clearInterval(timerInterval);
    timerRunning = false;
    timerTotalSeconds = readTimerInputs();
    timerRemaining = timerTotalSeconds;
    btnTimerStart.textContent = 'Start';
    btnTimerStart.classList.remove('is-active');
    timerStateLabel.textContent = 'Ready';
    timerInputs.style.opacity = '1';
    timerInputs.style.pointerEvents = 'auto';
    updateTimerDisplay();
  });

  // Override dismiss to also handle timer-complete overlay
  const originalDismiss = btnDismiss.onclick;
  btnDismiss.addEventListener('click', () => {
    if (activeAlarmId === 'TIMER') activeAlarmId = null;
  });

  updateTimerDisplay();

  /* ============================================
     STOPWATCH
     ============================================ */
  const stopwatchDisplay = document.getElementById('stopwatchDisplay');
  const btnStopwatchStart = document.getElementById('btnStopwatchStart');
  const btnLap = document.getElementById('btnLap');
  const lapsList = document.getElementById('lapsList');

  let swRunning = false;
  let swStartTime = 0;
  let swElapsed = 0;
  let swInterval = null;
  let laps = [];

  function formatStopwatch(ms) {
    const totalCentis = Math.floor(ms / 10);
    const centis = totalCentis % 100;
    const totalSeconds = Math.floor(totalCentis / 100);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${pad(minutes)}:${pad(seconds)}<span class="ms">.${pad(centis)}</span>`;
  }

  function updateStopwatchDisplay() {
    const elapsed = swRunning ? swElapsed + (Date.now() - swStartTime) : swElapsed;
    stopwatchDisplay.innerHTML = formatStopwatch(elapsed);
  }

  btnStopwatchStart.addEventListener('click', () => {
    if (!swRunning) {
      swRunning = true;
      swStartTime = Date.now();
      btnStopwatchStart.textContent = 'Stop';
      btnStopwatchStart.classList.add('is-active');
      btnLap.textContent = 'Lap';
      swInterval = setInterval(updateStopwatchDisplay, 40);
    } else {
      swRunning = false;
      swElapsed += Date.now() - swStartTime;
      clearInterval(swInterval);
      btnStopwatchStart.textContent = 'Start';
      btnStopwatchStart.classList.remove('is-active');
      btnLap.textContent = 'Reset';
      updateStopwatchDisplay();
    }
  });

  btnLap.addEventListener('click', () => {
    if (swRunning) {
      const elapsed = swElapsed + (Date.now() - swStartTime);
      const prevTotal = laps.length ? laps[0].total : 0;
      const diff = elapsed - prevTotal;
      laps.unshift({ total: elapsed, diff });
      renderLaps();
    } else {
      // Reset
      swElapsed = 0;
      laps = [];
      updateStopwatchDisplay();
      renderLaps();
      btnLap.textContent = 'Lap';
    }
  });

  function renderLaps() {
    lapsList.innerHTML = '';
    laps.forEach((lap, idx) => {
      const lapNum = laps.length - idx;
      const li = document.createElement('li');
      li.className = 'lap-item';
      li.innerHTML = `
        <span class="lap-num">Lap ${lapNum}</span>
        <span class="lap-diff">+${formatStopwatch(lap.diff)}</span>
        <span>${formatStopwatch(lap.total)}</span>
      `;
      lapsList.appendChild(li);
    });
  }

  /* ============================================
     WORLD CLOCK
     ============================================ */
  const CITY_DATA = [
    { name: 'New York', tz: 'America/New_York' },
    { name: 'Los Angeles', tz: 'America/Los_Angeles' },
    { name: 'Chicago', tz: 'America/Chicago' },
    { name: 'Toronto', tz: 'America/Toronto' },
    { name: 'Mexico City', tz: 'America/Mexico_City' },
    { name: 'São Paulo', tz: 'America/Sao_Paulo' },
    { name: 'London', tz: 'Europe/London' },
    { name: 'Paris', tz: 'Europe/Paris' },
    { name: 'Berlin', tz: 'Europe/Berlin' },
    { name: 'Madrid', tz: 'Europe/Madrid' },
    { name: 'Rome', tz: 'Europe/Rome' },
    { name: 'Moscow', tz: 'Europe/Moscow' },
    { name: 'Dubai', tz: 'Asia/Dubai' },
    { name: 'Mumbai', tz: 'Asia/Kolkata' },
    { name: 'New Delhi', tz: 'Asia/Kolkata' },
    { name: 'Karachi', tz: 'Asia/Karachi' },
    { name: 'Dhaka', tz: 'Asia/Dhaka' },
    { name: 'Bangkok', tz: 'Asia/Bangkok' },
    { name: 'Singapore', tz: 'Asia/Singapore' },
    { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
    { name: 'Shanghai', tz: 'Asia/Shanghai' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'Seoul', tz: 'Asia/Seoul' },
    { name: 'Sydney', tz: 'Australia/Sydney' },
    { name: 'Melbourne', tz: 'Australia/Melbourne' },
    { name: 'Auckland', tz: 'Pacific/Auckland' },
    { name: 'Cairo', tz: 'Africa/Cairo' },
    { name: 'Johannesburg', tz: 'Africa/Johannesburg' },
    { name: 'Lagos', tz: 'Africa/Lagos' },
    { name: 'Istanbul', tz: 'Europe/Istanbul' },
    { name: 'Honolulu', tz: 'Pacific/Honolulu' },
    { name: 'Anchorage', tz: 'America/Anchorage' }
  ];

  let worldCities = loadJSON(STORE_KEYS.cities, [
    { name: 'London', tz: 'Europe/London' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'New York', tz: 'America/New_York' }
  ]);

  const worldListEl = document.getElementById('worldList');
  const btnAddCity = document.getElementById('btnAddCity');
  const cityModalOverlay = document.getElementById('cityModalOverlay');
  const btnCancelCity = document.getElementById('btnCancelCity');
  const citySearchInput = document.getElementById('citySearchInput');
  const cityResults = document.getElementById('cityResults');

  function persistCities() { saveJSON(STORE_KEYS.cities, worldCities); }

  function renderWorldClocks() {
    worldListEl.innerHTML = '';
    const now = new Date();

    worldCities.forEach((city, idx) => {
      let timeStr = '—', dayLabel = '', offsetLabel = '';
      try {
        timeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: city.tz, hour: '2-digit', minute: '2-digit', hour12: true
        }).format(now);

        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: city.tz, weekday: 'short', month: 'short', day: 'numeric'
        }).format(now);
        dayLabel = parts;

        // Compute offset label
        const localOffset = -now.getTimezoneOffset();
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: city.tz }));
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const diffHours = Math.round((tzDate - utcDate) / 3600000);
        offsetLabel = diffHours >= 0 ? `UTC+${diffHours}` : `UTC${diffHours}`;
      } catch (e) {}

      const li = document.createElement('li');
      li.className = 'world-item';
      li.innerHTML = `
        <div class="world-info">
          <div class="w-city">${escapeHtml(city.name)}</div>
          <div class="w-meta">${offsetLabel}</div>
        </div>
        <div class="world-time">
          <div class="w-clock">${timeStr}</div>
          <div class="w-day">${dayLabel}</div>
        </div>
        <button class="world-remove" data-remove="${idx}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      worldListEl.appendChild(li);
    });

    worldListEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove, 10);
        worldCities.splice(idx, 1);
        persistCities();
        renderWorldClocks();
      });
    });
  }

  btnAddCity.addEventListener('click', () => {
    citySearchInput.value = '';
    renderCityResults(CITY_DATA);
    cityModalOverlay.classList.add('open');
    setTimeout(() => citySearchInput.focus(), 300);
  });
  btnCancelCity.addEventListener('click', () => cityModalOverlay.classList.remove('open'));
  cityModalOverlay.addEventListener('click', (e) => { if (e.target === cityModalOverlay) cityModalOverlay.classList.remove('open'); });

  function renderCityResults(list) {
    cityResults.innerHTML = '';
    list.forEach(city => {
      const li = document.createElement('li');
      li.className = 'city-result-item';
      li.innerHTML = `<span class="cr-name">${escapeHtml(city.name)}</span><span class="cr-offset">Add →</span>`;
      li.addEventListener('click', () => {
        worldCities.push(city);
        persistCities();
        renderWorldClocks();
        cityModalOverlay.classList.remove('open');
        showToast(`${city.name} added`);
      });
      cityResults.appendChild(li);
    });
  }

  citySearchInput.addEventListener('input', () => {
    const q = citySearchInput.value.trim().toLowerCase();
    const filtered = q
      ? CITY_DATA.filter(c => c.name.toLowerCase().includes(q))
      : CITY_DATA;
    renderCityResults(filtered);
  });

  /* ============================================
     CALENDAR
     ============================================ */
  const calMonthLabel = document.getElementById('calMonthLabel');
  const calGrid = document.getElementById('calGrid');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const calNoteInput = document.getElementById('calNoteInput');
  const btnSaveNote = document.getElementById('btnSaveNote');
  const calSelectedDateLabel = document.getElementById('calSelectedDateLabel');

  let calNotes = loadJSON(STORE_KEYS.notes, {});
  let viewDate = new Date();
  let selectedDate = new Date();

  function dateKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function persistNotes() { saveJSON(STORE_KEYS.notes, calNotes); }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    calMonthLabel.textContent = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    calGrid.innerHTML = '';

    // Previous month tail
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      calGrid.appendChild(makeDayCell(d, new Date(year, month - 1, d), true));
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      calGrid.appendChild(makeDayCell(d, cellDate, false));
    }
    // Next month lead-in to fill grid (up to 42 cells)
    const totalCells = startOffset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= trailing; d++) {
      calGrid.appendChild(makeDayCell(d, new Date(year, month + 1, d), true));
    }

    function makeDayCell(dayNum, cellDate, muted) {
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      if (muted) cell.classList.add('muted');
      if (isSameDay(cellDate, today)) cell.classList.add('today');
      if (isSameDay(cellDate, selectedDate)) cell.classList.add('selected');
      if (calNotes[dateKey(cellDate)]) cell.classList.add('has-note');
      cell.textContent = dayNum;
      cell.addEventListener('click', () => {
        selectedDate = cellDate;
        if (muted) { viewDate = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1); }
        renderCalendar();
        renderNoteForSelected();
      });
      return cell;
    }
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderNoteForSelected() {
    calSelectedDateLabel.textContent = selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    calNoteInput.value = calNotes[dateKey(selectedDate)] || '';
  }

  calPrev.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderCalendar();
  });

  btnSaveNote.addEventListener('click', () => {
    const key = dateKey(selectedDate);
    const val = calNoteInput.value.trim();
    if (val) calNotes[key] = val; else delete calNotes[key];
    persistNotes();
    renderCalendar();
    showToast('Note saved');
  });

  /* ============================================
     DEVELOPER OPTIONS (password protected)
     ============================================ */
  const DEV_PASSWORD = '2309';

  const btnDevOptions = document.getElementById('btnDevOptions');
  const devPassOverlay = document.getElementById('devPassOverlay');
  const devPassInput = document.getElementById('devPassInput');
  const devPassError = document.getElementById('devPassError');
  const btnCancelDevPass = document.getElementById('btnCancelDevPass');
  const btnSubmitDevPass = document.getElementById('btnSubmitDevPass');

  const devInfoOverlay = document.getElementById('devInfoOverlay');
  const btnCloseDevInfo = document.getElementById('btnCloseDevInfo');
  const btnResetData = document.getElementById('btnResetData');
  const devBuildDate = document.getElementById('devBuildDate');
  const devAlarmCount = document.getElementById('devAlarmCount');
  const devCityCount = document.getElementById('devCityCount');
  const devStorageSize = document.getElementById('devStorageSize');

  btnDevOptions.addEventListener('click', () => {
    devPassInput.value = '';
    devPassError.classList.remove('show');
    devPassOverlay.classList.add('open');
    setTimeout(() => devPassInput.focus(), 300);
  });

  btnCancelDevPass.addEventListener('click', () => devPassOverlay.classList.remove('open'));
  devPassOverlay.addEventListener('click', (e) => { if (e.target === devPassOverlay) devPassOverlay.classList.remove('open'); });

  function attemptDevUnlock() {
    if (devPassInput.value === DEV_PASSWORD) {
      devPassOverlay.classList.remove('open');
      openDevInfo();
    } else {
      devPassError.classList.add('show');
      devPassInput.value = '';
      devPassInput.focus();
    }
  }

  btnSubmitDevPass.addEventListener('click', attemptDevUnlock);
  devPassInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptDevUnlock(); });

  function calcStorageSize() {
    let total = 0;
    Object.values(STORE_KEYS).forEach(key => {
      const val = localStorage.getItem(key);
      if (val) total += val.length;
    });
    return (total / 1024).toFixed(2) + ' KB';
  }

  function openDevInfo() {
    devBuildDate.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    devAlarmCount.textContent = alarms.length;
    devCityCount.textContent = worldCities.length;
    devStorageSize.textContent = calcStorageSize();
    devInfoOverlay.classList.add('open');
  }

  btnCloseDevInfo.addEventListener('click', () => devInfoOverlay.classList.remove('open'));
  devInfoOverlay.addEventListener('click', (e) => { if (e.target === devInfoOverlay) devInfoOverlay.classList.remove('open'); });

  btnResetData.addEventListener('click', () => {
    if (confirm('This will erase all alarms, cities, and notes. Continue?')) {
      localStorage.removeItem(STORE_KEYS.alarms);
      localStorage.removeItem(STORE_KEYS.cities);
      localStorage.removeItem(STORE_KEYS.notes);
      alarms = [];
      worldCities = [];
      calNotes = {};
      renderAlarms();
      renderWorldClocks();
      renderCalendar();
      renderNoteForSelected();
      devInfoOverlay.classList.remove('open');
      showToast('All data cleared');
    }
  });

  /* ============================================
     INIT
     ============================================ */
  function init() {
    renderAlarms();
    renderWorldClocks();
    renderCalendar();
    renderNoteForSelected();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(renderWorldClocks, 30000);

    // Unlock audio context on first user interaction (mobile requirement)
    const unlock = () => { getCtx(); document.removeEventListener('touchstart', unlock); document.removeEventListener('click', unlock); };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  // Register service worker so the app is installable (PWA -> "Add to Home Screen")
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

})();
