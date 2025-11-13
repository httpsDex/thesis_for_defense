// ====================== SUPERADMIN PAGE JAVASCRIPT ======================
const apiBaseUrl = "http://localhost:1804";
// const apiBaseUrl = "https://meritup-server.onrender.com";

// Main js for superadmin page
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user"));

    // Authentication checks - Note: You need to add role_id 5 for superadmin in database
    if (!token || !user) {
        window.location.href = "loginpage.html";
        return;
    }

    // Verify token expiration
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
        alert("Session expired. Please log in again.");
        localStorage.clear();
        window.location.href = "loginpage.html";
        return;
    }

    // Initialize the page
    initializePage();
    setupSidebar();
    setupNavigation();
    loadDashboardStats();

    // Logout handler
    document.getElementById("logoutBtn").addEventListener("click", logout);
});

// ====================== INITIALIZATION ======================
function initializePage() {
    const user = JSON.parse(localStorage.getItem("user"));
    document.getElementById("userName").textContent = "Super Admin";
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
        link.addEventListener("click", (e) => {
            const targetId = e.currentTarget.id.replace("Link", "");
            showSection(targetId);
            updateActiveLink(e.currentTarget.id);
            
            // Load section data when navigating (non-blocking)
            loadSectionData(targetId);
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

// ====================== LOAD SECTION DATA ======================
async function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            await loadDashboardStats();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'periods':
            await loadAcademicYears();
            await loadEvaluationPeriods();
            break;
    }
}

// ====================== DASHBOARD ======================
async function loadDashboardStats() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/dashboard/stats`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            
            // Update stat cards
            document.getElementById("totalUsers").textContent = data.totalUsers || 0;
            document.getElementById("totalEvaluators").textContent = data.totalEvaluators || 0;
            document.getElementById("totalTeaching").textContent = data.totalTeaching || 0;
            document.getElementById("totalNonTeaching").textContent = data.totalNonTeaching || 0;
            
            // Update active period info
            if (data.activePeriod) {
                document.getElementById("activePeriodName").textContent = data.activePeriod.period_name;
                document.getElementById("activeAcademicYear").textContent = data.activePeriod.academic_year;
                document.getElementById("activePeriodDuration").textContent = 
                    `${formatDate(data.activePeriod.start_date)} - ${formatDate(data.activePeriod.end_date)}`;
            }
            
            // Update department heads count
            document.getElementById("teachingHeadsCount").textContent = data.teachingHeads || 0;
            document.getElementById("nonTeachingHeadsCount").textContent = data.nonTeachingHeads || 0;
        }
    } catch (error) {
        console.error("Error loading dashboard stats:", error);
    }
}

// ====================== USER MANAGEMENT ======================
async function loadUsers() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/users`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        } else {
            document.getElementById("usersTableBody").innerHTML = 
                '<tr><td colspan="9" class="text-center text-danger">Failed to load users</td></tr>';
        }
    } catch (error) {
        console.error("Error loading users:", error);
        document.getElementById("usersTableBody").innerHTML = 
            '<tr><td colspan="9" class="text-center text-danger">Error loading users</td></tr>';
    }
}

function displayUsers(users) {
    const tbody = document.getElementById("usersTableBody");
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr data-role="${user.role_id}" data-dept-head="${user.is_department_head}" data-status="${user.is_active}">
            <td>${user.user_id}</td>
            <td>${user.full_name}</td>
            <td>${user.email}</td>
            <td>${user.username}</td>
            <td>${getRoleBadge(user.role_id, user.role_name)}</td>
            <td>${user.department_name || '-'}</td>
            <td>${user.is_department_head ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</td>
            <td>${user.is_active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-danger">Inactive</span>'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="openEditUserModal(${user.user_id})" title="Edit User">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.user_id}, '${user.full_name}')" title="Delete User">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function getRoleBadge(roleId, roleName) {
    const colors = {
        1: 'danger',  // Teaching Evaluator
        2: 'warning', // Non-Teaching Evaluator
        3: 'info',    // Teaching Employee
        4: 'success'  // Non-Teaching Employee
    };
    return `<span class="badge bg-${colors[roleId] || 'secondary'}">${roleName}</span>`;
}

function filterUsers() {
    const searchText = document.getElementById("userSearch").value.toLowerCase();
    const roleFilter = document.getElementById("roleFilter").value;
    const deptHeadFilter = document.getElementById("deptHeadFilter").value;
    const statusFilter = document.getElementById("statusFilter").value;
    const rows = document.querySelectorAll('#usersTableBody tr');
    
    rows.forEach(row => {
        if (row.cells.length === 1) return; // Skip "no data" row
        
        const text = row.textContent.toLowerCase();
        const role = row.getAttribute('data-role');
        const isDeptHead = row.getAttribute('data-dept-head');
        const isActive = row.getAttribute('data-status');
        
        const matchesSearch = text.includes(searchText);
        const matchesRole = !roleFilter || role === roleFilter;
        const matchesDeptHead = !deptHeadFilter || isDeptHead === deptHeadFilter;
        const matchesStatus = !statusFilter || isActive === statusFilter;
        
        row.style.display = (matchesSearch && matchesRole && matchesDeptHead && matchesStatus) ? '' : 'none';
    });
}

// ====================== ADD USER ======================
async function openAddUserModal() {
    // Load departments
    await loadDepartmentsForSelect('addDepartment');
    
    // Reset form
    document.getElementById("addUserForm").reset();
    document.getElementById("deptHeadField").style.display = "none";
    
    const modal = new bootstrap.Modal(document.getElementById("addUserModal"));
    modal.show();
}

function handleRoleChange() {
    const roleId = parseInt(document.getElementById("addRole").value);
    const deptHeadField = document.getElementById("deptHeadField");
    
    // Show department head checkbox for role 4 (Non-Teaching Employee) only
    if (roleId === 4) {
        deptHeadField.style.display = "block";
    } else {
        deptHeadField.style.display = "none";
        document.getElementById("addIsDeptHead").checked = false;
    }
    
    // Auto-check department head for Teaching Evaluator (role 1)
    if (roleId === 1) {
        // Teaching Evaluator is always a department head
    }
}

async function submitAddUser() {
    const form = document.getElementById("addUserForm");
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const roleId = parseInt(document.getElementById("addRole").value);
    
    // Determine category_id based on role
    const categoryId = (roleId === 1 || roleId === 3) ? 1 : 2; // 1=Teaching, 2=Non-Teaching
    
    // Determine if department head
    let isDeptHead = false;
    if (roleId === 1 || roleId === 2) {
        // Evaluators are always department heads
        isDeptHead = true;
    } else if (roleId === 4) {
        // For non-teaching employees, check the checkbox
        isDeptHead = document.getElementById("addIsDeptHead").checked;
    }

    const userData = {
        firstName: document.getElementById("addFirstName").value,
        middleName: document.getElementById("addMiddleName").value || null,
        lastName: document.getElementById("addLastName").value,
        email: document.getElementById("addEmail").value,
        phone: document.getElementById("addPhone").value || null,
        username: document.getElementById("addUsername").value,
        password: document.getElementById("addPassword").value,
        roleId: roleId,
        departmentId: parseInt(document.getElementById("addDepartment").value),
        position: document.getElementById("addPosition").value || null,
        employmentType: document.getElementById("addEmploymentType").value,
        categoryId: categoryId,
        isDeptHead: isDeptHead
    };

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("addUserModal"));
            modal.hide();
            showToast("User added successfully!");
            await loadUsers();
            await loadDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to add user");
        }
    } catch (error) {
        console.error("Error adding user:", error);
        alert("Error adding user");
    }
}

// ====================== EDIT USER ======================
async function openEditUserModal(userId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/users/${userId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const user = await response.json();
            
            // Load departments
            await loadDepartmentsForSelect('editDepartment');
            
            // Populate form
            document.getElementById("editUserId").value = user.user_id;
            document.getElementById("editStaffId").value = user.staff_id;
            document.getElementById("editFirstName").value = user.first_name;
            document.getElementById("editMiddleName").value = user.middle_name || '';
            document.getElementById("editLastName").value = user.last_name;
            document.getElementById("editEmail").value = user.email;
            document.getElementById("editPhone").value = user.phone || '';
            document.getElementById("editUsername").value = user.username;
            document.getElementById("editRole").value = user.role_id;
            document.getElementById("editDepartment").value = user.department_id;
            document.getElementById("editPosition").value = user.position || '';
            document.getElementById("editEmploymentType").value = user.employment_type;
            document.getElementById("editIsDeptHead").checked = user.is_department_head === 1;
            document.getElementById("editIsActive").checked = user.is_active === 1;
            
            // Clear password field
            document.getElementById("editPassword").value = '';
            
            // Handle department head field visibility
            handleEditRoleChange();
            
            const modal = new bootstrap.Modal(document.getElementById("editUserModal"));
            modal.show();
        } else {
            alert("Failed to load user data");
        }
    } catch (error) {
        console.error("Error loading user:", error);
        alert("Error loading user data");
    }
}

function handleEditRoleChange() {
    const roleId = parseInt(document.getElementById("editRole").value);
    const deptHeadField = document.getElementById("editDeptHeadField");
    const deptHeadCheckbox = document.getElementById("editIsDeptHead");
    
    // Show department head checkbox for role 4 (Non-Teaching Employee) only
    if (roleId === 4) {
        deptHeadField.style.display = "flex";
        deptHeadCheckbox.checked = false;
        deptHeadCheckbox.disabled = false;

    } else if (roleId === 1 || roleId === 2) {
        // Evaluators are always department heads, but show the field as disabled
        deptHeadField.style.display = "flex";
        deptHeadCheckbox.checked = true;
        deptHeadCheckbox.disabled = true;
    } else  {
        deptHeadField.style.display = "flex";
        deptHeadCheckbox.checked = false;
        deptHeadCheckbox.disabled = true;
    }
}

async function submitEditUser() {
    const form = document.getElementById("editUserForm");
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const userId = document.getElementById("editUserId").value;
    const roleId = parseInt(document.getElementById("editRole").value);
    
    // Determine category_id based on role
    const categoryId = (roleId === 1 || roleId === 3) ? 1 : 2;
    
    // Determine if department head
    let isDeptHead = false;
    if (roleId === 1 || roleId === 2) {
        isDeptHead = true;
    } else if (roleId === 4) {
        isDeptHead = document.getElementById("editIsDeptHead").checked;
    }

    const userData = {
        firstName: document.getElementById("editFirstName").value,
        middleName: document.getElementById("editMiddleName").value || null,
        lastName: document.getElementById("editLastName").value,
        email: document.getElementById("editEmail").value,
        phone: document.getElementById("editPhone").value || null,
        username: document.getElementById("editUsername").value,
        password: document.getElementById("editPassword").value || null, // Only update if provided
        roleId: roleId,
        departmentId: parseInt(document.getElementById("editDepartment").value),
        position: document.getElementById("editPosition").value || null,
        employmentType: document.getElementById("editEmploymentType").value,
        categoryId: categoryId,
        isDeptHead: isDeptHead,
        isActive: document.getElementById("editIsActive").checked
    };

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/users/${userId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("editUserModal"));
            modal.hide();
            showToast("User updated successfully!");
            await loadUsers();
            await loadDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to update user");
        }
    } catch (error) {
        console.error("Error updating user:", error);
        alert("Error updating user");
    }
}

// ====================== DELETE USER ======================
async function deleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete user "${userName}"?\n\nThis will permanently delete the user and their staff record. This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/users/${userId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            showToast("User deleted successfully!");
            await loadUsers();
            await loadDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to delete user");
        }
    } catch (error) {
        console.error("Error deleting user:", error);
        alert("Error deleting user");
    }
}




// ====================== PERIOD MANAGEMENT ======================
async function loadAcademicYears() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/academic-years`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const years = await response.json();
            displayAcademicYears(years);
        } else {
            document.getElementById("academicYearsTableBody").innerHTML = 
                '<tr><td colspan="6" class="text-center text-danger">Failed to load academic years</td></tr>';
        }
    } catch (error) {
        console.error("Error loading academic years:", error);
        document.getElementById("academicYearsTableBody").innerHTML = 
            '<tr><td colspan="6" class="text-center text-danger">Error loading academic years</td></tr>';
    }
}

function displayAcademicYears(years) {
    const tbody = document.getElementById("academicYearsTableBody");
    
    if (years.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No academic years found</td></tr>';
        return;
    }

    tbody.innerHTML = years.map(year => `
        <tr>
            <td>${year.year_id}</td>
            <td><strong>${year.year_code}</strong></td>
            <td>${year.start_year}</td>
            <td>${year.end_year}</td>
            <td>${getStatusBadge(year.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="updateYearStatus(${year.year_id}, '${year.year_code}')" title="Change Status">
                    <i class="fas fa-exchange-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadEvaluationPeriods() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/evaluation-periods`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const periods = await response.json();
            displayEvaluationPeriods(periods);
        } else {
            document.getElementById("periodsTableBody").innerHTML = 
                '<tr><td colspan="8" class="text-center text-danger">Failed to load evaluation periods</td></tr>';
        }
    } catch (error) {
        console.error("Error loading evaluation periods:", error);
        document.getElementById("periodsTableBody").innerHTML = 
            '<tr><td colspan="8" class="text-center text-danger">Error loading evaluation periods</td></tr>';
    }
}

function displayEvaluationPeriods(periods) {
    const tbody = document.getElementById("periodsTableBody");
    
    if (periods.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No evaluation periods found</td></tr>';
        return;
    }

    tbody.innerHTML = periods.map(period => `
        <tr>
            <td>${period.period_id}</td>
            <td><strong>${period.period_name}</strong></td>
            <td>${period.academic_year}</td>
            <td><span class="badge bg-info">${period.semester}</span></td>
            <td>${formatDate(period.start_date)}</td>
            <td>${formatDate(period.end_date)}</td>
            <td>${getStatusBadge(period.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="updatePeriodStatus(${period.period_id}, '${period.period_name}')" title="Change Status">
                    <i class="fas fa-exchange-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function getStatusBadge(status) {
    const colors = {
        'active': 'success',
        'completed': 'secondary',
        'upcoming': 'warning'
    };
    return `<span class="badge bg-${colors[status] || 'secondary'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

// ====================== ADD ACADEMIC YEAR ======================
function openAddAcademicYearModal() {
    document.getElementById("addAcademicYearForm").reset();
    const modal = new bootstrap.Modal(document.getElementById("addAcademicYearModal"));
    modal.show();
}

async function submitAddAcademicYear() {
    const form = document.getElementById("addAcademicYearForm");
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const startYear = parseInt(document.getElementById("addStartYear").value);
    const endYear = parseInt(document.getElementById("addEndYear").value);

    if (endYear !== startYear + 1) {
        alert("End year must be exactly one year after start year");
        return;
    }

    const yearData = {
        startYear: startYear,
        endYear: endYear,
        status: document.getElementById("addYearStatus").value
    };

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/academic-years`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(yearData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("addAcademicYearModal"));
            modal.hide();
            showToast("Academic year added successfully!");
            await loadAcademicYears();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to add academic year");
        }
    } catch (error) {
        console.error("Error adding academic year:", error);
        alert("Error adding academic year");
    }
}

async function updateYearStatus(yearId, yearCode) {
    const newStatus = prompt(`Change status for ${yearCode}:\n\nEnter new status (active, completed, or upcoming):`);
    
    if (!newStatus) return;
    
    const validStatuses = ['active', 'completed', 'upcoming'];
    if (!validStatuses.includes(newStatus.toLowerCase())) {
        alert("Invalid status. Please enter: active, completed, or upcoming");
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/academic-years/${yearId}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify({ status: newStatus.toLowerCase() })
        });

        if (response.ok) {
            showToast("Academic year status updated!");
            await loadAcademicYears();
            await loadDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to update status");
        }
    } catch (error) {
        console.error("Error updating year status:", error);
        alert("Error updating year status");
    }
}

// ====================== ADD EVALUATION PERIOD ======================
async function openAddPeriodModal() {
    // Load academic years for dropdown
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/academic-years`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const years = await response.json();
            const select = document.getElementById("addPeriodYear");
            select.innerHTML = '<option value="">Select Academic Year</option>' + 
                years.map(year => `<option value="${year.year_id}">${year.year_code}</option>`).join('');
        }
    } catch (error) {
        console.error("Error loading academic years:", error);
    }

    document.getElementById("addPeriodForm").reset();
    const modal = new bootstrap.Modal(document.getElementById("addPeriodModal"));
    modal.show();
}

async function submitAddPeriod() {
    const form = document.getElementById("addPeriodForm");
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const periodData = {
        yearId: parseInt(document.getElementById("addPeriodYear").value),
        semester: document.getElementById("addPeriodSemester").value,
        periodName: document.getElementById("addPeriodName").value,
        startDate: document.getElementById("addPeriodStartDate").value,
        endDate: document.getElementById("addPeriodEndDate").value,
        status: document.getElementById("addPeriodStatus").value
    };

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/evaluation-periods`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify(periodData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById("addPeriodModal"));
            modal.hide();
            showToast("Evaluation period added successfully!");
            await loadEvaluationPeriods();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to add evaluation period");
        }
    } catch (error) {
        console.error("Error adding evaluation period:", error);
        alert("Error adding evaluation period");
    }
}

async function updatePeriodStatus(periodId, periodName) {
    const newStatus = prompt(`Change status for "${periodName}":\n\nEnter new status (upcoming, active, or completed):`);
    
    if (!newStatus) return;

    const validStatuses = ['upcoming', 'active', 'completed'];
    if (!validStatuses.includes(newStatus.toLowerCase())) {
        alert("Invalid status. Please enter: upcoming, active, or completed");
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/evaluation-periods/${periodId}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            },
            body: JSON.stringify({ status: newStatus.toLowerCase() })
        });

        if (response.ok) {
            showToast("Evaluation period status updated!");
            await loadEvaluationPeriods();
            await loadDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || "Failed to update status");
        }
    } catch (error) {
        console.error("Error updating period status:", error);
        alert("Error updating period status");
    }
}

// ====================== UTILITY FUNCTIONS ======================
async function loadDepartmentsForSelect(selectId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/superadmin/departments`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
        });

        if (response.ok) {
            const departments = await response.json();
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select Department</option>' + 
                departments.map(dept => `<option value="${dept.department_id}">${dept.department_name}</option>`).join('');
        }
    } catch (error) {
        console.error("Error loading departments:", error);
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showToast(message) {
    const toastBody = document.querySelector(".toast-body");
    toastBody.textContent = message;
    const toast = new bootstrap.Toast(document.getElementById("saveToast"));
    toast.show();
}

function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        window.location.href = "loginpage.html";
    }
}