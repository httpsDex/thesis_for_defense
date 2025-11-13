// ====================== GLOBAL STATE MANAGEMENT ======================
/**
 * Central state object for the Merit System
 * - currentPeriod: The currently selected evaluation period ID
 * - notifications: Array of user notifications
 * - user: Currently logged-in user object
 */
window.MeritSystem = {
    currentPeriod: null,
    notifications: [],
    user: null
};



// ====================== PERIOD MANAGEMENT ======================

async function initGlobalPeriodSelector(onPeriodChange) {
    const selector = document.getElementById('globalPeriodSelector');
    if (!selector) {
        console.warn('Global period selector not found in DOM');
        return;
    }
    
    try {
        // Fetch all evaluation periods from API
        //http://localhost:1804
        //https://meritup-server.onrender.com
        const response = await fetch(`http://localhost:1804/api/evaluation-periods`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load periods');
        
        const periods = await response.json();
        
        // Populate the dropdown with periods
        selector.innerHTML = periods.map(period => `
            <option value="${period.period_id}" ${period.status === 'active' ? 'selected' : ''}>
                ${period.period_name} ${period.status === 'active' ? '(Active)' : ''}
            </option>
        `).join('');
        
        // Set current period to the active one (or first period if no active)
        const activePeriod = periods.find(p => p.status === 'active');
        window.MeritSystem.currentPeriod = activePeriod ? activePeriod.period_id : (periods[0]?.period_id || 1);
        
        // Update selector value
        selector.value = window.MeritSystem.currentPeriod;
        
        // Listen for period changes and call the callback
        selector.addEventListener('change', async (e) => {
            const oldPeriod = window.MeritSystem.currentPeriod;
            window.MeritSystem.currentPeriod = parseInt(e.target.value);
            
            console.log(`Period changed from ${oldPeriod} to ${window.MeritSystem.currentPeriod}`);
            
            // Show loading indicator while data refreshes
            showLoadingIndicator();
            
            try {
                // Call the page-specific reload function
                await onPeriodChange();
            } catch (error) {
                console.error('Error reloading page data:', error);
                showToast('Error loading data for selected period', true);
            } finally {
                hideLoadingIndicator();
            }
        });
        
        // Initial data load
        await onPeriodChange();
        
    } catch (error) {
        console.error('Error initializing period selector:', error);
        selector.innerHTML = '<option value="1">Default Period</option>';
        window.MeritSystem.currentPeriod = 1;
    }
}


function getCurrentPeriod() {
    return window.MeritSystem.currentPeriod || 1;
}

// ====================== UI HELPERS ======================
/**
 * Show loading indicator overlay
 */
function showLoadingIndicator() {
    let loader = document.getElementById('globalLoadingIndicator');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoadingIndicator';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        loader.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="mt-2">Loading period data...</div>
            </div>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

/**
 * Hide loading indicator overlay
 */
function hideLoadingIndicator() {
    const loader = document.getElementById('globalLoadingIndicator');
    if (loader) {
        loader.style.display = 'none';
    }
}


function showToast(message, isError = false) {
    const toastElement = document.getElementById("saveToast");
    if (!toastElement) {
        console.warn('Toast element not found');
        return;
    }
    
    const toast = new bootstrap.Toast(toastElement);
    const toastBody = document.querySelector(".toast-body");
    
    toastBody.textContent = message;
    
    if (isError) {
        toastElement.classList.add("bg-danger", "text-white");
    } else {
        toastElement.classList.remove("bg-danger", "text-white");
    }
    
    toast.show();
    
    // Reset toast styling after it's hidden
    setTimeout(() => {
        toastElement.classList.remove("bg-danger", "text-white");
    }, 3000);
}




// ====================== EXPORTS ======================
// Make functions available globally
window.initGlobalPeriodSelector = initGlobalPeriodSelector;
window.getCurrentPeriod = getCurrentPeriod;
window.showLoadingIndicator = showLoadingIndicator;
window.hideLoadingIndicator = hideLoadingIndicator;
window.showToast = showToast;
