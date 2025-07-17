// TODO: css-grid based rendering
let selectedMeetings = {};

// -- colors --
const COURSE_COLORS = ['#992626', '#F28B30', '#F2B63D', '#C1D998', '#86B3B2', '#A574A4'];

function getUsedColors(term) {
  const used = new Set();
  for (const courseCode in selectedMeetings) {
    const colorObj = selectedMeetings[courseCode]._color;
    if (!colorObj) continue;
    if (term === 'Y') {
      if (colorObj.fall) used.add(colorObj.fall);
      if (colorObj.winter) used.add(colorObj.winter);
    } else if (colorObj[term]) {
      used.add(colorObj[term]);
    }
  }
  return used;
}

function getAvailableColor(term) {
  const used = getUsedColors(term);
  const available = COURSE_COLORS.filter(c => !used.has(c));
  return available.length > 0
    ? available[Math.floor(Math.random() * available.length)] : null;
}

function ensureCourseColor(courseCode, term, sessionCode) {
  selectedMeetings[courseCode]._color = selectedMeetings[courseCode]._color || {};
  if (sessionCode === 'Y') {
    if (!selectedMeetings[courseCode]._color.fall && !selectedMeetings[courseCode]._color.winter) {
      const sharedColor = getAvailableColor('Y') || '#999999';
      selectedMeetings[courseCode]._color.fall = sharedColor;
      selectedMeetings[courseCode]._color.winter = sharedColor;
    }
  } else {
    if (!selectedMeetings[courseCode]._color[term]) {
      const color = getAvailableColor(term);
      selectedMeetings[courseCode]._color[term] = color || '#999999';
    }
  }
}

function cleanupCourseIfEmpty(courseCode) {
  const entries = Object.entries(selectedMeetings[courseCode] || {});
  const nonMeta = entries.filter(([k]) => k !== '_color');
  if (nonMeta.length === 0) {
    delete selectedMeetings[courseCode];
  }
}

// -- misc utils -- 
function millisToTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}:${m.toString().padStart(2, '0')}`;
}

function numToDay(day) {
    return {
        1: 'M',
        2: 'T',
        3: 'W',
        4: 'R',
        5: 'F'
    }[day] || '';
}

function splitMeetingsByTerm(meetings) {
    const mid = Math.floor(meetings.length / 2);
    return {
        fall: Array.from(meetings).slice(0, mid),
        winter: Array.from(meetings).slice(mid),
    };
}

function isOverlap(a, b) {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

/**
 * Applies the 'selected' class to meeting lines and section lines for a specific course
 * based on the selectedMeetings state for that course.
 * @param {string} courseCode The code of the course to update
 */
function applyIndividualMeetingSelectionsToDOM(courseCode) {
  const currentCourseElement = document.querySelector(`.course[data-course-code="${courseCode}"]`);
  if (currentCourseElement) {
    currentCourseElement.querySelectorAll('.meeting-line.selected, .section-line.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }

  if (selectedMeetings[courseCode]) {
    for (const meetingId in selectedMeetings[courseCode]) {
      const meetingLine = document.querySelector(`.meeting-line[data-id="${meetingId}"]`);
      if (meetingLine) {
        meetingLine.classList.add('selected');
      }
    }
  }
}

/**
 * Updates the bolding of a section line based on whether all its meeting times are selected.
 * @param {HTMLElement} sectionDiv - The .section div element of a currently displayed course
 */
function updateSectionBolding(sectionDiv) {
  const sectionLine = sectionDiv.querySelector('.section-line');
  if (!sectionLine) return;

  const courseCode = sectionDiv.closest('.course').dataset.courseCode;
  const sectionName = sectionLine.dataset.sectionName;

  const allMeetingLinesForThisSection = Array.from(sectionDiv.querySelectorAll(`.meeting-line[data-section-name="${sectionName}"]`))
  .filter(line => {
    return line.closest('.course')?.dataset.courseCode === courseCode;
  });

  if (allMeetingLinesForThisSection.length === 0) {
    sectionLine.classList.remove('selected');
    return;
  }

  const allMeetingsSelected = allMeetingLinesForThisSection.every(line =>
    selectedMeetings[courseCode] && selectedMeetings[courseCode].hasOwnProperty(line.dataset.id)
  );

  if (allMeetingsSelected) {
    sectionLine.classList.add('selected');
  } else {
    sectionLine.classList.remove('selected');
  }
}

/**
 * Iterates through all sections of a specific rendered course and updates their bolding status.
 * @param {string} courseCode - The code of the course whose sections to update
 */
function updateSectionBoldingForCourse(courseCode) {
  const courseElement = document.querySelector(`.course[data-course-code="${courseCode}"]`);
  if (courseElement) {
    courseElement.querySelectorAll('.section').forEach(sectionDiv => {
      updateSectionBolding(sectionDiv);
    });
  }
}

// -- main blocks -- 
/**
 * Parses and renders course info from the provided XML.
 * 
 * @param {Document} xml - Fetched XML document of course data
 */
async function main(xml) {
    if (!xml) return;
    const container = document.getElementById('courses');
    container.innerHTML = '';
    const courseData = extractCourseData(xml.querySelector('courses > courses'));
    const grouped = groupAndSortSections(courseData.sections);
    container.insertAdjacentHTML('beforeend', renderCourse(courseData, grouped));

    applyIndividualMeetingSelectionsToDOM(courseData.code);
    updateSectionBoldingForCourse(courseData.code);
}

/**
 * Fetches XML data via Perl for a given course code and session.
 * 
 * @param {string} course - The course code (eg. "CSC240")
 * @param {string} session - The session code ("F", "S", or "Y")
 * @returns {Promise<Document|null>} - Fetched XML document or null on failure
 */
async function getData(course, session = '') {
    try {
        const params = new URLSearchParams({
            course
        });
        if (session) params.append('session', session);
        const response = await fetch(`/cgi-bin/api.cgi.bat?${params.toString()}`);
        const text = await response.text();
        return new DOMParser().parseFromString(text, 'application/xml');
    } catch (e) {
        console.error('Error fetching/parsing XML:', e);
        return null;
    }
}

// -- timetable initialization -- 
function buildTimetableGrid(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const headers = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  headers.forEach(text => {
    const div = document.createElement('div');
    div.className = 'header';
    div.textContent = text;
    container.appendChild(div);
  });

  for (let h = 8; h < 22; h++) {
    for (let half = 0; half < 2; half++) {
      const isFullHour = half === 0;
      const label = isFullHour ? `${String(h).padStart(2, '0')}:00` : '';
      const timeDiv = document.createElement('div');
      timeDiv.className = 'time-label';
      timeDiv.appendChild(Object.assign(document.createElement('span'), {
        textContent: label
      }));
      container.appendChild(timeDiv);

      for (let d = 0; d < 5; d++) {
        container.appendChild(document.createElement('div'));
      }
    }
  }
}

['fall-timetable', 'winter-timetable'].forEach(buildTimetableGrid);

// -- course info rendering -- 
function extractCourseData(course) {
    return {
        name: course.querySelector('name')?.textContent || '',
        code: course.querySelector('code')?.textContent || '',
        session: course.querySelector('sectionCode')?.textContent || '',
        desc: course.querySelector('cmCourseInfo > description')?.textContent || '',
        sections: Array.from(course.querySelectorAll('sections > sections')),
    };
}

/**
 * Groups section elements by section type (e.g. LEC, TUT),
 * and sorts each group by section number.
 * Skips cancelled sections.
 * 
 * @param {Element[]} sectionNodes - Array of <sections> elements
 * @returns {Object} - { LEC: [...], TUT: [...], PRA: [...] }
 */
function groupAndSortSections(sectionNodes) {
    const grouped = {};
    sectionNodes.forEach(section => {
        if (section.querySelector('cancelInd')?.textContent === 'Y') return;
        const method = section.querySelector('teachMethod')?.textContent || 'OTHER';
        grouped[method] ??= [];
        grouped[method].push(section);
    });

    for (const group of Object.values(grouped)) {
        group.sort((a, b) => {
            const aNum = a.querySelector('sectionNumber')?.textContent || '';
            const bNum = b.querySelector('sectionNumber')?.textContent || '';
            return aNum.localeCompare(bNum, undefined, {
                numeric: true
            });
        });
    }
    return grouped;
}

/**
 * Renders a single course section's HTML, including:
 * - Section header with enrolment info
 * - Instructor info (excl. TUT)
 * - Meeting times
 * 
 * @param {Element} section - XML element for the section
 * @param {string} method - Section type
 * @param {string} session - Course session
 * @returns {string} - HTML string for the section
 */
function renderSection(section, method, session, courseCode) {
    const sectionName = section.querySelector('name')?.textContent || '';
    const currEnrol = section.querySelector('currentEnrolment')?.textContent || '';
    const wl = section.querySelector('currentWaitlist')?.textContent || '';
    const maxEnrol = section.querySelector('maxEnrolment')?.textContent || '';
    const rawId = section.querySelector('code')?.textContent + sectionName;
    const sectionId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

    const instructorBlock = method !== 'TUT' ? (() => {
      const names = Array.from(section.querySelectorAll('instructors > instructors')).map(n => {
        const f = n.querySelector('firstName')?.textContent || '';
        const l = n.querySelector('lastName')?.textContent || '';
        return `${f} ${l}`.trim();
      }).filter(Boolean);
      return names.length ? `<div class="instructor-line">Instructor${names.length > 1 ? 's' : ''}: ${names.join(', ')}</div>` : '';
    })() : '';

    const meetings = Array.from(section.querySelectorAll('meetingTimes > meetingTimes'));
    const { fall, winter } = session === 'Y'
      ? splitMeetingsByTerm(meetings)
      : session === 'F'
        ? { fall: meetings, winter: [] }
        : session === 'S'
          ? { fall: [], winter: meetings }
          : { fall: meetings, winter: [] };

    const renderMeetingsList = (meetings, term) => {
      const dayOrder = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
      return meetings
        .slice()
        .sort((a, b) => (dayOrder[a.querySelector('start > day')?.textContent] ?? 99) - (dayOrder[b.querySelector('start > day')?.textContent] ?? 99))
        .map((m, i) => {
          const day = m.querySelector('start > day')?.textContent;
          const start = parseInt(m.querySelector('start > millisofday')?.textContent || '0');
          const end = parseInt(m.querySelector('end > millisofday')?.textContent || '0');
          const building = m.querySelector('building > buildingCode')?.textContent || '';
          const id = `${courseCode}-${sectionName}-${term}-${i}`;
          return `<div class="meeting-line" data-day="${day}" data-start="${start}" data-end="${end}" data-term="${term}" data-id="${id}" data-section-name="${sectionName}" data-building="${building}"><span>${numToDay(day)}, ${millisToTime(start)}–${millisToTime(end)} @ ${building}</span></div>`;
        }).join('');
    };

    const fallContent = renderMeetingsList(fall, 'fall');
    const winterContent = renderMeetingsList(winter, 'winter');

    let scheduleContent = '';
    if (session === 'Y') {
      scheduleContent = `Fall:<br>${fallContent}<br>Winter:<br>${winterContent}`;
    } else if (session === 'F') {
      scheduleContent = `Schedule:<br>${fallContent}`;
    } else if (session === 'S') {
      scheduleContent = `Schedule:<br>${winterContent}`;
    } else {
      scheduleContent = `Schedule:<br>${fallContent}`;
    }

    return `
    <div class="section">
      <p class="section-line" data-term="${session}" data-section="${sectionId}" data-section-name="${sectionName}">
        <strong>Section:</strong> ${sectionName}, ${+currEnrol + +wl}/${maxEnrol}
      </p>
      ${instructorBlock ? `<div>${instructorBlock}</div>` : ''}
      <div>${scheduleContent}</div>
    </div>
  `;
}

/**
 * Renders the full HTML structure for a course and its sections.
 * Groups sections by section type.
 * 
 * @param {Object} courseData - Parsed course data
 * @param {Object} groupedSections - Sections grouped by type
 * @returns {string} - HTML string for the course block
 */
function renderCourse(courseData, groupedSections) {
    const order = ['LEC', 'TUT', 'PRA'];
    const sorted = Object.keys(groupedSections).sort((a, b) => {
      const ai = order.indexOf(a),
      bi = order.indexOf(b);
      return (ai !== -1 ? ai : 99) - (bi !== -1 ? bi : 99);
    });

    const blocks = sorted.map(method => {
      const inner = groupedSections[method]
        .map(sec => renderSection(sec, method, courseData.session, courseData.code)).join('');
      return `
        <div class="section-column">
          <h3>${method}</h3>
          ${inner}
        </div>
      `;
    });

    return `
      <div class="course" data-course-code="${courseData.code}" data-course-session="${courseData.session}">
        <h2>${courseData.code}${courseData.session}: ${courseData.name}</h2>
        <hr>
        <p><strong>Description:</strong> ${courseData.desc}</p>
        <div class="section-columns">${blocks.join('')}</div>
      </div>
    `;
}

// -- search box handling -- 
const input = document.getElementById('courseCodeInput');
const suggestionBox = document.getElementById('suggestions');
let debounceTimer = null;

input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = input.value.trim();

  if (!query) {
    suggestionBox.innerHTML = '';
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      // calls perl script to fetch data
      const res = await fetch(`/cgi-bin/api.cgi.bat?search=${encodeURIComponent(query)}`);
      const data = await res.json();

      // loads first 20 suggestions
      const suggestions = (data.payload?.codesAndTitles || []).slice(0, 20);
      suggestionBox.innerHTML = suggestions.map(c =>
        `<div class="suggestion-item" data-code="${c.code}" data-session="${c.sectionCode}">
          ${c.code}${c.sectionCode} - ${c.name}
        </div>`
      ).join('');
    } catch (err) {
      console.error('Search fetch failed:', err);
    }
  }, 300);
});

// gets course info on click
suggestionBox.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('suggestion-item')) return;

    const code = e.target.dataset.code;
    const session = e.target.dataset.session;

    input.value = `${code}${session}`;
    suggestionBox.innerHTML = '';

    const xml = await getData(code, session);
    await main(xml);
});

// -- meeting tifme selection handler -- 
document.addEventListener('click', (e) => {
  const meetingLine = e.target.closest('.meeting-line');
  const sectionLine = e.target.closest('.section-line');

  // individual meetings
  if (meetingLine) {
    // add to selectedMeetings
    const sectionDiv = meetingLine.closest('.section');
    const courseDiv = meetingLine.closest('.course');

    const courseCode = courseDiv.dataset.courseCode;
    const courseSession = courseDiv.dataset.courseSession;
    const sectionName = meetingLine.dataset.sectionName;
    const meetingId = meetingLine.dataset.id;

    const start = parseInt(meetingLine.dataset.start);
    const end = parseInt(meetingLine.dataset.end);
    const day = parseInt(meetingLine.dataset.day);
    const term = meetingLine.dataset.term;
    const building = meetingLine.dataset.building || '';

    const isCurrentlySelected = meetingLine.classList.contains('selected');

    selectedMeetings[courseCode] = selectedMeetings[courseCode] || {};
    ensureCourseColor(courseCode, term, courseSession);

    // toggle selection status
    if (!isCurrentlySelected) {
      meetingLine.classList.add('selected');
      selectedMeetings[courseCode][meetingId] = {
        sessionCode: courseSession,
        sectionCode: sectionName,
        start,
        end,
        day,
        term,
        building,
      };
    } else {
      meetingLine.classList.remove('selected');
      delete selectedMeetings[courseCode][meetingId];

      cleanupCourseIfEmpty(courseCode);
    }
    // rendering
    updateSectionBolding(sectionDiv);
    renderSelectedMeetings();
    return;
  }

  // entire section
  if (sectionLine) {
    // add to selectedMeetings
    const sectionDiv = sectionLine.closest('.section');
    const courseDiv = sectionLine.closest('.course');

    const courseCode = courseDiv.dataset.courseCode;
    const courseSession = courseDiv.dataset.courseSession;
    const sectionName = sectionLine.dataset.sectionName;

    const isSelected = sectionLine.classList.contains('selected');
    const allMeetingLines = Array.from(sectionDiv.querySelectorAll(`.meeting-line[data-section-name="${sectionName}"]`));

    selectedMeetings[courseCode] = selectedMeetings[courseCode] || {};

    // toggle selection status
    if (!isSelected) {
      sectionLine.classList.add('selected');
      allMeetingLines.forEach(line => {
        const term = line.dataset.term;
        ensureCourseColor(courseCode, term, courseSession);
        line.classList.add('selected');
        selectedMeetings[courseCode][line.dataset.id] = {
          sessionCode: courseSession,
          sectionCode: sectionName,
          start: parseInt(line.dataset.start),
          end: parseInt(line.dataset.end),
          day: parseInt(line.dataset.day),
          term: line.dataset.term,
          building: line.dataset.building || '',
        };
      });
    } else {
      sectionLine.classList.remove('selected');
      allMeetingLines.forEach(line => {
        line.classList.remove('selected');
        delete selectedMeetings[courseCode][line.dataset.id];
      });
      cleanupCourseIfEmpty(courseCode);
    }
    // rendering
    renderSelectedMeetings();
  }
});

// -- meeting rendering on timetable -- 
function renderSelectedMeetings() {
  // reinitialization
  document.querySelectorAll('.meeting-block').forEach(el => el.remove());
  const cellHeightPx = 25;
  const timetableStartMs = 8 * 3600000;
  const allBlocks = [];

  for (const courseCode in selectedMeetings) {
    for (const meetingId in selectedMeetings[courseCode]) {
      if (meetingId === '_color') continue;
      const meeting = selectedMeetings[courseCode][meetingId];
      const { start, end, day, term } = meeting;
      const color = selectedMeetings[courseCode]._color?.[term] || '#999999';

      allBlocks.push({
        ...meeting,
        id: meetingId,
        courseCode,
        color,
        startOffset: (start - timetableStartMs) / 1800000,
        duration: (end - start) / 1800000,
        dayIndex: day - 1,
        term
      });
    }
  }

  const byTermAndDay = { fall: [[], [], [], [], []], winter: [[], [], [], [], []] };

  allBlocks.forEach(block => {
    /**
    if (!byTermAndDay.hasOwnProperty(block.term)) {
      console.warn('Invalid term in meeting:', block.term);
      return;
    }
    if (typeof block.dayIndex !== 'number' || isNaN(block.dayIndex) || block.dayIndex < 0 || block.dayIndex >= 5) {
      console.warn('Invalid dayIndex in meeting:', block.dayIndex, block);
      return;
    }
    */
    byTermAndDay[block.term][block.dayIndex].push(block);
  });

  // conflict grouping
  for (const term of ['fall', 'winter']) {
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const blocks = byTermAndDay[term][dayIndex];
      const conflictGroups = [];

      blocks.sort((a, b) => a.start - b.start);
      for (const block of blocks) {
        let addedToGroup = false;
        for (const group of conflictGroups) {
          if (group.some(b => isOverlap(b, block))) {
            group.push(block);
            addedToGroup = true;
            break;
          }
        }
        if (!addedToGroup) {
          conflictGroups.push([block]);
        }
      }

      for (const group of conflictGroups) {
        // renders each meeting
        group.forEach((block, index) => {
          const containerId = `${block.term}-timetable`;
          const container = document.getElementById(containerId);
          const columnWidth = (container.clientWidth - 50) / 5;

          const blockDiv = document.createElement('div');
          blockDiv.className = 'meeting-block';

          const isConflict = group.length > 1;
          const color = isConflict ? '#CC3939' : block.color;
          const textColor = (color === '#992626' || color === '#CC3939') ? '#FFFDE6' : '#131210';

          blockDiv.innerHTML = `
            ${isConflict ? `<div class="block-content">CONFLICT ${block.courseCode}${block.sessionCode}</div>` : `${block.courseCode}${block.sessionCode} · ${block.sectionCode}<br>${block.building}`}
            <div class="remove-button" data-id="${block.id}" data-course="${block.courseCode}">×</div>
          `;

          // styling
          blockDiv.style.position = 'absolute';
          blockDiv.style.top = `${block.startOffset * cellHeightPx + cellHeightPx}px`;
          blockDiv.style.height = `${block.duration * cellHeightPx - 1}px`;
          blockDiv.style.left = `${50 + (dayIndex * columnWidth + index * (columnWidth / group.length))}px`;
          blockDiv.style.width = `${(columnWidth / group.length) - 1}px`;
          blockDiv.style.backgroundColor = color;
          blockDiv.style.color = textColor;

          const removeButton = blockDiv.querySelector('.remove-button');
          if (removeButton) {
            removeButton.style.backgroundColor = color;
            removeButton.style.color = textColor;
          }

          container.style.position = 'relative';
          container.appendChild(blockDiv);
        });
      }
    }
  }
}

// -- removal button handling -- 
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.remove-button');
  if (!removeBtn) return;
  const meetingId = removeBtn.dataset.id;
  const courseCode = removeBtn.dataset.course;

  if (selectedMeetings[courseCode] && selectedMeetings[courseCode][meetingId]) {
    delete selectedMeetings[courseCode][meetingId];
    cleanupCourseIfEmpty(courseCode);

    const line = document.querySelector(`.meeting-line[data-id="${meetingId}"]`);
    if (line) {
      line.classList.remove('selected');

      const sectionDiv = line.closest('.section');
      if (sectionDiv) updateSectionBolding(sectionDiv);
    }
    renderSelectedMeetings();
  }
});

// -- save/load --
function exportSelectedMeetings() {
  try {
    const compressed = btoa(JSON.stringify(selectedMeetings));
    document.getElementById('importExportField').value = compressed;
  } catch (e) {
    alert('Failed to export');
  }
}

function importSelectedMeetings() {
  try {
    const field = document.getElementById('importExportField');
    const decoded = atob(field.value);
    const imported = JSON.parse(decoded);

    for (const courseCode in imported) {
      if (!selectedMeetings[courseCode]) {
        selectedMeetings[courseCode] = {};
      }
      Object.assign(selectedMeetings[courseCode], imported[courseCode]);
    }

    // render all course selections
    for (const courseCode in imported) {
      applyIndividualMeetingSelectionsToDOM(courseCode);
      updateSectionBoldingForCourse(courseCode);
    }

    renderSelectedMeetings();
  } catch (e) {
    alert('Invalid import');
  }
}

document.getElementById('exportBtn').addEventListener('click', exportSelectedMeetings);
document.getElementById('importBtn').addEventListener('click', importSelectedMeetings);

