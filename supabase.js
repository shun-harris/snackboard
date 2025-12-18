// Supabase Configuration
const SUPABASE_URL = 'https://wgtqxqztdxymyxmbxwqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndHF4cXp0ZHh5bXl4bWJ4d3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDM4MzAsImV4cCI6MjA4MDg3OTgzMH0.bNpS1YMr7YQSKH33gXkM0kYn8cI9zePTjUsSrwS_zIs';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth state
let currentUser = null;

// Initialize auth
async function initAuth() {
    // Start with modal hidden
    hideAuthModal();
    
    // Check current session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        await onAuthStateChange(true);
        hideAuthModal();
    } else {
        // Only show modal if no session
        showAuthModal();
    }
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            await onAuthStateChange(true);
            hideAuthModal();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            await onAuthStateChange(false);
            showAuthModal();
        }
    });
}

// Handle auth state changes
async function onAuthStateChange(isSignedIn) {
    const authBtn = document.getElementById('authBtn');
    const userEmail = document.getElementById('userEmail');
    
    if (isSignedIn) {
        authBtn.textContent = 'Sign Out';
        userEmail.textContent = currentUser.email;
        userEmail.classList.remove('hidden');
        
        // Migrate localStorage to Supabase on first login
        await migrateLocalStorageToSupabase();
        
        // Load data from Supabase
        await loadFromSupabase();
        
        // Set up real-time subscription
        setupRealtimeSync();
    } else {
        authBtn.textContent = 'Sign In';
        userEmail.classList.add('hidden');
        userEmail.textContent = '';
    }
}

// Migrate existing localStorage data to Supabase
async function migrateLocalStorageToSupabase() {
    const localData = localStorage.getItem('snackboard_v1');
    if (localData) {
        const data = JSON.parse(localData);
        
        // Check if user already has data in Supabase
        const { data: existingData } = await supabase
            .from('boards')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        // Only migrate if no existing data
        if (!existingData && (data.projects?.length > 0 || data.tasks?.length > 0)) {
            await saveToSupabase(data);
            showToast('Local data migrated to cloud!');
        }
    }
}

// Save to Supabase with retry
let isSaving = false;
async function saveToSupabase(data = null, retries = 2) {
    if (!currentUser || isSaving) return;
    
    isSaving = true;
    
    const dataToSave = data || {
        projects: state.projects,
        tasks: state.tasks,
        allLabels: state.allLabels,
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        rightSidebarCollapsed: state.rightSidebarCollapsed
    };
    
    try {
        // Simple update first, insert if doesn't exist
        const { data: result, error } = await supabase
            .from('boards')
            .update({
                data: dataToSave,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .select();
        
        // If no rows updated, insert
        if (!error && (!result || result.length === 0)) {
            const { error: insertError } = await supabase
                .from('boards')
                .insert({
                    user_id: currentUser.id,
                    data: dataToSave,
                    updated_at: new Date().toISOString()
                });
            
            if (insertError) {
                // If insert fails due to duplicate (race condition), try update again
                if (insertError.code === '23505' && retries > 0) {
                    isSaving = false;
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return saveToSupabase(data, retries - 1);
                }
                throw insertError;
            }
        } else if (error) {
            throw error;
        }
        
        isSaving = false;
        return true;
    } catch (err) {
        isSaving = false;
        console.error('Error in saveToSupabase:', err);
        
        // Retry on exception
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return saveToSupabase(data, retries - 1);
        }
        
        showToast('Failed to sync to cloud', 'error');
        return false;
    }
}

// Load from Supabase
async function loadFromSupabase() {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Error loading from Supabase:', error);
        return;
    }
    
    if (data && data.data) {
        const boardData = data.data;
        state.projects = boardData.projects || [];
        state.tasks = boardData.tasks || [];
        state.allLabels = boardData.allLabels || [...DEFAULT_LABELS];
        state.leftSidebarCollapsed = boardData.leftSidebarCollapsed || false;
        state.rightSidebarCollapsed = boardData.rightSidebarCollapsed || false;
        
        // Ensure all tasks have new fields
        state.tasks = state.tasks.map(task => ({
            ...task,
            aiPrompt: task.aiPrompt || '',
            isPromptOnly: task.isPromptOnly || false
        }));
        
        applySidebarStates();
        render();
    }
}

// Set up real-time sync
function setupRealtimeSync() {
    if (!currentUser) return;
    
    supabase
        .channel('board_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'boards',
                filter: `user_id=eq.${currentUser.id}`
            },
            async (payload) => {
                if (payload.new && payload.new.data) {
                    // Update local state with remote changes
                    const boardData = payload.new.data;
                    state.projects = boardData.projects || [];
                    state.tasks = boardData.tasks || [];
                    state.allLabels = boardData.allLabels || [...DEFAULT_LABELS];
                    
                    render();
                    showToast('Synced from another device');
                }
            }
        )
        .subscribe();
}

// Auth UI functions
function showAuthModal() {
    document.getElementById('authModal').classList.remove('hidden');
}

function hideAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

async function handleSignUp() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }
    
    const { error } = await supabase.auth.signUp({
        email,
        password
    });
    
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Check your email to confirm your account!');
    }
}

async function handleSignIn() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }
    
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        showToast(error.message, 'error');
    }
}

async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        showToast(error.message, 'error');
    }
}

// Debounce helper
let saveTimeout = null;
function debouncedSaveToSupabase() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveToSupabase();
    }, 500); // Wait 500ms after last change
}

// Override saveState when app.js loads
window.addEventListener('DOMContentLoaded', () => {
    if (typeof saveState === 'function') {
        const originalSaveState = saveState;
        window.saveState = function() {
            originalSaveState(); // Still save to localStorage as backup
            if (currentUser) {
                debouncedSaveToSupabase(); // Debounced save to Supabase
            }
        };
    }
});
