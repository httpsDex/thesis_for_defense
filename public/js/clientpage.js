// ====================== CLIENT PAGE JAVASCRIPT ======================
const apiBaseUrl = `http://localhost:1804`;
// const apiBaseUrl = "https://meritup-server.onrender.com";

// ====================== INITIALIZATION & AUTHENTICATION ======================

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user"));

    // Authentication checks
    if (!token || !user) {
        window.location.href = "loginpage.html";
        return;
    }

    // Check if user is teaching or non-teaching employee
    if (user.role_id !== 3 && user.role_id !== 4) {
        localStorage.clear();
        window.location.href = "loginpage.html";
        return;
    }

    // Check token expiration
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
        alert("Session expired. Please log in again.");
        localStorage.clear();
        window.location.href = "loginpage.html";
        return;
    }

    // Initialize the page
    initializePage(user);
    setupSidebar();
    setupNavigation();
    
    // Initialize global period selector with reload callback
    // This will automatically load initial data
    initGlobalPeriodSelector(reloadCurrentSection);

    // Event listeners
    document.getElementById("submitCertificate")?.addEventListener("click", submitCertificate);
    document.getElementById("submitEvaluation")?.addEventListener("click", submitEvaluation);

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
/**
 * This function is called when the global period changes
 * It reloads ONLY the currently visible section's data
 */
async function reloadCurrentSection() {
    const currentPeriod = getCurrentPeriod();
    const user = JSON.parse(localStorage.getItem("user"));
    console.log('Reloading client page for period:', currentPeriod);
    
    // Always reload dashboard (visible on all pages)
    await loadDashboardData();
    
    // Find which section is currently displayed
    const activeSection = document.querySelector('.content-section[style*="display: block"]');
    if (!activeSection) return;
    
    const sectionId = activeSection.id;
    console.log('Reloading section:', sectionId);
    
    // Reload data based on current section and user role
    switch(sectionId) {
        case 'teaching-summary':
            await loadTeachingSummaryData();
            break;
        case 'non-teaching-summary':
            await loadNonTeachingSummaryData();
            break;

        case 'certificateTeaching':
            await loadTeachingCertificateData();
            break;

        case 'certificateNonTeaching':
            await loadNonTeachingCertificateData();
            break;

        case 'rankingTeaching':
            await loadTeachingRankingData();
            break;
        case 'rankingNonTeaching':
            await loadNonTeachingRankingData();
            break;

        case 'peerEvaluation':
            // Only for non-teaching employees
            if (user.role_id === 4) {
                await loadPeerEvaluationData();
            }
            break;
        default:
            console.log('Unknown section:', sectionId);
    }
}

// ====================== PAGE INITIALIZATION ======================
function initializePage(user) {
    // Set user info
    document.getElementById("userName").textContent = user.name;
    document.getElementById("userRole").textContent = user.role_name;
    document.getElementById("welcomeMessage").textContent = `Welcome back, ${user.name}!`;
    document.getElementById("userDepartment").textContent = `${user.role_name} • ${user.department}`;

    // Apply role-based restrictions
    if (user.role_id === 3) { // Teaching Employee
        document.querySelectorAll(".non-teaching-only").forEach(el => {
            el.style.display = "none";
        });
    } else if (user.role_id === 4) { // Non-Teaching Employee
        document.querySelectorAll(".teaching-only").forEach(el => {
            el.style.display = "none";
        });
    }
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
// All data loading functions now use getCurrentPeriod() from utils.js

// Load Dashboard Data
// ====================== DASHBOARD FUNCTIONS ======================

async function loadDashboardData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Load all dashboard data in parallel (like adminpage)
        await Promise.all([
            loadEmployeeRecentActivity(periodId)
        ]);
        
    } catch (error) {
        console.error("Error loading dashboard data:", error);
        showToast("Failed to load dashboard data", true);
    }
}


// Load Recent Activity
async function loadEmployeeRecentActivity(periodId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/employee/dashboard/recent-activity/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const activities = await response.json();
            displayEmployeeRecentActivity(activities);
        }
    } catch (error) {
        console.error("Error loading recent activity:", error);
    }
}

function displayEmployeeRecentActivity(activities) {
    const activityList = document.getElementById("recentActivityList");
    activityList.innerHTML = "";
    
    // Update activity count badge
    const activityCount = document.getElementById("activityCount");
    if (activityCount) {
        activityCount.textContent = activities.length;
    }
    
    if (activities.length === 0) {
        activityList.innerHTML = `
            <div class="list-group-item text-center py-4">
                <i class="fas fa-inbox fa-2x text-muted mb-2"></i>
                <p class="text-muted mb-0">No recent activity</p>
                <small class="text-muted">Your activity will appear here</small>
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
        
        switch(activity.activity_type) {
            case 'certificate_submitted':
                icon = 'fa-certificate';
                iconColor = 'text-warning';
                actionText = `You submitted a certificate`;
                if (activity.description) {
                    actionText += `<br><small class="text-muted">${activity.description}</small>`;
                }
                break;
            case 'certificate_accepted':
                icon = 'fa-check-circle';
                iconColor = 'text-success';
                actionText = `Your certificate was <strong>accepted</strong>`;
                if (activity.description) {
                    actionText += `<br><small class="text-muted">${activity.description}</small>`;
                }
                break;
            case 'certificate_rejected':
                icon = 'fa-times-circle';
                iconColor = 'text-danger';
                actionText = `Your certificate was <strong>rejected</strong>`;
                if (activity.description) {
                    actionText += `<br><small class="text-muted">${activity.description}</small>`;
                }
                break;
            case 'peer_evaluation_assigned':
                icon = 'fa-user-plus';
                iconColor = 'text-info';
                actionText = `You were assigned to evaluate <strong>${activity.evaluatee_name}</strong>`;
                break;
            case 'peer_evaluation_completed':
                icon = 'fa-check';
                iconColor = 'text-success';
                actionText = `You completed peer evaluation for <strong>${activity.evaluatee_name}</strong>`;
                break;
            case 'evaluation_completed':
                icon = 'fa-clipboard-check';
                iconColor = 'text-success';
                actionText = `Your evaluation was completed`;
                break;
            default:
                icon = 'fa-info-circle';
                iconColor = 'text-secondary';
                actionText = activity.description || 'Activity occurred';
        }
        
        // Calculate time ago
        const timeAgo = getTimeAgo(activity.activity_date);
        
        listItem.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="me-3 mt-1">
                    <i class="fas ${icon} ${iconColor} fs-5"></i>
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


// ====================== TEACHING SUMMARY DATA ======================
async function loadTeachingSummaryData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) {
            showEmptyTeachingSummary();
            return;
        }
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch employee's own teaching summary
        const response = await fetch(`${apiBaseUrl}/api/employee/teaching-summary/${yearId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateTeachingSummaryTemplate(data);
        } else {
            console.error("Failed to load teaching summary");
            showEmptyTeachingSummary();
        }
    } catch (error) {
        console.error("Error loading teaching summary:", error);
        showEmptyTeachingSummary();
    }
}

function populateTeachingSummaryTemplate(data) {
    // Employee Information
    document.getElementById('teaching_employee_name').textContent = data.employee_name || '-';
    document.getElementById('teaching_department').textContent = data.department_name || '-';
    document.getElementById('teaching_school_year').textContent = data.academic_year || '-';
    document.getElementById('teaching_position').textContent = data.position || '-';
    
    const fs = data.first_semester || {};
    const ss = data.second_semester || {};
    
    // (1) TEACHING COMPETENCE (20 Maximum Points)
    // a. DEAN (maximum 7 points)
    document.getElementById('teaching_dean_fs').textContent = (fs.dean_eval || 0).toFixed(2);
    document.getElementById('teaching_dean_ss').textContent = (ss.dean_eval || 0).toFixed(2);
    const deanAvg = calculateAverage(fs.dean_eval, ss.dean_eval);
    document.getElementById('teaching_dean_avg').textContent = deanAvg.toFixed(2);
    
    // b. STUDENT (maximum 7 points)
    document.getElementById('teaching_students_fs').textContent = (fs.student_eval || 0).toFixed(2);
    document.getElementById('teaching_students_ss').textContent = (ss.student_eval || 0).toFixed(2);
    const studentAvg = calculateAverage(fs.student_eval, ss.student_eval);
    document.getElementById('teaching_students_avg').textContent = studentAvg.toFixed(2);
    
    // c. PEER (maximum 6 points)
    document.getElementById('teaching_peers_fs').textContent = (fs.peer_eval || 0).toFixed(2);
    document.getElementById('teaching_peers_ss').textContent = (ss.peer_eval || 0).toFixed(2);
    const peerAvg = calculateAverage(fs.peer_eval, ss.peer_eval);
    document.getElementById('teaching_peers_avg').textContent = peerAvg.toFixed(2);
    
    // Teaching Competence Subtotal
    const teachingCompetenceTotal = deanAvg + studentAvg + peerAvg;
    document.getElementById('teaching_competence_subtotal').textContent = teachingCompetenceTotal.toFixed(2);
    
    // (2) EFFECTIVENESS OF SCHOOL SERVICE (15 Maximum Points)
    // a. Committee Chairman/Head Teacher (maximum 5 points)
    document.getElementById('teaching_committee_fs').textContent = (fs.committee_chair_eval || 0).toFixed(2);
    document.getElementById('teaching_committee_ss').textContent = (ss.committee_chair_eval || 0).toFixed(2);
    const committeeAvg = calculateAverage(fs.committee_chair_eval, ss.committee_chair_eval);
    document.getElementById('teaching_committee_avg').textContent = committeeAvg.toFixed(2);
    
    // b. Department Head/Dean (maximum 10 points)
    document.getElementById('teaching_dept_head_fs').textContent = (fs.dept_head_eval || 0).toFixed(2);
    document.getElementById('teaching_dept_head_ss').textContent = (ss.dept_head_eval || 0).toFixed(2);
    const deptHeadAvg = calculateAverage(fs.dept_head_eval, ss.dept_head_eval);
    document.getElementById('teaching_dept_head_avg').textContent = deptHeadAvg.toFixed(2);
    
    // Effectiveness Subtotal
    const effectivenessTotal = committeeAvg + deptHeadAvg;
    document.getElementById('effectiveness_service_subtotal').textContent = effectivenessTotal.toFixed(2);
    
    // (3) PROFESSIONAL GROWTH (15 Maximum Points)
    // a. Seminar Attendance (3 max)
    document.getElementById('teaching_seminar_fs').textContent = (fs.seminar_attendance || 0).toFixed(2);
    document.getElementById('teaching_seminar_ss').textContent = (ss.seminar_attendance || 0).toFixed(2);
    const seminarAvg = calculateAverage(fs.seminar_attendance, ss.seminar_attendance);
    document.getElementById('teaching_seminar_avg').textContent = seminarAvg.toFixed(2);
    
    // b. Publications (3 max)
    document.getElementById('teaching_publications_fs').textContent = (fs.publications || 0).toFixed(2);
    document.getElementById('teaching_publications_ss').textContent = (ss.publications || 0).toFixed(2);
    const publicationsAvg = calculateAverage(fs.publications, ss.publications);
    document.getElementById('teaching_publications_avg').textContent = publicationsAvg.toFixed(2);
    
    // c. Scholarly Achievement (3 max)
    document.getElementById('teaching_scholarly_fs').textContent = (fs.scholarly_achievement || 0).toFixed(2);
    document.getElementById('teaching_scholarly_ss').textContent = (ss.scholarly_achievement || 0).toFixed(2);
    const scholarlyAvg = calculateAverage(fs.scholarly_achievement, ss.scholarly_achievement);
    document.getElementById('teaching_scholarly_avg').textContent = scholarlyAvg.toFixed(2);
    
    // d. Research/Instructional Materials (3 max)
    document.getElementById('teaching_research_fs').textContent = (fs.research_conducted || 0).toFixed(2);
    document.getElementById('teaching_research_ss').textContent = (ss.research_conducted || 0).toFixed(2);
    const researchAvg = calculateAverage(fs.research_conducted, ss.research_conducted);
    document.getElementById('teaching_research_avg').textContent = researchAvg.toFixed(2);
    
    // e. Graduate Units Earned (3 max)
    document.getElementById('teaching_graduate_fs').textContent = (fs.graduate_units || 0).toFixed(2);
    document.getElementById('teaching_graduate_ss').textContent = (ss.graduate_units || 0).toFixed(2);
    const graduateAvg = calculateAverage(fs.graduate_units, ss.graduate_units);
    document.getElementById('teaching_graduate_avg').textContent = graduateAvg.toFixed(2);
    
    // Professional Growth Subtotal
    const professionalGrowthTotal = seminarAvg + publicationsAvg + scholarlyAvg + researchAvg + graduateAvg;
    document.getElementById('professional_growth_subtotal').textContent = professionalGrowthTotal.toFixed(2);
    
    // (4) TEACHING EXPERIENCE (2 Maximum Points)
    document.getElementById('teaching_experience_fs').textContent = (fs.teaching_experience || 0).toFixed(2);
    document.getElementById('teaching_experience_ss').textContent = (ss.teaching_experience || 0).toFixed(2);
    const experienceAvg = calculateAverage(fs.teaching_experience, ss.teaching_experience);
    document.getElementById('teaching_experience_avg').textContent = experienceAvg.toFixed(2);
    document.getElementById('teaching_experience_subtotal').textContent = experienceAvg.toFixed(2);
    
    // GRAND TOTAL
    const grandTotal = teachingCompetenceTotal + effectivenessTotal + professionalGrowthTotal + experienceAvg;
    document.getElementById('teaching_grand_total').textContent = grandTotal.toFixed(2);
    
    // Recommended Increase
    const recommendedIncrease = calculateRecommendedIncrease(grandTotal);
    const increaseElement = document.getElementById('recommendation_increase');
    if (increaseElement) {
        increaseElement.textContent = recommendedIncrease;
    }
}

function showEmptyTeachingSummary() {
    // Set all fields to default values
    document.getElementById('teaching_employee_name').textContent = '-';
    document.getElementById('teaching_department').textContent = '-';
    document.getElementById('teaching_school_year').textContent = '-';
    document.getElementById('teaching_position').textContent = '-';
    
    // Set all numeric fields to 0.00
    const numericFields = [
        'teaching_dean_fs', 'teaching_dean_ss', 'teaching_dean_avg',
        'teaching_student_fs', 'teaching_student_ss', 'teaching_student_avg',
        'teaching_peer_fs', 'teaching_peer_ss', 'teaching_peer_avg',
        'teaching_competence_subtotal',
        'teaching_committee_fs', 'teaching_committee_ss', 'teaching_committee_avg',
        'teaching_dept_head_fs', 'teaching_dept_head_ss', 'teaching_dept_head_avg',
        'teaching_effectiveness_subtotal',
        'teaching_seminar_fs', 'teaching_seminar_ss', 'teaching_seminar_avg',
        'teaching_publications_fs', 'teaching_publications_ss', 'teaching_publications_avg',
        'teaching_scholarly_fs', 'teaching_scholarly_ss', 'teaching_scholarly_avg',
        'teaching_research_fs', 'teaching_research_ss', 'teaching_research_avg',
        'teaching_graduate_fs', 'teaching_graduate_ss', 'teaching_graduate_avg',
        'teaching_professional_subtotal',
        'teaching_experience_fs', 'teaching_experience_ss', 'teaching_experience_avg',
        'teaching_experience_subtotal',
        'teaching_grand_total'
    ];
    
    numericFields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.textContent = '-';
        }
    });
    
    const increaseElement = document.getElementById('teaching_recommended_increase');
    if (increaseElement) {
        increaseElement.textContent = 'No evaluation data available';
    }
}

// Helper function to calculate average
function calculateAverage(val1, val2) {
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;
    
    // If both are 0, return 0
    if (v1 === 0 && v2 === 0) return 0;
    
    // If only one semester has data, return that value
    if (v1 === 0) return v2;
    if (v2 === 0) return v1;
    
    // If both have data, calculate average
    return (v1 + v2) / 2;
}

// Helper function to calculate recommended increase
function calculateRecommendedIncrease(totalPoints) {
    if (totalPoints >= 46 && totalPoints <= 52) {
        return '₱45.00/subject/month';
    } else if (totalPoints >= 41 && totalPoints <= 45) {
        return '₱28.00/subject/month';
    } else if (totalPoints >= 36 && totalPoints <= 40) {
        return '₱23.00/subject/month';
    } else if (totalPoints >= 31 && totalPoints <= 35) {
        return '₱18.00/subject/month';
    } else if (totalPoints >= 26 && totalPoints <= 30) {
        return '₱15.00/subject/month';
    } else if (totalPoints < 26 && totalPoints > 0) {
        return 'Not eligible for increase (Below 26 points)';
    } else {
        return 'No evaluation data available';
    }
}

// ====================== NON-TEACHING SUMMARY DATA ======================
async function loadNonTeachingSummaryData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Get year from period
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) {
            showEmptyNonTeachingSummary();
            return;
        }
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        // Fetch employee's own non-teaching summary
        const response = await fetch(`${apiBaseUrl}/api/employee/nonteaching-summary/${yearId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateNonTeachingSummaryTemplate(data);
        } else {
            console.error("Failed to load non-teaching summary");
            showEmptyNonTeachingSummary();
        }
    } catch (error) {
        console.error("Error loading non-teaching summary:", error);
        showEmptyNonTeachingSummary();
    }
}

function populateNonTeachingSummaryTemplate(data) {
    // Employee Information
    document.getElementById('nt_employee_name').textContent = data.employee_name || '-';
    document.getElementById('nt_department').textContent = data.department_name || '-';
    document.getElementById('nt_school_year').textContent = data.academic_year || '-';
    document.getElementById('nt_position').textContent = data.position || '-';
    document.getElementById('nt_grade_step').textContent = data.grade_step || '-';

    const firstSemHeader = document.getElementById('first_sem');
    const secondSemHeader = document.getElementById('second_sem');
    
    if (firstSemHeader) {
        firstSemHeader.textContent = `${data.first_semester_period || '-'}`;
    }
    
    if (secondSemHeader) {
        secondSemHeader.textContent = `${data.second_semester_period || '-'}`;
    }
    
    const fs = data.first_semester || {};
    const ss = data.second_semester || {};
    
    // ========== A. PRODUCTIVITY (25 points) ==========
    populateNTCriteria('quality', fs.quality_1, fs.quality_2, fs.quality_3, ss.quality_1, ss.quality_2, ss.quality_3);
    populateNTCriteria('quantity', fs.quantity_1, fs.quantity_2, fs.quantity_3, ss.quantity_1, ss.quantity_2, ss.quantity_3);
    populateNTCriteria('job_knowledge', fs.job_knowledge_1, fs.job_knowledge_2, fs.job_knowledge_3, ss.job_knowledge_1, ss.job_knowledge_2, ss.job_knowledge_3);
    populateNTCriteria('initiative', fs.initiative_1, fs.initiative_2, fs.initiative_3, ss.initiative_1, ss.initiative_2, ss.initiative_3);
    populateNTCriteria('reliability', fs.reliability_1, fs.reliability_2, fs.reliability_3, ss.reliability_1, ss.reliability_2, ss.reliability_3);
    
    // ========== B. ATTITUDE (25 points) ==========
    populateNTCriteria('job_attitude', fs.job_attitude_1, fs.job_attitude_2, fs.job_attitude_3, ss.job_attitude_1, ss.job_attitude_2, ss.job_attitude_3);
    populateNTCriteria('work_habits', fs.work_habits_1, fs.work_habits_2, fs.work_habits_3, ss.work_habits_1, ss.work_habits_2, ss.work_habits_3);
    populateNTCriteria('personal_relation', fs.personal_relation_1, fs.personal_relation_2, fs.personal_relation_3, ss.personal_relation_1, ss.personal_relation_2, ss.personal_relation_3);
    populateNTCriteria('integrity', fs.integrity_1, fs.integrity_2, fs.integrity_3, ss.integrity_1, ss.integrity_2, ss.integrity_3);
    populateNTCriteria('self_discipline', fs.self_discipline_1, fs.self_discipline_2, fs.self_discipline_3, ss.self_discipline_1, ss.self_discipline_2, ss.self_discipline_3);
    
    // ========== C. PROMOTIONAL COMPETENCE (25 points) ==========
    populateNTCriteria('ability_learn', fs.ability_learn_1, fs.ability_learn_2, fs.ability_learn_3, ss.ability_learn_1, ss.ability_learn_2, ss.ability_learn_3);
    populateNTCriteria('ability_organize', fs.ability_organize_1, fs.ability_organize_2, fs.ability_organize_3, ss.ability_organize_1, ss.ability_organize_2, ss.ability_organize_3);
    populateNTCriteria('cooperation', fs.cooperation_1, fs.cooperation_2, fs.cooperation_3, ss.cooperation_1, ss.cooperation_2, ss.cooperation_3);
    populateNTCriteria('development', fs.development_orientation_1, fs.development_orientation_2, fs.development_orientation_3, ss.development_orientation_1, ss.development_orientation_2, ss.development_orientation_3);
    populateNTCriteria('planning', fs.planning_capability_1, fs.planning_capability_2, fs.planning_capability_3, ss.planning_capability_1, ss.planning_capability_2, ss.planning_capability_3);
    
    // ========== D. ATTENDANCE (15 points) - From HR Evaluator ==========
    document.getElementById('nt_absences_fs').textContent = formatScore(fs.excused_absences);
    document.getElementById('nt_absences_ss').textContent = formatScore(ss.excused_absences);
    const absencesAvg = calculateNTAverageWithZeros(fs.excused_absences, ss.excused_absences);
    document.getElementById('nt_absences_total_avg').textContent = formatScore(absencesAvg, true);
    
    document.getElementById('nt_tardiness_fs').textContent = formatScore(fs.tardiness);
    document.getElementById('nt_tardiness_ss').textContent = formatScore(ss.tardiness);
    const tardinessAvg = calculateNTAverageWithZeros(fs.tardiness, ss.tardiness);
    document.getElementById('nt_tardiness_total_avg').textContent = formatScore(tardinessAvg, true);
    
    document.getElementById('nt_minutes_late_fs').textContent = formatScore(fs.minutes_late);
    document.getElementById('nt_minutes_late_ss').textContent = formatScore(ss.minutes_late);
    const minutesLateAvg = calculateNTAverageWithZeros(fs.minutes_late, ss.minutes_late);
    document.getElementById('nt_minutes_late_total_avg').textContent = formatScore(minutesLateAvg, true);
    
    const attendanceTotal = absencesAvg + tardinessAvg + minutesLateAvg;
    document.getElementById('nt_attendance_grand_total').textContent = formatScore(attendanceTotal, true);
    
    // ========== E. PROFESSIONAL ADVANCEMENT (3 points) ==========
    document.getElementById('nt_seminar_fs').textContent = formatScore(fs.seminar);
    document.getElementById('nt_seminar_ss').textContent = formatScore(ss.seminar);
    const seminarTotal = Math.min((parseFloat(fs.seminar) || 0) + (parseFloat(ss.seminar) || 0), 3);
    document.getElementById('nt_seminar_total_avg').textContent = formatScore(seminarTotal, true);
    document.getElementById('nt_seminar_grand_total').textContent = formatScore(seminarTotal, true);
    
    // ========== F. INSTITUTIONAL INVOLVEMENT (2 points) ==========
    document.getElementById('nt_institutional_fs').textContent = formatScore(fs.institutional_involvement);
    document.getElementById('nt_institutional_ss').textContent = formatScore(ss.institutional_involvement);
    const institutionalTotal = Math.min((parseFloat(fs.institutional_involvement) || 0) + (parseFloat(ss.institutional_involvement) || 0), 2);
    document.getElementById('nt_institutional_total_avg').textContent = formatScore(institutionalTotal, true);
    document.getElementById('nt_institutional_grand_total').textContent = formatScore(institutionalTotal, true);
    
    // ========== G. COMMUNITY INVOLVEMENT (3 points) ==========
    document.getElementById('nt_community_fs').textContent = formatScore(fs.community_involvement);
    document.getElementById('nt_community_ss').textContent = formatScore(ss.community_involvement);
    const communityTotal = Math.min((parseFloat(fs.community_involvement) || 0) + (parseFloat(ss.community_involvement) || 0), 3);
    document.getElementById('nt_community_total_avg').textContent = formatScore(communityTotal, true);
    document.getElementById('nt_community_grand_total').textContent = formatScore(communityTotal, true);
    
    // ========== H. WORK EXPERIENCE (2 points) ==========
    document.getElementById('nt_work_experience_fs').textContent = formatScore(fs.work_experience);
    document.getElementById('nt_work_experience_ss').textContent = formatScore(ss.work_experience);
    const workExpTotal = Math.min( (parseFloat(fs.work_experience) || 0) + (parseFloat(ss.work_experience) || 0), 2);
    document.getElementById('nt_work_experience_total_avg').textContent = formatScore(workExpTotal, true);
    document.getElementById('nt_work_experience_grand_total').textContent = formatScore(workExpTotal, true);
    
    // ========== CALCULATE CATEGORY GRAND TOTALS ==========
    const productivityTotal = calculateCategoryGrandTotal(['quality', 'quantity', 'job_knowledge', 'initiative', 'reliability']);
    document.getElementById('nt_productivity_grand_total').textContent = formatScore(productivityTotal, true);
    
    const attitudeTotal = calculateCategoryGrandTotal(['job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline']);
    document.getElementById('nt_attitude_grand_total').textContent = formatScore(attitudeTotal, true);
    
    const competenceTotal = calculateCategoryGrandTotal(['ability_learn', 'ability_organize', 'cooperation', 'development', 'planning']);
    document.getElementById('nt_competence_grand_total').textContent = formatScore(competenceTotal, true);
    
    // ========== PERFORMANCE AVERAGE RATING (Grand Total) ==========
    const performanceRating = productivityTotal + attitudeTotal + competenceTotal + attendanceTotal + 
                             seminarTotal + institutionalTotal + communityTotal + workExpTotal;
    document.getElementById('nt_performance_rating').textContent = formatScore(performanceRating, true);
    
    // Recommendation and Remarks
    const recommendationElement = document.getElementById('nt_recommendation');
    const remarksElement = document.getElementById('nt_remarks');
    
    if (recommendationElement) {
        recommendationElement.textContent = data.recommendation || 'No recommendation provided.';
    }
    
    if (remarksElement) {
        remarksElement.textContent = data.remarks || 'No remarks provided.';
    }
}

// Helper function to format scores (shows dash for empty, 0.00 for calculated)
function formatScore(value, isCalculated = false) {
    if (value === null || value === undefined || value === 0) {
        return isCalculated ? '0.00' : '-';
    }
    return parseFloat(value).toFixed(2);
}

// Helper function to populate criteria with 3 evaluators
function populateNTCriteria(criteriaName, fs1, fs2, fs3, ss1, ss2, ss3) {
    // First Semester - 3 evaluators (show dash if 0/null)
    document.getElementById(`nt_${criteriaName}_1_fs`).textContent = formatScore(fs1);
    document.getElementById(`nt_${criteriaName}_2_fs`).textContent = formatScore(fs2);
    document.getElementById(`nt_${criteriaName}_3_fs`).textContent = formatScore(fs3);
    
    // First Semester Average - INCLUDES ZEROS (treats null/0 as 0 in average)
    const fsAvg = calculateNTAverageWithZeros(fs1, fs2, fs3);
    document.getElementById(`nt_${criteriaName}_avg_fs`).textContent = formatScore(fsAvg, true);
    
    // Second Semester - 3 evaluators (show dash if 0/null)
    document.getElementById(`nt_${criteriaName}_1_ss`).textContent = formatScore(ss1);
    document.getElementById(`nt_${criteriaName}_2_ss`).textContent = formatScore(ss2);
    document.getElementById(`nt_${criteriaName}_3_ss`).textContent = formatScore(ss3);
    
    // Second Semester Average - INCLUDES ZEROS
    const ssAvg = calculateNTAverageWithZeros(ss1, ss2, ss3);
    document.getElementById(`nt_${criteriaName}_avg_ss`).textContent = formatScore(ssAvg, true);
    
    // Total Average (average of both semesters) - INCLUDES ZEROS
    const totalAvg = calculateNTAverageWithZeros(fsAvg, ssAvg);
    document.getElementById(`nt_${criteriaName}_total_avg`).textContent = formatScore(totalAvg, true);
}

// NEW: Average function that INCLUDES zeros (for employee own view)
// If peer didn't evaluate, count as 0
function calculateNTAverageWithZeros(...values) {
    // Convert all null/undefined to 0
    const processedValues = values.map(v => {
        if (v === null || v === undefined || isNaN(v)) return 0;
        return parseFloat(v);
    });
    
    // If all values are 0, return 0
    const sum = processedValues.reduce((acc, val) => acc + val, 0);
    
    if (sum === 0) return 0;
    
    // Calculate average: (val1 + val2 + val3) / 3
    // Even if some values are 0
    return sum / processedValues.length;
}

// Helper function to calculate category grand total
function calculateCategoryGrandTotal(criteriaNames) {
    let total = 0;
    criteriaNames.forEach(name => {
        const element = document.getElementById(`nt_${name}_total_avg`);
        if (element) {
            const value = element.textContent;
            if (value !== '-') {
                total += parseFloat(value) || 0;
            }
        }
    });
    return total;
}

function showEmptyNonTeachingSummary() {
    document.getElementById('nt_employee_name').textContent = '-';
    document.getElementById('nt_department').textContent = '-';
    document.getElementById('nt_school_year').textContent = '-';
    document.getElementById('nt_position').textContent = '-';
    document.getElementById('nt_grade_step').textContent = '-';
    
    const criteriaList = [
        'quality', 'quantity', 'job_knowledge', 'initiative', 'reliability',
        'job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline',
        'ability_learn', 'ability_organize', 'cooperation', 'development_orientation', 'planning_capability'
    ];
    
    criteriaList.forEach(criteria => {
        ['1_fs', '2_fs', '3_fs', '1_ss', '2_ss', '3_ss'].forEach(suffix => {
            const element = document.getElementById(`nt_${criteria}_${suffix}`);
            if (element) element.textContent = '-';
        });
        
        ['avg_fs', 'avg_ss', 'total_avg'].forEach(suffix => {
            const element = document.getElementById(`nt_${criteria}_${suffix}`);
            if (element) element.textContent = '0.00';
        });
    });
    
    ['absences', 'tardiness', 'minutes_late', 'seminar', 'institutional', 'community', 'work_experience'].forEach(field => {
        ['fs', 'ss'].forEach(suffix => {
            const element = document.getElementById(`nt_${field}_${suffix}`);
            if (element) element.textContent = '-';
        });
        
        const totalAvgElement = document.getElementById(`nt_${field}_total_avg`);
        if (totalAvgElement) totalAvgElement.textContent = '0.00';
    });
    
    ['productivity', 'attitude', 'competence', 'attendance', 'seminar', 'institutional', 'community', 'work_experience'].forEach(field => {
        const element = document.getElementById(`nt_${field}_grand_total`);
        if (element) element.textContent = '0.00';
    });
    
    document.getElementById('nt_performance_rating').textContent = '0.00';
}


//============================CERTIFICATE SUBMISSION===============================

// ====================== CERTIFICATE IMAGE PREVIEW ======================
document.addEventListener('DOMContentLoaded', function() {
    const certificatePhoto = document.getElementById('certificatePhoto');
    if (certificatePhoto) {
        certificatePhoto.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imagePreview = document.getElementById('imagePreview');
                    imagePreview.innerHTML = `
                        <img src="${event.target.result}" alt="Certificate Preview" style="max-width: 100%; max-height: 300px; object-fit: contain;">
                    `;
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// ====================== CERTIFICATE SUBMISSION ======================
async function submitCertificate() {
    const certificateName = document.getElementById("certificateName").value.trim();
    const certificateType = document.getElementById("certificateType").value;
    const organizer = document.getElementById("organizers").value.trim();
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const certificatePhoto = document.getElementById("certificatePhoto").files[0];
    
    // Validation
    if (!certificateName || !certificateType || !organizer || !startDate || !endDate || !certificatePhoto) {
        showToast("Please fill in all required fields", true);
        return;
    }
    
    // Validate dates
    if (new Date(endDate) < new Date(startDate)) {
        showToast("End date must be after start date", true);
        return;
    }
    
    // Validate file size (5MB max)
    if (certificatePhoto.size > 5 * 1024 * 1024) {
        showToast("File size must be less than 5MB", true);
        return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append("certificate_name", certificateName);
    formData.append("certificate_type", certificateType);
    formData.append("organizer", organizer);
    formData.append("duration_start", startDate);
    formData.append("duration_end", endDate);
    formData.append("period_id", getCurrentPeriod());
    formData.append("certificate_image", certificatePhoto);
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/certificates/submit`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            showToast("Certificate submitted successfully!");
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('addCertificateModal'));
            modal.hide();
            
            // Reset form
            document.getElementById("certificateForm").reset();
            document.getElementById('imagePreview').innerHTML = `
                <div class="certificate-placeholder">
                    <i class="fas fa-file-image fa-3x mb-2"></i>
                    <p>Upload your certificate image</p>
                </div>
            `;
            
            // Reload certificates
            await reloadCurrentSection();
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to submit certificate", true);
        }
    } catch (error) {
        console.error("Error submitting certificate:", error);
        showToast("Error submitting certificate", true);
    }
}

// ====================== LOAD CERTIFICATE DATA ======================
async function loadTeachingCertificateData() {
    try {
        const periodId = getCurrentPeriod();
        
        const response = await fetch(`${apiBaseUrl}/api/employee/certificates/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const certificates = await response.json();
            displayTeachingCertificates(certificates);
        } else {
            console.error("Failed to load teaching certificates");
            displayTeachingCertificates([]);
        }
    } catch (error) {
        console.error("Error loading teaching certificates:", error);
        displayTeachingCertificates([]);
    }
}

function displayTeachingCertificates(certificates) {
    const tableBody = document.getElementById("certificateTeachingTableBody");
    if (!tableBody) return;
    
    if (certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="fas fa-certificate fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No certificates submitted for this period</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = certificates.map(cert => {
        const statusBadge = {
            'pending': '<span class="badge bg-warning">Pending</span>',
            'accepted': '<span class="badge bg-success">Accepted</span>',
            'rejected': '<span class="badge bg-danger">Rejected</span>'
        }[cert.status] || '<span class="badge bg-secondary">Unknown</span>';
        
        const typeBadge = {
            'local': '<span class="badge bg-info">Local</span>',
            'regional': '<span class="badge bg-primary">Regional</span>',
            'national': '<span class="badge bg-success">National</span>'
        }[cert.certificate_type] || '<span class="badge bg-secondary">-</span>';
        
        return `
            <tr>
                <td>${cert.certificate_name}</td>
                <td>${typeBadge}</td>
                <td>${cert.organizer || '-'}</td>
                <td>${new Date(cert.duration_start).toLocaleDateString()} - ${new Date(cert.duration_end).toLocaleDateString()}</td>
                <td>${cert.points_value || 0} pts</td>
                <td>${statusBadge}</td>
                <td>
                    ${cert.certificate_image || cert.image_filename ? `<button class="btn btn-sm btn-primary" onclick="viewCertificateImage(${cert.certificate_id})">
                        <i class="fas fa-eye"></i> View
                    </button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// ====================== NON-TEACHING CERTIFICATE DATA ======================
async function loadNonTeachingCertificateData() {
    try {
        const periodId = getCurrentPeriod();
        
        const response = await fetch(`${apiBaseUrl}/api/employee/certificates/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const certificates = await response.json();
            displayNonTeachingCertificates(certificates);
        } else {
            console.error("Failed to load non-teaching certificates");
            displayNonTeachingCertificates([]);
        }
    } catch (error) {
        console.error("Error loading non-teaching certificates:", error);
        displayNonTeachingCertificates([]);
    }
}

function displayNonTeachingCertificates(certificates) {
    const tableBody = document.getElementById("certificateNonTeachingTableBody");
    if (!tableBody) return;
    
    if (certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="fas fa-certificate fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No certificates submitted for this period</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = certificates.map(cert => {
        const statusBadge = {
            'pending': '<span class="badge bg-warning">Pending</span>',
            'accepted': '<span class="badge bg-success">Accepted</span>',
            'rejected': '<span class="badge bg-danger">Rejected</span>'
        }[cert.status] || '<span class="badge bg-secondary">Unknown</span>';
        
        const typeBadge = {
            'local': '<span class="badge bg-info">Local</span>',
            'regional': '<span class="badge bg-primary">Regional</span>',
            'national': '<span class="badge bg-success">National</span>'
        }[cert.certificate_type] || '<span class="badge bg-secondary">-</span>';
        
        return `
            <tr>
                <td>${cert.certificate_name}</td>
                <td>${typeBadge}</td>
                <td>${cert.organizer || '-'}</td>
                <td>${new Date(cert.duration_start).toLocaleDateString()} - ${new Date(cert.duration_end).toLocaleDateString()}</td>
                <td>${cert.points_value || 0} pts</td>
                <td>${statusBadge}</td>
                <td>
                    ${cert.certificate_image || cert.image_filename ? `<button class="btn btn-sm btn-primary" onclick="viewCertificateImage(${cert.certificate_id})">
                        <i class="fas fa-eye"></i> View
                    </button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// ====================== VIEW CERTIFICATE IMAGE ======================
async function viewCertificateImage(certificateId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/certificate/image/${certificateId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            // Create modal to show image
            const modalHtml = `
                <div class="modal fade" id="certificateImageModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Certificate Image</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body text-center">
                                <img src="${imageUrl}" alt="Certificate" style="max-width: 100%; height: auto;">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
            const existingModal = document.getElementById('certificateImageModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('certificateImageModal'));
            modal.show();
            
            // Clean up URL when modal closes
            document.getElementById('certificateImageModal').addEventListener('hidden.bs.modal', function() {
                URL.revokeObjectURL(imageUrl);
                this.remove();
            });
        } else {
            showToast("Failed to load certificate image", true);
        }
    } catch (error) {
        console.error("Error viewing certificate:", error);
        showToast("Error loading certificate image", true);
    }
}



// ====================== TEACHING RANKING DATA ======================
// Load Teaching Ranking Data
async function loadTeachingRankingData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Fetch periods from API
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) {
            showEmptyNonTeachingRankingHistory();
            return;
        }
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        // Fetch employee's own teaching ranking history
        const response = await fetch(`${apiBaseUrl}/api/teaching-employee/ranking-history/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });

        if (response.ok) {
            const data = await response.json();
            populateTeachingRankingHistory(data);
        } else {
            showEmptyRankingHistory();
        }
    } catch (error) {
        console.error("Error loading ranking history:", error);
        showEmptyRankingHistory();
    }
}

function populateTeachingRankingHistory(data) {
    const formatNum = (val) => (!val || val === 0) ? '____' : parseFloat(val).toFixed(2);
    
    // Basic Info
    document.getElementById('rank_employee_name').textContent = data.employee_name || '-';
    document.getElementById('rank_appointment').textContent = data.employment_type || '-';
    document.getElementById('rank_present_rank').textContent = data.present_rank || '-';
    document.getElementById('rank_teaching_exp').textContent = '-';
    document.getElementById('rank_degree').textContent = '-';
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
    
    
    // Seminar Points
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
    
    // Totals
    document.getElementById('rank_old_total').textContent = formatNum(expOld + compOld + effOld);
    document.getElementById('rank_year1_total').textContent = formatNum(expY3 + compY3 + effY3);
    document.getElementById('rank_year2_total').textContent = formatNum(expY2 + compY2 + effY2);
    document.getElementById('rank_year3_total').textContent = formatNum(expY1 + compY1 + effY1);
    document.getElementById('rank_grand_total').textContent = formatNum(data.grand_total);
}



// ====================== NON-TEACHING RANKING DATA ======================
async function loadNonTeachingRankingData() {
    try {
        const periodId = getCurrentPeriod();
        
        // Fetch periods from API
        const periodResponse = await fetch(`${apiBaseUrl}/api/evaluation-periods`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (!periodResponse.ok) {
            showEmptyNonTeachingRankingHistory();
            return;
        }
        
        const periods = await periodResponse.json();
        const currentPeriod = periods.find(p => p.period_id == periodId);
        const yearId = currentPeriod?.year_id || 2;
        
        const response = await fetch(`${apiBaseUrl}/api/nonteaching-employee/ranking-history/${yearId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("accessToken")}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            populateNonTeachingRankingHistory(data);
        } else {
            showEmptyNonTeachingRankingHistory();
        }
    } catch (error) {
        console.error("Error loading non-teaching ranking history:", error);
        showEmptyNonTeachingRankingHistory();
    }
}


function populateNonTeachingRankingHistory(data) {
    const formatNum = (val) => (!val || val === 0) ? '' : parseFloat(val).toFixed(2);
    
    // Basic Info
    document.getElementById('nt_rank_employee_name').textContent = data.employee_name || '-';
    document.getElementById('nt_rank_position').textContent = data.position || '-';
    document.getElementById('nt_rank_department').textContent = data.department || '-';
    
    // Year Headers (SWAPPED: year3 → year1 header, year1 → year3 header)
    document.getElementById('nt_rank_year1_header').textContent = data.year3_label || '-';
    document.getElementById('nt_rank_year2_header').textContent = data.year2_label || '-';
    document.getElementById('nt_rank_year3_header').textContent = data.year1_label || '-';
    
    // Productivity (SWAPPED: year3 data → y1 cell, year1 data → y3 cell)
    document.getElementById('nt_rank_productivity_y1').textContent = formatNum(data.year3?.productivity);
    document.getElementById('nt_rank_productivity_y2').textContent = formatNum(data.year2?.productivity);
    document.getElementById('nt_rank_productivity_y3').textContent = formatNum(data.year1?.productivity);
    document.getElementById('nt_rank_productivity_avg').textContent = formatNum(data.averages?.productivity);
    
    // Attitude
    document.getElementById('nt_rank_attitude_y1').textContent = formatNum(data.year3?.attitude);
    document.getElementById('nt_rank_attitude_y2').textContent = formatNum(data.year2?.attitude);
    document.getElementById('nt_rank_attitude_y3').textContent = formatNum(data.year1?.attitude);
    document.getElementById('nt_rank_attitude_avg').textContent = formatNum(data.averages?.attitude);
    
    // Promotional Competence
    document.getElementById('nt_rank_promotional_y1').textContent = formatNum(data.year3?.promotional_competence);
    document.getElementById('nt_rank_promotional_y2').textContent = formatNum(data.year2?.promotional_competence);
    document.getElementById('nt_rank_promotional_y3').textContent = formatNum(data.year1?.promotional_competence);
    document.getElementById('nt_rank_promotional_avg').textContent = formatNum(data.averages?.promotional_competence);
    
    // Attendance
    document.getElementById('nt_rank_attendance_y1').textContent = formatNum(data.year3?.attendance);
    document.getElementById('nt_rank_attendance_y2').textContent = formatNum(data.year2?.attendance);
    document.getElementById('nt_rank_attendance_y3').textContent = formatNum(data.year1?.attendance);
    document.getElementById('nt_rank_attendance_avg').textContent = formatNum(data.averages?.attendance);
    
    // Professional Advancement
    document.getElementById('nt_rank_prof_adv_y1').textContent = formatNum(data.year3?.professional_advancement);
    document.getElementById('nt_rank_prof_adv_y2').textContent = formatNum(data.year2?.professional_advancement);
    document.getElementById('nt_rank_prof_adv_y3').textContent = formatNum(data.year1?.professional_advancement);
    document.getElementById('nt_rank_prof_adv_avg').textContent = formatNum(data.averages?.professional_advancement);
    
    // Institutional Involvement
    document.getElementById('nt_rank_institutional_y1').textContent = formatNum(data.year3?.institutional_involvement);
    document.getElementById('nt_rank_institutional_y2').textContent = formatNum(data.year2?.institutional_involvement);
    document.getElementById('nt_rank_institutional_y3').textContent = formatNum(data.year1?.institutional_involvement);
    document.getElementById('nt_rank_institutional_avg').textContent = formatNum(data.averages?.institutional_involvement);
    
    // Community Involvement
    document.getElementById('nt_rank_community_y1').textContent = formatNum(data.year3?.community_involvement);
    document.getElementById('nt_rank_community_y2').textContent = formatNum(data.year2?.community_involvement);
    document.getElementById('nt_rank_community_y3').textContent = formatNum(data.year1?.community_involvement);
    document.getElementById('nt_rank_community_avg').textContent = formatNum(data.averages?.community_involvement);
    
    // Work Experience
    document.getElementById('nt_rank_work_exp_y1').textContent = formatNum(data.year3?.work_experience);
    document.getElementById('nt_rank_work_exp_y2').textContent = formatNum(data.year2?.work_experience);
    document.getElementById('nt_rank_work_exp_y3').textContent = formatNum(data.year1?.work_experience);
    document.getElementById('nt_rank_work_exp_avg').textContent = formatNum(data.averages?.work_experience);
    
    // Totals
    document.getElementById('nt_rank_total_y1').textContent = formatNum(data.year3?.total_points);
    document.getElementById('nt_rank_total_y2').textContent = formatNum(data.year2?.total_points);
    document.getElementById('nt_rank_total_y3').textContent = formatNum(data.year1?.total_points);
    document.getElementById('nt_rank_total_avg').textContent = formatNum(data.averages?.total);
}

function showEmptyNonTeachingRankingHistory() {
    // Set all fields to '-'
    const fields = [
        'nt_rank_employee_name', 'nt_rank_position', 'nt_rank_department',
        'nt_rank_productivity_y1', 'nt_rank_productivity_y2', 'nt_rank_productivity_y3', 'nt_rank_productivity_avg',
        'nt_rank_attitude_y1', 'nt_rank_attitude_y2', 'nt_rank_attitude_y3', 'nt_rank_attitude_avg',
        'nt_rank_promotional_y1', 'nt_rank_promotional_y2', 'nt_rank_promotional_y3', 'nt_rank_promotional_avg',
        'nt_rank_attendance_y1', 'nt_rank_attendance_y2', 'nt_rank_attendance_y3', 'nt_rank_attendance_avg',
        'nt_rank_prof_adv_y1', 'nt_rank_prof_adv_y2', 'nt_rank_prof_adv_y3', 'nt_rank_prof_adv_avg',
        'nt_rank_institutional_y1', 'nt_rank_institutional_y2', 'nt_rank_institutional_y3', 'nt_rank_institutional_avg',
        'nt_rank_community_y1', 'nt_rank_community_y2', 'nt_rank_community_y3', 'nt_rank_community_avg',
        'nt_rank_work_exp_y1', 'nt_rank_work_exp_y2', 'nt_rank_work_exp_y3', 'nt_rank_work_exp_avg',
        'nt_rank_total_y1', 'nt_rank_total_y2', 'nt_rank_total_y3', 'nt_rank_total_avg'
    ];
    
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

// ====================== PEER EVALUATION DATA ======================
// Global variable to store current assignment
let currentAssignmentId = null;

// Load peer evaluation assignments
async function loadPeerEvaluationData() {
    try {
        const periodId = getCurrentPeriod();
        
        const response = await fetch(`${apiBaseUrl}/api/employee/peer-evaluations/assigned/${periodId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const evaluations = await response.json();
            displayPeerEvaluations(evaluations);
        } else {
            console.error("Failed to load peer evaluations");
            displayPeerEvaluations([]);
        }
    } catch (error) {
        console.error("Error loading peer evaluations:", error);
        displayPeerEvaluations([]);
    }
}

function displayPeerEvaluations(evaluations) {
    const tableBody = document.getElementById("peerEvaluationTableBody");
    if (!tableBody) return;
    
    if (evaluations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    <i class="fas fa-users fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No peer evaluations assigned for this period</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = evaluations.map(evaluation => {
        const statusBadge = {
            'draft': '<span class="badge bg-warning">Draft</span>',
            'submitted': '<span class="badge bg-success">Submitted</span>',
            'pending': '<span class="badge bg-secondary">Pending</span>'
        }[evaluation.evaluation_status || 'pending'] || '<span class="badge bg-secondary">Pending</span>';
        
        // Format evaluator type for display
        const evaluatorTypeDisplay = {
            'department_head': 'Department Head',
            'same_department': 'Same Department Peer',
            'external_department': 'External Department Peer'
        }[evaluation.evaluator_type] || evaluation.evaluator_type;
        
        return `
            <tr>
                <td>${evaluation.evaluatee_name}</td>
                <td>${evaluatorTypeDisplay}</td>
                <td>${evaluation.department || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    ${evaluation.evaluation_status === 'submitted' 
                        ? '<button class="btn btn-sm btn-info" onclick="viewPeerEvaluation(' + evaluation.assignment_id + ')"><i class="fas fa-eye"></i> View</button>'
                        : `<button class="btn btn-sm btn-primary" onclick="openPeerEvaluationModal(${evaluation.assignment_id})">
                            <i class="fas fa-edit"></i> Evaluate
                        </button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

// Open peer evaluation modal
async function openPeerEvaluationModal(assignmentId) {
    currentAssignmentId = assignmentId;
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/employee/peer-evaluations/assignment/${assignmentId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            populatePeerEvaluationModal(data);
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('peerEvaluationModal'));
            modal.show();
        } else {
            showToast("Failed to load evaluation details", true);
        }
    } catch (error) {
        console.error("Error loading evaluation:", error);
        showToast("Error loading evaluation", true);
    }
}

function populatePeerEvaluationModal(data) {
    // Set employee info
    document.getElementById('evaluatingEmployee').textContent = data.evaluatee_name;
    document.getElementById('evaluatingDepartment').textContent = data.department_name || '-';
    
    // If there's existing evaluation data, populate it
    if (data.evaluation) {
        const evaluations = data.evaluation;
        
        // Productivity
        setRadioValue('comm1', evaluations.quality_of_work);
        setRadioValue('comm2', evaluations.quantity_of_work);
        setRadioValue('comm3', evaluations.job_knowledge);
        setRadioValue('comm4', evaluations.initiative);
        setRadioValue('comm5', evaluations.reliability);
        
        // Attitude
        setRadioValue('team1', evaluations.job_attitude);
        setRadioValue('team2', evaluations.work_habits);
        setRadioValue('team3', evaluations.personal_relation);
        setRadioValue('team4', evaluations.integrity);
        setRadioValue('team5', evaluations.self_discipline);
        
        // Promotional Competence
        setRadioValue('prob1', evaluations.ability_to_learn);
        setRadioValue('prob2', evaluations.ability_to_organize);
        setRadioValue('prob3', evaluations.cooperation);
        setRadioValue('prob4', evaluations.development_orientation);
        setRadioValue('prob5', evaluations.planning_capability);
        
        // Comments
        document.getElementById('comments').value = evaluations.comments || '';
    } else {
        // Clear all radio buttons and comments for new evaluation
        clearPeerEvaluationForm();
    }
}

function setRadioValue(name, value) {
    if (value) {
        const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
        }
    }
}

function clearPeerEvaluationForm() {
    // Clear all radio buttons
    const radioNames = [
        'comm1', 'comm2', 'comm3', 'comm4', 'comm5',
        'team1', 'team2', 'team3', 'team4', 'team5',
        'prob1', 'prob2', 'prob3', 'prob4', 'prob5'
    ];
    
    radioNames.forEach(name => {
        const radios = document.querySelectorAll(`input[name="${name}"]`);
        radios.forEach(radio => radio.checked = false);
    });
    
    // Clear comments
    document.getElementById('comments').value = '';
}

function getRadioValue(name) {
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? parseInt(radio.value) : null;
}

// Submit peer evaluation
async function submitPeerEvaluation() {
    if (!currentAssignmentId) {
        showToast("No assignment selected", true);
        return;
    }
    
    // Get all radio values
    const evaluationData = {
        quality_of_work: getRadioValue('comm1'),
        quantity_of_work: getRadioValue('comm2'),
        job_knowledge: getRadioValue('comm3'),
        initiative: getRadioValue('comm4'),
        reliability: getRadioValue('comm5'),
        job_attitude: getRadioValue('team1'),
        work_habits: getRadioValue('team2'),
        personal_relation: getRadioValue('team3'),
        integrity: getRadioValue('team4'),
        self_discipline: getRadioValue('team5'),
        ability_to_learn: getRadioValue('prob1'),
        ability_to_organize: getRadioValue('prob2'),
        cooperation: getRadioValue('prob3'),
        development_orientation: getRadioValue('prob4'),
        planning_capability: getRadioValue('prob5'),
        comments: document.getElementById('comments').value
    };
    
    // Validate all fields are filled
    const missingFields = [];
    Object.keys(evaluationData).forEach(key => {
        if (key !== 'comments' && evaluationData[key] === null) {
            missingFields.push(key);
        }
    });
    
    if (missingFields.length > 0) {
        showToast("Please rate all criteria before submitting", true);
        return;
    }
    
    try {
        const response = await fetch(`${apiBaseUrl}/api/employee/peer-evaluations/submit/${currentAssignmentId}`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(evaluationData)
        });
        
        if (response.ok) {
            showToast("Evaluation submitted successfully");
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('peerEvaluationModal'));
            modal.hide();
            
            // Reload evaluations list
            loadPeerEvaluationData();
            
            // Clear form
            clearPeerEvaluationForm();
            currentAssignmentId = null;
        } else {
            const error = await response.json();
            showToast(error.message || "Failed to submit evaluation", true);
        }
    } catch (error) {
        console.error("Error submitting evaluation:", error);
        showToast("Error submitting evaluation", true);
    }
}

// View submitted evaluation (read-only)
async function viewPeerEvaluation(assignmentId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/employee/peer-evaluations/assignment/${assignmentId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.evaluation) {
                // Populate modal in read-only mode
                currentAssignmentId = null; // Set to null to indicate read-only
                populatePeerEvaluationModal(data);
                
                // Disable all inputs
                const modal = document.getElementById('peerEvaluationModal');
                modal.querySelectorAll('input, textarea').forEach(input => {
                    input.disabled = true;
                });
                
                // Hide submit button, show close only
                document.getElementById('submitEvaluation').style.display = 'none';
                
                // Show modal
                const modalInstance = new bootstrap.Modal(modal);
                modalInstance.show();
                
                // Re-enable inputs when modal closes
                modal.addEventListener('hidden.bs.modal', function () {
                    modal.querySelectorAll('input, textarea').forEach(input => {
                        input.disabled = false;
                    });
                    document.getElementById('submitEvaluation').style.display = 'block';
                }, { once: true });
            } else {
                showToast("No evaluation data found", true);
            }
        }
    } catch (error) {
        console.error("Error viewing evaluation:", error);
        showToast("Error loading evaluation", true);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Attach submit button event
    const submitButton = document.getElementById('submitEvaluation');
    if (submitButton) {
        submitButton.addEventListener('click', submitPeerEvaluation);
    }
    
    // Load evaluations if on peer evaluation page
    if (document.getElementById('peerEvaluationTableBody')) {
        loadPeerEvaluationData();
    }
});









// ====================== SEARCH FUNCTIONALITY ======================
document.addEventListener("DOMContentLoaded", function() {
    // Certificate search
    const certificateSearch = document.getElementById('certificateSearch');
    if (certificateSearch) {
        certificateSearch.addEventListener('input', function() {
            const searchText = this.value.toLowerCase();
            const rows = document.querySelectorAll('#certificateTableBody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchText) ? '' : 'none';
            });
        });
    }
    
    // Peer evaluation search (for non-teaching employees)
    const peerEvaluationSearch = document.getElementById('peerEvaluationSearch');
    if (peerEvaluationSearch) {
        peerEvaluationSearch.addEventListener('input', function() {
            const searchText = this.value.toLowerCase();
            const rows = document.querySelectorAll('#peerEvaluationTableBody tr');
            
            rows.forEach(row => {
                const nameTd = row.querySelector('td:first-child');
                const text = nameTd ? nameTd.textContent.toLowerCase() : '';
                row.style.display = text.includes(searchText) ? '' : 'none';
            });
        });
    }
});