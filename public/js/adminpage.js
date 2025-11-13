// ====================== ADMIN PAGE JAVASCRIPT ======================
// Main js for adminpage
const apiBaseUrl = "http://localhost:1804";
// const apiBaseUrl = "https://meritup-server.onrender.com";


document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user"));

    // Authentication checks
    if (!token || !user) {
        window.location.href = "loginpage.html";
        return;
    }

    if (user.role_id !== 1 && user.role_id !== 2) {
        localStorage.clear();
        window.location.href = "loginpage.html";
        return;
    }

    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
        alert("Session expired. Please log in again.");
        localStorage.clear();
        window.location.href = "loginpage.html";
        return;
    }
    
    if (user.role_id === 2) {
        document.getElementById("downloadSummaryMeritBtn").style.display = "none";
    }

    // Initialize the page
    initializePage(user);
    setupSidebar();
    setupNavigation();
    
    // Initialize global period selector with reload callback
    // This will automatically load initial data
    initGlobalPeriodSelector(reloadCurrentSection);

    // Logout handler
    document.getElementById("logoutBtn").addEventListener("click", () => {
        if (confirm("Are you sure you want to logout?")) {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
            window.location.href = "loginpage.html";
        }
    });
});

// ====================== RELOAD CURRENT SECTION ======================
async function reloadCurrentSection() {
    const user = JSON.parse(localStorage.getItem("user"));
    const currentPeriod = getCurrentPeriod();
    console.log('Reloading admin page for period:', currentPeriod);
    
    // Always reload dashboard (visible on all pages)
    await loadDashboardData();
    
    // Find which section is currently displayed
    const activeSection = document.querySelector('.content-section[style*="display: block"]');
    if (!activeSection) return;
    
    const sectionId = activeSection.id;
    console.log('Reloading section:', sectionId);
    
    // Reload data based on current section
    // Employee Management is excluded because it doesn't depend on period
    switch(sectionId) {
        case 'evaluation':
            await loadEvaluationData();
            break;
        case 'non-teaching_evaluation':
            await loadNonTeachingEvaluationData();
            break;
        case 'peerEvaluation':
            await loadPeerEvaluationData();
            break;
        case 'summary':
            if (user.role_id === 1) {
                await loadTeachingSummaryData();
            } else {
                await loadNonTeachingSummaryData();
            }
            break;
        case 'ranking':
            // Load based on user role
            if (user.role_id === 1) {
                await loadTeachingRankingData();
            } else {
                await loadNonTeachingRankingData();
            }
            break;
        case 'certificate':
            // Load based on user role
            if (user.role_id === 1) {
                await loadTeachingCertificateData();
            } else {
                await loadNonTeachingCertificateData();
            }
            break;
        case 'employee_management':
            await loadEmployeeData();
            console.log('Employee management section - no period reload needed');
            break;
        default:
            console.log('Unknown section:', sectionId);
    }
}

// ====================== PAGE INITIALIZATION ======================
function initializePage(user) {
    // Role-based UI visibility
    if (user.role_id === 1) { // Teaching Evaluator
        document.querySelectorAll(".non-teaching-only").forEach(el => {
            el.style.display = "none";
        });
    } else if (user.role_id === 2) { // Non-Teaching Evaluator
        document.querySelectorAll(".teaching-only").forEach(el => {
            el.style.display = "none";
        });
    }
    
    // Set user info in UI
    document.getElementById("userName").textContent = user.name;
    document.getElementById("userRole").textContent = user.role_name;
    document.getElementById("welcomeMessage").textContent = `Welcome back, ${user.name}!`;
    document.getElementById("userDepartment").textContent = `${user.role_name} • ${user.department}`;
}

// ====================== SIDEBAR & NAVIGATION ======================
function setupSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    hamburgerBtn.addEventListener('click', function() {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
        
        const icon = this.querySelector('i');
        if (sidebar.classList.contains('show')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });

    overlay.addEventListener('click', function() {
        sidebar.classList.remove('show');
        this.classList.remove('show');
        hamburgerBtn.querySelector('i').classList.remove('fa-times');
        hamburgerBtn.querySelector('i').classList.add('fa-bars');
    });
}

function setupNavigation() {
    const navLinks = document.querySelectorAll(".sidebar-content button");
    navLinks.forEach(link => {
        link.addEventListener("click", async (e) => {
            const targetId = e.currentTarget.id.replace("Link", "");
            showSection(targetId);
            updateActiveLink(e.currentTarget.id);
            
            // Load section data when navigating
            await reloadCurrentSection();
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll(".content-section").forEach(section => {
        section.style.display = "none";
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = "block";
    }
    
    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("show");
    document.getElementById("overlay").classList.remove("show");
}

function updateActiveLink(activeLinkId) {
    document.querySelectorAll(".sidebar-content button").forEach(link => {
        link.classList.remove("active");
    });
    document.getElementById(activeLinkId)?.classList.add("active");
}

// ====================== DATA LOADING FUNCTIONS ======================

async function loadDashboardData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Load all dashboard data in parallel
        await Promise.all([
            loadDashboardStatistics(periodId),
            loadEvaluationProgress(periodId),
            loadRecentActivity(periodId)
        ]);
        
    } catch (error) {
        console.error("Error loading dashboard data:", error);
        showToast("Failed to load dashboard data", true);
    }
}

// Load Quick Statistics
async function loadDashboardStatistics(periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/statistics/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Update quick statistics
            document.getElementById("handledEmployees").textContent = data.handledEmployees || 0;
            document.getElementById("pendingEvaluations").textContent = data.pendingEvaluations || 0;
            document.getElementById("completedEvaluations").textContent = data.completedEvaluations || 0;
            document.getElementById("pendingCertificates").textContent = data.pendingCertificates || 0;
        }
    } catch (error) {
        console.error("Error loading statistics:", error);
    }
}

// Load Evaluation Progress
async function loadEvaluationProgress(periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/progress/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Update period info
            document.getElementById("currentPeriodName").textContent = data.periodName || '1st Semester 2024-2025';
            
            if (data.periodEndDate) {
                const endDate = new Date(data.periodEndDate);
                document.getElementById("periodEndDate").textContent = endDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            // Calculate overall progress
            const totalTasks = data.totalEvaluations + data.totalCertificates + (data.totalPeerEvaluations || 0);
            const completedTasks = data.completedEvaluations + data.reviewedCertificates + (data.completedPeerEvaluations || 0);
            const overallPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
            // Update overall progress
            document.getElementById("overallProgressText").textContent = `${completedTasks}/${totalTasks} (${overallPercentage}%)`;
            document.getElementById("overallProgressBar").style.width = `${overallPercentage}%`;
            document.getElementById("overallProgressBar").querySelector('span').textContent = `${overallPercentage}%`;
            
            // Update teaching evaluations (if applicable)
            if (data.teachingEvaluations !== undefined) {
                const teachingPercentage = data.totalTeachingEvaluations > 0 
                    ? Math.round((data.teachingEvaluations / data.totalTeachingEvaluations) * 100) 
                    : 0;
                document.getElementById("teachingProgressText").textContent = `${data.teachingEvaluations}/${data.totalTeachingEvaluations}`;
                document.getElementById("teachingProgressBar").style.width = `${teachingPercentage}%`;
            }
            
            // Update non-teaching evaluations (if applicable)
            if (data.nonTeachingEvaluations !== undefined) {
                const nonTeachingPercentage = data.totalNonTeachingEvaluations > 0 
                    ? Math.round((data.nonTeachingEvaluations / data.totalNonTeachingEvaluations) * 100) 
                    : 0;
                document.getElementById("nonTeachingProgressText").textContent = `${data.nonTeachingEvaluations}/${data.totalNonTeachingEvaluations}`;
                document.getElementById("nonTeachingProgressBar").style.width = `${nonTeachingPercentage}%`;
            }
            
            // Update peer evaluations (if applicable)
            if (data.completedPeerEvaluations !== undefined) {
                const peerPercentage = data.totalPeerEvaluations > 0 
                    ? Math.round((data.completedPeerEvaluations / data.totalPeerEvaluations) * 100) 
                    : 0;
                document.getElementById("peerProgressText").textContent = `${data.completedPeerEvaluations}/${data.totalPeerEvaluations}`;
                document.getElementById("peerProgressBar").style.width = `${peerPercentage}%`;
            }
            
            // Update certificate reviews
            const certPercentage = data.totalCertificates > 0 
                ? Math.round((data.reviewedCertificates / data.totalCertificates) * 100) 
                : 0;
            document.getElementById("certificateProgressText").textContent = `${data.reviewedCertificates}/${data.totalCertificates}`;
            document.getElementById("certificateProgressBar").style.width = `${certPercentage}%`;
        }
    } catch (error) {
        console.error("Error loading progress:", error);
    }
}

// Load Recent Activity
async function loadRecentActivity(periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/recent-activity/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const activities = await response.json();
            displayRecentActivity(activities);
        }
    } catch (error) {
        console.error("Error loading recent activity:", error);
    }
}

function displayRecentActivity(activities) {
    const activityList = document.getElementById("recentActivityList");
    activityList.innerHTML = "";
    
    if (activities.length === 0) {
        activityList.innerHTML = `
            <div class="list-group-item text-center py-4">
                <i class="fas fa-inbox fa-2x text-muted mb-2"></i>
                <p class="text-muted mb-0">No recent activity</p>
            </div>
        `;
        return;
    }
    
    activities.forEach(activity => {
        const listItem = document.createElement("div");
        listItem.className = "list-group-item list-group-item-action";
        
        let icon = '';
        let iconColor = '';
        let actionText = '';
        
        if (activity.activity_type === 'certificate_submitted') {
            icon = 'fa-certificate';
            iconColor = 'text-warning';
            actionText = `<strong>${activity.employee_name}</strong> submitted a certificate`;
            if (activity.description) {
                actionText += `<br><small class="text-muted">${activity.description}</small>`;
            }
        } else if (activity.activity_type === 'peer_evaluation_completed') {
            icon = 'fa-users';
            iconColor = 'text-info';
            actionText = `<strong>${activity.evaluator_name}</strong> completed peer evaluation for <strong>${activity.employee_name}</strong>`;
        }
        
        // Calculate time ago
        const timeAgo = getTimeAgo(activity.activity_date);
        
        listItem.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="me-3 mt-1">
                    <i class="fas ${icon} ${iconColor}"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between mb-1">
                        <small class="text-muted"><i class="fas fa-clock me-1"></i>${timeAgo}</small>
                    </div>
                    <p class="mb-0 small">${actionText}</p>
                </div>
            </div>
        `;
        
        activityList.appendChild(listItem);
    });
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'Just now';
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'Just now';
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboardData();
    }
});


//==============================================================================


// ====================== EVALUATION DATA LOADING ======================
async function loadEvaluationData() {
    try {
        const periodId = getCurrentPeriod();
        

        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const buttonStatus = currentPeriod?.status;
        
        // Fetch evaluations
        const response = await fetch(`${apiBaseUrl}/api/teaching-evaluations/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const evaluations = await response.json();
            const tableBody = document.getElementById("evaluationTableBody");
            tableBody.innerHTML = "";
            
            evaluations.forEach(evaluation => {
                const row = document.createElement("tr");
                
                let actionButton = '';
                if (buttonStatus === 'active') {
                    // Show evaluate button if period is active
                    actionButton = `
                        <button class="btn btn-sm btn-primary evaluate-t-btn"
                        data-staff-id="${evaluation.staff_id}" 
                        data-evaluation-id="${evaluation.evaluation_id || ''}"
                        data-employee-name="${evaluation.employee_name}"
                        data-position="${evaluation.position}"
                        data-department="${evaluation.department}">
                            <i class="fas fa-edit me-1"></i> Evaluate
                        </button>
                    `;
                } else if (buttonStatus === 'completed') {
                    // Show disabled message if period is inactive
                    actionButton = `
                        <span class="badge bg-success">
                            <i class="fas fa-lock me-1"></i> Period completed
                        </span>
                    `;
                } else {
                    actionButton = `
                        <span class="badge bg-secondary">
                            <i class="fas fa-lock me-1"></i> Period isn't currently active
                        </span>
                    `;
                }
                
                row.innerHTML = `
                    <td>
                        <div class="d-flex align-items-center">
                            <div>
                                <div class="fw-bold">${evaluation.employee_name}</div>
                                <small class="text-muted">${evaluation.department}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge ${evaluation.status === 'completed' ? 'bg-success' : evaluation.status === 'draft' ? 'bg-secondary' : 'bg-warning'}">
                            ${evaluation.status === 'completed' ? 'Completed' : evaluation.status === 'draft' ? 'Draft' : 'Pending'}
                        </span>
                    </td>
                    <td>
                        <div class="fw-bold">${evaluation.total_score || 'N/A'}</div>
                    </td>
                    <td>
                        ${actionButton}
                    </td>
                `;
                tableBody.appendChild(row);
            });
            if(buttonStatus === 'active') {
                document.querySelectorAll('.evaluate-t-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const staffId = parseInt(this.dataset.staffId);
                        const evaluationId = this.dataset.evaluationId ? parseInt(this.dataset.evaluationId) : null;
                        openTeachingEvaluationModal(staffId, evaluationId);
                    });
                });
            }
        }
    } catch (error) {
        console.error("Error loading evaluation data:", error);
    }
}



async function openTeachingEvaluationModal(staffId, evaluationId) {
    const periodId = getCurrentPeriod();
    const modal = new bootstrap.Modal(document.getElementById('teachingEvaluationModal'));
    
    // Store for saving
    document.getElementById('teachingEvaluationModal').dataset.staffId = staffId;
    document.getElementById('teachingEvaluationModal').dataset.evaluationId = evaluationId || '';
    document.getElementById('teachingEvaluationModal').dataset.periodId = periodId;
    
    // Get staff info from the table
    const button = event.target.closest('.evaluate-t-btn');
    if (button) {
        document.getElementById('modalEmployeeName').textContent = button.dataset.employeeName;
        document.getElementById('modalEmployeeRole').textContent = `${button.dataset.position} • ${button.dataset.department}`;
    }
    
    // Clear form
    document.getElementById('evaluationForm').reset();
    
    // Load existing evaluation if exists
    if (evaluationId) {
        try {
            const response = await fetch(`${apiBaseUrl}/api/teaching-evaluation/${evaluationId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                document.getElementById('deanEval').value = data.dean_eval || 0;
                document.getElementById('studentEval').value = data.student_eval || 0;
                document.getElementById('peerEval').value = data.peer_eval || 0;
                document.getElementById('committeeEval').value = data.committee_chair_eval || 0;
                document.getElementById('deptHeadEval').value = data.dept_head_eval || 0;
                document.getElementById('seminarAttendance').value = data.seminar_attendance || 0;
                document.getElementById('publications').value = data.publications || 0;
                document.getElementById('scholarlyAchievement').value = data.scholarly_achievement || 0;
                document.getElementById('researchConducted').value = data.research_conducted || 0;
                document.getElementById('graduateUnits').value = data.graduate_units || 0;
                document.getElementById('teachingExperience').value = data.teaching_experience || 0;
                calculateTeachingTotal();
            }
        } catch (error) {
            console.error("Error loading evaluation:", error);
        }
    } else {
        calculateTeachingTotal();
    }
    
    modal.show();
}

function calculateTeachingTotal() {
    const fields = ['deanEval', 'studentEval', 'peerEval', 'committeeEval', 'deptHeadEval', 
                   'seminarAttendance', 'publications', 'scholarlyAchievement', 'researchConducted', 
                   'graduateUnits', 'teachingExperience'];
    
    let total = 0;
    fields.forEach(field => {
        const value = parseFloat(document.getElementById(field).value) || 0;
        total += value;
    });
    
    document.getElementById('Teaching_totalScore').textContent = total.toFixed(2);
}

// Add event listeners for teaching evaluation inputs
document.addEventListener('DOMContentLoaded', () => {
    const fields = ['deanEval', 'studentEval', 'peerEval', 'committeeEval', 'deptHeadEval', 
                   'seminarAttendance', 'publications', 'scholarlyAchievement', 'researchConducted', 
                   'graduateUnits', 'teachingExperience'];
    
    fields.forEach(field => {
        document.getElementById(field)?.addEventListener('input', calculateTeachingTotal);
    });
    
    document.getElementById('saveEvaluation')?.addEventListener('click', saveTeachingEvaluation);
});

async function saveTeachingEvaluation() {
    const modal = document.getElementById('teachingEvaluationModal');
    const staffId = modal.dataset.staffId;
    const evaluationId = modal.dataset.evaluationId;
    const periodId = modal.dataset.periodId;
    
    const data = {
        staff_id: parseInt(staffId),
        period_id: parseInt(periodId),
        evaluation_id: evaluationId ? parseInt(evaluationId) : null,
        dean_eval: parseFloat(document.getElementById('deanEval').value) || 0,
        student_eval: parseFloat(document.getElementById('studentEval').value) || 0,
        peer_eval: parseFloat(document.getElementById('peerEval').value) || 0,
        committee_chair_eval: parseFloat(document.getElementById('committeeEval').value) || 0,
        dept_head_eval: parseFloat(document.getElementById('deptHeadEval').value) || 0,
        seminar_attendance: parseFloat(document.getElementById('seminarAttendance').value) || 0,
        publications: parseFloat(document.getElementById('publications').value) || 0,
        scholarly_achievement: parseFloat(document.getElementById('scholarlyAchievement').value) || 0,
        research_conducted: parseFloat(document.getElementById('researchConducted').value) || 0,
        graduate_units: parseFloat(document.getElementById('graduateUnits').value) || 0,
        teaching_experience: parseFloat(document.getElementById('teachingExperience').value) || 0
    };
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/teaching-evaluation/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast("Evaluation saved successfully!");
            bootstrap.Modal.getInstance(modal).hide();
            await loadEvaluationData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to save evaluation", true);
        }
    } catch (error) {
        console.error("Error saving evaluation:", error);
        showToast("Error saving evaluation", true);
    }
}



// ====================== NON-TEACHING EVALUATION DATA LOADING ======================
async function loadNonTeachingEvaluationData() {
    try {
        const periodId = getCurrentPeriod();
        
        // ✅ Fetch period info to check if it's active
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const buttonStatus = currentPeriod?.status;
        
        // Fetch evaluations
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-evaluations/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const evaluations = await response.json();
            displayNonTeachingEvaluations(evaluations,buttonStatus);
        }
    } catch (error) {
        console.error("Error loading non-teaching evaluation data:", error);
        showToast("Failed to load non-teaching evaluations", true);
    }
}

function displayNonTeachingEvaluations(evaluations , buttonStatus) {
    const tableBody = document.getElementById("nonTeachingEvaluationTableBody");
    tableBody.innerHTML = "";
    
    if (evaluations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No employees found
                </td>
            </tr>
        `;
        return;
    }
    
    evaluations.forEach(evaluation => {
        const row = document.createElement("tr");
        const statusClass = evaluation.status === 'completed' ? 'bg-success' : 
                           evaluation.status === 'draft' ? 'bg-secondary' : 'bg-warning';
        const statusText = evaluation.status.charAt(0).toUpperCase() + evaluation.status.slice(1);
        
        let actionButton = '';
        if (buttonStatus === 'active') {
            // Show evaluate button if period is active
            actionButton = `
                <button class="btn btn-sm btn-primary evaluate-nt-btn" 
                data-staff-id="${evaluation.staff_id}" 
                data-evaluation-id="${evaluation.evaluation_id || ''}"
                data-employee-name="${evaluation.employee_name}"
                data-position="${evaluation.position}"
                data-department="${evaluation.department_name}">
                    <i class="fas fa-edit me-1"></i> Evaluate
                </button>
            `;
        } else if (buttonStatus === 'completed') {
            // Show disabled message if period is inactive
            actionButton = `
                <span class="badge bg-success">
                    <i class="fas fa-lock me-1"></i> Period completed
                </span>
            `;
        } else {
            // Show disabled message if period is inactive
            actionButton = `
                <span class="badge bg-secondary">
                    <i class="fas fa-lock me-1"></i> Period isn't currently active
                </span>
            `;
        }
        
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${evaluation.employee_name}</div>
                        <small class="text-muted">${evaluation.department_name}</small>
                    </div>
                </div>
            </td>
            <td>${evaluation.position}</td>
            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td>
                ${actionButton}
            </td>
        `;
        tableBody.appendChild(row);
    });

    if (buttonStatus === 'active') {
        document.querySelectorAll('.evaluate-nt-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const staffId = parseInt(this.dataset.staffId);
                const evaluationId = this.dataset.evaluationId ? parseInt(this.dataset.evaluationId) : null;
                openNonTeachingEvaluationModal(staffId, evaluationId);
            });
        });
    }
}

async function openNonTeachingEvaluationModal(staffId, evaluationId) {
    const periodId = getCurrentPeriod();
    const modal = new bootstrap.Modal(document.getElementById('NonTeachingEvaluationModal'));
    
    
    // Store for saving
    document.getElementById('NonTeachingEvaluationModal').dataset.staffId = staffId;
    document.getElementById('NonTeachingEvaluationModal').dataset.evaluationId = evaluationId || '';
    document.getElementById('NonTeachingEvaluationModal').dataset.periodId = periodId;
    
    // Get staff info from the button
    const button = event.target.closest('.evaluate-nt-btn');
    if (button) {
        document.getElementById('modalNonTeachingEmployeeName').textContent = button.dataset.employeeName;
        document.getElementById('modalEmployeePosition').textContent = `${button.dataset.position} • ${button.dataset.department}`;
    }
    
    // Clear form
    document.getElementById('nonTeachingEvaluationForm').reset();
    
    // Load existing evaluation if exists
    if (evaluationId) {
        try {
            const response = await fetch(`${apiBaseUrl}/api/non-teaching-evaluation/${evaluationId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                document.getElementById('absences').value = data.excu_absences_without_pay || 0;
                document.getElementById('tardiness').value = data.tardiness || 0;
                document.getElementById('minutes').value = data.minutes_late || 0;
                document.getElementById('institutional').value = data.institutional_involvement || 0;
                document.getElementById('community').value = data.community_involvement || 0;
                document.getElementById('workExperience').value = data.work_experience || 0;
                
                document.getElementById('nonTeachingSeminarPoints').value = data.points?.toFixed(2) || '0.00';
                
                calculateNonTeachingTotal();
            }
        } catch (error) {
            console.error("Error loading evaluation:", error);
        }
    } 
    // Load seminar points for new evaluation
    await loadNonTeachingSeminarPoints(staffId, periodId);
    calculateNonTeachingTotal();
    
    
    modal.show();
}

async function loadNonTeachingSeminarPoints(staffId, periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/seminar-points/${staffId}/${periodId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('nonTeachingSeminarPoints').value = data.points?.toFixed(2) || '0.00';
        }
    } catch (error) {
        console.error("Error loading seminar points:", error);
        document.getElementById('nonTeachingSeminarPoints').value = '0.00';
    }
}

function calculateNonTeachingTotal() {
    const absences = parseFloat(document.getElementById('absences').value) || 0;
    const tardiness = parseFloat(document.getElementById('tardiness').value) || 0;
    const minutes = parseFloat(document.getElementById('minutes').value) || 0;
    const seminar = parseFloat(document.getElementById('nonTeachingSeminarPoints').value) || 0;
    const institutional = parseFloat(document.getElementById('institutional').value) || 0;
    const community = parseFloat(document.getElementById('community').value) || 0;
    const workExperience = parseFloat(document.getElementById('workExperience').value) || 0;
    
    const total = absences + tardiness + minutes + seminar + institutional + community + workExperience;
    
    document.getElementById('NonTeaching_totalScore').textContent = total.toFixed(2);
}

// Add event listeners for non-teaching evaluation inputs
document.addEventListener('DOMContentLoaded', () => {
    const fields = ['absences', 'tardiness', 'minutes', 'institutional', 'community', 'workExperience'];
    
    fields.forEach(field => {
        document.getElementById(field)?.addEventListener('input', calculateNonTeachingTotal);
    });
    
    document.getElementById('saveNonTeachingEvaluation')?.addEventListener('click', saveNonTeachingEvaluation);
});

async function saveNonTeachingEvaluation() {
    const modal = document.getElementById('NonTeachingEvaluationModal');
    const staffId = modal.dataset.staffId;
    const evaluationId = modal.dataset.evaluationId;
    const periodId = modal.dataset.periodId;
    
    const data = {
        staff_id: parseInt(staffId),
        period_id: parseInt(periodId),
        evaluation_id: evaluationId ? parseInt(evaluationId) : null,
        excu_absences_without_pay: parseFloat(document.getElementById('absences').value) || 0,
        tardiness: parseFloat(document.getElementById('tardiness').value) || 0,
        minutes_late: parseFloat(document.getElementById('minutes').value) || 0,
        seminar: parseFloat(document.getElementById('nonTeachingSeminarPoints').value) || 0,
        institutional_involvement: parseFloat(document.getElementById('institutional').value) || 0,
        community_involvement: parseFloat(document.getElementById('community').value) || 0,
        work_experience: parseFloat(document.getElementById('workExperience').value) || 0
    };
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-evaluation/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast("Evaluation saved successfully!");
            bootstrap.Modal.getInstance(modal).hide();
            await loadNonTeachingEvaluationData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to save evaluation", true);
        }
    } catch (error) {
        console.error("Error saving evaluation:", error); 
        showToast("Error saving evaluation", true);
    }
}



// ====================== PEER EVALUATION DATA LOADING ======================
async function loadPeerEvaluationData() {
    try {
        const periodId = getCurrentPeriod();
        const response = await fetch(`${apiBaseUrl}/api/peer-evaluations/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const assignments = await response.json();
            displayPeerEvaluations(assignments);
        }
    } catch (error) {
        console.error("Error loading peer evaluation data:", error);
        showToast("Failed to load peer evaluations", true);
    }
}

function displayPeerEvaluations(assignments) {
    const tableBody = document.getElementById("peerEvaluationTableBody");
    tableBody.innerHTML = "";
    
    if (assignments.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No peer evaluation assignments found
                </td>
            </tr>
        `;
        return;
    }
    
    assignments.forEach(assignment => {
        const row = document.createElement("tr");
        
        // Calculate completion status
        const completed = assignment.completed_evaluations || 0;
        const total = 3;
        const statusBadge = completed === total ? 
            `<span class="badge bg-success">Completed (${completed}/${total})</span>` :
            `<span class="badge bg-warning">Pending (${completed}/${total})</span>`;
        
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${assignment.employee_name}</div>
                        <small class="text-muted">${assignment.department_name}</small>
                    </div>
                </div>
            </td>
            <td>
                <div class="fw-bold">${assignment.dept_head_name || 'Not Assigned'}</div>
                ${assignment.dept_head_status ? 
                    `<small class="badge bg-${assignment.dept_head_status === 'submitted' ? 'success' : 'secondary'}">${assignment.dept_head_status}</small>` 
                    : '<small class="text-muted">Pending</small>'}
            </td>
            <td>
                <div class="fw-bold">${assignment.same_dept_peer_name || 'Not Assigned'}</div>
                ${assignment.same_dept_peer_status ? 
                    `<small class="badge bg-${assignment.same_dept_peer_status === 'submitted' ? 'success' : 'secondary'}">${assignment.same_dept_peer_status}</small>` 
                    : '<small class="text-muted">Pending</small>'}
            </td>
            <td>
                <div class="fw-bold">${assignment.external_peer_name || 'Not Assigned'}</div>
                ${assignment.external_peer_status ? 
                    `<small class="badge bg-${assignment.external_peer_status === 'submitted' ? 'success' : 'secondary'}">${assignment.external_peer_status}</small>` 
                    : '<small class="text-muted">Pending</small>'}
            </td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewPeerEvaluationDetails(${assignment.evaluatee_staff_id}, ${assignment.period_id})">
                    <i class="fas fa-eye me-1"></i> View
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
}

// Load employees for assignment modal - SIMPLIFIED VERSION
async function loadPeerAssignmentOptions() {
    try {
        // Load all non-teaching employees
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-staff`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const employees = await response.json();
            
            // Populate evaluatee dropdown
            const evaluateeSelect = document.getElementById('employeeToEvaluate');
            evaluateeSelect.innerHTML = '<option value="">Select Employee</option>';
            employees.forEach(emp => {
                evaluateeSelect.innerHTML += `
                    <option value="${emp.staff_id}" data-dept="${emp.department_id}">
                        ${emp.full_name} (${emp.department_name})
                    </option>`;
            });
            
            // Store employees data for filtering
            window.peerAssignmentEmployees = employees;
        }
    } catch (error) {
        console.error("Error loading employees:", error);
        showToast("Failed to load employees", true);
    }
}

// Handle evaluatee selection to filter other dropdowns
document.getElementById('employeeToEvaluate')?.addEventListener('change', function() {
    const selectedStaffId = parseInt(this.value);
    const selectedOption = this.options[this.selectedIndex];
    const selectedDeptId = selectedOption ? parseInt(selectedOption.dataset.dept) : null;
    
    if (!selectedStaffId || !selectedDeptId || !window.peerAssignmentEmployees) {
        return;
    }
    
    const employees = window.peerAssignmentEmployees;
    
    // Filter department heads from the same department (excluding evaluatee)
    const deptHeads = employees.filter(emp => 
        emp.department_id === selectedDeptId && 
        emp.staff_id !== selectedStaffId &&
        emp.is_department_head === 1
    );
    
    // Filter same department peers (excluding evaluatee and dept heads)
    const sameDeptPeers = employees.filter(emp => 
        emp.department_id === selectedDeptId && 
        emp.staff_id !== selectedStaffId &&
        emp.is_department_head !== 1
    );
    
    // Filter external department peers
    const externalPeers = employees.filter(emp => 
        emp.department_id !== selectedDeptId && 
        emp.staff_id !== selectedStaffId
    );
    
    // Populate department head dropdown
    const deptHeadSelect = document.getElementById('departmentHead');
    deptHeadSelect.innerHTML = '<option value="">Select Department Head</option>';
    deptHeads.forEach(emp => {
        deptHeadSelect.innerHTML += `<option value="${emp.staff_id}">${emp.full_name}</option>`;
    });
    
    // Populate same department peer dropdown
    const samePeerSelect = document.getElementById('sameDepartmentPeer');
    samePeerSelect.innerHTML = '<option value="">Select Same Department Peer</option>';
    sameDeptPeers.forEach(emp => {
        samePeerSelect.innerHTML += `<option value="${emp.staff_id}">${emp.full_name}</option>`;
    });
    
    // Populate external department peer dropdown
    const externalPeerSelect = document.getElementById('externalDepartmentPeer');
    externalPeerSelect.innerHTML = '<option value="">Select External Department Peer</option>';
    externalPeers.forEach(emp => {
        externalPeerSelect.innerHTML += `<option value="${emp.staff_id}">${emp.full_name} (${emp.department_name})</option>`;
    });
});

// Save peer assignment - USES GLOBAL PERIOD SELECTOR
document.getElementById('savePeerAssignment')?.addEventListener('click', async function() {
    const evaluateeId = document.getElementById('employeeToEvaluate').value;
    const deptHeadId = document.getElementById('departmentHead').value;
    const samePeerId = document.getElementById('sameDepartmentPeer').value;
    const externalPeerId = document.getElementById('externalDepartmentPeer').value;
    const periodId = getCurrentPeriod(); // ✅ USE GLOBAL PERIOD SELECTOR
    
    // Validation
    if (!periodId) {
        showToast("Please select an evaluation period from the top", true);
        return;
    }
    
    if (!evaluateeId) {
        showToast("Please select an employee to evaluate", true);
        return;
    }
    
    if (!deptHeadId) {
        showToast("Please select a department head", true);
        return;
    }
    
    if (!samePeerId) {
        showToast("Please select a same department peer", true);
        return;
    }
    
    if (!externalPeerId) {
        showToast("Please select an external department peer", true);
        return;
    }
    
    // Check for duplicate evaluators
    const evaluators = [deptHeadId, samePeerId, externalPeerId];
    const uniqueEvaluators = new Set(evaluators);
    
    if (uniqueEvaluators.size !== evaluators.length) {
        showToast("Cannot assign the same person as multiple evaluators", true);
        return;
    }
    
    // Check if evaluatee is not in evaluators list
    if (evaluators.includes(evaluateeId)) {
        showToast("Cannot assign employee to evaluate themselves", true);
        return;
    }
    
    const data = {
        evaluatee_staff_id: parseInt(evaluateeId),
        department_head_id: parseInt(deptHeadId),
        same_dept_peer_id: parseInt(samePeerId),
        external_peer_id: parseInt(externalPeerId),
        period_id: parseInt(periodId) // ✅ FROM GLOBAL SELECTOR
    };
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/peer-assignment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            showToast("Peer evaluation assigned successfully!");
            
            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('assignPeerModal'));
            modal.hide();
            document.getElementById('assignPeerForm').reset();
            
            // Reload the peer evaluation data
            await loadPeerEvaluationData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to assign peer evaluation", true);
        }
    } catch (error) {
        console.error("Error assigning peer evaluation:", error);
        showToast("Error assigning peer evaluation", true);
    }
});

// View peer evaluation details
async function viewPeerEvaluationDetails(evaluateeStaffId, periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/peer-evaluation-details/${evaluateeStaffId}/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            populatePeerEvaluationDetailsModal(data);
        } else {
            showToast("Failed to load evaluation details", true);
        }
    } catch (error) {
        console.error("Error loading evaluation details:", error);
        showToast("Error loading evaluation details", true);
    }
}

function populatePeerEvaluationDetailsModal(data) {
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('peerEvaluationDetailsModal');
    if (!modal) {
        modal = createPeerEvaluationDetailsModal();
        document.body.appendChild(modal);
    }
    
    // Populate employee info
    document.getElementById('peerDetailsEmployeeName').textContent = data.employee_name;
    document.getElementById('peerDetailsDepartment').textContent = data.department_name;
    document.getElementById('peerDetailsPeriod').textContent = data.period_name;
    
    // Populate evaluator details
    const evaluations = data.evaluations || [];
    
    // Department Head
    const deptHeadEval = evaluations.find(e => e.evaluator_type === 'department_head');
    populateEvaluatorSection('deptHead', deptHeadEval);
    
    // Same Department Peer
    const samePeerEval = evaluations.find(e => e.evaluator_type === 'same_department_peer');
    populateEvaluatorSection('samePeer', samePeerEval);
    
    // External Peer
    const externalPeerEval = evaluations.find(e => e.evaluator_type === 'outsider');
    populateEvaluatorSection('externalPeer', externalPeerEval);
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

function populateEvaluatorSection(prefix, evaluation) {
    if (evaluation && evaluation.evaluation_status === 'submitted') {
        document.getElementById(`${prefix}Name`).textContent = evaluation.evaluator_name;
        document.getElementById(`${prefix}Status`).innerHTML = '<span class="badge bg-success">Submitted</span>';
        
        // Populate scores
        const criteria = [
            'quality_of_work', 'quantity_of_work', 'job_knowledge', 'initiative', 'reliability',
            'job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline',
            'ability_to_learn', 'ability_to_organize', 'cooperation', 'development_orientation', 'planning_capability'
        ];
        
        criteria.forEach(criterion => {
            const element = document.getElementById(`${prefix}_${criterion}`);
            if (element) {
                element.textContent = evaluation[criterion]?.toFixed(2) || '0.00';
            }
        });
        
        // Comments
        const commentsElement = document.getElementById(`${prefix}Comments`);
        if (commentsElement) {
            commentsElement.textContent = evaluation.comments || 'No comments';
        }
    } else {
        document.getElementById(`${prefix}Name`).textContent = evaluation ? evaluation.evaluator_name : 'Not Assigned';
        document.getElementById(`${prefix}Status`).innerHTML = '<span class="badge bg-warning">Pending</span>';
        
        // Clear scores
        const criteria = [
            'quality_of_work', 'quantity_of_work', 'job_knowledge', 'initiative', 'reliability',
            'job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline',
            'ability_to_learn', 'ability_to_organize', 'cooperation', 'development_orientation', 'planning_capability'
        ];
        
        criteria.forEach(criterion => {
            const element = document.getElementById(`${prefix}_${criterion}`);
            if (element) {
                element.textContent = '-';
            }
        });
        
        const commentsElement = document.getElementById(`${prefix}Comments`);
        if (commentsElement) {
            commentsElement.textContent = 'Evaluation not yet submitted';
        }
    }
}

function createPeerEvaluationDetailsModal() {
    const modalHTML = `
        <div class="modal fade" id="peerEvaluationDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Peer Evaluation Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-4">
                            <p><strong>Employee:</strong> <span id="peerDetailsEmployeeName"></span></p>
                            <p><strong>Department:</strong> <span id="peerDetailsDepartment"></span></p>
                            <p><strong>Period:</strong> <span id="peerDetailsPeriod"></span></p>
                        </div>
                        
                        <!-- Department Head Evaluation -->
                        <div class="card mb-3">
                            <div class="card-header bg-primary text-white">
                                <h6 class="mb-0">Department Head Evaluation</h6>
                            </div>
                            <div class="card-body">
                                <p><strong>Evaluator:</strong> <span id="deptHeadName"></span> <span id="deptHeadStatus"></span></p>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Criteria</th>
                                                <th class="text-center">Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Quality of Work</td><td class="text-center" id="deptHead_quality_of_work">-</td></tr>
                                            <tr><td>Quantity of Work</td><td class="text-center" id="deptHead_quantity_of_work">-</td></tr>
                                            <tr><td>Job Knowledge</td><td class="text-center" id="deptHead_job_knowledge">-</td></tr>
                                            <tr><td>Initiative</td><td class="text-center" id="deptHead_initiative">-</td></tr>
                                            <tr><td>Reliability</td><td class="text-center" id="deptHead_reliability">-</td></tr>
                                            <tr><td>Job Attitude</td><td class="text-center" id="deptHead_job_attitude">-</td></tr>
                                            <tr><td>Work Habits</td><td class="text-center" id="deptHead_work_habits">-</td></tr>
                                            <tr><td>Personal Relations</td><td class="text-center" id="deptHead_personal_relation">-</td></tr>
                                            <tr><td>Integrity</td><td class="text-center" id="deptHead_integrity">-</td></tr>
                                            <tr><td>Self-Discipline</td><td class="text-center" id="deptHead_self_discipline">-</td></tr>
                                            <tr><td>Ability to Learn</td><td class="text-center" id="deptHead_ability_to_learn">-</td></tr>
                                            <tr><td>Ability to Organize</td><td class="text-center" id="deptHead_ability_to_organize">-</td></tr>
                                            <tr><td>Cooperation</td><td class="text-center" id="deptHead_cooperation">-</td></tr>
                                            <tr><td>Development Orientation</td><td class="text-center" id="deptHead_development_orientation">-</td></tr>
                                            <tr><td>Planning Capability</td><td class="text-center" id="deptHead_planning_capability">-</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p><strong>Comments:</strong> <span id="deptHeadComments"></span></p>
                            </div>
                        </div>
                        
                        <!-- Same Department Peer Evaluation -->
                        <div class="card mb-3">
                            <div class="card-header bg-info text-white">
                                <h6 class="mb-0">Same Department Peer Evaluation</h6>
                            </div>
                            <div class="card-body">
                                <p><strong>Evaluator:</strong> <span id="samePeerName"></span> <span id="samePeerStatus"></span></p>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Criteria</th>
                                                <th class="text-center">Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Quality of Work</td><td class="text-center" id="samePeer_quality_of_work">-</td></tr>
                                            <tr><td>Quantity of Work</td><td class="text-center" id="samePeer_quantity_of_work">-</td></tr>
                                            <tr><td>Job Knowledge</td><td class="text-center" id="samePeer_job_knowledge">-</td></tr>
                                            <tr><td>Initiative</td><td class="text-center" id="samePeer_initiative">-</td></tr>
                                            <tr><td>Reliability</td><td class="text-center" id="samePeer_reliability">-</td></tr>
                                            <tr><td>Job Attitude</td><td class="text-center" id="samePeer_job_attitude">-</td></tr>
                                            <tr><td>Work Habits</td><td class="text-center" id="samePeer_work_habits">-</td></tr>
                                            <tr><td>Personal Relations</td><td class="text-center" id="samePeer_personal_relation">-</td></tr>
                                            <tr><td>Integrity</td><td class="text-center" id="samePeer_integrity">-</td></tr>
                                            <tr><td>Self-Discipline</td><td class="text-center" id="samePeer_self_discipline">-</td></tr>
                                            <tr><td>Ability to Learn</td><td class="text-center" id="samePeer_ability_to_learn">-</td></tr>
                                            <tr><td>Ability to Organize</td><td class="text-center" id="samePeer_ability_to_organize">-</td></tr>
                                            <tr><td>Cooperation</td><td class="text-center" id="samePeer_cooperation">-</td></tr>
                                            <tr><td>Development Orientation</td><td class="text-center" id="samePeer_development_orientation">-</td></tr>
                                            <tr><td>Planning Capability</td><td class="text-center" id="samePeer_planning_capability">-</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p><strong>Comments:</strong> <span id="samePeerComments"></span></p>
                            </div>
                        </div>
                        
                        <!-- External Peer Evaluation -->
                        <div class="card mb-3">
                            <div class="card-header bg-success text-white">
                                <h6 class="mb-0">External Department Peer Evaluation</h6>
                            </div>
                            <div class="card-body">
                                <p><strong>Evaluator:</strong> <span id="externalPeerName"></span> <span id="externalPeerStatus"></span></p>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Criteria</th>
                                                <th class="text-center">Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Quality of Work</td><td class="text-center" id="externalPeer_quality_of_work">-</td></tr>
                                            <tr><td>Quantity of Work</td><td class="text-center" id="externalPeer_quantity_of_work">-</td></tr>
                                            <tr><td>Job Knowledge</td><td class="text-center" id="externalPeer_job_knowledge">-</td></tr>
                                            <tr><td>Initiative</td><td class="text-center" id="externalPeer_initiative">-</td></tr>
                                            <tr><td>Reliability</td><td class="text-center" id="externalPeer_reliability">-</td></tr>
                                            <tr><td>Job Attitude</td><td class="text-center" id="externalPeer_job_attitude">-</td></tr>
                                            <tr><td>Work Habits</td><td class="text-center" id="externalPeer_work_habits">-</td></tr>
                                            <tr><td>Personal Relations</td><td class="text-center" id="externalPeer_personal_relation">-</td></tr>
                                            <tr><td>Integrity</td><td class="text-center" id="externalPeer_integrity">-</td></tr>
                                            <tr><td>Self-Discipline</td><td class="text-center" id="externalPeer_self_discipline">-</td></tr>
                                            <tr><td>Ability to Learn</td><td class="text-center" id="externalPeer_ability_to_learn">-</td></tr>
                                            <tr><td>Ability to Organize</td><td class="text-center" id="externalPeer_ability_to_organize">-</td></tr>
                                            <tr><td>Cooperation</td><td class="text-center" id="externalPeer_cooperation">-</td></tr>
                                            <tr><td>Development Orientation</td><td class="text-center" id="externalPeer_development_orientation">-</td></tr>
                                            <tr><td>Planning Capability</td><td class="text-center" id="externalPeer_planning_capability">-</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p><strong>Comments:</strong> <span id="externalPeerComments"></span></p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const temp = document.createElement('div');
    temp.innerHTML = modalHTML;
    return temp.firstElementChild;
}

// Initialize - Show current period info when modal opens
document.addEventListener('DOMContentLoaded', () => {
    // Load options when assign peer modal is opened
    const assignPeerModal = document.getElementById('assignPeerModal');
    if (assignPeerModal) {
        assignPeerModal.addEventListener('show.bs.modal', async function() {
            await loadPeerAssignmentOptions();
            
            // Show current period name in the info box
            const currentPeriodId = getCurrentPeriod();
            const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
            });
            
            if (periodResponse.ok) {
                const periods = await periodResponse.json();
                const currentPeriod = periods.find(p => p.period_id == currentPeriodId);
                if (currentPeriod) {
                    document.getElementById('currentPeriodInfo').textContent = currentPeriod.period_name;
                }
            }
        });
    }
});


// ====================== TEACHING SUMMARY DATA LOADING ======================
//Generate summary of merit pay for teaching staff
// Add event listener for the button (put this in your initialization code)
document.addEventListener('DOMContentLoaded', function() {
    const downloadBtn = document.getElementById('downloadSummaryMeritBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadSummaryMeritPay);
    }
});

async function downloadSummaryMeritPay() {
    try {
        showToast("Generating Summary of Merit Pay...", false);
        
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch summary data
        const response = await fetch(`${apiBaseUrl}/api/teaching-summary-merit-pay/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!response.ok) {
            showToast("Failed to load summary data", true);
            return;
        }
        
        const data = await response.json();
        generateSummaryMeritPayPDF(data);
        
    } catch (error) {
        console.error("Error generating Summary of Merit Pay:", error);
        showToast("Error generating PDF", true);
    }
}

function generateSummaryMeritPayPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'legal'); // Landscape
    
    const formatNum = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return '0.00';
        return parseFloat(val).toFixed(2);
    };
    
    let yPos = 5;
    const leftMargin = 15;
    const pageWidth = 297; // A4 landscape width
    
    // ========== HEADER ==========
    // Logo
    const logoPath = '/public/photos/mseuf_logo.jpg';
    try {
        doc.addImage(logoPath, 'JPEG', leftMargin, yPos, 20, 20);
    } catch (e) {
        console.log('Logo not found, skipping...');
    }
    
    // University Name
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Manuel S. Enverga University Foundation - Candelaria Inc.', pageWidth / 2, yPos + 8, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Quezon, Philippines', pageWidth / 2, yPos + 13, { align: 'center' });
    
    yPos += 20;
    
    // Horizontal line
    doc.setLineWidth(0.5);
    const lineWidth = 180;
    doc.line((pageWidth / 2) - (lineWidth / 2), yPos, (pageWidth / 2) + (lineWidth / 2), yPos);
    yPos += 8;
    
    // Title
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('SUMMARY OF MERIT PAY', pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
    doc.text(`${data.department_name.toUpperCase()} DEPARTMENT`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
    doc.setFontSize(10);
    doc.text(`School Year ${data.academic_year}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;
    
    // ========== TABLE ==========
    const tableData = data.employees.map((emp, index) => [
        (index + 1).toString(),
        emp.employee_name,
        formatNum(emp.teaching_competence),
        formatNum(emp.effectiveness),
        formatNum(emp.professional_growth),
        formatNum(emp.teaching_experience),
        formatNum(emp.total_points),
        formatNum(emp.recommended_merit_pay),
        '' // Conforme column
    ]);
    
    doc.autoTable({
        startY: yPos,
        head: [[
            '',
            'NAME OF FACULTY',
            { content: 'Teaching\nCompetence\n20 points', styles: { halign: 'center' } },
            { content: 'Effectiveness in\nSchool Service\n15 points', styles: { halign: 'center' } },
            { content: 'Professional\nGrowth\n13 points', styles: { halign: 'center' } },
            { content: 'Teaching\nExperience\n2 points', styles: { halign: 'center' } },
            'Total',
            { content: 'Approved Merit\nPay/Subj/Month', styles: { halign: 'center' } },
            'Conforme'
        ]],
        body: tableData,
        theme: 'grid',
        styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.3
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 50 },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' },
            4: { cellWidth: 25, halign: 'center' },
            5: { cellWidth: 25, halign: 'center' },
            6: { cellWidth: 20, halign: 'center' },
            7: { cellWidth: 25, halign: 'center' },
            8: { cellWidth: 25, halign: 'center' }
        }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // ========== MERIT POINTS GUIDE ==========
    const guideData = [
        ['46 - 50', '45.00'],
        ['41 - 45', '28.00'],
        ['36 - 40', '23.00'],
        ['31 - 35', '18.00'],
        ['26 - 30', '15.00']
    ];
    
    doc.autoTable({
        startY: yPos,
        head: [['Merit Points', 'Recommended Merit Pay/subj/mo.']],
        body: guideData,
        theme: 'grid',
        styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: [0, 0, 0],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 30, halign: 'center' },
            1: { cellWidth: 50, halign: 'center' }
        },
        margin: { left: leftMargin }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // ========== SIGNATURE SECTION ==========
    // Check if we need a new page for signatures
    if (yPos > 160) {
        doc.addPage();
        yPos = 20;
    }

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Reviewed and Recommended for Approval:', leftMargin, yPos);
    yPos += 10;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    // Define signature positions (3 columns)
    const col1X = leftMargin + 7;
    const col2X = 97;
    const col3X = 187;
    const col4X = 277;
    const sigWidth = 50;

    // ========== ROW 1: 3 Signatures ==========
    // Lines
    doc.line(col1X, yPos, col1X + sigWidth, yPos);
    doc.line(col2X, yPos, col2X + sigWidth, yPos);
    doc.line(col3X, yPos, col3X + sigWidth, yPos);
    doc.line(col4X, yPos, col4X + sigWidth, yPos);
    yPos += 4;

    // Labels
    doc.text('Department Chair,', col1X + 9, yPos);
    doc.text('Administrative Officer', col2X + 7, yPos);
    doc.text('HR Officer for Affiliate Schools', col3X + 3, yPos);
    doc.text('Secretary, Promotions Board', col4X + 5, yPos);
    yPos += 3;
    doc.text('University Treasurer', col4X + 12, yPos);
    yPos += 12;

    // ========== ROW 2: 3 Signatures ==========
    // Lines
    doc.line(col1X, yPos, col1X + sigWidth, yPos);
    doc.line(col2X, yPos, col2X + sigWidth, yPos);
    doc.line(col3X, yPos, col3X + sigWidth, yPos);
    yPos += 4;

    // Labels
    doc.text('Dean of Studies', col1X + 12, yPos);
    doc.text('Vice President for Administration', col2X, yPos);
    doc.text('Vice President for Academics and Research', col3X - 8, yPos);
    yPos += 15;

    // ========== CENTER: Approved + Secretary ==========
    const centerX = pageWidth / 2;

    // Approved section
    doc.setFont(undefined, 'bold');
    doc.text('Approved:', centerX - 10, yPos);

    

    yPos += 10;

    // ========== BOTTOM CENTER: University President ==========
    doc.line(centerX - 25, yPos, centerX + 30, yPos);
    yPos += 4;
    doc.text('University President/COO', centerX - 20, yPos);
    
    // Save PDF
    const filename = `Summary_Merit_Pay_${data.department_name.replace(/\s+/g, '_')}_${data.academic_year.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    
    showToast("PDF downloaded successfully!", false);
}



// Load Teaching Summary Data
async function loadTeachingSummaryData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Load summary for the year
        const response = await fetch(`${apiBaseUrl}/api/teaching-summary/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const summaries = await response.json();
            displayTeachingSummaryData(summaries, currentPeriod.academic_year);
        }
    } catch (error) {
        console.error("Error loading teaching summary data:", error);
    }
}

function displayTeachingSummaryData(summaries, academicYear) {
    const tableBody = document.getElementById("summaryTableBody");
    tableBody.innerHTML = "";
    
    if (summaries.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No evaluation data available
                </td>
            </tr>
        `;
        return;
    }
    
    summaries.forEach(summary => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${summary.employee_name}</div>
                        <small class="text-muted">${summary.department}</small>
                    </div>
                </div>
            </td>
            <td class="text-center">
                <button class="btn btn-sm btn-info me-1" onclick="viewTeachingSummary(${summary.staff_id}, '${academicYear}')">
                    <i class="fas fa-eye me-1"></i> View
                </button>
                <button class="btn btn-sm btn-success" onclick="downloadTeachingSummary(${summary.staff_id})">
                    <i class="fas fa-download me-1"></i> PDF
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function viewTeachingSummary(staffId, academicYear) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year_id from current period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch detailed evaluation
        const response = await fetch(`${apiBaseUrl}/api/teaching-summary/detail/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateTeachingReportModal(data);
        }
    } catch (error) {
        console.error("Error viewing teaching summary:", error);
        showToast("Error loading summary", true);
    }
}

function populateTeachingReportModal(data) {
    // Employee Information
    document.getElementById('teaching_employee_name').textContent = data.employee_name || '-';
    document.getElementById('teaching_department').textContent = data.department_name || '-';
    document.getElementById('teaching_school_year').textContent = data.academic_year || '-';
    document.getElementById('teaching_position').textContent = data.position || '-';
    
    // (1) TEACHING COMPETENCE (20 Maximum Points)
    // a. DEAN (maximum 7 points)
    document.getElementById('teaching_dean_fs').textContent = data.first_semester?.dean_eval?.toFixed(2) || '_____';
    document.getElementById('teaching_dean_ss').textContent = data.second_semester?.dean_eval?.toFixed(2) || '_____';
    const deanAvg = calculateAverage(data.first_semester?.dean_eval, data.second_semester?.dean_eval);
    document.getElementById('teaching_dean_avg').textContent = deanAvg.toFixed(2);
    
    // b. Students (7 Maximum Points)
    document.getElementById('teaching_students_fs').textContent = data.first_semester?.student_eval?.toFixed(2) || '_____';
    document.getElementById('teaching_students_ss').textContent = data.second_semester?.student_eval?.toFixed(2) || '_____';
    const studentAvg = calculateAverage(data.first_semester?.student_eval, data.second_semester?.student_eval);
    document.getElementById('teaching_students_avg').textContent = studentAvg.toFixed(2);
    
    // c. Peers (6 Maximum Points)
    document.getElementById('teaching_peers_fs').textContent = data.first_semester?.peer_eval?.toFixed(2) || '_____';
    document.getElementById('teaching_peers_ss').textContent = data.second_semester?.peer_eval?.toFixed(2) || '_____';
    const peerAvg = calculateAverage(data.first_semester?.peer_eval, data.second_semester?.peer_eval);
    document.getElementById('teaching_peers_avg').textContent = peerAvg.toFixed(2);
    
    // (2) EFFECTIVENESS OF SCHOOL SERVICE (15 Maximum Points)
    // a. Committee Chairman/Head Teacher (5 maximum points)
    document.getElementById('teaching_committee_fs').textContent = data.first_semester?.committee_chair_eval?.toFixed(2) || '_____';
    document.getElementById('teaching_committee_ss').textContent = data.second_semester?.committee_chair_eval?.toFixed(2) || '_____';
    const committeeAvg = calculateAverage(data.first_semester?.committee_chair_eval, data.second_semester?.committee_chair_eval);
    document.getElementById('teaching_committee_avg').textContent = committeeAvg.toFixed(2);
    
    // b. Department Head/Dean Directors, Principals (10 max pts)
    document.getElementById('teaching_dept_head_fs').textContent = data.first_semester?.dept_head_eval?.toFixed(2) || '_____';
    document.getElementById('teaching_dept_head_ss').textContent = data.second_semester?.dept_head_eval?.toFixed(2) || '_____';
    const deptHeadAvg = calculateAverage(data.first_semester?.dept_head_eval, data.second_semester?.dept_head_eval);
    document.getElementById('teaching_dept_head_avg').textContent = deptHeadAvg.toFixed(2);
    
    // (3) PROFESSIONAL GROWTH (15 Maximum Points)
    // a. Attendance in Seminar Workshop (3 Maximum Points)
    document.getElementById('teaching_seminar_fs').textContent = data.first_semester?.seminar_attendance?.toFixed(2) || '_____';
    document.getElementById('teaching_seminar_ss').textContent = data.second_semester?.seminar_attendance?.toFixed(2) || '_____';
    const seminarTotal = Math.min(
        (parseFloat(data.first_semester?.seminar_attendance) || 0) + 
        (parseFloat(data.second_semester?.seminar_attendance) || 0), 
        3
    );
    document.getElementById('teaching_seminar_avg').textContent = seminarTotal.toFixed(2);
    
    // b. Publications approved by University Council (3 Maximum Points)
    document.getElementById('teaching_publications_fs').textContent = data.first_semester?.publications?.toFixed(2) || '_____';
    document.getElementById('teaching_publications_ss').textContent = data.second_semester?.publications?.toFixed(2) || '_____';
    const publicationsAvg = calculateAverage(data.first_semester?.publications, data.second_semester?.publications);
    document.getElementById('teaching_publications_avg').textContent = publicationsAvg.toFixed(2);
    
    // c. Scholarly achievements (3 Maximum Points)
    document.getElementById('teaching_scholarly_fs').textContent = data.first_semester?.scholarly_achievement?.toFixed(2) || '_____';
    document.getElementById('teaching_scholarly_ss').textContent = data.second_semester?.scholarly_achievement?.toFixed(2) || '_____';
    const scholarlyAvg = calculateAverage(data.first_semester?.scholarly_achievement, data.second_semester?.scholarly_achievement);
    document.getElementById('teaching_scholarly_avg').textContent = scholarlyAvg.toFixed(2);
    
    // d. Research/Instructional Materials (3 Maximum Points)
    document.getElementById('teaching_research_fs').textContent = data.first_semester?.research_conducted?.toFixed(2) || '_____';
    document.getElementById('teaching_research_ss').textContent = data.second_semester?.research_conducted?.toFixed(2) || '_____';
    const researchAvg = calculateAverage(data.first_semester?.research_conducted, data.second_semester?.research_conducted);
    document.getElementById('teaching_research_avg').textContent = researchAvg.toFixed(2);
    
    // e. Graduate units earned (5 Maximum Points)
    document.getElementById('teaching_graduate_fs').textContent = data.first_semester?.graduate_units?.toFixed(2) || '_____';
    document.getElementById('teaching_graduate_ss').textContent = data.second_semester?.graduate_units?.toFixed(2) || '_____';
    const graduateAvg = calculateAverage(data.first_semester?.graduate_units, data.second_semester?.graduate_units);
    document.getElementById('teaching_graduate_avg').textContent = graduateAvg.toFixed(2);
    
    // (4) TEACHING EXPERIENCE (2 points)
    document.getElementById('teaching_experience_fs').textContent = data.first_semester?.teaching_experience?.toFixed(2) || '_____';
    document.getElementById('teaching_experience_ss').textContent = data.second_semester?.teaching_experience?.toFixed(2) || '_____';
    const expAvg = calculateAverage(data.first_semester?.teaching_experience, data.second_semester?.teaching_experience);
    document.getElementById('teaching_experience_avg').textContent = expAvg.toFixed(2);
    
    // Calculate Subtotals
    const teachingCompetenceSubtotal = deanAvg + studentAvg + peerAvg;
    document.getElementById('teaching_competence_subtotal').textContent = teachingCompetenceSubtotal.toFixed(2);
    
    const effectivenessSubtotal = committeeAvg + deptHeadAvg;
    document.getElementById('effectiveness_service_subtotal').textContent = effectivenessSubtotal.toFixed(2);
    
    const professionalGrowthSubtotal = seminarTotal + publicationsAvg + scholarlyAvg + researchAvg + graduateAvg;
    document.getElementById('professional_growth_subtotal').textContent = professionalGrowthSubtotal.toFixed(2);
    
    document.getElementById('teaching_experience_subtotal').textContent = expAvg.toFixed(2);
    
    // Grand Total
    const grandTotal = teachingCompetenceSubtotal + effectivenessSubtotal + professionalGrowthSubtotal + expAvg;
    document.getElementById('teaching_grand_total').textContent = grandTotal.toFixed(2);
    
    // Calculate recommended increase (you can adjust this formula)
    const recommendedIncrease = calculateRecommendedIncrease(grandTotal);
    document.getElementById('recomendation_increase').textContent = recommendedIncrease;
    
    // Approved increase (placeholder - you may want to make this editable)
    document.getElementById('approved_increase').textContent = ' ';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('teachingReportModal'));
    modal.show();
}

// Helper function to calculate average (handles null/undefined values)
function calculateAverage(val1, val2) {
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;
    
    // If both are 0, return 0
    if (v1 === 0 && v2 === 0) return 0;
    
    // If only one has value, return that value
    if (v1 === 0) return v2;
    if (v2 === 0) return v1;
    
    // Both have values, return average
    return (v1 + v2) / 2;
}

function calculateRecommendedIncrease(totalPoints) {
    if (totalPoints >= 46 && totalPoints <= 54) {
        return '₱45.00';
    } else if (totalPoints >= 41 && totalPoints <= 45) {
        return '₱28.00';
    } else if (totalPoints >= 36 && totalPoints <= 40) {
        return '₱23.00';
    } else if (totalPoints >= 31 && totalPoints <= 35) {
        return '₱18.00';
    } else if (totalPoints >= 26 && totalPoints <= 30) {
        return '₱15.00';
    } else {
        return '-';
    }
}


async function downloadTeachingSummary(staffId) {
    try {
        showToast("Generating PDF...", false);
        
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch summary data
        const response = await fetch(`${apiBaseUrl}/api/teaching-summary/detail/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!response.ok) {
            showToast("Failed to load summary data", true);
            return;
        }
        
        const data = await response.json();
        generateTeachingSummaryPDF(data);
        
    } catch (error) {
        console.error("Error generating PDF:", error);
        showToast("Error generating PDF", true);
    }
}


function generateTeachingSummaryPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
   // Calculate average (same logic as your modal)
    const calcAvg = (val1, val2) => {
        const v1 = parseFloat(val1) || 0;
        const v2 = parseFloat(val2) || 0;
        if (v1 === 0 && v2 === 0) return 0;
        if (v1 === 0) return v2;
        if (v2 === 0) return v1;
        return (v1 + v2) / 2;
    };
    
    const formatVal = (val) => {
        if (val === null || val === undefined || val === 0) return '';
        return parseFloat(val).toFixed(2);
    };
    
    const fs = data.first_semester || {};
    const ss = data.second_semester || {};
    
    // Calculate all averages
    const deanAvg = calcAvg(fs.dean_eval, ss.dean_eval);
    const studentAvg = calcAvg(fs.student_eval, ss.student_eval);
    const peerAvg = calcAvg(fs.peer_eval, ss.peer_eval);
    const committeeAvg = calcAvg(fs.committee_chair_eval, ss.committee_chair_eval);
    const deptHeadAvg = calcAvg(fs.dept_head_eval, ss.dept_head_eval);
    const publicationsAvg = calcAvg(fs.publications, ss.publications);
    const scholarlyAvg = calcAvg(fs.scholarly_achievement, ss.scholarly_achievement);
    const researchAvg = calcAvg(fs.research_conducted, ss.research_conducted);
    const graduateAvg = calcAvg(fs.graduate_units, ss.graduate_units);
    const expAvg = calcAvg(fs.teaching_experience, ss.teaching_experience);

    const seminarTotal = Math.min(
        (parseFloat(fs.seminar_attendance) || 0) + 
        (parseFloat(ss.seminar_attendance) || 0), 
        3
    );
    
    // Calculate subtotals
    const teachingCompetenceSubtotal = deanAvg + studentAvg + peerAvg;
    const effectivenessSubtotal = committeeAvg + deptHeadAvg;
    const professionalGrowthSubtotal = seminarTotal + publicationsAvg + scholarlyAvg + researchAvg + graduateAvg;
    const grandTotal = teachingCompetenceSubtotal + effectivenessSubtotal + professionalGrowthSubtotal + expAvg;
    
    // Calculate recommended increase
    const calculateRecommendedIncrease = (totalPoints) => {
        if (totalPoints >= 46 && totalPoints <= 54) return 'PHP 45.00';
        else if (totalPoints >= 41 && totalPoints <= 45) return 'PHP 28.00';
        else if (totalPoints >= 36 && totalPoints <= 40) return 'PHP 23.00';
        else if (totalPoints >= 31 && totalPoints <= 35) return 'PHP 18.00';
        else if (totalPoints >= 26 && totalPoints <= 30) return 'PHP 15.00';
        else return '';
    };
    
    const recommendedIncrease = calculateRecommendedIncrease(grandTotal);
    
    // Helper to draw underline for empty fields
    const drawLine = (x, y, width) => {
        doc.line(x, y, x + width, y);
    };
    
    const drawValue = (x, y, value, width = 13) => { 
        if (value) {
            doc.text(value, x + width, y, { align: 'right' });
            doc.line(x, y + 1, x + width, y + 1);
        } else {
            drawLine(x, y + 1, width);
        }
    };
    
    let yPos = 10;
    const leftMargin = 15;
    const fsCol = 110;        // FS column
    const ssCol = 135;        // SS column  
    const avgCol = 160;       // Average column
    const evalCol = 185;      // EVALUATION column (subtotals)
    

    const logoPath = '/public/photos/mseuf_logo.jpg';
    try {
        doc.addImage(logoPath, 'PNG', leftMargin, yPos, 20, 20);  // x, y, width, height
    } catch (e) {
        console.log('Logo not found, skipping...');
    }
    
    // University Name (center, aligned with logo)
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Manuel S. Enverga University Foundation - Candelaria Inc.', 105, yPos + 8, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Quezon, Philippines', 105, yPos + 13, { align: 'center' });
    yPos += 18;  // Move down after header
    
    // Horizontal line separator
    doc.setLineWidth(0.5);
    const lineWidth4topline = 130;
    doc.line(105 - (lineWidth4topline / 2), yPos, 105 + (lineWidth4topline / 2), yPos);
    yPos += 8;

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('MERIT POINTS', 105, yPos, { align: 'center' });
    yPos += 15;
    

    // Employee Name and Department
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('NAME: ', leftMargin, yPos);
    doc.text(data.employee_name || '', leftMargin + 15, yPos);
    
    yPos += 6;
    doc.setFont(undefined, 'bold');
    doc.text((data.department_name + ' DEPARTMENT' || 'DEPARTMENT').toUpperCase(), leftMargin, yPos);
    doc.setFont(undefined, 'normal');
    
    yPos += 8;
    
    // Column Headers
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('EVALUATION', evalCol + 12, yPos, { align: 'center' });
    yPos += 5;
    doc.text('FS', fsCol + 12, yPos, { align: 'center' });     
    doc.text('SS', ssCol + 12, yPos, { align: 'center' });     
    doc.text('Average', avgCol + 12, yPos, { align: 'center' });
    
    doc.setFont(undefined, 'normal');
    yPos += 7;
    
    // (1) TEACHING COMPETENCE
    doc.setFont(undefined, 'bold');
    doc.text('(1) TEACHING COMPETENCE (20 Maximum Points)', leftMargin, yPos);
    doc.text(formatVal(teachingCompetenceSubtotal), evalCol + 12, yPos, { align: 'center' });  // Subtotal in EVALUATION column
    drawLine(evalCol, yPos + 1, 15);  // Underline in EVALUATION column
    doc.setFont(undefined, 'normal');
    yPos += 7;
    
    doc.text('a.', leftMargin + 5, yPos);
    doc.text('DEAN ( maximum 7 points)', leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.dean_eval), 13);
    drawValue(ssCol, yPos, formatVal(ss.dean_eval), 13);
    drawValue(avgCol, yPos, formatVal(deanAvg), 13);
    yPos += 6;
    
    doc.text('b.', leftMargin + 5, yPos);
    doc.text('Students (7 Maximum Points)', leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.student_eval), 13);
    drawValue(ssCol, yPos, formatVal(ss.student_eval), 13);
    drawValue(avgCol, yPos, formatVal(studentAvg), 13);
    yPos += 6;
    
    doc.text('c.', leftMargin + 5, yPos);
    doc.text('Peers (6 Maximum Points)', leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.peer_eval), 13);
    drawValue(ssCol, yPos, formatVal(ss.peer_eval), 13);
    drawValue(avgCol, yPos, formatVal(peerAvg), 13);
    yPos += 10;
    
    // (2) EFFECTIVENESS OF SCHOOL SERVICE
    doc.setFont(undefined, 'bold');
    doc.text('(2) EFFECTIVENESS OF SCHOOL SERVICE (15 Maximum Points)', leftMargin, yPos);
    doc.text(formatVal(effectivenessSubtotal), evalCol + 12, yPos, { align: 'center' });
    drawLine(evalCol, yPos + 1, 15);
    doc.setFont(undefined, 'normal');
    yPos += 7;
    
    doc.text('a.', leftMargin + 5, yPos);
    doc.text('Committee Chairman/Head Teacher(5 maximum points)', leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.committee_chair_eval), 13);
    drawValue(ssCol, yPos, formatVal(ss.committee_chair_eval), 13);
    drawValue(avgCol, yPos, formatVal(committeeAvg), 13);
    yPos += 6;
    
    doc.text('b.', leftMargin + 5, yPos);
    doc.text('Department Head/Dean Directors,Principals(10 max pts)', leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.dept_head_eval), 13);
    drawValue(ssCol, yPos, formatVal(ss.dept_head_eval), 13);
    drawValue(avgCol, yPos, formatVal(deptHeadAvg), 13);
    yPos += 10;
    
    // (3) PROFESSIONAL GROWTH
    doc.setFont(undefined, 'bold');
    doc.text('(3) PROFESSIONAL GROWTH ( 15 Maximum Points)', leftMargin, yPos);
    doc.text(formatVal(professionalGrowthSubtotal), evalCol +12, yPos, { align: 'center' });
    drawLine(evalCol, yPos + 1, 15);
    doc.setFont(undefined, 'normal');
    yPos += 7;
    
    doc.text('a.', leftMargin + 5, yPos);
    const seminarText = doc.splitTextToSize('Attendance in Seminar Workshop in Service Training, etc. (3 Maximum Points)', 70);
    doc.text(seminarText, leftMargin + 10, yPos);
    drawValue(fsCol, yPos + (seminarText.length > 1 ? 3 : 0), formatVal(fs.seminar_attendance), 13);
    drawValue(ssCol, yPos + (seminarText.length > 1 ? 3 : 0), formatVal(ss.seminar_attendance), 13);
    drawValue(avgCol, yPos + (seminarText.length > 1 ? 3 : 0), formatVal(seminarTotal), 13);
    yPos += (seminarText.length > 1 ? 9 : 6);
    
    doc.text('b.', leftMargin + 5, yPos);
    const pubText = doc.splitTextToSize('Publications approved by the University Council (3 Maximum Points)', 70);
    doc.text(pubText, leftMargin + 10, yPos);
    drawValue(fsCol, yPos + (pubText.length > 1 ? 3 : 0), formatVal(fs.publications), 13);
    drawValue(ssCol, yPos + (pubText.length > 1 ? 3 : 0), formatVal(ss.publications), 13);
    drawValue(avgCol, yPos + (pubText.length > 1 ? 3 : 0), formatVal(publicationsAvg), 13);
    yPos += (pubText.length > 1 ? 9 : 6);
    
    doc.text('c.', leftMargin + 5, yPos);
    const scholarlyText = doc.splitTextToSize('Scholarly achievements like Lecturing, Speaking etc. subject to the evaluation of the formal paper presented to University Council (3 Maximum Points)', 70);
    doc.text(scholarlyText, leftMargin + 10, yPos);
    const scholarlyLines = scholarlyText.length;
    drawValue(fsCol, yPos + (scholarlyLines * 3), formatVal(fs.scholarly_achievement), 13);
    drawValue(ssCol, yPos + (scholarlyLines * 3), formatVal(ss.scholarly_achievement), 13);
    drawValue(avgCol, yPos + (scholarlyLines * 3), formatVal(scholarlyAvg), 13);
    yPos += (scholarlyLines * 4.5) + 2;
    
    doc.text('d', leftMargin + 5, yPos);
    const researchText = doc.splitTextToSize('Research conducted or development of Instructional Materials as approved by the University Council (3 Maximum Points)', 70);
    doc.text(researchText, leftMargin + 10, yPos);
    const researchLines = researchText.length;
    drawValue(fsCol, yPos + (researchLines * 3), formatVal(fs.research_conducted), 13);
    drawValue(ssCol, yPos + (researchLines * 3), formatVal(ss.research_conducted), 13);
    drawValue(avgCol, yPos + (researchLines * 3), formatVal(researchAvg), 13);
    yPos += (researchLines * 4.5) + 2;
    
    doc.text('e.', leftMargin + 5, yPos);
    const gradText = doc.splitTextToSize('Graduate units earned (.5pt/3 Units)    (5 Maximum Points', 70);
    doc.text(gradText, leftMargin + 10, yPos);
    drawValue(fsCol, yPos, formatVal(fs.graduate_units), 13);
    drawValue(ssCol, yPos, formatVal(ss.graduate_units), 13);
    drawValue(avgCol, yPos, formatVal(graduateAvg), 13);
    yPos += 10;
    
    // (4) TEACHING EXPERIENCE
    doc.setFont(undefined, 'bold');
    doc.text('(4) TEACHING EXPERIENCE        (2pts)', leftMargin, yPos);
    doc.text(formatVal(expAvg), evalCol + 12, yPos, { align: 'center' });
    drawLine(evalCol, yPos + 1, 15);
    yPos += 10;
    
    // TOTAL
    doc.setFont(undefined, 'normal');
    doc.text('Total Point/s', leftMargin + 100, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(formatVal(grandTotal), evalCol + 12, yPos, { align: 'center' });
    drawLine(evalCol, yPos + 1, 15);
    yPos += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text('Recommended merit pay/subject/month', leftMargin + 100, yPos);
    drawLine(evalCol, yPos + 1, 15);
    if (recommendedIncrease) {
        doc.text(recommendedIncrease, evalCol + 12, yPos, { align: 'center' });
    }
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.text('Approved increase', leftMargin + 100, yPos);
    drawLine(evalCol, yPos + 1, 15);
    yPos += 10;
    
    // REMARKS
    doc.setFont(undefined, 'bold');
    doc.text('REMARKS:', leftMargin, yPos);
    drawLine(leftMargin + 20, yPos + 1, 165);
    yPos += 6;
    drawLine(leftMargin, yPos + 1, 190);
    yPos += 10;
    
    // Reviewed and Recommended by
    doc.setFont(undefined, 'normal');
    doc.text('Reviewed and Recommended by:', leftMargin, yPos);
    yPos += 7;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    
    // Define 3 columns
    const col1X = leftMargin + 10;
    const col2X = 80;
    const col3X = 145;
    const lineWidth = 50;
    
    // ========== ROW 1 ==========
    
    // Column 1: CS-Department Chair
    doc.setFont(undefined, 'bold');
    doc.text('WISHIEL C. ILLUMIN', col1X + (lineWidth / 2), yPos, { align: 'center' });
    doc.setFontSize(9);
    doc.text('CS-Department Chair', col1X + (lineWidth / 2), yPos + 5, { align: 'center' });
    
    // Column 2: Internal Auditor
    drawLine(col2X, yPos, lineWidth);
    doc.text('Internal Auditor', col2X + (lineWidth / 2), yPos + 5, { align: 'center' });
    
    // Column 3: Dean of Studies
    drawLine(col3X, yPos, lineWidth);
    doc.text('Dean of Studies', col3X + (lineWidth / 2), yPos + 5, { align: 'center' });
    
    yPos += 15;
    
    // ========== ROW 2 ==========
    
    // Column 1: Secretary, Promotion Board Member
    drawLine(col1X, yPos, lineWidth);
    doc.setFontSize(8);
    const sec1Line1 = 'Secretary, Promotion Board';
    const sec1Line2 = 'Member';
    doc.text(sec1Line1, col1X + (lineWidth / 2), yPos + 5, { align: 'center' });
    doc.text(sec1Line2, col1X + (lineWidth / 2), yPos + 9, { align: 'center' });
    
    // Column 2: VP Academic Affairs Chairman
    drawLine(col2X, yPos, lineWidth);
    const sec2Line1 = 'VP Academic Affairs';
    const sec2Line2 = 'Chairman';
    doc.text(sec2Line1, col2X + (lineWidth / 2), yPos + 5, { align: 'center' });
    doc.text(sec2Line2, col2X + (lineWidth / 2), yPos + 9, { align: 'center' });
    
    // Column 3: Faculty President Member
    drawLine(col3X, yPos, lineWidth);
    const sec3Line1 = 'Faculty President';
    const sec3Line2 = 'Member';
    doc.text(sec3Line1, col3X + (lineWidth / 2), yPos + 5, { align: 'center' });
    doc.text(sec3Line2, col3X + (lineWidth / 2), yPos + 9, { align: 'center' });
    
    yPos += 15;
    
    // Save PDF
    const filename = `Merit_Points_${data.employee_name?.replace(/\s+/g, '_')}_${data.academic_year?.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    
    showToast("PDF downloaded successfully!", false);
}






// ====================== NON-TEACHING SUMMARY DATA LOADING ======================
async function loadNonTeachingSummaryData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-summary/${yearId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const summaries = await response.json();
            displayNonTeachingSummaryData(summaries, currentPeriod.academic_year);
        }
    } catch (error) {
        console.error("Error loading non-teaching summary:", error);
        showToast("Failed to load summaries", true);
    }
}

function displayNonTeachingSummaryData(summaries, academicYear) {
    const tableBody = document.getElementById("summaryTableBody");
    tableBody.innerHTML = "";
    
    if (summaries.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No evaluation data available
                </td>
            </tr>
        `;
        return;
    }
    
    summaries.forEach(summary => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${summary.employee_name}</div>
                        <small class="text-muted">${summary.department_name}</small>
                    </div>
                </div>
            </td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-sm btn-info me-1" onclick="viewNonTeachingSummary(${summary.staff_id}, '${academicYear}')">
                        <i class="fas fa-eye me-1"></i> View
                    </button>
                    <button class="btn btn-sm btn-success" onclick="downloadNonTeachingSummary(${summary.staff_id}, '${academicYear}')">
                        <i class="fas fa-file-pdf me-1"></i> PDF
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
}

async function viewNonTeachingSummary(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year_id from current period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch detailed summary
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-summary/detail/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateNonTeachingReportModal(data);
        }
    } catch (error) {
        console.error("Error viewing non-teaching summary:", error);
        showToast("Error loading summary", true);
    }
}

function populateNonTeachingReportModal(data) {
    // Store raw calculated values for accurate totals
    window.ntRawValues = {
        productivity: {},
        attitude: {},
        competence: {}
    };
    
    // Employee Information
    document.getElementById('nt_employee_name').textContent = data.employee_name || '-';
    document.getElementById('nt_department').textContent = data.department_name || '-';
    document.getElementById('nt_school_year').textContent = data.academic_year || '-';
    document.getElementById('nt_position').textContent = data.position || '-';
    document.getElementById('nt_grade_step').textContent = data.grade_step || '-';
    
    // Update semester headers
    document.getElementById('first_sem').textContent = `${data.first_semester_period || '-'}`;
    document.getElementById('second_sem').textContent = `${data.second_semester_period || '-'}`;
    
    const fs = data.first_semester || {};
    const ss = data.second_semester || {};
    
    // A. PRODUCTIVITY (25 points)
    populateCriteriaRow('quality', fs.productivity?.quality_of_work || {}, ss.productivity?.quality_of_work || {}, 'productivity');
    populateCriteriaRow('quantity', fs.productivity?.quantity_of_work || {}, ss.productivity?.quantity_of_work || {}, 'productivity');
    populateCriteriaRow('job_knowledge', fs.productivity?.job_knowledge || {}, ss.productivity?.job_knowledge || {}, 'productivity');
    populateCriteriaRow('initiative', fs.productivity?.initiative || {}, ss.productivity?.initiative || {}, 'productivity');
    populateCriteriaRow('reliability', fs.productivity?.reliability || {}, ss.productivity?.reliability || {}, 'productivity');
    
    const productivityTotal = calculateCategoryTotalRaw('productivity');
    document.getElementById('nt_productivity_grand_total').textContent = productivityTotal.toFixed(2);
    
    // B. ATTITUDE (25 points)
    populateCriteriaRow('job_attitude', fs.attitude?.job_attitude || {}, ss.attitude?.job_attitude || {}, 'attitude');
    populateCriteriaRow('work_habits', fs.attitude?.work_habits || {}, ss.attitude?.work_habits || {}, 'attitude');
    populateCriteriaRow('personal_relation', fs.attitude?.personal_relation || {}, ss.attitude?.personal_relation || {}, 'attitude');
    populateCriteriaRow('integrity', fs.attitude?.integrity || {}, ss.attitude?.integrity || {}, 'attitude');
    populateCriteriaRow('self_discipline', fs.attitude?.self_discipline || {}, ss.attitude?.self_discipline || {}, 'attitude');
    
    const attitudeTotal = calculateCategoryTotalRaw('attitude');
    document.getElementById('nt_attitude_grand_total').textContent = attitudeTotal.toFixed(2);
    
    // C. PROMOTIONAL COMPETENCE (25 points)
    populateCriteriaRow('ability_learn', fs.competence?.ability_to_learn || {}, ss.competence?.ability_to_learn || {}, 'competence');
    populateCriteriaRow('ability_organize', fs.competence?.ability_to_organize || {}, ss.competence?.ability_to_organize || {}, 'competence');
    populateCriteriaRow('cooperation', fs.competence?.cooperation || {}, ss.competence?.cooperation || {}, 'competence');
    populateCriteriaRow('development', fs.competence?.development_orientation || {}, ss.competence?.development_orientation || {}, 'competence');
    populateCriteriaRow('planning', fs.competence?.planning_capability || {}, ss.competence?.planning_capability || {}, 'competence');
    
    const competenceTotal = calculateCategoryTotalRaw('competence');
    document.getElementById('nt_competence_grand_total').textContent = competenceTotal.toFixed(2);
    
    // D. ATTENDANCE (15 points) - FIXED CALCULATION
    document.getElementById('nt_absences_fs').textContent = (fs.attendance?.absences || 0).toFixed(2);
    document.getElementById('nt_absences_ss').textContent = (ss.attendance?.absences || 0).toFixed(2);
    const absencesAvg = ((parseFloat(fs.attendance?.absences) || 0) + (parseFloat(ss.attendance?.absences) || 0)) / 2;
    document.getElementById('nt_absences_total_avg').textContent = absencesAvg.toFixed(2);
    
    document.getElementById('nt_tardiness_fs').textContent = (fs.attendance?.tardiness || 0).toFixed(2);
    document.getElementById('nt_tardiness_ss').textContent = (ss.attendance?.tardiness || 0).toFixed(2);
    const tardinessAvg = ((parseFloat(fs.attendance?.tardiness) || 0) + (parseFloat(ss.attendance?.tardiness) || 0)) / 2;
    document.getElementById('nt_tardiness_total_avg').textContent = tardinessAvg.toFixed(2);
    
    document.getElementById('nt_minutes_late_fs').textContent = (fs.attendance?.minutes_late || 0).toFixed(2);
    document.getElementById('nt_minutes_late_ss').textContent = (ss.attendance?.minutes_late || 0).toFixed(2);
    const minutesAvg = ((parseFloat(fs.attendance?.minutes_late) || 0) + (parseFloat(ss.attendance?.minutes_late) || 0)) / 2;
    document.getElementById('nt_minutes_late_total_avg').textContent = minutesAvg.toFixed(2);
    
    const attendanceTotal = absencesAvg + tardinessAvg + minutesAvg;
    document.getElementById('nt_attendance_grand_total').textContent = attendanceTotal.toFixed(2);
    
    // E. PROFESSIONAL ADVANCEMENT (3 points)
    document.getElementById('nt_seminar_fs').textContent = (fs.seminar || 0).toFixed(2);
    document.getElementById('nt_seminar_ss').textContent = (ss.seminar || 0).toFixed(2);
    const seminarTotal = Math.min((parseFloat(fs.seminar) || 0) + (parseFloat(ss.seminar) || 0), 3);

    document.getElementById('nt_seminar_total_avg').textContent = seminarTotal.toFixed(2);
    document.getElementById('nt_seminar_grand_total').textContent = seminarTotal.toFixed(2);
    
    // F. INSTITUTIONAL INVOLVEMENT (2 points)
    document.getElementById('nt_institutional_fs').textContent = (fs.institutional || 0).toFixed(2);
    document.getElementById('nt_institutional_ss').textContent = (ss.institutional || 0).toFixed(2);
    const institutionalTotal = Math.min((parseFloat(fs.institutional) || 0) + (parseFloat(ss.institutional) || 0), 2);

    document.getElementById('nt_institutional_total_avg').textContent = institutionalTotal.toFixed(2);
    document.getElementById('nt_institutional_grand_total').textContent = institutionalTotal.toFixed(2);
    
    // G. COMMUNITY INVOLVEMENT (3 points)
    document.getElementById('nt_community_fs').textContent = (fs.community || 0).toFixed(2);
    document.getElementById('nt_community_ss').textContent = (ss.community || 0).toFixed(2);
    const communityTotal = Math.min((parseFloat(fs.community) || 0) + (parseFloat(ss.community) || 0), 3);

    document.getElementById('nt_community_total_avg').textContent = communityTotal.toFixed(2);
    document.getElementById('nt_community_grand_total').textContent = communityTotal.toFixed(2);

    // H. WORK EXPERIENCE (2 points)
    document.getElementById('nt_work_experience_fs').textContent = (fs.work_experience || 0).toFixed(2);
    document.getElementById('nt_work_experience_ss').textContent = (ss.work_experience || 0).toFixed(2);
    const workExpTotal = Math.min( (parseFloat(fs.work_experience) || 0) + (parseFloat(ss.work_experience) || 0), 2);

    document.getElementById('nt_work_experience_total_avg').textContent = workExpTotal.toFixed(2);
    document.getElementById('nt_work_experience_grand_total').textContent = workExpTotal.toFixed(2);

    // PERFORMANCE AVERAGE RATING - Using raw values
    const performanceRating = productivityTotal + attitudeTotal + competenceTotal + attendanceTotal + 
                              seminarTotal + institutionalTotal + communityTotal + workExpTotal;
    document.getElementById('nt_performance_rating').textContent = performanceRating.toFixed(2);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('nonTeachingReportModal'));
    modal.show();
}

// Modified to store raw values
function populateCriteriaRow(prefix, fsData, ssData, category) {
    // First Semester (3 evaluators)
    document.getElementById(`nt_${prefix}_1_fs`).textContent = (fsData.evaluator1 || 0).toFixed(2);
    document.getElementById(`nt_${prefix}_2_fs`).textContent = (fsData.evaluator2 || 0).toFixed(2);
    document.getElementById(`nt_${prefix}_3_fs`).textContent = (fsData.evaluator3 || 0).toFixed(2);
    
    const fsAvg = ((parseFloat(fsData.evaluator1) || 0) + 
                   (parseFloat(fsData.evaluator2) || 0) + 
                   (parseFloat(fsData.evaluator3) || 0)) / 3;
    document.getElementById(`nt_${prefix}_avg_fs`).textContent = fsAvg.toFixed(2);
    
    // Second Semester (3 evaluators)
    document.getElementById(`nt_${prefix}_1_ss`).textContent = (ssData.evaluator1 || 0).toFixed(2);
    document.getElementById(`nt_${prefix}_2_ss`).textContent = (ssData.evaluator2 || 0).toFixed(2);
    document.getElementById(`nt_${prefix}_3_ss`).textContent = (ssData.evaluator3 || 0).toFixed(2);
    
    const ssAvg = ((parseFloat(ssData.evaluator1) || 0) + 
                   (parseFloat(ssData.evaluator2) || 0) + 
                   (parseFloat(ssData.evaluator3) || 0)) / 3;
    document.getElementById(`nt_${prefix}_avg_ss`).textContent = ssAvg.toFixed(2);
    
    // Total Average - Store raw value for accurate totals
    const totalAvg = (fsAvg + ssAvg) / 2;
    document.getElementById(`nt_${prefix}_total_avg`).textContent = totalAvg.toFixed(2);
    
    // Store raw value
    window.ntRawValues[category][prefix] = totalAvg;
}

// New function to calculate totals using raw values
function calculateCategoryTotalRaw(category) {
    let total = 0;
    const values = window.ntRawValues[category];
    
    for (const key in values) {
        total += values[key];
    }
    
    return total;
}


async function downloadNonTeachingSummary(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year_id from current period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch detailed summary
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-summary/detail/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            generateNonTeachingSummaryPDF(data);
        } else {
            showToast("Failed to fetch evaluation data", true);
        }
    } catch (error) {
        console.error("Error downloading non-teaching summary:", error);
        showToast("Error generating PDF", true);
    }
}

function generateNonTeachingSummaryPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'legal'); // Portrait orientation
    
    const formatNum = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return '';
        return parseFloat(val).toFixed(2);
    };
    
    const fs = data.first_semester || {};
    const ss = data.second_semester || {};
    
    let yPos = 15;
    const leftMargin = 10;
    
    // Employee Info Box
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.rect(leftMargin + 4, yPos, 166, 22); // Outer box
    doc.text('Evaluation Summary Report', leftMargin + 50, yPos + 5);
    doc.text(`School Year ${data.academic_year || '____'}`, 110, yPos + 5);
     
    doc.text(`Name of Employee:`, leftMargin + 10, yPos + 15);
    doc.text(`${data.employee_name || '____'}`, leftMargin + 40, yPos + 15);
    
    doc.text(`Department:`, leftMargin + 10, yPos + 20);
    doc.text(`${data.department_name || '____'}`, leftMargin + 40, yPos + 20);
    
    doc.text(`Position :`, 110, yPos + 15);
    doc.text(`${data.position || '____'}`, 130, yPos + 15);
    
    doc.text(`Grade Step`, 110, yPos + 20);
    doc.text(`${data.grade_step || '____'}`, 130, yPos + 20);
    
    yPos += 22;
    
    // Calculate all values first
    const calcPeerAvg = (data) => {
        return ((parseFloat(data?.evaluator1) || 0) + 
                (parseFloat(data?.evaluator2) || 0) + 
                (parseFloat(data?.evaluator3) || 0)) / 3;
    };
    
    const calcTotalAvg = (fsAvg, ssAvg) => {
        return (parseFloat(fsAvg) + parseFloat(ssAvg)) / 2;
    };
    
    // A. Productivity
    const quality_fs_avg = calcPeerAvg(fs.productivity?.quality_of_work);
    const quality_ss_avg = calcPeerAvg(ss.productivity?.quality_of_work);
    const quality_total = calcTotalAvg(quality_fs_avg, quality_ss_avg);
    
    const quantity_fs_avg = calcPeerAvg(fs.productivity?.quantity_of_work);
    const quantity_ss_avg = calcPeerAvg(ss.productivity?.quantity_of_work);
    const quantity_total = calcTotalAvg(quantity_fs_avg, quantity_ss_avg);
    
    const job_fs_avg = calcPeerAvg(fs.productivity?.job_knowledge);
    const job_ss_avg = calcPeerAvg(ss.productivity?.job_knowledge);
    const job_total = calcTotalAvg(job_fs_avg, job_ss_avg);
    
    const init_fs_avg = calcPeerAvg(fs.productivity?.initiative);
    const init_ss_avg = calcPeerAvg(ss.productivity?.initiative);
    const init_total = calcTotalAvg(init_fs_avg, init_ss_avg);
    
    const rel_fs_avg = calcPeerAvg(fs.productivity?.reliability);
    const rel_ss_avg = calcPeerAvg(ss.productivity?.reliability);
    const rel_total = calcTotalAvg(rel_fs_avg, rel_ss_avg);
    
    const productivity_total = quality_total + quantity_total + job_total + init_total + rel_total;
    
    // B. Attitude
    const job_att_fs_avg = calcPeerAvg(fs.attitude?.job_attitude);
    const job_att_ss_avg = calcPeerAvg(ss.attitude?.job_attitude);
    const job_att_total = calcTotalAvg(job_att_fs_avg, job_att_ss_avg);
    
    const work_fs_avg = calcPeerAvg(fs.attitude?.work_habits);
    const work_ss_avg = calcPeerAvg(ss.attitude?.work_habits);
    const work_total = calcTotalAvg(work_fs_avg, work_ss_avg);
    
    const personal_fs_avg = calcPeerAvg(fs.attitude?.personal_relation);
    const personal_ss_avg = calcPeerAvg(ss.attitude?.personal_relation);
    const personal_total = calcTotalAvg(personal_fs_avg, personal_ss_avg);
    
    const integrity_fs_avg = calcPeerAvg(fs.attitude?.integrity);
    const integrity_ss_avg = calcPeerAvg(ss.attitude?.integrity);
    const integrity_total = calcTotalAvg(integrity_fs_avg, integrity_ss_avg);
    
    const self_fs_avg = calcPeerAvg(fs.attitude?.self_discipline);
    const self_ss_avg = calcPeerAvg(ss.attitude?.self_discipline);
    const self_total = calcTotalAvg(self_fs_avg, self_ss_avg);
    
    const attitude_total = job_att_total + work_total + personal_total + integrity_total + self_total;
    
    // C. Competence
    const learn_fs_avg = calcPeerAvg(fs.competence?.ability_to_learn);
    const learn_ss_avg = calcPeerAvg(ss.competence?.ability_to_learn);
    const learn_total = calcTotalAvg(learn_fs_avg, learn_ss_avg);
    
    const organize_fs_avg = calcPeerAvg(fs.competence?.ability_to_organize);
    const organize_ss_avg = calcPeerAvg(ss.competence?.ability_to_organize);
    const organize_total = calcTotalAvg(organize_fs_avg, organize_ss_avg);
    
    const coop_fs_avg = calcPeerAvg(fs.competence?.cooperation);
    const coop_ss_avg = calcPeerAvg(ss.competence?.cooperation);
    const coop_total = calcTotalAvg(coop_fs_avg, coop_ss_avg);
    
    const dev_fs_avg = calcPeerAvg(fs.competence?.development_orientation);
    const dev_ss_avg = calcPeerAvg(ss.competence?.development_orientation);
    const dev_total = calcTotalAvg(dev_fs_avg, dev_ss_avg);
    
    const plan_fs_avg = calcPeerAvg(fs.competence?.planning_capability);
    const plan_ss_avg = calcPeerAvg(ss.competence?.planning_capability);
    const plan_total = calcTotalAvg(plan_fs_avg, plan_ss_avg);
    
    const competence_total = learn_total + organize_total + coop_total + dev_total + plan_total;
    
    // D. Attendance - Put points directly in Ave. columns
    const absences_fs = parseFloat(fs.attendance?.absences) || 0;
    const absences_ss = parseFloat(ss.attendance?.absences) || 0;
    const absences_total = (absences_fs + absences_ss) / 2;
    
    const tardiness_fs = parseFloat(fs.attendance?.tardiness) || 0;
    const tardiness_ss = parseFloat(ss.attendance?.tardiness) || 0;
    const tardiness_total = (tardiness_fs + tardiness_ss) / 2;
    
    const minutes_fs = parseFloat(fs.attendance?.minutes_late) || 0;
    const minutes_ss = parseFloat(ss.attendance?.minutes_late) || 0;
    const minutes_total = (minutes_fs + minutes_ss) / 2;
    
    const attendance_total = absences_total + tardiness_total + minutes_total;
    
    // E-H: Other categories
    const seminar_fs = parseFloat(fs.seminar) || 0;
    const seminar_ss = parseFloat(ss.seminar) || 0;
    const seminarTotal = Math.min(seminar_fs + seminar_ss, 3);
    
    const institutional_fs = parseFloat(fs.institutional) || 0;
    const institutional_ss = parseFloat(ss.institutional) || 0;
    const institutional_total = (institutional_fs + institutional_ss) / 2;
    
    const community_fs = parseFloat(fs.community) || 0;
    const community_ss = parseFloat(ss.community) || 0;
    const community_total = Math.min(community_fs + community_ss, 3);
    
    const work_exp_fs = parseFloat(fs.work_experience) || 0;
    const work_exp_ss = parseFloat(ss.work_experience) || 0;
    const workExpTotal = Math.min(work_exp_fs + work_exp_ss, 2);
    
    const performance_rating = productivity_total + attitude_total + competence_total + 
                               attendance_total + seminarTotal + institutional_total + 
                               community_total + workExpTotal;

    // Create table data
    const tableData = [
        // Header row with semester labels
        [
            '',
            { content: data.first_semester_period || '-', colSpan: 4, styles: { halign: 'center' } },
            { content: data.second_semester_period || '-', colSpan: 4, styles: { halign: 'center' } },
            '', 'Total'
        ],
        [
            'A. Productivity (25 points)', '1', '2', '3', 'Ave.', '1', '2', '3', 'Ave.', 'Total Ave.', ''
        ],
        // Productivity rows
        ['1. Quality of Work', 
         formatNum(fs.productivity?.quality_of_work?.evaluator1), 
         formatNum(fs.productivity?.quality_of_work?.evaluator2), 
         formatNum(fs.productivity?.quality_of_work?.evaluator3), 
         formatNum(quality_fs_avg),
         formatNum(ss.productivity?.quality_of_work?.evaluator1), 
         formatNum(ss.productivity?.quality_of_work?.evaluator2), 
         formatNum(ss.productivity?.quality_of_work?.evaluator3), 
         formatNum(quality_ss_avg),
         formatNum(quality_total), ''],
        
        ['2. Quantity of Work', 
         formatNum(fs.productivity?.quantity_of_work?.evaluator1), 
         formatNum(fs.productivity?.quantity_of_work?.evaluator2), 
         formatNum(fs.productivity?.quantity_of_work?.evaluator3), 
         formatNum(quantity_fs_avg),
         formatNum(ss.productivity?.quantity_of_work?.evaluator1), 
         formatNum(ss.productivity?.quantity_of_work?.evaluator2), 
         formatNum(ss.productivity?.quantity_of_work?.evaluator3), 
         formatNum(quantity_ss_avg),
         formatNum(quantity_total), ''],
        
        ['3. Job Knowledge', 
         formatNum(fs.productivity?.job_knowledge?.evaluator1), 
         formatNum(fs.productivity?.job_knowledge?.evaluator2), 
         formatNum(fs.productivity?.job_knowledge?.evaluator3), 
         formatNum(job_fs_avg),
         formatNum(ss.productivity?.job_knowledge?.evaluator1), 
         formatNum(ss.productivity?.job_knowledge?.evaluator2), 
         formatNum(ss.productivity?.job_knowledge?.evaluator3), 
         formatNum(job_ss_avg),
         formatNum(job_total), ''],
        
        ['4. Initiative', 
         formatNum(fs.productivity?.initiative?.evaluator1), 
         formatNum(fs.productivity?.initiative?.evaluator2), 
         formatNum(fs.productivity?.initiative?.evaluator3), 
         formatNum(init_fs_avg),
         formatNum(ss.productivity?.initiative?.evaluator1), 
         formatNum(ss.productivity?.initiative?.evaluator2), 
         formatNum(ss.productivity?.initiative?.evaluator3), 
         formatNum(init_ss_avg),
         formatNum(init_total), ''],
        
        ['5. Reliability', 
         formatNum(fs.productivity?.reliability?.evaluator1), 
         formatNum(fs.productivity?.reliability?.evaluator2), 
         formatNum(fs.productivity?.reliability?.evaluator3), 
         formatNum(rel_fs_avg),
         formatNum(ss.productivity?.reliability?.evaluator1), 
         formatNum(ss.productivity?.reliability?.evaluator2), 
         formatNum(ss.productivity?.reliability?.evaluator3), 
         formatNum(rel_ss_avg),
         formatNum(rel_total), formatNum(productivity_total)],
        
        // Attitude section
        [{ content: 'B. Attitude (25 points)', colSpan: 11, styles: { fontStyle: 'bold' } }],
        
        ['1. Job Attitude', 
         formatNum(fs.attitude?.job_attitude?.evaluator1), 
         formatNum(fs.attitude?.job_attitude?.evaluator2), 
         formatNum(fs.attitude?.job_attitude?.evaluator3), 
         formatNum(job_att_fs_avg),
         formatNum(ss.attitude?.job_attitude?.evaluator1), 
         formatNum(ss.attitude?.job_attitude?.evaluator2), 
         formatNum(ss.attitude?.job_attitude?.evaluator3), 
         formatNum(job_att_ss_avg),
         formatNum(job_att_total), ''],
        
        ['2. Work Habits', 
         formatNum(fs.attitude?.work_habits?.evaluator1), 
         formatNum(fs.attitude?.work_habits?.evaluator2), 
         formatNum(fs.attitude?.work_habits?.evaluator3), 
         formatNum(work_fs_avg),
         formatNum(ss.attitude?.work_habits?.evaluator1), 
         formatNum(ss.attitude?.work_habits?.evaluator2), 
         formatNum(ss.attitude?.work_habits?.evaluator3), 
         formatNum(work_ss_avg),
         formatNum(work_total), ''],
        
        ['3. Personal Relation with Others', 
         formatNum(fs.attitude?.personal_relation?.evaluator1), 
         formatNum(fs.attitude?.personal_relation?.evaluator2), 
         formatNum(fs.attitude?.personal_relation?.evaluator3), 
         formatNum(personal_fs_avg),
         formatNum(ss.attitude?.personal_relation?.evaluator1), 
         formatNum(ss.attitude?.personal_relation?.evaluator2), 
         formatNum(ss.attitude?.personal_relation?.evaluator3), 
         formatNum(personal_ss_avg),
         formatNum(personal_total), ''],
        
        ['4. Integrity', 
         formatNum(fs.attitude?.integrity?.evaluator1), 
         formatNum(fs.attitude?.integrity?.evaluator2), 
         formatNum(fs.attitude?.integrity?.evaluator3), 
         formatNum(integrity_fs_avg),
         formatNum(ss.attitude?.integrity?.evaluator1), 
         formatNum(ss.attitude?.integrity?.evaluator2), 
         formatNum(ss.attitude?.integrity?.evaluator3), 
         formatNum(integrity_ss_avg),
         formatNum(integrity_total), ''],
        
        ['5. Self-Discipline', 
         formatNum(fs.attitude?.self_discipline?.evaluator1), 
         formatNum(fs.attitude?.self_discipline?.evaluator2), 
         formatNum(fs.attitude?.self_discipline?.evaluator3), 
         formatNum(self_fs_avg),
         formatNum(ss.attitude?.self_discipline?.evaluator1), 
         formatNum(ss.attitude?.self_discipline?.evaluator2), 
         formatNum(ss.attitude?.self_discipline?.evaluator3), 
         formatNum(self_ss_avg),
         formatNum(self_total), formatNum(attitude_total)],
        
        // Competence section
        [{ content: 'C. Promotional Competence (25 points)', colSpan: 11, styles: { fontStyle: 'bold' } }],
        
        ['1. Ability to Learn', 
         formatNum(fs.competence?.ability_to_learn?.evaluator1), 
         formatNum(fs.competence?.ability_to_learn?.evaluator2), 
         formatNum(fs.competence?.ability_to_learn?.evaluator3), 
         formatNum(learn_fs_avg),
         formatNum(ss.competence?.ability_to_learn?.evaluator1), 
         formatNum(ss.competence?.ability_to_learn?.evaluator2), 
         formatNum(ss.competence?.ability_to_learn?.evaluator3), 
         formatNum(learn_ss_avg),
         formatNum(learn_total), ''],
        
        ['2. Ability to Organize', 
         formatNum(fs.competence?.ability_to_organize?.evaluator1), 
         formatNum(fs.competence?.ability_to_organize?.evaluator2), 
         formatNum(fs.competence?.ability_to_organize?.evaluator3), 
         formatNum(organize_fs_avg),
         formatNum(ss.competence?.ability_to_organize?.evaluator1), 
         formatNum(ss.competence?.ability_to_organize?.evaluator2), 
         formatNum(ss.competence?.ability_to_organize?.evaluator3), 
         formatNum(organize_ss_avg),
         formatNum(organize_total), ''],
        
        ['3. Cooperation', 
         formatNum(fs.competence?.cooperation?.evaluator1), 
         formatNum(fs.competence?.cooperation?.evaluator2), 
         formatNum(fs.competence?.cooperation?.evaluator3), 
         formatNum(coop_fs_avg),
         formatNum(ss.competence?.cooperation?.evaluator1), 
         formatNum(ss.competence?.cooperation?.evaluator2), 
         formatNum(ss.competence?.cooperation?.evaluator3), 
         formatNum(coop_ss_avg),
         formatNum(coop_total), ''],
        
        ['4. Development-Orientation', 
         formatNum(fs.competence?.development_orientation?.evaluator1), 
         formatNum(fs.competence?.development_orientation?.evaluator2), 
         formatNum(fs.competence?.development_orientation?.evaluator3), 
         formatNum(dev_fs_avg),
         formatNum(ss.competence?.development_orientation?.evaluator1), 
         formatNum(ss.competence?.development_orientation?.evaluator2), 
         formatNum(ss.competence?.development_orientation?.evaluator3), 
         formatNum(dev_ss_avg),
         formatNum(dev_total), ''],
        
        ['5. Planning Capability', 
         formatNum(fs.competence?.planning_capability?.evaluator1), 
         formatNum(fs.competence?.planning_capability?.evaluator2), 
         formatNum(fs.competence?.planning_capability?.evaluator3), 
         formatNum(plan_fs_avg),
         formatNum(ss.competence?.planning_capability?.evaluator1), 
         formatNum(ss.competence?.planning_capability?.evaluator2), 
         formatNum(ss.competence?.planning_capability?.evaluator3), 
         formatNum(plan_ss_avg),
         formatNum(plan_total), formatNum(competence_total)],
        
        // Attendance section
        [{ content: 'D. Attendance (15 points)', colSpan: 11, styles: { fontStyle: 'bold' } }],
        ['1. Excused Absences without pay(5)', '', '', '', formatNum(absences_fs), '', '', '', formatNum(absences_ss), formatNum(absences_total), ''],
        ['2. Tardiness(5)', '', '', '', formatNum(tardiness_fs), '', '', '', formatNum(tardiness_ss), formatNum(tardiness_total), ''],
        ['3. Minutes Late (5)', '', '', '', formatNum(minutes_fs), '', '', '', formatNum(minutes_ss), formatNum(minutes_total), formatNum(attendance_total)],
        
        // Other sections
        [{ content: 'E. Professional Advancement (3 points)', colSpan: 11, styles: { fontStyle: 'bold' } }],
        ['1. Training/Seminars', '', '', '', formatNum(seminar_fs), '', '', '', formatNum(seminar_ss), formatNum(seminarTotal), formatNum(seminarTotal)],
        
        [{ content: 'F. Institutional Involvement &', styles: { fontStyle: 'bold' } },'','','',formatNum(institutional_fs),'','','',formatNum(institutional_ss),formatNum(institutional_total),formatNum(institutional_total)],
        [{ content: 'G. Community Involvement &', styles: { fontStyle: 'bold' } },'','','',formatNum(community_fs),'','','',formatNum(community_ss),formatNum(community_total),formatNum(community_total)],
        [{ content: 'H. Work Experience (2 points)', colSpan: 11, styles: { fontStyle: 'bold' } }],
        ['(.16 point for every year of', '', '', '',formatNum(work_exp_fs), '', '', '', formatNum(work_exp_ss), formatNum(workExpTotal), formatNum(workExpTotal)    ],

        [{ content: 'Performance Averange Rating :', colSpan: 10, styles: { fontStyle: 'bold' } }, formatNum(performance_rating)],
        [{ content: 'Recommendation :', colSpan: 11 }],
        [{ content: 'Remarks:', colSpan: 11 }]
    ];
    
    // Generate table
    doc.autoTable({
        startY: yPos,
        body: tableData,
        theme: 'grid',
        styles: { 
            fontSize: 8, 
            cellPadding: 1,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fillColor: [255, 255, 255] // Plain white
        },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 10, halign: 'center' },
            2: { cellWidth: 10, halign: 'center' },
            3: { cellWidth: 10, halign: 'center' },
            4: { cellWidth: 13, halign: 'center' },
            5: { cellWidth: 10, halign: 'center' },
            6: { cellWidth: 10, halign: 'center' },
            7: { cellWidth: 10, halign: 'center' },
            8: { cellWidth: 13, halign: 'center' },
            9: { cellWidth: 15, halign: 'center' },
            10: { cellWidth: 15, halign: 'center' }
        }
    });
    
    // Signature section
    yPos = doc.lastAutoTable.finalY + 10;
    
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9);
    doc.text('Prepared by :', leftMargin + 7, yPos);
    doc.text('Noted & Reviewed by:', 115, yPos);
    yPos += 10;
    
    doc.line(leftMargin + 7, yPos, leftMargin + 60, yPos);
    doc.line(115, yPos, 160, yPos);
    yPos += 4;
    doc.setFontSize(8);
    doc.text('HRD Staff II', leftMargin + 22, yPos);
    doc.text('Administrative / Personnel officer', 115, yPos);
    
    yPos += 10;
    doc.setFontSize(9);
    doc.text('Reviewed & Verified by:', leftMargin + 7, yPos);
    doc.text('Conforme:', 115, yPos);
    yPos += 10;
    
    doc.line(leftMargin + 7, yPos, leftMargin + 60, yPos);
    doc.line(115, yPos, 160, yPos);
    yPos += 4;
    doc.setFontSize(8);
    doc.text('HR Officer for Affiliate', leftMargin + 17, yPos);
    
    // Save
    const filename = `NonTeaching_Summary_${data.employee_name?.replace(/\s+/g, '_')}_${data.academic_year?.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    
    showToast("PDF downloaded successfully!", false);
}

// Helper functions for PDF generation
function createCriteriaRow(label, fsData, ssData, isLast, totalValue) {
    const fsEval1 = formatNum(fsData?.evaluator1);
    const fsEval2 = formatNum(fsData?.evaluator2);
    const fsEval3 = formatNum(fsData?.evaluator3);
    const fsAvg = formatNum(((parseFloat(fsData?.evaluator1) || 0) + (parseFloat(fsData?.evaluator2) || 0) + (parseFloat(fsData?.evaluator3) || 0)) / 3);
    
    const ssEval1 = formatNum(ssData?.evaluator1);
    const ssEval2 = formatNum(ssData?.evaluator2);
    const ssEval3 = formatNum(ssData?.evaluator3);
    const ssAvg = formatNum(((parseFloat(ssData?.evaluator1) || 0) + (parseFloat(ssData?.evaluator2) || 0) + (parseFloat(ssData?.evaluator3) || 0)) / 3);
    
    const totalAvg = formatNum((parseFloat(fsAvg) + parseFloat(ssAvg)) / 2);
    const total = isLast ? formatNum(totalValue) : '';
    
    return [label, fsEval1, fsEval2, fsEval3, fsAvg, ssEval1, ssEval2, ssEval3, ssAvg, totalAvg, total];
}

function formatNum(val) {
    if (val === null || val === undefined || isNaN(val) || val === 0) return '';
    return parseFloat(val).toFixed(2);
}

function calculateCategoryTotalPDF(category, fs, ss) {
    let total = 0;
    
    if (category === 'productivity') {
        const items = ['quality_of_work', 'quantity_of_work', 'job_knowledge', 'initiative', 'reliability'];
        items.forEach(item => {
            const fsAvg = ((parseFloat(fs.productivity?.[item]?.evaluator1) || 0) + (parseFloat(fs.productivity?.[item]?.evaluator2) || 0) + (parseFloat(fs.productivity?.[item]?.evaluator3) || 0)) / 3;
            const ssAvg = ((parseFloat(ss.productivity?.[item]?.evaluator1) || 0) + (parseFloat(ss.productivity?.[item]?.evaluator2) || 0) + (parseFloat(ss.productivity?.[item]?.evaluator3) || 0)) / 3;
            total += (fsAvg + ssAvg) / 2;
        });
    } else if (category === 'attitude') {
        const items = ['job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline'];
        items.forEach(item => {
            const fsAvg = ((parseFloat(fs.attitude?.[item]?.evaluator1) || 0) + (parseFloat(fs.attitude?.[item]?.evaluator2) || 0) + (parseFloat(fs.attitude?.[item]?.evaluator3) || 0)) / 3;
            const ssAvg = ((parseFloat(ss.attitude?.[item]?.evaluator1) || 0) + (parseFloat(ss.attitude?.[item]?.evaluator2) || 0) + (parseFloat(ss.attitude?.[item]?.evaluator3) || 0)) / 3;
            total += (fsAvg + ssAvg) / 2;
        });
    } else if (category === 'competence') {
        const items = ['ability_to_learn', 'ability_to_organize', 'cooperation', 'development_orientation', 'planning_capability'];
        items.forEach(item => {
            const fsAvg = ((parseFloat(fs.competence?.[item]?.evaluator1) || 0) + (parseFloat(fs.competence?.[item]?.evaluator2) || 0) + (parseFloat(fs.competence?.[item]?.evaluator3) || 0)) / 3;
            const ssAvg = ((parseFloat(ss.competence?.[item]?.evaluator1) || 0) + (parseFloat(ss.competence?.[item]?.evaluator2) || 0) + (parseFloat(ss.competence?.[item]?.evaluator3) || 0)) / 3;
            total += (fsAvg + ssAvg) / 2;
        });
    }
    
    return total;
}

function calculateGrandTotal(fs, ss) {
    const prod = calculateCategoryTotalPDF('productivity', fs, ss);
    const att = calculateCategoryTotalPDF('attitude', fs, ss);
    const comp = calculateCategoryTotalPDF('competence', fs, ss);
    const attend = ((parseFloat(fs.attendance?.absences) || 0) + (parseFloat(ss.attendance?.absences) || 0) + 
                    (parseFloat(fs.attendance?.tardiness) || 0) + (parseFloat(ss.attendance?.tardiness) || 0) + 
                    (parseFloat(fs.attendance?.minutes_late) || 0) + (parseFloat(ss.attendance?.minutes_late) || 0)) / 2;
    const seminar = ((parseFloat(fs.seminar) || 0) + (parseFloat(ss.seminar) || 0)) / 2;
    const institutional = ((parseFloat(fs.institutional) || 0) + (parseFloat(ss.institutional) || 0)) / 2;
    const community = ((parseFloat(fs.community) || 0) + (parseFloat(ss.community) || 0)) / 2;
    const work = ((parseFloat(fs.work_experience) || 0) + (parseFloat(ss.work_experience) || 0)) / 2;
    
    return prod + att + comp + attend + seminar + institutional + community + work;
}





// ====================== TEACHING RANKING DATA ======================
async function loadTeachingRankingData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;

        const response = await fetch(`${apiBaseUrl}/api/teaching-rankings/${yearId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const rankings = await response.json();
            displayTeachingRankingData(rankings);
        }
    } catch (error) {
        console.error("Error loading teaching ranking data:", error);
        showToast("Failed to load teaching rankings", true);
    }
}

function displayTeachingRankingData(rankings) {
    const tableBody = document.getElementById("rankingTableBody");
    tableBody.innerHTML = "";
    
    if (rankings.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No ranking data available
                </td>
            </tr>
        `;
        return;
    }
    
    rankings.forEach((ranking) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${ranking.employee_name}</div>
                        <small class="text-muted">${ranking.department_name}</small>
                    </div>
                </div>
            </td>
            <td class="text-center">
                <button class="btn btn-sm btn-info me-1" onclick="viewTeachingRankingHistory(${ranking.staff_id})">
                    <i class="fas fa-eye me-1"></i> View History
                </button>
                <button class="btn btn-sm btn-success" onclick="downloadRankingHistory(${ranking.staff_id})">
                    <i class="fas fa-download me-1"></i> PDF
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}


async function viewTeachingRankingHistory(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id;

        const response = await fetch(`${apiBaseUrl}/api/teaching-ranking-history/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateTeachingRankingHistoryModal(data);
        } else {
            showToast("Failed to load ranking history", true);
        }
    } catch (error) {
        console.error("Error viewing ranking history:", error);
        showToast("Error loading ranking history", true);
    }
}

function populateTeachingRankingHistoryModal(data) {
    const formatNum = (val) => (!val || val === 0) ? '____' : parseFloat(val).toFixed(2);
    
    // Basic Information
    document.getElementById('rank_employee_name').textContent = data.employee_name || '-';
    document.getElementById('rank_appointment').textContent = data.employment_type || '-';
    document.getElementById('rank_teaching_exp').textContent = '-';
    document.getElementById('rank_degree').textContent = '-';
    document.getElementById('rank_present_rank').textContent = data.present_rank || '-';
    document.getElementById('rank_present_rate').textContent = '-';
    
    // Year Headers 
    document.getElementById('rank_year1_header').textContent = data.year3_label || '-';
    document.getElementById('rank_year2_header').textContent = data.year2_label || '-';
    document.getElementById('rank_year3_header').textContent = data.year1_label || '-';
    
    // Teaching Experience
    const expOld = parseFloat(data.old_points?.teaching_experience) || 0;
    const expY1 = parseFloat(data.year1?.teaching_experience) || 0;
    const expY2 = parseFloat(data.year2?.teaching_experience) || 0;
    const expY3 = parseFloat(data.year3?.teaching_experience) || 0;
    
    document.getElementById('rank_exp_old').textContent = formatNum(expOld);
    document.getElementById('rank_exp_year1').textContent = formatNum(expY3);
    document.getElementById('rank_exp_year2').textContent = formatNum(expY2);
    document.getElementById('rank_exp_year3').textContent = formatNum(expY1);
    document.getElementById('rank_exp_total').textContent = formatNum(expOld + expY1 + expY2 + expY3);
    
    // ⭐ Seminar Points
    const seminarOld = parseFloat(data.old_points?.seminar) || 0;
    const seminarY1 = parseFloat(data.year1?.seminar_points) || 0;
    const seminarY2 = parseFloat(data.year2?.seminar_points) || 0;
    const seminarY3 = parseFloat(data.year3?.seminar_points) || 0;
    
    document.getElementById('rank_seminar_old').textContent = formatNum(seminarOld);
    document.getElementById('rank_seminar_year1').textContent = formatNum(seminarY3);
    document.getElementById('rank_seminar_year2').textContent = formatNum(seminarY2);
    document.getElementById('rank_seminar_year3').textContent = formatNum(seminarY1);
    document.getElementById('rank_seminar_total').textContent = formatNum(seminarOld + seminarY1 + seminarY2 + seminarY3);
    
    // Teaching Competence
    const compOld = parseFloat(data.old_points?.teaching_competence) || 0;
    const compY1 = parseFloat(data.year1?.teaching_competence) || 0;
    const compY2 = parseFloat(data.year2?.teaching_competence) || 0;
    const compY3 = parseFloat(data.year3?.teaching_competence) || 0;
    
    document.getElementById('rank_competence_old').textContent = formatNum(compOld);
    document.getElementById('rank_competence_year1').textContent = formatNum(compY3);
    document.getElementById('rank_competence_year2').textContent = formatNum(compY2);
    document.getElementById('rank_competence_year3').textContent = formatNum(compY1);
    document.getElementById('rank_competence_total').textContent = formatNum(compOld + compY1 + compY2 + compY3);
    
    // Effectiveness
    const effOld = parseFloat(data.old_points?.effectiveness) || 0;
    const effY1 = parseFloat(data.year1?.effectiveness) || 0;
    const effY2 = parseFloat(data.year2?.effectiveness) || 0;
    const effY3 = parseFloat(data.year3?.effectiveness) || 0;
    
    document.getElementById('rank_service_old').textContent = formatNum(effOld);
    document.getElementById('rank_service_year1').textContent = formatNum(effY3);
    document.getElementById('rank_service_year2').textContent = formatNum(effY2);
    document.getElementById('rank_service_year3').textContent = formatNum(effY1);
    document.getElementById('rank_service_total').textContent = formatNum(effOld + effY1 + effY2 + effY3);
    
    // Total Points per year
    const oldTotal = expOld + seminarOld + compOld + effOld;
    const year1Total = expY1 + seminarY1 + compY1 + effY1;
    const year2Total = expY2 + seminarY2 + compY2 + effY2;
    const year3Total = expY3 + seminarY3 + compY3 + effY3;
    const grandTotal = oldTotal + year1Total + year2Total + year3Total;

    document.getElementById('rank_old_total').textContent = formatNum(oldTotal);
    document.getElementById('rank_year1_total').textContent = formatNum(year3Total);
    document.getElementById('rank_year2_total').textContent = formatNum(year2Total);
    document.getElementById('rank_year3_total').textContent = formatNum(year1Total);
    document.getElementById('rank_grand_total').textContent = formatNum(grandTotal);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('teachingRankingHistoryModal'));
    modal.show();
}

async function downloadRankingHistory(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id;

        const response = await fetch(`${apiBaseUrl}/api/teaching-ranking-history/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            generateTeachingRankingPDF(data);
        } else {
            showToast("Failed to fetch ranking data", true);
        }
    } catch (error) {
        console.error("Error downloading ranking history:", error);
        showToast("Error generating PDF", true);
    }
}

function generateTeachingRankingPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait
    
    const formatNum = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return '____';
        return parseFloat(val).toFixed(1);
    };
    
    let yPos = 5;
    const leftMargin = 15;
    const rightMargin = 195;
    
    // ========== HEADER BOX ==========
    doc.setLineWidth(0.5);
    doc.rect(leftMargin, yPos, 180, 33); // Outer box
    doc.line(leftMargin + 120, yPos, leftMargin + 120, yPos + 33); // Vertical divider
    // Left side - University Info
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('MANUEL S. ENVERGA UNIVERSITY FOUNDATION CANDELARIA, INC', leftMargin + 2, yPos + 5);
    doc.text('Candelaria, Quezon', leftMargin + 45, yPos + 10);
    doc.text('PROCEDURES MANUAL', leftMargin + 45, yPos + 25);
    
    // Right side - Document Info
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text('Document Code: ', leftMargin + 122, yPos + 5);
    doc.text('Document Title: ', leftMargin + 122, yPos + 9);
    doc.text('Page No.: 1', leftMargin + 122, yPos + 13);
    doc.text('Revision No.: ', leftMargin + 122, yPos + 17);
    doc.text('Effectivity Date: ', leftMargin + 122, yPos + 21);
    doc.text('Prepared by: ', leftMargin + 122, yPos + 25);
    doc.text('Approved by: ', leftMargin + 122, yPos + 29);
    
    yPos += 35;
    
    // ========== TITLE ==========
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('POINT SYSTEM SUMMARY', 105, yPos + 3, { align: 'center' });
    yPos += 5;
    
    const schoolYear = `${data.year3_label || '____'} - ${data.year1_label || '____'}`;
    doc.text(`S.Y. ${schoolYear}`, 105, yPos + 3, { align: 'center' });
    yPos += 8;


    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    // Left column
    doc.text('Name:', leftMargin + 2, yPos + 5);
    doc.text(data.employee_name || '____________________', leftMargin + 35, yPos + 5);
    
    doc.text('Nature of Appointment:', leftMargin + 2, yPos + 10);
    doc.text(`${data.employment_type === 'full_time' ? 'Permanent Full-Time' : 'Part-Time'}`, leftMargin + 35, yPos + 10);
    
    doc.text('Teaching Experience:', leftMargin + 2, yPos + 15);
    doc.text('____________________', leftMargin + 35, yPos + 15);
    
    doc.text('Present Rank:', leftMargin + 2, yPos + 20);
    doc.text('____________________', leftMargin + 35, yPos + 20);
    
    doc.text('Present Rate:', leftMargin + 2, yPos + 25);
    doc.text('____________________', leftMargin + 35, yPos + 25);
    
    // Right column
    doc.text('Degree:', leftMargin + 93, yPos + 5);
    doc.text('____________________', leftMargin + 110, yPos + 5);
    
    yPos += 35;
    
    // ========== YEAR HEADERS ==========
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    
    const col1 = leftMargin + 2;
    const oldCol = 120;
    const year1Col = 140;
    const year2Col = 155;
    const year3Col = 170;
    const totalCol = 185;
    
    doc.text('OLD POINTS', oldCol, yPos, { align: 'center' });
    doc.text(data.year3_label || '____', year1Col, yPos, { align: 'center' });
    doc.text(data.year2_label || '____', year2Col, yPos, { align: 'center' });
    doc.text(data.year1_label || '____', year3Col, yPos, { align: 'center' });
    doc.text('TOTAL', totalCol, yPos, { align: 'center' });
    
    yPos += 5;
    
    doc.setFont(undefined, 'normal');
    
    // Calculate totals
    const eduOld = 0; // Not in data
    const eduY1 = 0;
    const eduY2 = 0;
    const eduY3 = 0;
    const eduTotal = 0;
    
    const expOld = parseFloat(data.old_points?.teaching_experience) || 0;
    const expY1 = parseFloat(data.year3?.teaching_experience) || 0;
    const expY2 = parseFloat(data.year2?.teaching_experience) || 0;
    const expY3 = parseFloat(data.year1?.teaching_experience) || 0;
    const expTotal = expOld + expY1 + expY2 + expY3;
    
    const seminarOld = parseFloat(data.old_points?.seminar) || 0;
    const seminarY1 = parseFloat(data.year3?.seminar_points) || 0;
    const seminarY2 = parseFloat(data.year2?.seminar_points) || 0;
    const seminarY3 = parseFloat(data.year1?.seminar_points) || 0;
    const seminarTotal = seminarOld + seminarY1 + seminarY2 + seminarY3;
    
    const compOld = parseFloat(data.old_points?.teaching_competence) || 0;
    const compY1 = parseFloat(data.year3?.teaching_competence) || 0;
    const compY2 = parseFloat(data.year2?.teaching_competence) || 0;
    const compY3 = parseFloat(data.year1?.teaching_competence) || 0;
    const compTotal = compOld + compY1 + compY2 + compY3;
    
    const effOld = parseFloat(data.old_points?.effectiveness) || 0;
    const effY1 = parseFloat(data.year3?.effectiveness) || 0;
    const effY2 = parseFloat(data.year2?.effectiveness) || 0;
    const effY3 = parseFloat(data.year1?.effectiveness) || 0;
    const effTotal = effOld + effY1 + effY2 + effY3;
    
    const oldTotal = expOld + seminarOld + compOld + effOld;
    const year1Total = expY1 + seminarY1 + compY1 + effY1;
    const year2Total = expY2 + seminarY2 + compY2 + effY2;
    const year3Total = expY3 + seminarY3 + compY3 + effY3;
    const grandTotal = oldTotal + year1Total + year2Total + year3Total;
    
    // ========== CONTENT ==========
    
    // 1. Educational Qualification
    doc.text('1. Educational Qualification', col1, yPos);
    doc.text(formatNum(eduOld), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(eduY1), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(eduY2), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(eduY3), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(eduTotal), totalCol, yPos, { align: 'center' });
    yPos += 4;
    
    doc.setFontSize(7);
    doc.text('Document Required: Official Transcript of Records', col1 + 5, yPos);
    yPos += 5;
    
    // 2. Teaching Experience
    doc.setFontSize(8);
    doc.text('2. Teaching Experience', col1, yPos);
    doc.text(formatNum(expOld), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(expY1), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(expY2), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(expY3), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(expTotal), totalCol, yPos, { align: 'center' });
    yPos += 4;
    
    doc.setFontSize(7);
    doc.text('Document Required: Certification of Dean, Director', col1 + 5, yPos);
    yPos += 3;
    doc.text('noted by the Personnel Officer', col1 + 5, yPos);
    yPos += 5;
    
    // 3. Professional Growth
    doc.setFontSize(8);
    doc.text('3. Professional Growth (maximum of 13 pts.)', col1, yPos);
    yPos += 4;
    
    doc.setFontSize(7);
    doc.text('a. Ph.D., MBA, MA, MS, Maed (.5/3 units)', col1 + 5, yPos);
    doc.text(formatNum(0), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(0), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(0), totalCol, yPos, { align: 'center' });
    yPos += 3;
    
    doc.text('b. Undergraduate (.25/3 units)', col1 + 5, yPos);
    doc.text(formatNum(0), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(0), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(0), totalCol, yPos, { align: 'center' });
    yPos += 3;
    
    doc.text('c. Seminar (maximum of 3 points)', col1 + 5, yPos);
    doc.text(formatNum(seminarOld), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(seminarY1), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(seminarY2), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(seminarY3), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(seminarTotal), totalCol, yPos, { align: 'center' });
    yPos += 3;
    
    doc.text('d. Publications (maximum of 3 points)', col1 + 5, yPos);
    doc.text(formatNum(0), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(0), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(0), totalCol, yPos, { align: 'center' });
    yPos += 3;
    doc.setFontSize(6);
    doc.text('Document Required: Original Certificate of Appreciation', col1 + 8, yPos);
    yPos += 3;
    
    doc.setFontSize(7);
    doc.text('e. Lecturing/Speaking(maximum of 3 points)', col1 + 5, yPos);
    doc.text(formatNum(0), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(0), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(0), totalCol, yPos, { align: 'center' });
    yPos += 3;
    doc.setFontSize(6);
    doc.text('Document Required: Original Certificate of Appreciation', col1 + 8, yPos);
    yPos += 3;
    
    doc.setFontSize(7);
    doc.text('f. Research (maximum of 3 points)', col1 + 5, yPos);
    doc.text(formatNum(0), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(0), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(0), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(0), totalCol, yPos, { align: 'center' });
    yPos += 3;
    doc.setFontSize(6);
    doc.text('Document Required: Certification of University', col1 + 8, yPos);
    yPos += 2;
    doc.text('Council noted by the VPAA & manuscript', col1 + 8, yPos);
    yPos += 5;
    
    // 4. Teaching Efficiency
    doc.setFontSize(8);
    doc.text('4. Teaching Efficiency (Merit Evaluation)', col1, yPos);
    yPos += 4;
    
    doc.setFontSize(7);
    doc.text('a. Teaching Competence       (3)', col1 + 5, yPos);
    doc.text(formatNum(compOld), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(compY1), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(compY2), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(compY3), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(compTotal), totalCol, yPos, { align: 'center' });
    yPos += 3;
    
    doc.text('b. Effectiveness in School Service   (2)', col1 + 5, yPos);
    doc.text(formatNum(effOld), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(effY1), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(effY2), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(effY3), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(effTotal), totalCol, yPos, { align: 'center' });
    yPos += 5;
    
    // 5. Others
    doc.setFontSize(8);
    doc.text('5. Others', col1, yPos);
    yPos += 6;
    
    // ========== TOTAL POINTS ==========
    doc.setFont(undefined, 'bold');
    doc.text('TOTAL POINTS', col1 + 50, yPos);
    doc.text(formatNum(oldTotal), oldCol, yPos, { align: 'center' });
    doc.text(formatNum(year1Total), year1Col, yPos, { align: 'center' });
    doc.text(formatNum(year2Total), year2Col, yPos, { align: 'center' });
    doc.text(formatNum(year3Total), year3Col, yPos, { align: 'center' });
    doc.text(formatNum(grandTotal), totalCol, yPos, { align: 'center' });
    yPos += 8;
    
    doc.setFont(undefined, 'normal');
    
    // ========== REMARKS ==========
    doc.text('REMARKS:', leftMargin, yPos);
    doc.line(leftMargin + 20, yPos, rightMargin, yPos);
    yPos += 5;
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 10;
    
    // ========== SIGNATURES ==========
    doc.setFontSize(8);
    
    // Recommended Classification
    doc.text('Recommended Classification:', leftMargin, yPos);
    doc.text('Recommended by:', 140, yPos);
    yPos += 5;
    
    doc.text('Rank:', leftMargin + 5, yPos);
    doc.line(leftMargin + 15, yPos, leftMargin + 70, yPos);
    doc.line(140, yPos, rightMargin, yPos);
    yPos += 4;
    doc.text('Department Chair', 155, yPos);
    yPos += 2;
    
    doc.text('Rate:', leftMargin + 5, yPos);
    doc.line(leftMargin + 15, yPos, leftMargin + 70, yPos);
    yPos += 4;
    
    doc.text('Effectivity:', leftMargin + 5, yPos);
    doc.line(leftMargin + 20, yPos, leftMargin + 70, yPos);
    yPos += 8;
    
    // Reviewed & Evaluated by
    doc.text('Reviewed & Evaluated by:', leftMargin + 20, yPos);
    doc.line(140, yPos, rightMargin, yPos);
    yPos += 4;
    doc.text('Faculty President', 155, yPos);
    yPos += 6;
    
    doc.line(leftMargin + 15, yPos, leftMargin + 65, yPos);
    doc.line(140, yPos, rightMargin, yPos);
    yPos += 4;
    doc.text('Secretary, Promotions Board', leftMargin + 20, yPos);
    doc.text('Acting Personnel Officer, Member', 142, yPos);
    yPos += 8;
    
    // Recommending Approval
    doc.text('Recommending Approval:', 80, yPos);
    yPos += 5;
    
    doc.line(leftMargin + 15, yPos, leftMargin + 65, yPos);
    doc.line(110, yPos, 165, yPos);
    yPos += 4;
    doc.text('Internal Auditor', leftMargin + 30, yPos);
    doc.text('Dean of Studies & Administrative Officer', 112, yPos);
    yPos += 5;
    
    doc.line(leftMargin + 15, yPos, leftMargin + 65, yPos);
    doc.line(110, yPos, 165, yPos);
    yPos += 4;
    doc.text('Vice President for Administration', leftMargin + 18, yPos);
    doc.text('Vice President for Academic Affairs', 112, yPos);
    yPos += 8;
    
    // Approved by
    doc.text('Approved by:', 85, yPos);
    yPos += 5;
    
    doc.line(leftMargin + 60, yPos, leftMargin + 100, yPos);
    yPos += 4;
    doc.text('Chairperson', leftMargin + 70, yPos);
    
    // Save
    const filename = `Teaching_Ranking_${data.employee_name?.replace(/\s+/g, '_')}_${schoolYear.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    
    showToast("PDF downloaded successfully!", false);
}









// ====================== NON-TEACHING RANKING DATA ======================
async function loadNonTeachingRankingData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) return;
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-rankings/${yearId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const rankings = await response.json();
            displayNonTeachingRankingData(rankings);
        }
    } catch (error) {
        console.error("Error loading non-teaching ranking data:", error);
        showToast("Failed to load non-teaching rankings", true);
    }
}

function displayNonTeachingRankingData(rankings) {
    const tableBody = document.getElementById("rankingTableBody");
    tableBody.innerHTML = "";
    
    if (rankings.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>No ranking data available
                </td>
            </tr>
        `;
        return;
    }
    
    rankings.forEach((ranking) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${ranking.employee_name}</div>
                        <small class="text-muted">${ranking.department_name}</small>
                    </div>
                </div>
            </td>
            <td class="text-center">
                <button class="btn btn-sm btn-info me-1" onclick="viewNonTeachingRankingHistory(${ranking.staff_id})">
                    <i class="fas fa-eye me-1"></i> View History
                </button>
                <button class="btn btn-sm btn-success" onclick="downloadNonTeachingRankingHistory(${ranking.staff_id})">
                    <i class="fas fa-download me-1"></i> PDF
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
}

async function viewNonTeachingRankingHistory(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-ranking-history/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateNonTeachingRankingHistoryModal(data);
        } else {
            showToast("Failed to load ranking history", true);
        }
    } catch (error) {
        console.error("Error viewing ranking history:", error);
        showToast("Error loading ranking history", true);
    }
}

function populateNonTeachingRankingHistoryModal(data) {
    const formatNum = (val) => (!val || val === 0) ? '' : parseFloat(val).toFixed(2);
    
    // Basic Information
    document.getElementById('nt_rank_employee_name').textContent = data.employee_name || '-';
    document.getElementById('nt_rank_department').textContent = data.department_name || '-';
    document.getElementById('nt_rank_position').textContent = data.position || '-';
    document.getElementById('nt_rank_employment_type').textContent = data.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time';
    
    // Year Headers (SWAPPED: year3 → year1 header, year1 → year3 header)
    document.getElementById('nt_rank_year1_header').textContent = data.year3_label || '-';
    document.getElementById('nt_rank_year2_header').textContent = data.year2_label || '-';
    document.getElementById('nt_rank_year3_header').textContent = data.year1_label || '-';
    
    // Calculate averages for each category
    const calculateAverage = (field) => {
        const y1 = parseFloat(data.year1?.[field]) || 0;
        const y2 = parseFloat(data.year2?.[field]) || 0;
        const y3 = parseFloat(data.year3?.[field]) || 0;
        
        let count = 0;
        let sum = 0;
        if (y1 > 0) { sum += y1; count++; }
        if (y2 > 0) { sum += y2; count++; }
        if (y3 > 0) { sum += y3; count++; }
        
        return count > 0 ? sum / count : 0;
    };
    
    const averages = {
        productivity: calculateAverage('productivity'),
        attitude: calculateAverage('attitude'),
        promotional_competence: calculateAverage('promotional_competence'),
        attendance: calculateAverage('attendance'),
        professional_advancement: calculateAverage('professional_advancement'),
        institutional_involvement: calculateAverage('institutional_involvement'),
        community_involvement: calculateAverage('community_involvement'),
        work_experience: calculateAverage('work_experience')
    };
    averages.total = Object.values(averages).reduce((a, b) => a + b, 0);
    
    // Productivity (SWAPPED)
    document.getElementById('nt_rank_year1_productivity').textContent = formatNum(data.year3?.productivity);
    document.getElementById('nt_rank_year2_productivity').textContent = formatNum(data.year2?.productivity);
    document.getElementById('nt_rank_year3_productivity').textContent = formatNum(data.year1?.productivity);
    document.getElementById('nt_rank_productivity_avg').textContent = formatNum(averages.productivity);
    
    // Attitude (SWAPPED)
    document.getElementById('nt_rank_year1_attitude').textContent = formatNum(data.year3?.attitude);
    document.getElementById('nt_rank_year2_attitude').textContent = formatNum(data.year2?.attitude);
    document.getElementById('nt_rank_year3_attitude').textContent = formatNum(data.year1?.attitude);
    document.getElementById('nt_rank_attitude_avg').textContent = formatNum(averages.attitude);
    
    // Promotional Competence (SWAPPED)
    document.getElementById('nt_rank_year1_competence').textContent = formatNum(data.year3?.promotional_competence);
    document.getElementById('nt_rank_year2_competence').textContent = formatNum(data.year2?.promotional_competence);
    document.getElementById('nt_rank_year3_competence').textContent = formatNum(data.year1?.promotional_competence);
    document.getElementById('nt_rank_competence_avg').textContent = formatNum(averages.promotional_competence);
    
    // Attendance (SWAPPED)
    document.getElementById('nt_rank_year1_attendance').textContent = formatNum(data.year3?.attendance);
    document.getElementById('nt_rank_year2_attendance').textContent = formatNum(data.year2?.attendance);
    document.getElementById('nt_rank_year3_attendance').textContent = formatNum(data.year1?.attendance);
    document.getElementById('nt_rank_attendance_avg').textContent = formatNum(averages.attendance);
    
    // Professional Advancement (SWAPPED)
    document.getElementById('nt_rank_year1_advancement').textContent = formatNum(data.year3?.professional_advancement);
    document.getElementById('nt_rank_year2_advancement').textContent = formatNum(data.year2?.professional_advancement);
    document.getElementById('nt_rank_year3_advancement').textContent = formatNum(data.year1?.professional_advancement);
    document.getElementById('nt_rank_advancement_avg').textContent = formatNum(averages.professional_advancement);
    
    // Institutional Involvement (SWAPPED)
    document.getElementById('nt_rank_year1_institutional').textContent = formatNum(data.year3?.institutional_involvement);
    document.getElementById('nt_rank_year2_institutional').textContent = formatNum(data.year2?.institutional_involvement);
    document.getElementById('nt_rank_year3_institutional').textContent = formatNum(data.year1?.institutional_involvement);
    document.getElementById('nt_rank_institutional_avg').textContent = formatNum(averages.institutional_involvement);
    
    // Community Involvement (SWAPPED)
    document.getElementById('nt_rank_year1_community').textContent = formatNum(data.year3?.community_involvement);
    document.getElementById('nt_rank_year2_community').textContent = formatNum(data.year2?.community_involvement);
    document.getElementById('nt_rank_year3_community').textContent = formatNum(data.year1?.community_involvement);
    document.getElementById('nt_rank_community_avg').textContent = formatNum(averages.community_involvement);
    
    // Work Experience (SWAPPED)
    document.getElementById('nt_rank_year1_experience').textContent = formatNum(data.year3?.work_experience);
    document.getElementById('nt_rank_year2_experience').textContent = formatNum(data.year2?.work_experience);
    document.getElementById('nt_rank_year3_experience').textContent = formatNum(data.year1?.work_experience);
    document.getElementById('nt_rank_experience_avg').textContent = formatNum(averages.work_experience);
    
    // Year Totals (SWAPPED)
    const year1Total = calculateYearTotal(data.year1);
    const year2Total = calculateYearTotal(data.year2);
    const year3Total = calculateYearTotal(data.year3);
    
    document.getElementById('nt_rank_year1_total').textContent = formatNum(year3Total);
    document.getElementById('nt_rank_year2_total').textContent = formatNum(year2Total);
    document.getElementById('nt_rank_year3_total').textContent = formatNum(year1Total);
    document.getElementById('nt_rank_avg_total').textContent = formatNum(averages.total);
    
    // Show modal
    const modalInstance = new bootstrap.Modal(document.getElementById('nonTeachingRankingHistoryModal'));
    modalInstance.show();
}

function calculateYearTotal(yearData) {
    if (!yearData) return 0;
    return (parseFloat(yearData.productivity) || 0) +
           (parseFloat(yearData.attitude) || 0) +
           (parseFloat(yearData.promotional_competence) || 0) +
           (parseFloat(yearData.attendance) || 0) +
           (parseFloat(yearData.professional_advancement) || 0) +
           (parseFloat(yearData.institutional_involvement) || 0) +
           (parseFloat(yearData.community_involvement) || 0) +
           (parseFloat(yearData.work_experience) || 0);
}

async function downloadNonTeachingRankingHistory(staffId) {
    try {
        const periodId = getCurrentPeriod();
        
        // Get current year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-ranking-history/${staffId}/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            generateNonTeachingRankingPDF(data);
        } else {
            showToast("Failed to fetch ranking data", true);
        }
    } catch (error) {
        console.error("Error downloading non-teaching ranking history:", error);
        showToast("Error generating PDF", true);
    }
}

function generateNonTeachingRankingPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait
    
    const formatNum = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return '-';
        return parseFloat(val).toFixed(2);
    };
    
    // Calculate averages
    const calculateAverage = (field) => {
        const y1 = parseFloat(data.year1?.[field]) || 0;
        const y2 = parseFloat(data.year2?.[field]) || 0;
        const y3 = parseFloat(data.year3?.[field]) || 0;
        
        let count = 0;
        let sum = 0;
        if (y1 > 0) { sum += y1; count++; }
        if (y2 > 0) { sum += y2; count++; }
        if (y3 > 0) { sum += y3; count++; }
        
        return count > 0 ? sum / count : 0;
    };
    
    const averages = {
        productivity: calculateAverage('productivity'),
        attitude: calculateAverage('attitude'),
        promotional_competence: calculateAverage('promotional_competence'),
        attendance: calculateAverage('attendance'),
        professional_advancement: calculateAverage('professional_advancement'),
        institutional_involvement: calculateAverage('institutional_involvement'),
        community_involvement: calculateAverage('community_involvement'),
        work_experience: calculateAverage('work_experience')
    };
    averages.total = Object.values(averages).reduce((a, b) => a + b, 0);
    
    const year1Total = calculateYearTotal(data.year1);
    const year2Total = calculateYearTotal(data.year2);
    const year3Total = calculateYearTotal(data.year3);
    
    let yPos = 15;
    const leftMargin = 15;
    
    // Title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Non-Teaching Employee Ranking History', 105, yPos, { align: 'center' });
    yPos += 10;
    
    // Employee Information
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Name: ${data.employee_name || '-'}`, leftMargin, yPos);
    doc.text(`Position: ${data.position || '-'}`, 120, yPos);
    yPos += 6;
    doc.text(`Department: ${data.department_name || '-'}`, leftMargin, yPos);
    yPos += 20;
    
    // Create table data
    const tableData = [
        // Header row
        [
            { content: 'Category', styles: { fontStyle: 'bold', halign: 'left' } },
            { content: data.year3_label || '-', styles: { fontStyle: 'bold', halign: 'center' } },
            { content: data.year2_label || '-', styles: { fontStyle: 'bold', halign: 'center' } },
            { content: data.year1_label || '-', styles: { fontStyle: 'bold', halign: 'center' } },
            { content: 'AVERAGE', styles: { fontStyle: 'bold', halign: 'center' } }
        ],
        // Data rows
        [
            { content: 'A. Productivity (25 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.productivity),
            formatNum(data.year2?.productivity),
            formatNum(data.year1?.productivity),
            { content: formatNum(averages.productivity), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'B. Attitude (25 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.attitude),
            formatNum(data.year2?.attitude),
            formatNum(data.year1?.attitude),
            { content: formatNum(averages.attitude), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'C. Promotional Competence (25 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.promotional_competence),
            formatNum(data.year2?.promotional_competence),
            formatNum(data.year1?.promotional_competence),
            { content: formatNum(averages.promotional_competence), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'D. Attendance (15 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.attendance),
            formatNum(data.year2?.attendance),
            formatNum(data.year1?.attendance),
            { content: formatNum(averages.attendance), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'E. Professional Advancement (3 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.professional_advancement),
            formatNum(data.year2?.professional_advancement),
            formatNum(data.year1?.professional_advancement),
            { content: formatNum(averages.professional_advancement), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'F. Institutional Involvement (2 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.institutional_involvement),
            formatNum(data.year2?.institutional_involvement),
            formatNum(data.year1?.institutional_involvement),
            { content: formatNum(averages.institutional_involvement), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'G. Community Involvement (3 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.community_involvement),
            formatNum(data.year2?.community_involvement),
            formatNum(data.year1?.community_involvement),
            { content: formatNum(averages.community_involvement), styles: { fontStyle: 'bold' } }
        ],
        [
            { content: 'H. Work Experience (2 points)', styles: { fontStyle: 'bold' } },
            formatNum(data.year3?.work_experience),
            formatNum(data.year2?.work_experience),
            formatNum(data.year1?.work_experience),
            { content: formatNum(averages.work_experience), styles: { fontStyle: 'bold' } }
        ],
        // Total row
        [
            { content: 'TOTAL POINTS', styles: { fontStyle: 'bold', fillColor: [220, 220, 255] } },
            { content: formatNum(year3Total), styles: { fontStyle: 'bold', fillColor: [220, 220, 255], halign: 'center' } },
            { content: formatNum(year2Total), styles: { fontStyle: 'bold', fillColor: [220, 220, 255], halign: 'center' } },
            { content: formatNum(year1Total), styles: { fontStyle: 'bold', fillColor: [220, 220, 255], halign: 'center' } },
            { content: formatNum(averages.total), styles: { fontStyle: 'bold', fillColor: [220, 220, 255], halign: 'center' } }
        ]
    ];
    
    // Generate table
    doc.autoTable({
        startY: yPos,
        body: tableData,
        theme: 'grid',
        styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fillColor: [255, 255, 255]
        },
        columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' },
            4: { cellWidth: 25, halign: 'center' }
        }
    });
    
    // Save PDF
    const schoolYear = `${data.year3_label}_${data.year2_label}_${data.year1_label}`;
    const filename = `NonTeaching_Ranking_${data.employee_name?.replace(/\s+/g, '_')}_${schoolYear.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    
    showToast("PDF downloaded successfully!", false);
}

// Helper function (if not already present)
function calculateYearTotal(yearData) {
    if (!yearData) return 0;
    return (parseFloat(yearData.productivity) || 0) +
           (parseFloat(yearData.attitude) || 0) +
           (parseFloat(yearData.promotional_competence) || 0) +
           (parseFloat(yearData.attendance) || 0) +
           (parseFloat(yearData.professional_advancement) || 0) +
           (parseFloat(yearData.institutional_involvement) || 0) +
           (parseFloat(yearData.community_involvement) || 0) +
           (parseFloat(yearData.work_experience) || 0);
}




// ====================== TEACHING CERTIFICATE DATA ======================
async function loadTeachingCertificateData() {
    try {
        const periodId = getCurrentPeriod();
        const typeFilter = document.getElementById('certificateTypeFilter')?.value || '';
        
        let url = `${apiBaseUrl}/api/teaching-certificates/${periodId}`;
        if (typeFilter && typeFilter !== 'All Types') {
            url += `?type=${typeFilter}`;
        }
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const certificates = await response.json();
            displayTeachingCertificates(certificates);
        }
    } catch (error) {
        console.error("Error loading teaching certificate data:", error);
        showToast("Failed to load teaching certificates", true);
    }
}

function displayTeachingCertificates(certificates) {
    const tableBody = document.getElementById("certificateTableBody");
    tableBody.innerHTML = "";
    
    if (certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-muted">
                    <i class="fas fa-certificate fa-2x mb-2"></i>
                    <p>No certificates found</p>
                </td>
            </tr>
        `;

        return;
    }
    
    certificates.forEach(cert => {
        const row = document.createElement("tr");
        const statusClass = cert.status === 'pending' ? 'bg-warning' : 
                           cert.status === 'accepted' ? 'bg-success' : 'bg-danger';
        const statusText = cert.status.charAt(0).toUpperCase() + cert.status.slice(1);
        
        // Calculate points display
        const pointsDisplay = cert.points_value ? 
            `<small class="text-primary">(${cert.points_value} pts)</small>` : '';
        
        row.innerHTML = `
            <td>
                <div>
                    <div class="fw-bold">${cert.employee_name}</div>
                    <small class="text-muted">${cert.department_name || 'N/A'}</small>
                </div>
            </td>
            <td>
                <span class="badge ${cert.certificate_type === 'local' ? 'bg-info' : 
                                     cert.certificate_type === 'regional' ? 'bg-primary' : 'bg-success'}">
                    ${cert.certificate_type}
                </span>
            </td>
            <td>
                <div>${cert.certificate_name}</div>
                <small class="text-muted">${cert.organizer || 'N/A'}</small>
                ${pointsDisplay}
            </td>
            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
                ${cert.status !== 'pending' && cert.evaluated_date ? 
                    `<br><small class="text-muted">${new Date(cert.evaluated_date).toLocaleDateString()}</small>` 
                    : ''}
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" 
                        onclick="viewCertificateDetails(${cert.certificate_id})">
                        <i class="fas fa-eye me-1"></i> View
                    </button>
                    ${cert.status === 'pending' ? `
                        <button class="btn btn-outline-success" 
                            onclick="updateCertificateStatus(${cert.certificate_id}, 'accepted')">
                            <i class="fas fa-check me-1"></i> Accept
                        </button>
                        <button class="btn btn-outline-danger" 
                            onclick="updateCertificateStatus(${cert.certificate_id}, 'rejected')">
                            <i class="fas fa-times me-1"></i> Reject
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
}

async function viewCertificateDetails(certificateId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/certificate/${certificateId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const cert = await response.json();
            populateCertificateModal(cert);
        } else {
            showToast("Failed to load certificate details", true);
        }
    } catch (error) {
        console.error("Error viewing certificate:", error);
        showToast("Error loading certificate", true);
    }
}

function populateCertificateModal(cert) {
    // Populate modal fields
    document.getElementById('certEmployeeName').textContent = cert.employee_name;
    document.getElementById('certType').textContent = cert.certificate_type.toUpperCase();
    document.getElementById('certEventName').textContent = cert.certificate_name;
    document.getElementById('certOrganizer').textContent = cert.organizer || 'N/A';
    
    // Format dates
    const startDate = cert.duration_start ? new Date(cert.duration_start).toLocaleDateString() : 'N/A';
    const endDate = cert.duration_end ? new Date(cert.duration_end).toLocaleDateString() : 'N/A';
    document.getElementById('certDate').textContent = `${startDate} to ${endDate}`;
    
    // Calculate duration in days
    if (cert.duration_start && cert.duration_end) {
        const start = new Date(cert.duration_start);
        const end = new Date(cert.duration_end);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
        document.getElementById('certDuration').textContent = `${days} day${days !== 1 ? 's' : ''} (${cert.points_value} points)`;
    } else {
        document.getElementById('certDuration').textContent = 'N/A';
    }
    
    // Display certificate image
    const certificatePreview = document.querySelector('.certificate-preview');
    if (cert.certificate_image) {
        certificatePreview.innerHTML = `
            <img src="data:image/jpeg;base64,${cert.certificate_image}" 
                 alt="Certificate" 
                 class="img-fluid rounded"
                 style="max-height: 70vh; width: auto; object-fit: contain;">
        `;
    } else if (cert.image_filename) {
        certificatePreview.innerHTML = `
            <img src="/uploads/certificates/${cert.image_filename}" 
                 alt="Certificate" 
                 class="img-fluid rounded"
                 style="max-height: 400px; object-fit: contain;">
        `;
    } else {
        certificatePreview.innerHTML = `
            <div class="certificate-placeholder">
                <i class="fas fa-certificate fa-5x text-primary mb-3"></i>
                <p class="text-muted">No image available</p>
            </div>
        `;
    }
    
    // Update action buttons
    const acceptBtn = document.querySelector('.accept-certificate');
    const rejectBtn = document.querySelector('.reject-certificate');
    
    if (cert.status === 'pending') {
        acceptBtn.style.display = 'inline-block';
        rejectBtn.style.display = 'inline-block';
        acceptBtn.onclick = () => updateCertificateStatus(cert.certificate_id, 'accepted');
        rejectBtn.onclick = () => updateCertificateStatus(cert.certificate_id, 'rejected');
    } else {
        acceptBtn.style.display = 'none';
        rejectBtn.style.display = 'none';
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('certificateViewModal'));
    modal.show();
}

async function updateCertificateStatus(certificateId, status) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/certificate/${certificateId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify({ status })
        });
        
        if (response.ok) {
            showToast(`Certificate ${status} successfully!`);
            
            // Close modal if open
            const modal = bootstrap.Modal.getInstance(document.getElementById('certificateViewModal'));
            if (modal) {
                modal.hide();
            }
            
            // Reload certificate list
            await loadTeachingCertificateData();
            
            // Reload evaluation data to show updated points
            if (typeof loadEvaluationData === 'function') {
                await loadEvaluationData();
            }
        } else {
            const error = await response.json();
            showToast(error.message || `Failed to ${status} certificate`, true);
        }
    } catch (error) {
        console.error(`Error ${status} certificate:`, error);
        showToast(`Error ${status} certificate`, true);
    }
}

// Add event listener for type filter
document.addEventListener('DOMContentLoaded', () => {
    const typeFilter = document.getElementById('certificateTypeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', loadTeachingCertificateData);
    }
});


// ====================== NON-TEACHING CERTIFICATE DATA ======================
async function loadNonTeachingCertificateData() {
    try {
        const periodId = getCurrentPeriod();
        const typeFilter = document.getElementById('certificateTypeFilter')?.value || '';
        
        let url = `${apiBaseUrl}/api/non-teaching-certificates/${periodId}`;
        if (typeFilter && typeFilter !== '') {
            url += `?type=${typeFilter}`;
        }
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const certificates = await response.json();
            displayNonTeachingCertificates(certificates);
        }
    } catch (error) {
        console.error("Error loading non-teaching certificate data:", error);
        showToast("Failed to load non-teaching certificates", true);
    }
}

function displayNonTeachingCertificates(certificates) {
    const tableBody = document.getElementById("certificateTableBody");
    tableBody.innerHTML = "";
    
    if (certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-muted">
                    <i class="fas fa-certificate fa-2x mb-2"></i>
                    <p>No certificates found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    certificates.forEach(cert => {
        const row = document.createElement("tr");
        const statusClass = cert.status === 'pending' ? 'bg-warning' : 
                           cert.status === 'accepted' ? 'bg-success' : 'bg-danger';
        const statusText = cert.status.charAt(0).toUpperCase() + cert.status.slice(1);
        
        // Calculate points display
        const pointsDisplay = cert.points_value ? 
            `<small class="text-primary">(${cert.points_value} pts)</small>` : '';
        
        row.innerHTML = `
            <td>
                <div>
                    <div class="fw-bold">${cert.employee_name}</div>
                    <small class="text-muted">${cert.department_name || 'N/A'}</small>
                </div>
            </td>
            <td>
                <span class="badge ${cert.certificate_type === 'local' ? 'bg-info' : 
                                     cert.certificate_type === 'regional' ? 'bg-primary' : 'bg-success'}">
                    ${cert.certificate_type}
                </span>
            </td>
            <td>
                <div>${cert.certificate_name}</div>
                <small class="text-muted">${cert.organizer || 'N/A'}</small>
                ${pointsDisplay}
            </td>
            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
                ${cert.status !== 'pending' && cert.evaluated_date ? 
                    `<br><small class="text-muted">${new Date(cert.evaluated_date).toLocaleDateString()}</small>` 
                    : ''}
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" 
                        onclick="viewNonTeachingCertificateDetails(${cert.certificate_id})">
                        <i class="fas fa-eye me-1"></i> View
                    </button>
                    ${cert.status === 'pending' ? `
                        <button class="btn btn-outline-success" 
                            onclick="updateNonTeachingCertificateStatus(${cert.certificate_id}, 'accepted')">
                            <i class="fas fa-check me-1"></i> Accept
                        </button>
                        <button class="btn btn-outline-danger" 
                            onclick="updateNonTeachingCertificateStatus(${cert.certificate_id}, 'rejected')">
                            <i class="fas fa-times me-1"></i> Reject
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function viewNonTeachingCertificateDetails(certificateId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/certificate/${certificateId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const cert = await response.json();
            populateNonTeachingCertificateModal(cert);
        } else {
            showToast("Failed to load certificate details", true);
        }
    } catch (error) {
        console.error("Error viewing certificate:", error);
        showToast("Error loading certificate", true);
    }
}

function populateNonTeachingCertificateModal(cert) {
    // Populate modal fields
    document.getElementById('certEmployeeName').textContent = cert.employee_name;
    document.getElementById('certType').textContent = cert.certificate_type.toUpperCase();
    document.getElementById('certEventName').textContent = cert.certificate_name;
    document.getElementById('certOrganizer').textContent = cert.organizer || 'N/A';
    
    // Format dates
    const startDate = cert.duration_start ? new Date(cert.duration_start).toLocaleDateString() : 'N/A';
    const endDate = cert.duration_end ? new Date(cert.duration_end).toLocaleDateString() : 'N/A';
    document.getElementById('certDate').textContent = `${startDate} to ${endDate}`;
    
    // Calculate duration in days
    if (cert.duration_start && cert.duration_end) {
        const start = new Date(cert.duration_start);
        const end = new Date(cert.duration_end);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        document.getElementById('certDuration').textContent = `${days} day${days !== 1 ? 's' : ''} (${cert.points_value} points)`;
    } else {
        document.getElementById('certDuration').textContent = 'N/A';
    }
    
    // Display certificate image
    const certificatePreview = document.querySelector('.certificate-preview');
    if (cert.certificate_image) {
        certificatePreview.innerHTML = `
            <img src="data:image/jpeg;base64,${cert.certificate_image}" 
                 alt="Certificate" 
                 class="img-fluid rounded"
                 style="max-height: 400px; object-fit: contain;">
        `;
    } else if (cert.image_filename) {
        certificatePreview.innerHTML = `
            <img src="/uploads/certificates/${cert.image_filename}" 
                 alt="Certificate" 
                 class="img-fluid rounded"
                 style="max-height: 400px; object-fit: contain;">
        `;
    } else {
        certificatePreview.innerHTML = `
            <div class="certificate-placeholder">
                <i class="fas fa-certificate fa-5x text-primary mb-3"></i>
                <p class="text-muted">No image available</p>
            </div>
        `;
    }
    
    // Update action buttons
    const acceptBtn = document.querySelector('.accept-certificate');
    const rejectBtn = document.querySelector('.reject-certificate');
    
    if (cert.status === 'pending') {
        acceptBtn.style.display = 'inline-block';
        rejectBtn.style.display = 'inline-block';
        acceptBtn.onclick = () => updateNonTeachingCertificateStatus(cert.certificate_id, 'accepted');
        rejectBtn.onclick = () => updateNonTeachingCertificateStatus(cert.certificate_id, 'rejected');
    } else {
        acceptBtn.style.display = 'none';
        rejectBtn.style.display = 'none';
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('certificateViewModal'));
    modal.show();
}

async function updateNonTeachingCertificateStatus(certificateId, status) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/non-teaching-certificate/${certificateId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify({ status })
        });
        
        if (response.ok) {
            showToast(`Certificate ${status} successfully!`);
            
            // Close modal if open
            const modal = bootstrap.Modal.getInstance(document.getElementById('certificateViewModal'));
            if (modal) {
                modal.hide();
            }
            
            // Reload certificate list
            await loadNonTeachingCertificateData();
            
            // Reload evaluation data to show updated points
            if (typeof loadNonTeachingEvaluationData === 'function') {
                await loadNonTeachingEvaluationData();
            }
        } else {
            const error = await response.json();
            showToast(error.message || `Failed to ${status} certificate`, true);
        }
    } catch (error) {
        console.error(`Error ${status} certificate:`, error);
        showToast(`Error ${status} certificate`, true);
    }
}

// Add event listener for type filter
document.addEventListener('DOMContentLoaded', () => {
    const typeFilter = document.getElementById('certificateTypeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', loadNonTeachingCertificateData);
    }
});





// Employee Management - Does NOT use period filtering
async function loadEmployeeData() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees-management`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const employees = await response.json();
            displayEmployeeData(employees);
        }
    } catch (error) {
        console.error("Error loading employees:", error);
        showToast("Failed to load employees", true);
    }
}

function displayEmployeeData(employees) {
    const tableBody = document.getElementById("employeeTableBody");
    tableBody.innerHTML = "";
    
    if (employees.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fas fa-users fa-2x mb-2"></i>
                    <p>No employees found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    employees.forEach(employee => {
        const row = document.createElement("tr");
        const statusClass = employee.status === 'active' ? 'bg-success' : 
                           employee.status === 'inactive' ? 'bg-warning' : 'bg-secondary';
        const statusText = employee.status.charAt(0).toUpperCase() + employee.status.slice(1);
        
        row.innerHTML = `
            <td>
                <div class="fw-bold">${employee.full_name}</div>
            </td>
            <td>${employee.department_name}</td>
            <td>
                <span class="badge ${employee.employment_type === 'full_time' ? 'bg-primary' : 'bg-info'}">
                    ${employee.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                </span>
            </td>
            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" 
                        onclick="openEditEmployeeModal(${employee.staff_id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    ${employee.status !== 'archived' ? `
                        <button class="btn btn-outline-danger" 
                            onclick="archiveEmployee(${employee.staff_id}, '${employee.full_name}')">
                            <i class="fas fa-archive"></i> Archive
                        </button>
                    ` : `
                        <button class="btn btn-outline-success" 
                            onclick="unarchiveEmployee(${employee.staff_id})">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                    `}
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Load departments for the add employee modal
// Load departments for the add employee modal
async function loadDepartmentsForModal() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/departments`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const departments = await response.json();
            const select = document.getElementById('employeeDepartment');
            
            if (!select) {
                console.error("Department select not found!");
                return;
            }
            
            select.innerHTML = '<option value="">Select Department</option>';
            departments.forEach(dept => {
                select.innerHTML += `<option value="${dept.department_id}">${dept.department_name}</option>`;
            });
            
            console.log(`Loaded ${departments.length} departments`);
        }
    } catch (error) {
        console.error("Error loading departments:", error);
    }
}

// Add Employee Button Handler
document.getElementById('saveEmployeeBtn')?.addEventListener('click', async function() {
    const firstName = document.getElementById('employeeFirstName').value.trim();
    const lastName = document.getElementById('employeeLastName').value.trim();
    const middleName = document.getElementById('employeeMiddleName').value.trim();
    const departmentId = document.getElementById('employeeDepartment').value;
    const employmentType = document.getElementById('employeeType').value.trim();
    const email = document.getElementById('employeeEmail').value.trim();
    const phone = document.getElementById('employeePhone').value.trim();
    
    if (!firstName || !lastName || !departmentId || !employmentType || !email) {
        showToast("Please fill in all required fields", true);
        return;
    }
    
    const data = {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        department_id: parseInt(departmentId),
        employment_type: employmentType,
        email: email,
        phone: phone
    };
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            showToast(`Employee added successfully! Username: ${result.username}`);
            bootstrap.Modal.getInstance(document.getElementById('addEmployeeModal')).hide();
            document.getElementById('addEmployeeForm').reset();
            await loadEmployeeData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to add employee", true);
        }
    } catch (error) {
        console.error("Error adding employee:", error);
        showToast("Error adding employee", true);
    }
});

// THIS IS THE KEY PART - Call loadDepartmentsForModal when modal opens
const addEmployeeModal = document.getElementById('addEmployeeModal');
if (addEmployeeModal) {
    addEmployeeModal.addEventListener('show.bs.modal', function() {
        console.log("Modal opening, loading departments...");
        loadDepartmentsForModal();
    });
}


// Open Edit Employee Modal
async function openEditEmployeeModal(staffId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees/${staffId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const employee = await response.json();
            
            // Populate modal
            document.getElementById('editEmployeeId').value = employee.staff_id;
            document.getElementById('editEmployeeName').value = employee.full_name;
            
            // Load departments for edit
            await loadDepartmentsForEdit();
            document.getElementById('editEmployeeDepartment').value = employee.department_id;
            document.getElementById('editEmployeeType').value = employee.employment_type;
            
            const modal = new bootstrap.Modal(document.getElementById('editEmployeeModal'));
            modal.show();
        }
    } catch (error) {
        console.error("Error loading employee:", error);
        showToast("Error loading employee details", true);
    }
}

async function loadDepartmentsForEdit() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/departments`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const departments = await response.json();
            const select = document.getElementById('editEmployeeDepartment');
            select.innerHTML = '<option value="">Select Department</option>';
            departments.forEach(dept => {
                select.innerHTML += `<option value="${dept.department_id}">${dept.department_name}</option>`;
            });
        }
    } catch (error) {
        console.error("Error loading departments:", error);
    }
}

// Update Employee
document.getElementById('updateEmployeeBtn')?.addEventListener('click', async function() {
    const staffId = document.getElementById('editEmployeeId').value;
    const departmentId = document.getElementById('editEmployeeDepartment').value;
    const employmentType = document.getElementById('editEmployeeType').value;
    
    if (!departmentId || !employmentType) {
        showToast("Please fill in all fields", true);
        return;
    }
    
    const data = {
        department_id: parseInt(departmentId),
        employment_type: employmentType
    };
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees/${staffId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast("Employee updated successfully!");
            bootstrap.Modal.getInstance(document.getElementById('editEmployeeModal')).hide();
            await loadEmployeeData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to update employee", true);
        }
    } catch (error) {
        console.error("Error updating employee:", error);
        showToast("Error updating employee", true);
    }
});

// Archive Employee
async function archiveEmployee(staffId, employeeName) {
    if (!confirm(`Are you sure you want to archive ${employeeName}? Their data will be preserved but they won't appear in active lists.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees/${staffId}/archive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            showToast("Employee archived successfully!");
            await loadEmployeeData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to archive employee", true);
        }
    } catch (error) {
        console.error("Error archiving employee:", error);
        showToast("Error archiving employee", true);
    }
}

// Unarchive Employee
async function unarchiveEmployee(staffId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/employees/${staffId}/unarchive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            showToast("Employee restored successfully!");
            await loadEmployeeData();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to restore employee", true);
        }
    } catch (error) {
        console.error("Error restoring employee:", error);
        showToast("Error restoring employee", true);
    }
}



// ====================== SEARCH FUNCTIONALITY ======================
document.addEventListener("DOMContentLoaded", function() {
    const searchFields = [
        'evaluationSearch',
        'nonTeachingEvaluationSearch',
        'peerEvaluationSearch',
        'summarySearch',
        'rankingSearch',
        'certificateSearch',
        'employeeSearch'
    ];
    
    searchFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', function() {
                const searchText = this.value.toLowerCase();
                const tableId = fieldId.replace('Search', 'TableBody');
                const rows = document.querySelectorAll(`#${tableId} tr`);
                
                rows.forEach(row => {
                    const nameTd = row.querySelector('td:first-child');
                    const text = nameTd ? nameTd.textContent.toLowerCase(): '';
                    row.style.display = text.includes(searchText) ? '' : 'none';
                });
            });
        }
    });
});