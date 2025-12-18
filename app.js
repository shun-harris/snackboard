// ============================================
// Data Models & State
// ============================================

const STORAGE_KEY = 'snackboard_v1';
const DEFAULT_LABELS = ['Studio', 'CRM', 'SBKZ', 'Music', 'Course'];
const SIZE_OPTIONS = [1, 5, 15, 30];
const COLUMNS = ['backlog', 'ready', 'doing', 'done'];
const COLUMN_NAMES = {
    'backlog': 'Later',
    'ready': 'Next',
    'doing': 'Now',
    'done': 'Done'
};

let state = {
    projects: [],
    tasks: [],
    activeTimerTaskId: null,
    timerStartTime: null,
    timerElapsed: 0,
    selectedProjectId: 'all',
    labelFilters: [],
    sizeFilters: [],
    allLabels: [...DEFAULT_LABELS],
    currentTaskId: null,
    currentProjectId: null,
    currentAreaForMenu: null,
    activeOnly: false,
    statsSidebarOpen: false,
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false
};

// ============================================
// Storage
// ============================================

function saveState() {
    const dataToSave = {
        projects: state.projects,
        tasks: state.tasks,
        allLabels: state.allLabels,
        activeTimerTaskId: state.activeTimerTaskId,
        timerStartTime: state.timerStartTime,
        timerElapsed: state.timerElapsed,
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        rightSidebarCollapsed: state.rightSidebarCollapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.projects = data.projects || [];
            state.tasks = data.tasks || [];
            state.allLabels = data.allLabels || [...DEFAULT_LABELS];
            state.activeTimerTaskId = data.activeTimerTaskId || null;
            state.timerStartTime = data.timerStartTime || null;
            state.timerElapsed = data.timerElapsed || 0;
            state.leftSidebarCollapsed = data.leftSidebarCollapsed || false;
            state.rightSidebarCollapsed = data.rightSidebarCollapsed || false;
            
            // Ensure all tasks have the new fields
            state.tasks = state.tasks.map(task => ({
                ...task,
                aiPrompt: task.aiPrompt || '',
                isPromptOnly: task.isPromptOnly || false
            }));
        } catch (e) {
            console.error('Failed to load state', e);
        }
    }
    
    // Apply sidebar states
    applySidebarStates();
}

function applySidebarStates() {
    const appContainer = document.querySelector('.app-container');
    const projectsSidebar = document.getElementById('projectsSidebar');
    const statsSidebar = document.getElementById('statsSidebar');
    const projectsBtn = document.getElementById('projectsCollapseBtn');
    const statsBtn = document.getElementById('statsCollapseBtn');
    
    // Update classes
    if (state.leftSidebarCollapsed) {
        projectsSidebar.classList.add('collapsed');
        projectsBtn.textContent = '▶';
    } else {
        projectsSidebar.classList.remove('collapsed');
        projectsBtn.textContent = '◀';
    }
    
    if (state.rightSidebarCollapsed) {
        statsSidebar.classList.add('collapsed');
        statsBtn.textContent = '◀';
    } else {
        statsSidebar.classList.remove('collapsed');
        statsBtn.textContent = '▶';
    }
    
    // Update app container class
    appContainer.classList.remove('left-collapsed', 'right-collapsed', 'both-collapsed');
    if (state.leftSidebarCollapsed && state.rightSidebarCollapsed) {
        appContainer.classList.add('both-collapsed');
    } else if (state.leftSidebarCollapsed) {
        appContainer.classList.add('left-collapsed');
    } else if (state.rightSidebarCollapsed) {
        appContainer.classList.add('right-collapsed');
    }
}

// ============================================
// Utility Functions
// ============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}

function formatMinutes(minutes) {
    if (!minutes || minutes === 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
}

// ============================================
// Project Functions
// ============================================

function createProject(name, color = '#6366f1', notes = '', primaryArea = null) {
    const project = {
        id: generateId(),
        name,
        color,
        notes,
        primaryArea,
        createdAt: Date.now()
    };
    state.projects.push(project);
    saveState();
    return project;
}

function updateProject(id, updates) {
    const project = state.projects.find(p => p.id === id);
    if (project) {
        Object.assign(project, updates);
        saveState();
    }
}

function deleteProject(id) {
    state.projects = state.projects.filter(p => p.id !== id);
    // Unlink tasks from deleted project
    state.tasks.forEach(task => {
        if (task.projectId === id) {
            task.projectId = null;
        }
    });
    if (state.selectedProjectId === id) {
        state.selectedProjectId = 'all';
    }
    saveState();
}

function getProjectStats(projectId) {
    const tasks = state.tasks.filter(t => t.projectId === projectId && !t.isPromptOnly);
    const totalEstimate = tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
    const totalActual = tasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
    return { totalEstimate, totalActual };
}

// ============================================
// Task Functions
// ============================================

function createTask(title, projectId = null, columnId = 'backlog') {
    const task = {
        id: generateId(),
        title,
        projectId,
        sizeId: 5,
        estimateMinutes: 5,
        actualMinutes: 0,
        labels: [],
        notes: '',
        aiPrompt: '',
        isPromptOnly: false,
        columnId,
        createdAt: Date.now(),
        timeEntries: []
    };
    
    // Auto-add project's primary area
    if (projectId) {
        const project = state.projects.find(p => p.id === projectId);
        if (project && project.primaryArea) {
            task.labels = [project.primaryArea];
        }
    }
    
    state.tasks.push(task);
    saveState();
    return task;
}

function updateTask(id, updates) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        Object.assign(task, updates);
        saveState();
    }
}

function deleteTask(id) {
    if (state.activeTimerTaskId === id) {
        stopTimer();
    }
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
}

function moveTask(taskId, newColumnId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        task.columnId = newColumnId;
        saveState();
    }
}

function getFilteredTasks() {
    let tasks = state.tasks;
    
    // Filter by project
    if (state.selectedProjectId !== 'all') {
        tasks = tasks.filter(t => t.projectId === state.selectedProjectId);
    }
    
    // Filter by labels
    if (state.labelFilters.length > 0) {
        tasks = tasks.filter(t => 
            state.labelFilters.some(label => t.labels.includes(label))
        );
    }
    
    // Filter by size
    if (state.sizeFilters.length > 0) {
        tasks = tasks.filter(t => state.sizeFilters.includes(t.sizeId));
    }
    
    // Filter active only (hide done tasks)
    if (state.activeOnly) {
        tasks = tasks.filter(t => t.columnId !== 'done');
    }
    
    return tasks;
}

// ============================================
// Area Management Functions
// ============================================

function addArea(areaName) {
    const trimmed = areaName.trim();
    if (!trimmed) return false;
    
    if (!state.allLabels.includes(trimmed)) {
        state.allLabels.push(trimmed);
        saveState();
        return true;
    }
    return false;
}

function renameArea(oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return false;
    
    // Check if new name already exists
    if (state.allLabels.includes(trimmed) && oldName !== trimmed) {
        return false;
    }
    
    // Update area name in the list
    const index = state.allLabels.indexOf(oldName);
    if (index > -1) {
        state.allLabels[index] = trimmed;
    }
    
    // Update all tasks that use this area
    state.tasks.forEach(task => {
        if (task.labels.includes(oldName)) {
            const labelIndex = task.labels.indexOf(oldName);
            task.labels[labelIndex] = trimmed;
        }
    });
    
    // Update all projects that use this as primary area
    state.projects.forEach(project => {
        if (project.primaryArea === oldName) {
            project.primaryArea = trimmed;
        }
    });
    
    // Update filter if it's active
    const filterIndex = state.labelFilters.indexOf(oldName);
    if (filterIndex > -1) {
        state.labelFilters[filterIndex] = trimmed;
    }
    
    saveState();
    return true;
}

function deleteArea(areaName) {
    // Remove from area list
    state.allLabels = state.allLabels.filter(label => label !== areaName);
    
    // Remove from all tasks
    state.tasks.forEach(task => {
        task.labels = task.labels.filter(label => label !== areaName);
    });
    
    // Remove from projects' primary area
    state.projects.forEach(project => {
        if (project.primaryArea === areaName) {
            project.primaryArea = null;
        }
    });
    
    // Remove from active filters
    state.labelFilters = state.labelFilters.filter(label => label !== areaName);
    
    saveState();
}

// ============================================
// CSV Import Functions
// ============================================

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function importTasksFromCSV(csvText, projectId) {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        return { success: false, message: 'CSV must have at least a header and one data row' };
    }
    
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const requiredFields = ['title', 'focus', 'size', 'column'];
    const hasAllFields = requiredFields.every(field => header.includes(field));
    
    if (!hasAllFields) {
        return { success: false, message: 'CSV header must be: Title,Focus,Size,Column (optional: Type)' };
    }
    
    const titleIndex = header.indexOf('title');
    const areaIndex = header.indexOf('focus');
    const sizeIndex = header.indexOf('size');
    const columnIndex = header.indexOf('column');
    const typeIndex = header.indexOf('type'); // Optional
    
    let imported = 0;
    let skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        
        const title = values[titleIndex]?.trim();
        if (!title) {
            skipped++;
            continue;
        }
        
        const areaText = values[areaIndex]?.trim();
        const sizeText = values[sizeIndex]?.trim().toLowerCase();
        const columnText = values[columnIndex]?.trim().toLowerCase();
        const typeText = typeIndex >= 0 ? values[typeIndex]?.trim().toLowerCase() : '';
        
        // Check if prompt-only task
        const isPromptOnly = typeText === 'prompt';
        
        // Parse size (only for non-prompt tasks)
        let sizeId = 5;
        if (!isPromptOnly) {
            const sizeMatch = sizeText.match(/(\d+)m?/);
            if (sizeMatch) {
                const parsedSize = parseInt(sizeMatch[1]);
                if ([1, 5, 15, 30].includes(parsedSize)) {
                    sizeId = parsedSize;
                }
            }
        }
        
        // Parse column
        let columnId = 'backlog';
        const columnMap = {
            'later': 'backlog',
            'next': 'ready',
            'now': 'doing',
            'done': 'done'
        };
        if (columnMap[columnText]) {
            columnId = columnMap[columnText];
        }
        
        // Create task
        const task = createTask(title, projectId, columnId);
        task.isPromptOnly = isPromptOnly;
        
        if (!isPromptOnly) {
            task.sizeId = sizeId;
            task.estimateMinutes = sizeId;
        }
        
        // Add area
        if (areaText) {
            if (!state.allLabels.includes(areaText)) {
                state.allLabels.push(areaText);
            }
            task.labels = [areaText];
        }
        
        imported++;
    }
    
    saveState();
    return { 
        success: true, 
        message: `Imported ${imported} task${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}` 
    };
}

// ============================================
// Timer Functions
// ============================================

function startTimer(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Don't allow timer on prompt-only tasks
    if (task.isPromptOnly) {
        showToast('Cannot start timer on prompt-only tasks', 'error');
        return;
    }
    
    // Stop any active timer first
    if (state.activeTimerTaskId) {
        stopTimer();
    }
    
    // Add ripple effect to button
    const btn = document.querySelector(`[data-task-id="${taskId}"].task-timer-btn`);
    if (btn) {
        btn.classList.add('ripple-effect');
        setTimeout(() => btn.classList.remove('ripple-effect'), 600);
    }
    
    state.activeTimerTaskId = taskId;
    state.timerStartTime = Date.now();
    state.timerElapsed = 0;
    
    // Move task to Doing
    if (task.columnId !== 'doing') {
        task.columnId = 'doing';
    }
    
    saveState();
    updateTimerBar();
    render();
}

function stopTimer() {
    if (!state.activeTimerTaskId) return;
    
    const task = state.tasks.find(t => t.id === state.activeTimerTaskId);
    if (task) {
        const elapsed = state.timerElapsed;
        const minutesToAdd = Math.round(elapsed / 60);
        
        task.actualMinutes = (task.actualMinutes || 0) + minutesToAdd;
        
        // Add time entry for today's stats
        if (!task.timeEntries) task.timeEntries = [];
        task.timeEntries.push({
            date: Date.now(),
            minutes: minutesToAdd
        });
    }
    
    state.activeTimerTaskId = null;
    state.timerStartTime = null;
    state.timerElapsed = 0;
    
    saveState();
    updateTimerBar();
    render();
}

function updateTimerBar() {
    const timerBar = document.getElementById('timerBar');
    const timerTaskTitle = document.getElementById('timerTaskTitle');
    const timerElapsed = document.getElementById('timerElapsed');
    
    if (state.activeTimerTaskId) {
        const task = state.tasks.find(t => t.id === state.activeTimerTaskId);
        if (task) {
            timerBar.classList.remove('hidden');
            timerTaskTitle.textContent = task.title;
            
            const elapsed = state.timerElapsed;
            timerElapsed.textContent = formatTime(elapsed);
        }
    } else {
        timerBar.classList.add('hidden');
    }
}

// Timer tick
setInterval(() => {
    if (state.activeTimerTaskId && state.timerStartTime) {
        const now = Date.now();
        const totalElapsed = Math.floor((now - state.timerStartTime) / 1000);
        state.timerElapsed = totalElapsed;
        updateTimerBar();
    }
}, 1000);

// ============================================
// Stats Functions
// ============================================

function getTodayStats() {
    const todayTimestamp = getToday();
    
    let totalMinutes = 0;
    let estimateMinutes = 0;
    const byLabel = {};
    const byProject = {};
    
    state.tasks.forEach(task => {
        // Skip prompt-only tasks in stats
        if (task.isPromptOnly) return;
        if (!task.timeEntries) return;
        
        task.timeEntries.forEach(entry => {
            const entryDate = new Date(entry.date);
            entryDate.setHours(0, 0, 0, 0);
            
            if (entryDate.getTime() === todayTimestamp) {
                totalMinutes += entry.minutes;
                estimateMinutes += task.estimateMinutes || 0;
                
                // By label
                task.labels.forEach(label => {
                    byLabel[label] = (byLabel[label] || 0) + entry.minutes;
                });
                
                // By project
                if (task.projectId) {
                    const project = state.projects.find(p => p.id === task.projectId);
                    if (project) {
                        byProject[project.name] = (byProject[project.name] || 0) + entry.minutes;
                    }
                }
            }
        });
    });
    
    return { totalMinutes, estimateMinutes, byLabel, byProject };
}

// ============================================
// Render Functions
// ============================================

function renderProjects() {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';
    
    state.projects.forEach(project => {
        const stats = getProjectStats(project.id);
        const div = document.createElement('div');
        div.className = 'project-item';
        if (state.selectedProjectId === project.id) {
            div.classList.add('active');
        }
        div.dataset.projectId = project.id;
        
        let areaTag = '';
        if (project.primaryArea) {
            areaTag = `<span class="project-area-tag" style="border-color: ${project.color}">${project.primaryArea}</span>`;
        }
        
        div.innerHTML = `
            <div class="project-info">
                <span class="project-dot" style="background-color: ${project.color}"></span>
                <span class="project-name">${project.name}</span>
                ${areaTag}
            </div>
            <div class="project-stats">Est: ${formatMinutes(stats.totalEstimate)} · Actual: ${formatMinutes(stats.totalActual)}</div>
        `;
        
        div.addEventListener('click', () => selectProject(project.id));
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openProjectModal(project.id);
        });
        
        projectsList.appendChild(div);
    });
}

function renderTasks() {
    const tasks = getFilteredTasks();
    
    COLUMNS.forEach(columnId => {
        const container = document.getElementById(`${columnId}-tasks`);
        container.innerHTML = '';
        
        const columnTasks = tasks.filter(t => t.columnId === columnId);
        
        // Update count
        const column = container.closest('.kanban-column');
        column.querySelector('.task-count').textContent = columnTasks.length;
        
        columnTasks.forEach(task => {
            const card = createTaskCard(task);
            container.appendChild(card);
        });
    });
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskId = task.id;
    card.draggable = true;
    
    const project = task.projectId ? state.projects.find(p => p.id === task.projectId) : null;
    const isActive = state.activeTimerTaskId === task.id;
    const isPromptOnly = task.isPromptOnly;
    
    let metaHTML = '<div class="task-meta">';
    
    if (project) {
        metaHTML += `
            <span class="task-project-tag">
                <span class="task-project-dot" style="background-color: ${project.color}"></span>
                ${project.name}
            </span>
        `;
    }
    
    // Show prompt pill for prompt-only tasks
    if (isPromptOnly) {
        metaHTML += `<span class="task-prompt-pill">📝 Prompt</span>`;
    } else {
        // Show size for normal tasks
        metaHTML += `<span class="task-size-badge">${task.sizeId}m</span>`;
    }
    
    task.labels.forEach(label => {
        metaHTML += `<span class="task-label">${label}</span>`;
    });
    
    if (!isPromptOnly && task.actualMinutes > 0) {
        metaHTML += `<span class="task-actual">${formatMinutes(task.actualMinutes)} logged</span>`;
    }
    
    metaHTML += '</div>';
    
    // Build header with timer button or copy button based on task type
    let headerButtonHTML = '';
    if (isPromptOnly && task.aiPrompt) {
        headerButtonHTML = `<button class="task-copy-btn" data-task-id="${task.id}">📋</button>`;
    } else if (!isPromptOnly) {
        headerButtonHTML = `<button class="task-timer-btn ${isActive ? 'active' : ''}" data-task-id="${task.id}">
            ${isActive ? '⏸' : '▶'}
        </button>`;
    }
    
    card.innerHTML = `
        <div class="task-card-header">
            <div class="task-title">${task.title}</div>
            ${headerButtonHTML}
        </div>
        ${metaHTML}
    `;
    
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.task-timer-btn') && !e.target.closest('.task-copy-btn')) {
            openTaskModal(task.id);
        }
    });
    
    // Handle timer button for normal tasks
    const timerBtn = card.querySelector('.task-timer-btn');
    if (timerBtn) {
        timerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isActive) {
                stopTimer();
            } else {
                startTimer(task.id);
            }
        });
    }
    
    // Handle copy button for prompt tasks
    const copyBtn = card.querySelector('.task-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (task.aiPrompt) {
                const success = await copyToClipboard(task.aiPrompt);
                if (success) {
                    showToast('Prompt copied to clipboard!');
                } else {
                    showToast('Failed to copy prompt', 'error');
                }
            }
        });
    }
    
    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    return card;
}

function renderFilters() {
    // Helper function to render label chips
    function renderLabelChips(container) {
        container.innerHTML = '';
        state.allLabels.forEach(label => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            if (state.labelFilters.includes(label)) {
                chip.classList.add('active');
            }
            
            const labelText = document.createElement('span');
            labelText.textContent = label;
            chip.appendChild(labelText);
            
            const menuBtn = document.createElement('button');
            menuBtn.className = 'filter-chip-menu-btn';
            menuBtn.innerHTML = '⋮';
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAreaMenu(label, e);
            });
            chip.appendChild(menuBtn);
            
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('.filter-chip-menu-btn')) {
                    toggleLabelFilter(label);
                }
            });
            
            container.appendChild(chip);
        });
    }
    
    // Helper function to render size chips
    function renderSizeChips(container) {
        container.innerHTML = '';
        SIZE_OPTIONS.forEach(size => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            if (state.sizeFilters.includes(size)) {
                chip.classList.add('active');
            }
            chip.textContent = `${size}m`;
            chip.addEventListener('click', () => toggleSizeFilter(size));
            container.appendChild(chip);
        });
    }
    
    // Desktop filters
    const labelFiltersContainer = document.getElementById('labelFiltersContainer');
    if (labelFiltersContainer) renderLabelChips(labelFiltersContainer);
    
    const sizeFilters = document.getElementById('sizeFilters');
    if (sizeFilters) renderSizeChips(sizeFilters);
    
    // Mobile filters
    const mobileLabelsContainer = document.getElementById('mobileLabelsContainer');
    if (mobileLabelsContainer) renderLabelChips(mobileLabelsContainer);
    
    const mobileSizeFilters = document.getElementById('mobileSizeFilters');
    if (mobileSizeFilters) renderSizeChips(mobileSizeFilters);
    
    // Show/hide import button
    const importBtn = document.getElementById('importTasksBtn');
    if (state.selectedProjectId !== 'all') {
        importBtn.classList.remove('hidden');
    } else {
        importBtn.classList.add('hidden');
    }
}

function renderStats() {
    const stats = getTodayStats();
    
    // Total time today
    document.getElementById('totalTimeToday').textContent = formatMinutes(stats.totalMinutes);
    
    // Estimate vs Actual
    const estimateVsActual = document.getElementById('estimateVsActual');
    if (stats.estimateMinutes > 0 && stats.totalMinutes > 0) {
        const diff = ((stats.totalMinutes - stats.estimateMinutes) / stats.estimateMinutes * 100).toFixed(0);
        const sign = diff > 0 ? '+' : '';
        estimateVsActual.textContent = `${sign}${diff}%`;
        estimateVsActual.style.color = diff > 0 ? 'var(--warning)' : 'var(--success)';
    } else {
        estimateVsActual.textContent = '-';
        estimateVsActual.style.color = 'var(--text-secondary)';
    }
    
    // By label
    const byLabelContainer = document.getElementById('statsByLabel');
    byLabelContainer.innerHTML = '';
    Object.entries(stats.byLabel).sort((a, b) => b[1] - a[1]).forEach(([label, minutes]) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <span class="stat-item-label">${label}</span>
            <span class="stat-item-value">${formatMinutes(minutes)}</span>
        `;
        byLabelContainer.appendChild(item);
    });
    
    // By project
    const byProjectContainer = document.getElementById('statsByProject');
    byProjectContainer.innerHTML = '';
    Object.entries(stats.byProject).sort((a, b) => b[1] - a[1]).forEach(([projectName, minutes]) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <span class="stat-item-label">${projectName}</span>
            <span class="stat-item-value">${formatMinutes(minutes)}</span>
        `;
        byProjectContainer.appendChild(item);
    });
    
    // Selected project stats
    if (state.selectedProjectId !== 'all') {
        const project = state.projects.find(p => p.id === state.selectedProjectId);
        if (project) {
            const projectStats = getProjectStats(project.id);
            const selectedProjectStats = document.getElementById('selectedProjectStats');
            const projectStatsContent = document.getElementById('projectStatsContent');
            
            selectedProjectStats.classList.remove('hidden');
            projectStatsContent.innerHTML = `
                <div class="stat-item">
                    <span class="stat-item-label">Estimated</span>
                    <span class="stat-item-value">${formatMinutes(projectStats.totalEstimate)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Actual</span>
                    <span class="stat-item-value">${formatMinutes(projectStats.totalActual)}</span>
                </div>
            `;
        }
    } else {
        document.getElementById('selectedProjectStats').classList.add('hidden');
    }
}

function render() {
    renderProjects();
    renderTasks();
    renderFilters();
    renderStats();
}

// ============================================
// Drag and Drop
// ============================================

let draggedTaskId = null;

function handleDragStart(e) {
    draggedTaskId = e.target.dataset.taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTaskId = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    if (e.target.classList.contains('column-tasks')) {
        e.target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    if (e.target.classList.contains('column-tasks')) {
        e.target.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const container = e.target.closest('.column-tasks');
    if (container) {
        container.classList.remove('drag-over');
        const columnId = container.id.replace('-tasks', '');
        if (draggedTaskId) {
            moveTask(draggedTaskId, columnId);
            render();
            
            // Add drop animation
            setTimeout(() => {
                const droppedCard = container.querySelector(`[data-task-id="${draggedTaskId}"]`);
                if (droppedCard) {
                    droppedCard.classList.add('task-dropping');
                    setTimeout(() => droppedCard.classList.remove('task-dropping'), 300);
                }
            }, 10);
            
            // Animate counter
            const column = container.closest('.kanban-column');
            const counter = column.querySelector('.task-count');
            counter.classList.add('count-updated');
            setTimeout(() => counter.classList.remove('count-updated'), 400);
        }
    }
}

// ============================================
// Area Menu & Modal Functions
// ============================================

function showAreaMenu(areaName, event) {
    const menu = document.getElementById('areaMenuModal');
    state.currentAreaForMenu = areaName;
    
    // Position menu
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.classList.remove('hidden');
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeAreaMenu, { once: true });
    }, 0);
}

function closeAreaMenu() {
    document.getElementById('areaMenuModal').classList.add('hidden');
}

function openAddAreaModal() {
    document.getElementById('addAreaModal').classList.remove('hidden');
    document.getElementById('newAreaName').value = '';
    document.getElementById('newAreaName').focus();
}

function closeAddAreaModal() {
    document.getElementById('addAreaModal').classList.add('hidden');
}

function saveAddArea() {
    const name = document.getElementById('newAreaName').value.trim();
    if (name) {
        const success = addArea(name);
        if (success) {
            closeAddAreaModal();
            render();
        } else {
            alert('Focus already exists');
        }
    }
}

function openRenameAreaModal() {
    closeAreaMenu();
    const modal = document.getElementById('renameAreaModal');
    modal.classList.remove('hidden');
    document.getElementById('renameAreaName').value = state.currentAreaForMenu;
    document.getElementById('renameAreaName').focus();
    document.getElementById('renameAreaName').select();
}

function closeRenameAreaModal() {
    document.getElementById('renameAreaModal').classList.add('hidden');
}

function saveRenameArea() {
    const newName = document.getElementById('renameAreaName').value.trim();
    if (newName) {
        const success = renameArea(state.currentAreaForMenu, newName);
        if (success) {
            closeRenameAreaModal();
            render();
        } else {
            alert('Focus name already exists or is invalid');
        }
    }
}

function confirmDeleteArea() {
    closeAreaMenu();
    if (confirm(`Delete focus "${state.currentAreaForMenu}"? Tasks will not be deleted, just unlinked from this focus.`)) {
        deleteArea(state.currentAreaForMenu);
        render();
    }
}

function openImportModal() {
    document.getElementById('importTasksModal').classList.remove('hidden');
    document.getElementById('importCSV').value = '';
    document.getElementById('importResult').classList.add('hidden');
}

function closeImportModal() {
    document.getElementById('importTasksModal').classList.add('hidden');
}

function executeImport() {
    const csvText = document.getElementById('importCSV').value;
    const result = importTasksFromCSV(csvText, state.selectedProjectId);
    
    const resultDiv = document.getElementById('importResult');
    resultDiv.textContent = result.message;
    resultDiv.className = 'import-result ' + (result.success ? 'success' : 'error');
    resultDiv.classList.remove('hidden');
    
    if (result.success) {
        setTimeout(() => {
            closeImportModal();
            render();
        }, 1500);
    }
}

// ============================================
// Modal Functions
// ============================================

// Wizard state
let wizardCurrentStep = 1;
const wizardTotalSteps = 4;

function openTaskModal(taskId = null) {
    const modal = document.getElementById('taskModal');
    const isNew = !taskId;
    
    state.currentTaskId = taskId;
    
    if (isNew) {
        // Reset wizard to step 1
        wizardCurrentStep = 1;
        showWizardStep(1);
        
        // New task - clear form
        document.getElementById('modalTitle').textContent = 'Create Task';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskProject').value = state.selectedProjectId !== 'all' ? state.selectedProjectId : '';
        document.getElementById('taskSize').value = '5';
        document.getElementById('taskEstimate').value = '';
        document.getElementById('taskActual').value = '0';
        document.getElementById('taskColumn').value = 'doing';
        document.getElementById('taskNotes').value = '';
        document.getElementById('taskAiPrompt').value = '';
        document.getElementById('taskIsPromptOnly').checked = false;
        document.getElementById('taskLabels').innerHTML = '';
        document.getElementById('deleteTaskBtn').style.display = 'none';
        
        // Reset wizard buttons
        document.querySelectorAll('.wizard-toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.wizard-toggle-btn[data-prompt-type="timed"]')?.classList.add('active');
        document.querySelectorAll('.wizard-size-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.wizard-size-btn[data-size="5"]')?.classList.add('active');
        document.querySelectorAll('.wizard-column-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.wizard-column-btn[data-column="doing"]')?.classList.add('active');
    } else {
        // Edit task - skip wizard, show all fields
        const task = state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        wizardCurrentStep = wizardTotalSteps;
        showWizardStep(wizardTotalSteps);
        
        document.getElementById('modalTitle').textContent = 'Edit Task';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskProject').value = task.projectId || '';
        document.getElementById('taskSize').value = task.sizeId;
        document.getElementById('taskEstimate').value = task.estimateMinutes;
        document.getElementById('taskActual').value = task.actualMinutes;
        document.getElementById('taskColumn').value = task.columnId;
        document.getElementById('taskNotes').value = task.notes || '';
        document.getElementById('taskAiPrompt').value = task.aiPrompt || '';
        document.getElementById('taskIsPromptOnly').checked = task.isPromptOnly || false;
        
        // Sync visual buttons with values
        document.querySelectorAll('.wizard-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', 
                (task.isPromptOnly && btn.dataset.promptType === 'prompt') ||
                (!task.isPromptOnly && btn.dataset.promptType === 'timed')
            );
        });
        document.querySelectorAll('.wizard-size-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size == task.sizeId);
        });
        document.querySelectorAll('.wizard-column-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.column === task.columnId);
        });
        
        // Render labels
        const labelsContainer = document.getElementById('taskLabels');
        labelsContainer.innerHTML = '';
        task.labels.forEach(label => {
            const chip = createLabelChip(label);
            labelsContainer.appendChild(chip);
        });
        
        document.getElementById('deleteTaskBtn').style.display = 'block';
    }
    
    // Populate project dropdown
    const projectSelect = document.getElementById('taskProject');
    projectSelect.innerHTML = '<option value="">No project</option>';
    state.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });
    
    modal.classList.remove('hidden');
    
    // Focus first input
    setTimeout(() => document.getElementById('taskTitle')?.focus(), 100);
}

function showWizardStep(step) {
    // Update progress indicators
    document.querySelectorAll('.wizard-step').forEach((stepEl, index) => {
        const stepNum = index + 1;
        stepEl.classList.remove('active', 'completed');
        if (stepNum === step) {
            stepEl.classList.add('active');
        } else if (stepNum < step) {
            stepEl.classList.add('completed');
        }
    });
    
    // Show/hide panels
    document.querySelectorAll('.wizard-panel').forEach(panel => {
        panel.style.display = panel.dataset.panel == step ? 'block' : 'none';
    });
    
    // Update buttons
    const backBtn = document.getElementById('wizardBackBtn');
    const nextBtn = document.getElementById('wizardNextBtn');
    const saveBtn = document.getElementById('wizardSaveBtn');
    
    backBtn.style.display = step > 1 ? 'block' : 'none';
    nextBtn.style.display = step < wizardTotalSteps ? 'block' : 'none';
    saveBtn.style.display = step === wizardTotalSteps ? 'block' : 'none';
    
    // Skip step 2 for prompt-only tasks
    const isPromptOnly = document.getElementById('taskIsPromptOnly').checked;
    if (isPromptOnly && step === 2) {
        showWizardStep(step < wizardCurrentStep ? 1 : 3);
        return;
    }
    
    // Auto-focus appropriate element for keyboard navigation
    setTimeout(() => {
        const activePanel = document.querySelector(`.wizard-panel[data-panel="${step}"]`);
        if (activePanel) {
            // Focus first input or first button
            const firstInput = activePanel.querySelector('input[type="text"], textarea');
            const firstButton = activePanel.querySelector('.wizard-size-btn, .wizard-column-btn, .wizard-toggle-btn');
            
            if (firstInput && step === 1) {
                firstInput.focus();
                firstInput.select();
            } else if (firstButton) {
                firstButton.focus();
            }
        }
    }, 100);
}

function validateWizardStep(step) {
    if (step === 1) {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            showToast('Please enter a task title', 'error');
            document.getElementById('taskTitle').focus();
            return false;
        }
        
        // Skip step 2 if prompt-only
        const isPromptOnly = document.getElementById('taskIsPromptOnly').checked;
        if (isPromptOnly && wizardCurrentStep === 1) {
            wizardCurrentStep = 2; // Will skip to 3
        }
    }
    return true;
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    state.currentTaskId = null;
}

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) {
        alert('Please enter a task title');
        return;
    }
    
    const projectId = document.getElementById('taskProject').value || null;
    const isPromptOnly = document.getElementById('taskIsPromptOnly').checked;
    const columnId = document.getElementById('taskColumn').value;
    const notes = document.getElementById('taskNotes').value.trim();
    const aiPrompt = document.getElementById('taskAiPrompt').value.trim();
    
    const labels = Array.from(document.getElementById('taskLabels').children)
        .map(chip => chip.querySelector('.label-chip').textContent.slice(0, -2).trim());
    
    const updates = {
        title,
        projectId,
        columnId,
        notes,
        aiPrompt,
        isPromptOnly,
        labels
    };
    
    // Only include time fields for non-prompt tasks
    if (!isPromptOnly) {
        updates.sizeId = parseInt(document.getElementById('taskSize').value);
        updates.estimateMinutes = parseInt(document.getElementById('taskEstimate').value);
    }
    
    if (state.currentTaskId) {
        // Update existing task
        updateTask(state.currentTaskId, updates);
    } else {
        // Create new task
        const task = createTask(title, projectId, columnId);
        updateTask(task.id, updates);
    }
    
    // Update all labels list
    labels.forEach(label => {
        if (!state.allLabels.includes(label)) {
            state.allLabels.push(label);
        }
    });
    
    closeTaskModal();
    render();
}

function createLabelChip(label) {
    const chip = document.createElement('div');
    chip.innerHTML = `
        <span class="label-chip">
            ${label}
            <button class="label-remove" type="button">&times;</button>
        </span>
    `;
    chip.querySelector('.label-remove').addEventListener('click', () => {
        chip.remove();
    });
    return chip;
}

function openProjectModal(projectId = null) {
    const modal = document.getElementById('projectModal');
    const isNew = !projectId;
    
    state.currentProjectId = projectId;
    
    // Populate primary area dropdown
    const primaryAreaSelect = document.getElementById('projectPrimaryArea');
    primaryAreaSelect.innerHTML = '<option value="">No Area</option>';
    state.allLabels.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        primaryAreaSelect.appendChild(option);
    });
    
    if (isNew) {
        document.getElementById('projectModalTitle').textContent = 'New Project';
        document.getElementById('projectName').value = '';
        document.getElementById('projectColor').value = '#6366f1';
        document.getElementById('projectPrimaryArea').value = '';
        document.getElementById('projectNotes').value = '';
        document.getElementById('deleteProjectBtn').style.display = 'none';
    } else {
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;
        
        document.getElementById('projectModalTitle').textContent = 'Edit Project';
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectColor').value = project.color;
        document.getElementById('projectPrimaryArea').value = project.primaryArea || '';
        document.getElementById('projectNotes').value = project.notes || '';
        document.getElementById('deleteProjectBtn').style.display = 'block';
    }
    
    modal.classList.remove('hidden');
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.add('hidden');
    state.currentProjectId = null;
}

function saveProject() {
    const name = document.getElementById('projectName').value.trim();
    if (!name) {
        alert('Please enter a project name');
        return;
    }
    
    const color = document.getElementById('projectColor').value;
    const primaryArea = document.getElementById('projectPrimaryArea').value || null;
    const notes = document.getElementById('projectNotes').value.trim();
    
    if (state.currentProjectId) {
        updateProject(state.currentProjectId, { name, color, primaryArea, notes });
    } else {
        createProject(name, color, notes, primaryArea);
    }
    
    closeProjectModal();
    render();
}

// ============================================
// Filter Functions
// ============================================

function selectProject(projectId) {
    state.selectedProjectId = projectId;
    
    // Update UI
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-project-id="${projectId}"]`).classList.add('active');
    
    // Update board title (both desktop and mobile)
    let title = 'All Projects';
    if (projectId !== 'all') {
        const project = state.projects.find(p => p.id === projectId);
        if (project) {
            title = project.name;
        }
    }
    
    if (typeof window.syncTitles === 'function') {
        window.syncTitles(title);
    } else {
        document.getElementById('boardTitle').textContent = title;
        const mobileTitle = document.getElementById('mobileTitle');
        if (mobileTitle) mobileTitle.textContent = title;
    }
    
    // Close mobile drawer on selection
    const projectsSidebar = document.getElementById('projectsSidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    if (projectsSidebar) projectsSidebar.classList.remove('open');
    if (mobileOverlay) mobileOverlay.classList.remove('visible');
    
    render();
}

function toggleLabelFilter(label) {
    const index = state.labelFilters.indexOf(label);
    if (index > -1) {
        state.labelFilters.splice(index, 1);
    } else {
        state.labelFilters.push(label);
    }
    render();
}

function toggleSizeFilter(size) {
    const index = state.sizeFilters.indexOf(size);
    if (index > -1) {
        state.sizeFilters.splice(index, 1);
    } else {
        state.sizeFilters.push(size);
    }
    render();
}

// ============================================
// Event Listeners
// ============================================

function initEventListeners() {
    // New task button
    document.getElementById('newTaskBtn').addEventListener('click', () => openTaskModal());
    
    // New project button
    document.getElementById('newProjectBtn').addEventListener('click', () => openProjectModal());
    
    // All projects selector
    document.querySelector('[data-project-id="all"]').addEventListener('click', () => selectProject('all'));
    
    // Area management
    document.getElementById('addAreaBtn').addEventListener('click', openAddAreaModal);
    document.getElementById('cancelAddAreaBtn').addEventListener('click', closeAddAreaModal);
    document.getElementById('saveAddAreaBtn').addEventListener('click', saveAddArea);
    document.querySelector('#addAreaModal .modal-close').addEventListener('click', closeAddAreaModal);
    
    document.getElementById('renameAreaMenuItem').addEventListener('click', openRenameAreaModal);
    document.getElementById('deleteAreaMenuItem').addEventListener('click', confirmDeleteArea);
    document.getElementById('cancelRenameAreaBtn').addEventListener('click', closeRenameAreaModal);
    document.getElementById('saveRenameAreaBtn').addEventListener('click', saveRenameArea);
    document.querySelector('#renameAreaModal .modal-close').addEventListener('click', closeRenameAreaModal);
    
    // Import tasks
    document.getElementById('importTasksBtn').addEventListener('click', openImportModal);
    document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);
    document.getElementById('executeImportBtn').addEventListener('click', executeImport);
    document.querySelector('#importTasksModal .modal-close').addEventListener('click', closeImportModal);
    
    // Timer bar
    document.getElementById('timerStopBtn').addEventListener('click', stopTimer);
    document.getElementById('timerTaskTitle').addEventListener('click', () => {
        if (state.activeTimerTaskId) {
            openTaskModal(state.activeTimerTaskId);
        }
    });
    
    // Active only toggle
    document.getElementById('activeOnlyToggle').addEventListener('change', (e) => {
        state.activeOnly = e.target.checked;
        render();
    });
    
    // Stats sidebar toggle
    document.getElementById('statsToggleBtn').addEventListener('click', () => {
        state.statsSidebarOpen = true;
        document.getElementById('statsSidebar').classList.add('open');
    });
    
    document.getElementById('statsCloseBtn').addEventListener('click', () => {
        state.statsSidebarOpen = false;
        document.getElementById('statsSidebar').classList.remove('open');
    });
    
    // Task modal
    document.querySelector('#taskModal .modal-close').addEventListener('click', closeTaskModal);
    
    // Global keyboard shortcut: Alt+N to open new task
    document.addEventListener('keydown', (e) => {
        // Alt+N for new task (doesn't conflict with browser)
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            openTaskModal();
        }
    });
    
    // Wizard navigation
    document.getElementById('wizardBackBtn')?.addEventListener('click', () => {
        if (wizardCurrentStep > 1) {
            wizardCurrentStep--;
            showWizardStep(wizardCurrentStep);
        }
    });
    
    document.getElementById('wizardNextBtn')?.addEventListener('click', () => {
        if (validateWizardStep(wizardCurrentStep)) {
            wizardCurrentStep++;
            showWizardStep(wizardCurrentStep);
        }
    });
    
    document.getElementById('wizardSaveBtn')?.addEventListener('click', saveTask);
    
    // Keyboard navigation in wizard
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('taskModal');
        if (modal.classList.contains('hidden')) return;
        
        // Enter to proceed (if not in textarea and not Ctrl)
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            const target = e.target;
            
            // If in textarea, Ctrl+Enter for new line is default, Enter does nothing here
            if (target.tagName === 'TEXTAREA') {
                return; // Let textarea handle it normally
            }
            
            // If in text input, proceed to next step
            if (target.tagName === 'INPUT' && target.type === 'text') {
                e.preventDefault();
                if (wizardCurrentStep < wizardTotalSteps) {
                    const nextBtn = document.getElementById('wizardNextBtn');
                    if (nextBtn && nextBtn.style.display !== 'none') {
                        nextBtn.click();
                    }
                } else {
                    const saveBtn = document.getElementById('wizardSaveBtn');
                    if (saveBtn && saveBtn.style.display !== 'none') {
                        saveBtn.click();
                    }
                }
                return;
            }
            
            // If focused on button or select option, activate it
            if (target.classList.contains('wizard-size-btn') || 
                target.classList.contains('wizard-column-btn') ||
                target.classList.contains('wizard-toggle-btn')) {
                e.preventDefault();
                target.click();
                // Auto-advance after selection
                setTimeout(() => {
                    if (wizardCurrentStep < wizardTotalSteps) {
                        document.getElementById('wizardNextBtn')?.click();
                    }
                }, 200);
                return;
            }
            
            // General Enter to proceed
            if (wizardCurrentStep < wizardTotalSteps) {
                const nextBtn = document.getElementById('wizardNextBtn');
                if (nextBtn && nextBtn.style.display !== 'none') {
                    e.preventDefault();
                    nextBtn.click();
                }
            } else {
                const saveBtn = document.getElementById('wizardSaveBtn');
                if (saveBtn && saveBtn.style.display !== 'none') {
                    e.preventDefault();
                    saveBtn.click();
                }
            }
        }
        
        // Arrow keys for navigation
        if (e.key === 'ArrowLeft' && wizardCurrentStep > 1) {
            e.preventDefault();
            wizardCurrentStep--;
            showWizardStep(wizardCurrentStep);
        }
        
        if (e.key === 'ArrowRight' && wizardCurrentStep < wizardTotalSteps) {
            e.preventDefault();
            if (validateWizardStep(wizardCurrentStep)) {
                wizardCurrentStep++;
                showWizardStep(wizardCurrentStep);
            }
        }
        
        // Arrow keys for button selection in grids
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
             e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
            (document.activeElement.classList.contains('wizard-size-btn') ||
             document.activeElement.classList.contains('wizard-column-btn') ||
             document.activeElement.classList.contains('wizard-toggle-btn'))) {
            
            e.preventDefault();
            const buttons = Array.from(document.activeElement.parentElement.children);
            const currentIndex = buttons.indexOf(document.activeElement);
            let nextIndex = currentIndex;
            
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                nextIndex = (currentIndex + 1) % buttons.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            }
            
            buttons[nextIndex]?.focus();
        }
        
        // Escape to close modal
        if (e.key === 'Escape') {
            closeTaskModal();
        }
    });
    
    document.getElementById('deleteTaskBtn').addEventListener('click', () => {
        if (confirm('Delete this task?')) {
            deleteTask(state.currentTaskId);
            closeTaskModal();
            render();
        }
    });
    
    // Wizard step clicks
    document.querySelectorAll('.wizard-step').forEach(stepEl => {
        stepEl.addEventListener('click', () => {
            const targetStep = parseInt(stepEl.dataset.step);
            if (targetStep < wizardCurrentStep) {
                wizardCurrentStep = targetStep;
                showWizardStep(wizardCurrentStep);
            }
        });
    });
    
    // Wizard toggle buttons
    document.querySelectorAll('.wizard-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wizard-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const isPrompt = btn.dataset.promptType === 'prompt';
            document.getElementById('taskIsPromptOnly').checked = isPrompt;
        });
    });
    
    // Wizard size buttons
    document.querySelectorAll('.wizard-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wizard-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const size = btn.dataset.size;
            document.getElementById('taskSize').value = size;
        });
    });
    
    // Wizard column buttons
    document.querySelectorAll('.wizard-column-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wizard-column-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('taskColumn').value = btn.dataset.column;
        });
    });
    
    // Project modal
    document.querySelector('#projectModal .modal-close').addEventListener('click', closeProjectModal);
    document.getElementById('cancelProjectBtn').addEventListener('click', closeProjectModal);
    document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
    document.getElementById('deleteProjectBtn').addEventListener('click', () => {
        if (confirm('Delete this project? Tasks will not be deleted, but will be unlinked.')) {
            deleteProject(state.currentProjectId);
            closeProjectModal();
            render();
        }
    });
    
    // Copy prompt button in modal
    document.getElementById('copyPromptBtn').addEventListener('click', async () => {
        const prompt = document.getElementById('taskAiPrompt').value.trim();
        if (prompt) {
            const success = await copyToClipboard(prompt);
            if (success) {
                showToast('Prompt copied to clipboard!');
            } else {
                showToast('Failed to copy prompt', 'error');
            }
        } else {
            showToast('No prompt to copy', 'error');
        }
    });
    
    // Sidebar collapse buttons
    document.getElementById('projectsCollapseBtn').addEventListener('click', () => {
        state.leftSidebarCollapsed = !state.leftSidebarCollapsed;
        saveState();
        applySidebarStates();
    });
    
    document.getElementById('statsCollapseBtn').addEventListener('click', () => {
        state.rightSidebarCollapsed = !state.rightSidebarCollapsed;
        saveState();
        applySidebarStates();
    });
    
    // Mobile app bar handlers
    const mobileProjectsBtn = document.getElementById('mobileProjectsBtn');
    const mobileStatsBtn = document.getElementById('mobileStatsBtn');
    const mobileNewTaskBtn = document.getElementById('mobileNewTaskBtn');
    const projectsCloseBtn = document.getElementById('projectsCloseBtn');
    const projectsSidebar = document.getElementById('projectsSidebar');
    const statsSidebar = document.getElementById('statsSidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    
    function closeMobileDrawers() {
        projectsSidebar.classList.remove('open');
        if (statsSidebar) statsSidebar.classList.remove('open');
        mobileOverlay.classList.remove('visible');
    }
    
    if (mobileProjectsBtn) {
        mobileProjectsBtn.addEventListener('click', () => {
            projectsSidebar.classList.add('open');
            mobileOverlay.classList.add('visible');
        });
    }
    
    if (mobileStatsBtn) {
        mobileStatsBtn.addEventListener('click', () => {
            if (statsSidebar) {
                statsSidebar.classList.add('open');
                mobileOverlay.classList.add('visible');
            }
        });
    }
    
    if (mobileNewTaskBtn) {
        mobileNewTaskBtn.addEventListener('click', () => {
            openTaskModal();
        });
    }
    
    if (projectsCloseBtn) {
        projectsCloseBtn.addEventListener('click', closeMobileDrawers);
    }
    
    const statsCloseBtn = document.getElementById('statsCloseBtn');
    if (statsCloseBtn) {
        statsCloseBtn.addEventListener('click', closeMobileDrawers);
    }
    
    // Close on overlay click
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', closeMobileDrawers);
    }
    
    // Mobile filters toggle
    const mobileFiltersToggle = document.getElementById('mobileFiltersToggle');
    const mobileFiltersContent = document.getElementById('mobileFiltersContent');
    
    if (mobileFiltersToggle && mobileFiltersContent) {
        mobileFiltersToggle.addEventListener('click', () => {
            mobileFiltersContent.classList.toggle('expanded');
            const isExpanded = mobileFiltersContent.classList.contains('expanded');
            mobileFiltersToggle.textContent = isExpanded ? 'Filters ▲' : 'Filters ▼';
        });
    }
    
    // Sync mobile filters with desktop filters
    const activeToggle = document.getElementById('activeOnlyToggle');
    const mobileActiveToggle = document.getElementById('mobileActiveToggle');
    
    if (activeToggle && mobileActiveToggle) {
        activeToggle.addEventListener('change', () => {
            mobileActiveToggle.checked = activeToggle.checked;
        });
        mobileActiveToggle.addEventListener('change', () => {
            activeToggle.checked = mobileActiveToggle.checked;
            activeToggle.dispatchEvent(new Event('change'));
        });
    }
    
    // Update mobile title when project changes
    const mobileTitle = document.getElementById('mobileTitle');
    const boardTitle = document.getElementById('boardTitle');
    
    function syncTitles(title) {
        if (boardTitle) boardTitle.textContent = title;
        if (mobileTitle) mobileTitle.textContent = title;
    }
    
    // Override the original title update
    window.syncTitles = syncTitles;
    
    // Size change auto-updates estimate
    document.getElementById('taskSize').addEventListener('change', (e) => {
        document.getElementById('taskEstimate').value = e.target.value;
    });
    
    // Add label on Enter
    document.getElementById('newLabelInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = e.target;
            const label = input.value.trim();
            if (label) {
                const chip = createLabelChip(label);
                document.getElementById('taskLabels').appendChild(chip);
                input.value = '';
            }
        }
    });
    
    // Drag and drop
    COLUMNS.forEach(columnId => {
        const container = document.getElementById(`${columnId}-tasks`);
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('dragenter', handleDragEnter);
        container.addEventListener('dragleave', handleDragLeave);
        container.addEventListener('drop', handleDrop);
    });
    
    // Close modals on click outside
    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target.id === 'taskModal') {
            closeTaskModal();
        }
    });
    
    document.getElementById('projectModal').addEventListener('click', (e) => {
        if (e.target.id === 'projectModal') {
            closeProjectModal();
        }
    });
    
    document.getElementById('addAreaModal').addEventListener('click', (e) => {
        if (e.target.id === 'addAreaModal') {
            closeAddAreaModal();
        }
    });
    
    document.getElementById('renameAreaModal').addEventListener('click', (e) => {
        if (e.target.id === 'renameAreaModal') {
            closeRenameAreaModal();
        }
    });
    
    document.getElementById('importTasksModal').addEventListener('click', (e) => {
        if (e.target.id === 'importTasksModal') {
            closeImportModal();
        }
    });
    
    // Enter key shortcuts for area modals
    document.getElementById('newAreaName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveAddArea();
        }
    });
    
    document.getElementById('renameAreaName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveRenameArea();
        }
    });
    
    // Auth event listeners
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (typeof currentUser !== 'undefined' && currentUser) {
                handleSignOut();
            } else {
                showAuthModal();
            }
        });
    }
    
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
        signInBtn.addEventListener('click', async () => {
            if (typeof handleSignIn === 'function') {
                await handleSignIn();
            }
        });
    }
    
    const signUpBtn = document.getElementById('signUpBtn');
    if (signUpBtn) {
        signUpBtn.addEventListener('click', async () => {
            if (typeof handleSignUp === 'function') {
                await handleSignUp();
            }
        });
    }
    
    // Auth modal close on background click
    document.getElementById('authModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'authModal') {
            // Only close if user is already signed in (optional sign-in)
            if (typeof currentUser !== 'undefined' && currentUser) {
                hideAuthModal();
            }
        }
    });
    
    // Enter key for auth inputs
    ['authEmail', 'authPassword'].forEach(id => {
        document.getElementById(id)?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSignIn();
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // N - New task
        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            openTaskModal();
        }
        
        // Esc - Close modals
        if (e.key === 'Escape') {
            closeTaskModal();
            closeProjectModal();
            closeAddAreaModal();
            closeRenameAreaModal();
            closeImportModal();
            closeAreaMenu();
        }
    });
}

// ============================================
// Initialize
// ============================================

function init() {
    loadState();
    initEventListeners();
    render();
    
    // Initialize Supabase auth if available
    if (typeof initAuth === 'function') {
        initAuth();
    }
}

document.addEventListener('DOMContentLoaded', init);
