const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const path = require("path");
// Multer configuration for file upload
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});


const app = express();
const PORT = process.env.PORT || 1804;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
const logger = (req, res, next) => {
    console.log(`${req.protocol}://${req.get('host')}${req.originalUrl} : ${moment().format()}`);
    next();
};
app.use(logger);

// Database connection
const connection = mysql.createConnection({
    // host:  process.env.DB_HOST || "localhost",
    // user:  process.env.DB_USER || "root",
    // password: process.env.DB_PASSWORD || "",
    // database: process.env.DB_NAME || "meritup_db"
    host:  process.env.DB_HOST || "bdd2ul7fixoasvh5cx8w-mysql.services.clever-cloud.com",
    user:  process.env.DB_USER || "uiawqnq4vw9cisif",
    password: process.env.DB_PASSWORD || "uTjoJEueeUW6embTjqlE",
    database: process.env.DB_NAME || "bdd2ul7fixoasvh5cx8w"
});

connection.connect((err) => {
    if (err) {
        console.error("❌ MySQL connection failed:", err);
        return;
    }
    console.log("✅ MySQL connected!");
});


// ====================== HELPER FUNCTION: GET 3-YEAR CYCLE ======================
function getCycleYears(yearId) {
    // Calculate which cycle this year belongs to
    // Cycle 1: Years 1, 2, 3
    // Cycle 2: Years 4, 5, 6
    // Cycle 3: Years 7, 8, 9, etc.
    
    const cycleStart = Math.floor((yearId - 1) / 3) * 3 + 1;
    
    return {
        year1: cycleStart + 2,  // Most recent in cycle
        year2: cycleStart + 1,  // Middle year
        year3: cycleStart,      // Oldest in cycle
        cycleNumber: Math.floor((yearId - 1) / 3) + 1
    };
}


// ====================== AUTH MIDDLEWARE ======================
const authenticate = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(403).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: "Invalid token" });
        }
        req.user = decoded;
        next();
    });
};

// Role-based access control middleware
const requireRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role_name)) {
        return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
};

// ====================== LOGIN ENDPOINTS ======================
app.post("/api/auth/login", async (req, res) => {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
        return res.status(400).json({ message: "Missing credentials" });
    }

    const query = `
        SELECT u.*, r.role_name, s.*, d.department_name as department,
               CONCAT(s.first_name, ' ', s.last_name) as full_name
        FROM users u
        JOIN user_roles r ON u.role_id = r.role_id
        LEFT JOIN staff s ON u.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE u.username = ? OR u.email = ?
    `;

    connection.query(query, [usernameOrEmail, usernameOrEmail], async (err, results) => {
        if (err) {
            console.error("Login query error:", err);
            return res.status(500).json({ message: "Server error" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        if (results[0].is_active === 0) {
            return res.status(403).json({ message: "User account is inactive" });
        }

        const user = results[0];

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        console.log("User authenticated:", results);
        const token = jwt.sign(
            {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                role_id: user.role_id,
                category_id: user.category_id,
                role_name: user.role_name,
                staff_id: user.staff_id
            },
            JWT_SECRET,
            { expiresIn: "5hr" }
        );

        connection.query("UPDATE users SET last_login = NOW() WHERE user_id = ?", [user.user_id]);

        res.json({
            message: "Login successful",
            accessToken: token,
            user: {
                id: user.user_id,
                username: user.username,
                email: user.email,
                role_id: user.role_id,
                role_name: user.role_name,
                category_id: user.category_id || null,
                staff_id: user.staff_id || null,
                name: `${user.first_name} ${user.last_name}`
                    ? `${user.first_name} ${user.last_name}` 
                    : 'Super Admin',
                department: user.department || null,
                position: user.position || null
            }
        });
    });
});
//==================================================================



// ====================== DASHBOARD ENDPOINTS ======================
//Evaluators
// Get dashboard stats
// GET Dashboard Statistics
app.get("/api/dashboard/statistics/:periodId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const userRole = req.user.role_name;
    const staffId = req.user.staff_id;
    
    if (userRole === 'Teaching Evaluator') {
        // Teaching evaluator dashboard
        const query = `
            SELECT 
                -- Handled employees (in their department)
                (SELECT COUNT(*) 
                 FROM staff s 
                 WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                   AND s.category_id = 1 
                   AND s.status = 'active'
                   AND s.staff_id != ?
                ) as handledEmployees,
                
                -- Pending evaluations
                (SELECT COUNT(*) 
                 FROM staff s 
                 LEFT JOIN teaching_evaluations te ON s.staff_id = te.staff_id AND te.period_id = ?
                 WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                   AND s.category_id = 1 
                   AND s.status = 'active'
                   AND s.staff_id != ?
                   AND (te.evaluation_id IS NULL OR te.evaluation_status = 'draft')
                ) as pendingEvaluations,
                
                -- Completed evaluations
                (SELECT COUNT(*) 
                 FROM teaching_evaluations te
                 JOIN staff s ON te.staff_id = s.staff_id
                 WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                   AND te.period_id = ?
                   AND te.evaluation_status = 'completed'
                   AND s.status = 'active'
                ) as completedEvaluations,
                
                -- Pending certificates
                (SELECT COUNT(*) 
                 FROM certificates c
                 JOIN staff s ON c.staff_id = s.staff_id
                 WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                   AND c.period_id = ?
                   AND c.status = 'pending'
                   AND s.category_id = 1
                ) as pendingCertificates
        `;
        
        connection.query(query, [staffId, staffId, periodId, staffId, staffId, staffId, periodId, staffId, periodId], (err, results) => {
            if (err) {
                console.error("Dashboard statistics error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results[0] || {});
        });
        
    } else if (userRole === 'Non-Teaching Evaluator') {
        // Non-teaching evaluator (HR) dashboard
        const query = `
            SELECT 
                -- Handled employees (all non-teaching staff)
                (SELECT COUNT(*) 
                 FROM staff s 
                 WHERE s.category_id = 2 
                    AND s.staff_id != ?
                    AND s.status = 'active'
                ) as handledEmployees,
                
                -- Pending evaluations
                (SELECT COUNT(*) 
                 FROM staff s 
                 LEFT JOIN nonteaching_evaluations nte ON s.staff_id = nte.staff_id AND nte.period_id = ?
                 WHERE s.category_id = 2 
                    AND s.staff_id != ?
                   AND s.status = 'active'
                   AND (nte.evaluation_id IS NULL OR nte.evaluation_status = 'draft')
                ) as pendingEvaluations,
                
                -- Completed evaluations
                (SELECT COUNT(*) 
                 FROM nonteaching_evaluations nte
                 JOIN staff s ON nte.staff_id = s.staff_id
                 WHERE nte.period_id = ?
                   AND nte.evaluation_status = 'completed'
                   AND s.status = 'active'
                ) as completedEvaluations,
                
                -- Pending certificates
                (SELECT COUNT(*) 
                 FROM certificates c
                 JOIN staff s ON c.staff_id = s.staff_id
                 WHERE c.period_id = ?
                   AND c.status = 'pending'
                   AND s.category_id = 2
                ) as pendingCertificates
        `;
        
        connection.query(query, [staffId, periodId, staffId, periodId, periodId], (err, results) => {
            if (err) {
                console.error("Dashboard statistics error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results[0] || {});
        });
    }
});

// GET Evaluation Progress
app.get("/api/dashboard/progress/:periodId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const userRole = req.user.role_name;
    const staffId = req.user.staff_id;
    
    // Get period info first
    const periodQuery = `
        SELECT ep.period_name, ep.end_date, ay.year_code as academic_year
        FROM evaluation_periods ep
        JOIN academic_years ay ON ep.year_id = ay.year_id
        WHERE ep.period_id = ?
    `;
    
    connection.query(periodQuery, [periodId], (err, periodResults) => {
        if (err) {
            console.error("Period query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        const periodInfo = periodResults[0] || {};
        
        if (userRole === 'Teaching Evaluator') {
            // Teaching evaluator progress
            const query = `
                SELECT 
                    -- Total evaluations
                    (SELECT COUNT(*) 
                     FROM staff s 
                     WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                       AND s.category_id = 1 
                       AND s.status = 'active'
                       AND s.staff_id != ?
                    ) as totalTeachingEvaluations,
                    
                    -- Completed evaluations
                    (SELECT COUNT(*) 
                     FROM teaching_evaluations te
                     JOIN staff s ON te.staff_id = s.staff_id
                     WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                       AND te.period_id = ?
                       AND te.evaluation_status = 'completed'
                       AND s.status = 'active'
                    ) as teachingEvaluations,
                    
                    -- Total certificates
                    (SELECT COUNT(*) 
                     FROM certificates c
                     JOIN staff s ON c.staff_id = s.staff_id
                     WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                       AND c.period_id = ?
                       AND s.category_id = 1
                    ) as totalCertificates,
                    
                    -- Reviewed certificates
                    (SELECT COUNT(*) 
                     FROM certificates c
                     JOIN staff s ON c.staff_id = s.staff_id
                     WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
                       AND c.period_id = ?
                       AND c.status IN ('accepted', 'rejected')
                       AND s.category_id = 1
                    ) as reviewedCertificates
            `;
            
            connection.query(query, [staffId, staffId, staffId, periodId, staffId, periodId, staffId, periodId], (err, results) => {
                if (err) {
                    console.error("Progress query error:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                const progress = results[0] || {};
                progress.totalEvaluations = progress.totalTeachingEvaluations || 0;
                progress.completedEvaluations = progress.teachingEvaluations || 0;
                progress.periodName = periodInfo.period_name;
                progress.periodEndDate = periodInfo.end_date;
                
                res.json(progress);
            });
            
        } else if (userRole === 'Non-Teaching Evaluator') {
            // Non-teaching evaluator (HR) progress
            const query = `
                SELECT 
                    -- Total non-teaching evaluations
                    (SELECT COUNT(*) 
                     FROM staff s 
                     WHERE s.category_id = 2 
                       AND s.status = 'active'
                       And s.staff_id != ?
                    ) as totalNonTeachingEvaluations,
                    
                    -- Completed non-teaching evaluations
                    (SELECT COUNT(*) 
                     FROM nonteaching_evaluations nte
                     JOIN staff s ON nte.staff_id = s.staff_id
                     WHERE nte.period_id = ?
                       AND nte.evaluation_status = 'completed'
                       AND s.status = 'active'
                    ) as nonTeachingEvaluations,
                    
                    -- Total peer evaluation assignments
                    (SELECT COUNT(DISTINCT evaluatee_staff_id) 
                     FROM peer_evaluation_assignments
                     WHERE period_id = ?
                    ) as totalPeerEvaluations,
                    
                    -- Completed peer evaluations (all 3 evaluators submitted)
                    (SELECT COUNT(*)
                     FROM (
                         SELECT evaluatee_staff_id
                         FROM peer_evaluation_assignments pea
                         JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
                         WHERE pea.period_id = ? AND pe.evaluation_status = 'submitted'
                         GROUP BY evaluatee_staff_id
                         HAVING COUNT(*) = 3
                     ) as completed
                    ) as completedPeerEvaluations,
                    
                    -- Total certificates
                    (SELECT COUNT(*) 
                     FROM certificates c
                     JOIN staff s ON c.staff_id = s.staff_id
                     WHERE c.period_id = ?
                       AND s.category_id = 2
                    ) as totalCertificates,
                    
                    -- Reviewed certificates
                    (SELECT COUNT(*) 
                     FROM certificates c
                     JOIN staff s ON c.staff_id = s.staff_id
                     WHERE c.period_id = ?
                       AND c.status IN ('accepted', 'rejected')
                       AND s.category_id = 2
                    ) as reviewedCertificates
            `;
            
            connection.query(query, [staffId,periodId, periodId, periodId, periodId, periodId], (err, results) => {
                if (err) {
                    console.error("Progress query error:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                const progress = results[0] || {};
                progress.totalEvaluations = progress.totalNonTeachingEvaluations || 0;
                progress.completedEvaluations = progress.nonTeachingEvaluations || 0;
                progress.periodName = periodInfo.period_name;
                progress.periodEndDate = periodInfo.end_date;
                
                res.json(progress);
            });
        }
    });
});

// GET Recent Activity
// GET Recent Activity (Certificate Submissions & Peer Evaluations Only)
app.get("/api/dashboard/recent-activity/:periodId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const userRole = req.user.role_name;
    const staffId = req.user.staff_id;
    
    if (userRole === 'Teaching Evaluator') {
        // Teaching evaluator recent activity (only certificate submissions)
        const query = `
            SELECT 
                'certificate_submitted' as activity_type,
                c.submitted_date as activity_date,
                CONCAT(s.first_name, ' ', s.last_name) as employee_name,
                c.certificate_name as description
            FROM certificates c
            JOIN staff s ON c.staff_id = s.staff_id
            WHERE s.department_id = (SELECT department_id FROM staff WHERE staff_id = ?)
              AND c.period_id = ?
              AND s.category_id = 1
            ORDER BY c.submitted_date DESC
        `;
        
        connection.query(query, [staffId, periodId], (err, results) => {
            if (err) {
                console.error("Recent activity error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results);
        });
        
    } else if (userRole === 'Non-Teaching Evaluator') {
        // Non-teaching evaluator (HR) recent activity
        const query = `
            SELECT * FROM (
                -- Certificate submissions
                SELECT 
                    'certificate_submitted' as activity_type,
                    c.submitted_date as activity_date,
                    CONCAT(s.first_name, ' ', s.last_name) as employee_name,
                    NULL as evaluator_name,
                    c.certificate_name as description
                FROM certificates c
                JOIN staff s ON c.staff_id = s.staff_id
                WHERE c.period_id = ?
                  AND s.category_id = 2
                
                UNION ALL
                
                -- Peer evaluation completions
                SELECT 
                    'peer_evaluation_completed' as activity_type,
                    pe.submitted_date as activity_date,
                    CONCAT(s1.first_name, ' ', s1.last_name) as employee_name,
                    CONCAT(s2.first_name, ' ', s2.last_name) as evaluator_name,
                    CONCAT('Completed ', pea.evaluator_type, ' evaluation') as description
                FROM peer_evaluations pe
                JOIN peer_evaluation_assignments pea ON pe.assignment_id = pea.assignment_id
                JOIN staff s1 ON pea.evaluatee_staff_id = s1.staff_id
                JOIN staff s2 ON pea.evaluator_staff_id = s2.staff_id
                WHERE pea.period_id = ?
                  AND pe.evaluation_status = 'submitted'
            ) as activities
            ORDER BY activity_date DESC
        `;
        
        connection.query(query, [periodId, periodId], (err, results) => {
            if (err) {
                console.error("Recent activity error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results);
        });
    }
});
//============================================================================


// ====================== HELPER FUNCTION: CALCULATE YEARLY POINTS ======================
async function calculateYearlyPointsForStaff(staffId, yearId) {
    return new Promise((resolve, reject) => {
        const evalQuery = `
            SELECT te.*, ep.semester
            FROM teaching_evaluations te
            JOIN evaluation_periods ep ON te.period_id = ep.period_id
            WHERE te.staff_id = ? AND ep.year_id = ? AND te.evaluation_status = 'completed'
            ORDER BY ep.semester
        `;
        
        connection.query(evalQuery, [staffId, yearId], (err, evaluations) => {
            if (err) {
                reject(err);
                return;
            }
            
            const semester1 = evaluations.find(e => e.semester === '1st');
            const semester2 = evaluations.find(e => e.semester === '2nd');
            
            if (!semester1 || !semester2) {
                resolve({ success: false, message: 'Both semesters not completed yet' });
                return;
            }
            
            // For the main criteria breakdown, also average each
            // Teaching Competence = dean + student + peer + committee + dept_head
            const sem1_teaching_competence = (
                parseFloat(semester1.dean_eval || 0) +
                parseFloat(semester1.student_eval || 0) +
                parseFloat(semester1.peer_eval || 0)
            );
            
            const sem2_teaching_competence = (
                parseFloat(semester2.dean_eval || 0) +
                parseFloat(semester2.student_eval || 0) +
                parseFloat(semester2.peer_eval || 0)
            );
            
            const teaching_competence = (sem1_teaching_competence + sem2_teaching_competence) / 2;
            
            // Effectiveness = seminar_attendance + scholarly_achievement
            const sem1_effectiveness = (
                parseFloat(semester1.committee_chair_eval || 0) +
                parseFloat(semester1.dept_head_eval || 0)
            );
            
            const sem2_effectiveness = (
                parseFloat(semester2.committee_chair_eval || 0) +
                parseFloat(semester2.dept_head_eval || 0)
            );
            
            const effectiveness = (sem1_effectiveness + sem2_effectiveness) / 2;
            
            // Professional Growth = publications + research + graduate_units
            const sem1_professional_growth = (
                parseFloat(semester1.seminar_attendance || 0) +
                parseFloat(semester1.publications || 0) +
                parseFloat(semester1.scholarly_achievement || 0) +
                parseFloat(semester1.research_conducted || 0) +
                parseFloat(semester1.graduate_units || 0)
            );
            
            const sem2_professional_growth = (
                parseFloat(semester2.seminar_attendance || 0) +
                parseFloat(semester2.publications || 0) +
                parseFloat(semester2.scholarly_achievement || 0) +
                parseFloat(semester2.research_conducted || 0) +
                parseFloat(semester2.graduate_units || 0)
            );
            
            const professional_growth = (sem1_professional_growth + sem2_professional_growth) / 2;
            
            // Teaching Experience - just average
            const teaching_experience = (
                parseFloat(semester1.teaching_experience || 0) +
                parseFloat(semester2.teaching_experience || 0)
            ) / 2;

            // Simple calculation: Just get the total_points from each semester and average
            const sem1_total = (sem1_teaching_competence + sem1_effectiveness + sem1_professional_growth + parseFloat(semester1.teaching_experience || 0)) || 0;
            const sem2_total = (sem2_teaching_competence + sem2_effectiveness + sem2_professional_growth + parseFloat(semester2.teaching_experience || 0)) || 0;

            // Average the total points
            const total_points = (sem1_total + sem2_total) / 2;


            const insertQuery = `
                INSERT INTO teaching_yearly_points 
                (staff_id, academic_year_id, teaching_competence, effectiveness, professional_growth, teaching_experience, total_points)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    teaching_competence = VALUES(teaching_competence),
                    effectiveness = VALUES(effectiveness),
                    professional_growth = VALUES(professional_growth),
                    teaching_experience = VALUES(teaching_experience),
                    total_points = VALUES(total_points),
                    updated_at = CURRENT_TIMESTAMP
            `;
            
            connection.query(insertQuery, [
                staffId, yearId,
                teaching_competence.toFixed(2),
                effectiveness.toFixed(2),
                professional_growth.toFixed(2),
                teaching_experience.toFixed(2),
                total_points.toFixed(2)
            ], (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ 
                    success: true, 
                    staffId: staffId,
                    total_points: total_points.toFixed(2)
                });
            });
        });
    });
}

// ====================== TEACHING EVALUATION ENDPOINTS ======================
// Get teaching evaluations by period (for global period selector)
//For populating the table in teaching evaluations page
app.get("/api/teaching-evaluations/:periodId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    

    const query = `
        SELECT 
            te.evaluation_id,
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name as department,
            s.position,
            COALESCE(te.total_points, 0) as total_score,
            COALESCE(te.evaluation_status, 'pending') as status
        FROM staff s
        LEFT JOIN teaching_evaluations te ON s.staff_id = te.staff_id AND te.period_id = ?
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.department_head_id = ? 
            AND s.category_id = 1 
            AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
    `;

    connection.query(query, [periodId, req.user.staff_id], (err, results) => {
        if (err) {
            console.error("Teaching evaluations query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});



// GET single teaching evaluation
app.get("/api/teaching-evaluation/:evaluationId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const evaluationId = req.params.evaluationId;
    
    const query = `
        SELECT 
            te.*,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            s.position,
            d.department_name
        FROM teaching_evaluations te
        JOIN staff s ON te.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE te.evaluation_id = ? AND s.department_head_id = ?
    `;
    
    connection.query(query, [evaluationId, req.user.staff_id], (err, results) => {
        if (err) {
            console.error("Error fetching evaluation:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "Evaluation not found" });
        }
        
        res.json(results[0]);
    });
});

// POST save/update teaching evaluation
app.post("/api/teaching-evaluation/save", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const {
        staff_id,
        period_id,
        evaluation_id,
        dean_eval,
        student_eval,
        peer_eval,
        committee_chair_eval,
        dept_head_eval,
        seminar_attendance,
        publications,
        scholarly_achievement,
        research_conducted,
        graduate_units,
        teaching_experience
    } = req.body;
    
    // Calculate total points
    const total_points = parseFloat(dean_eval || 0) + 
                        parseFloat(student_eval || 0) + 
                        parseFloat(peer_eval || 0) + 
                        parseFloat(committee_chair_eval || 0) + 
                        parseFloat(dept_head_eval || 0) + 
                        parseFloat(seminar_attendance || 0) + 
                        parseFloat(publications || 0) + 
                        parseFloat(scholarly_achievement || 0) + 
                        parseFloat(research_conducted || 0) + 
                        parseFloat(graduate_units || 0) + 
                        parseFloat(teaching_experience || 0);
    
    // Verify the staff belongs to this evaluator's department
    const verifyQuery = `
        SELECT staff_id FROM staff 
        WHERE staff_id = ? AND department_head_id = ? AND category_id = 1
    `;
    
    connection.query(verifyQuery, [staff_id, req.user.staff_id], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "You don't have permission to evaluate this staff" });
        }
        
        if (evaluation_id) {
            // UPDATE existing evaluation
            const updateQuery = `
                UPDATE teaching_evaluations 
                SET dean_eval = ?,
                    student_eval = ?,
                    peer_eval = ?,
                    committee_chair_eval = ?,
                    dept_head_eval = ?,
                    seminar_attendance = ?,
                    publications = ?,
                    scholarly_achievement = ?,
                    research_conducted = ?,
                    graduate_units = ?,
                    teaching_experience = ?,
                    total_points = ?,
                    evaluation_status = 'completed',
                    completed_date = CURRENT_TIMESTAMP
                WHERE evaluation_id = ? AND staff_id = ?
            `;
            
            connection.query(updateQuery, [
                dean_eval, student_eval, peer_eval, committee_chair_eval, dept_head_eval,
                seminar_attendance, publications, scholarly_achievement, research_conducted,
                graduate_units, teaching_experience, total_points, evaluation_id, staff_id
            ], async (err, result) => {
                if (err) {
                    console.error("Update error:", err);
                    return res.status(500).json({ message: "Error updating evaluation" });
                }
                
                // ⭐ Auto-calculate yearly points if 2nd semester completed
                const checkQuery = `
                    SELECT ep.semester, ep.year_id
                    FROM teaching_evaluations te
                    JOIN evaluation_periods ep ON te.period_id = ep.period_id
                    WHERE te.evaluation_id = ?
                `;
                
                connection.query(checkQuery, [evaluation_id], async (err, evalInfo) => {
                    if (!err && evalInfo.length > 0) {
                        const { semester, year_id } = evalInfo[0];
                        
                        if (semester === '2nd') {
                            const firstSemQuery = `
                                SELECT COUNT(*) as count
                                FROM teaching_evaluations te
                                JOIN evaluation_periods ep ON te.period_id = ep.period_id
                                WHERE te.staff_id = ? AND ep.year_id = ? 
                                    AND ep.semester = '1st' AND te.evaluation_status = 'completed'
                            `;
                            
                            connection.query(firstSemQuery, [staff_id, year_id], async (err, firstSemResult) => {
                                if (!err && firstSemResult[0].count > 0) {
                                    try {
                                        const result = await calculateYearlyPointsForStaff(staff_id, year_id);
                                        console.log('✅ Auto-calculated yearly points:', result);
                                    } catch (error) {
                                        console.error('❌ Error auto-calculating:', error);
                                    }
                                }
                            });
                        }
                    }
                });
                
                res.json({ 
                    message: "Evaluation updated successfully",
                    evaluation_id: evaluation_id,
                    total_points: total_points
                });
            });

        } else {
            // INSERT new evaluation
            const insertQuery = `
                INSERT INTO teaching_evaluations (
                    staff_id, evaluator_user_id, period_id,
                    dean_eval, student_eval, peer_eval, committee_chair_eval, dept_head_eval,
                    seminar_attendance, publications, scholarly_achievement, research_conducted,
                    graduate_units, teaching_experience, total_points,
                    evaluation_status, evaluation_date, completed_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `;
            
            connection.query(insertQuery, [
                staff_id, req.user.user_id, period_id,
                dean_eval, student_eval, peer_eval, committee_chair_eval, dept_head_eval,
                seminar_attendance, publications, scholarly_achievement, research_conducted,
                graduate_units, teaching_experience, total_points
            ], async (err, result) => {
                if (err) {
                    console.error("Insert error:", err);
                    return res.status(500).json({ message: "Error creating evaluation" });
                }
                
                const newEvaluationId = result.insertId;
                
                // ⭐ Auto-calculate yearly points if 2nd semester completed
                const checkQuery = `
                    SELECT ep.semester, ep.year_id
                    FROM evaluation_periods ep
                    WHERE ep.period_id = ?
                `;
                
                connection.query(checkQuery, [period_id], async (err, evalInfo) => {
                    if (!err && evalInfo.length > 0) {
                        const { semester, year_id } = evalInfo[0];
                        
                        if (semester === '2nd') {
                            const firstSemQuery = `
                                SELECT COUNT(*) as count
                                FROM teaching_evaluations te
                                JOIN evaluation_periods ep ON te.period_id = ep.period_id
                                WHERE te.staff_id = ? AND ep.year_id = ? 
                                    AND ep.semester = '1st' AND te.evaluation_status = 'completed'
                            `;
                            
                            connection.query(firstSemQuery, [staff_id, year_id], async (err, firstSemResult) => {
                                if (!err && firstSemResult[0].count > 0) {
                                    try {
                                        const result = await calculateYearlyPointsForStaff(staff_id, year_id);
                                        console.log('✅ Auto-calculated yearly points:', result);
                                    } catch (error) {
                                        console.error('❌ Error auto-calculating:', error);
                                    }
                                }
                            });
                        }
                    }
                });
                
                res.json({ 
                    message: "Evaluation created successfully",
                    evaluation_id: newEvaluationId,
                    total_points: total_points
                });
            });
        }
    });
});



// ====================== HELPER FUNCTION: CALCULATE NON-TEACHING YEARLY POINTS ======================
async function calculateYearlyPointsForNonTeachingStaff(staffId, yearId) {
    return new Promise((resolve, reject) => {
        const evalQuery = `
            SELECT nte.*, ep.semester
            FROM nonteaching_evaluations nte
            JOIN evaluation_periods ep ON nte.period_id = ep.period_id
            WHERE nte.staff_id = ? AND ep.year_id = ? AND nte.evaluation_status = 'completed'
            ORDER BY ep.semester
        `;
        
        connection.query(evalQuery, [staffId, yearId], (err, evaluations) => {
            if (err) {
                reject(err);
                return;
            }
            
            const semester1 = evaluations.find(e => e.semester === '1st');
            const semester2 = evaluations.find(e => e.semester === '2nd');
            
            if (!semester1 || !semester2) {
                resolve({ success: false, message: 'Both semesters not completed yet' });
                return;
            }
            
            // Get peer evaluation points for both semesters
            const peerEvalQuery = `
                SELECT 
                    pe.*,
                    pea.period_id
                FROM peer_evaluation_assignments pea
                JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
                WHERE pea.evaluatee_staff_id = ? 
                    AND pea.period_id IN (?, ?)
                    AND pe.evaluation_status = 'submitted'
                ORDER BY pea.period_id, pea.evaluator_type
            `;
            
            connection.query(peerEvalQuery, [staffId, semester1.period_id, semester2.period_id], (err, peerResults) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Separate by semester
                const sem1Peers = peerResults.filter(p => p.period_id === semester1.period_id);
                const sem2Peers = peerResults.filter(p => p.period_id === semester2.period_id);
                
                // Calculate average for each field across 3 evaluators, then sum for category
                const calculateCategoryAverage = (peers, fields) => {
                    if (peers.length === 0) return 0;
                    
                    let categoryTotal = 0;
                    fields.forEach(field => {
                        const sum = peers.reduce((acc, peer) => acc + (parseFloat(peer[field]) || 0), 0);
                        const avg = sum / 3; // Always divide by 3 (even if some are 0)
                        categoryTotal += avg;
                    });
                    
                    return categoryTotal;
                };
                
                // PRODUCTIVITY (5 fields: quality, quantity, knowledge, initiative, reliability)
                const productivityFields = ['quality_of_work', 'quantity_of_work', 'job_knowledge', 'initiative', 'reliability'];
                const sem1Productivity = calculateCategoryAverage(sem1Peers, productivityFields);
                const sem2Productivity = calculateCategoryAverage(sem2Peers, productivityFields);
                const productivity = (sem1Productivity + sem2Productivity) / 2;
                
                // ATTITUDE (5 fields: job_attitude, work_habits, personal_relation, integrity, self_discipline)
                const attitudeFields = ['job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline'];
                const sem1Attitude = calculateCategoryAverage(sem1Peers, attitudeFields);
                const sem2Attitude = calculateCategoryAverage(sem2Peers, attitudeFields);
                const attitude = (sem1Attitude + sem2Attitude) / 2;
                
                // PROMOTIONAL COMPETENCE (5 fields: ability_to_learn, ability_to_organize, cooperation, development_orientation, planning_capability)
                const competenceFields = ['ability_to_learn', 'ability_to_organize', 'cooperation', 'development_orientation', 'planning_capability'];
                const sem1Competence = calculateCategoryAverage(sem1Peers, competenceFields);
                const sem2Competence = calculateCategoryAverage(sem2Peers, competenceFields);
                const promotional_competence = (sem1Competence + sem2Competence) / 2;
                
                // ATTENDANCE (from nonteaching_evaluations table)
                const attendance = (
                    (parseFloat(semester1.excu_absences_without_pay) || 0) +
                    (parseFloat(semester1.tardiness) || 0) +
                    (parseFloat(semester1.minutes_late) || 0) +
                    (parseFloat(semester2.excu_absences_without_pay) || 0) +
                    (parseFloat(semester2.tardiness) || 0) +
                    (parseFloat(semester2.minutes_late) || 0)
                ) / 2;
                
                // PROFESSIONAL ADVANCEMENT (seminar)
                const professional_advancement = Math.min(
                    (parseFloat(semester1.seminar) || 0) +
                    (parseFloat(semester2.seminar) || 0), 3);
                
                // INSTITUTIONAL INVOLVEMENT
                const institutional_involvement = Math.min(
                    (parseFloat(semester1.institutional_involvement) || 0) +
                    (parseFloat(semester2.institutional_involvement) || 0), 2);
                
                // COMMUNITY INVOLVEMENT
                const community_involvement = Math.min(
                    (parseFloat(semester1.community_involvement) || 0) +
                    (parseFloat(semester2.community_involvement) || 0), 3);
                
                // WORK EXPERIENCE
                const work_experience = Math.min(
                    (parseFloat(semester1.work_experience) || 0) +
                    (parseFloat(semester2.work_experience) || 0), 2);
                
                const total_points = productivity + attitude + promotional_competence + 
                                   attendance + professional_advancement + institutional_involvement + 
                                   community_involvement + work_experience;
                
                const insertQuery = `
                    INSERT INTO nonteaching_yearly_points 
                    (staff_id, academic_year_id, productivity, attitude, promotional_competence, 
                     attendance, professional_advancement, institutional_involvement, 
                     community_involvement, work_experience, total_points)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        productivity = VALUES(productivity),
                        attitude = VALUES(attitude),
                        promotional_competence = VALUES(promotional_competence),
                        attendance = VALUES(attendance),
                        professional_advancement = VALUES(professional_advancement),
                        institutional_involvement = VALUES(institutional_involvement),
                        community_involvement = VALUES(community_involvement),
                        work_experience = VALUES(work_experience),
                        total_points = VALUES(total_points),
                        updated_at = CURRENT_TIMESTAMP
                `;
                
                connection.query(insertQuery, [
                    staffId, yearId,
                    productivity.toFixed(2),
                    attitude.toFixed(2),
                    promotional_competence.toFixed(2),
                    attendance.toFixed(2),
                    professional_advancement.toFixed(2),
                    institutional_involvement.toFixed(2),
                    community_involvement.toFixed(2),
                    work_experience.toFixed(2),
                    total_points.toFixed(2)
                ], (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ 
                        success: true, 
                        staffId: staffId,
                        total_points: total_points.toFixed(2)
                    });
                });
            });
        });
    });
}

// ====================== NON-TEACHING EVALUATION ENDPOINTS ======================
// Get non-teaching evaluations by period (for global period selector)
// GET Non-Teaching Evaluations List
app.get("/api/non-teaching-evaluations/:periodId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const evaluatorStaffId = req.user.staff_id; // HR Head
    
    const query = `
        SELECT 
            nte.evaluation_id,
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            COALESCE(nte.final_total_points, 0) as total_score,
            COALESCE(nte.evaluation_status, 'pending') as status
        FROM staff s
        LEFT JOIN nonteaching_evaluations nte ON s.staff_id = nte.staff_id AND nte.period_id = ?
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.department_head_id = ?
            AND s.category_id = 2 
            AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [periodId, evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Non-teaching evaluations query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Single Non-Teaching Evaluation
app.get("/api/non-teaching-evaluation/:evaluationId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const evaluationId = req.params.evaluationId;
    
    const query = `
        SELECT 
            nte.*,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            s.position,
            d.department_name
        FROM nonteaching_evaluations nte
        JOIN staff s ON nte.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE nte.evaluation_id = ?
    `;
    
    connection.query(query, [evaluationId], (err, results) => {
        if (err) {
            console.error("Error fetching evaluation:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "Evaluation not found" });
        }
        
        res.json(results[0]);
    });
});

// GET Seminar Points for Staff
app.get("/api/seminar-points/:staffId/:periodId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const { staffId, periodId } = req.params;
    
    const query = `
        SELECT 
            COALESCE(SUM(points_value), 0) as points
        FROM certificates
        WHERE staff_id = ? 
            AND period_id = ?
            AND status = 'accepted'
    `;
    
    connection.query(query, [staffId, periodId], (err, results) => {
        if (err) {
            console.error("Error fetching seminar points:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        const points = Math.min(parseFloat(results[0].points) || 0, 3); // Max 3 points
        res.json({ points });
    });
});

// POST Save/Update Non-Teaching Evaluation
app.post("/api/non-teaching-evaluation/save", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const {
        staff_id,
        period_id,
        evaluation_id,
        excu_absences_without_pay,
        tardiness,
        minutes_late,
        seminar,
        institutional_involvement,
        community_involvement,
        work_experience
    } = req.body;
    
    // Verify the staff is non-teaching
    const verifyQuery = `
        SELECT staff_id FROM staff 
        WHERE staff_id = ? AND category_id = 2
    `;
    
    connection.query(verifyQuery, [staff_id], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Invalid staff member" });
        }
        
        // Calculate total points
        const final_total_points = parseFloat(excu_absences_without_pay || 0) + 
                                   parseFloat(tardiness || 0) + 
                                   parseFloat(minutes_late || 0) + 
                                   parseFloat(seminar || 0) + 
                                   parseFloat(institutional_involvement || 0) + 
                                   parseFloat(community_involvement || 0) + 
                                   parseFloat(work_experience || 0);
        
        if (evaluation_id) {
            // ========== UPDATE PATH ==========
            const updateQuery = `
                UPDATE nonteaching_evaluations 
                SET excu_absences_without_pay = ?,
                    tardiness = ?,
                    minutes_late = ?,
                    seminar = ?,
                    institutional_involvement = ?,
                    community_involvement = ?,
                    work_experience = ?,
                    final_total_points = ?,
                    evaluation_status = 'completed',
                    completed_date = CURRENT_TIMESTAMP
                WHERE evaluation_id = ? AND staff_id = ?
            `;
            
            connection.query(updateQuery, [
                excu_absences_without_pay, tardiness, minutes_late, seminar,
                institutional_involvement, community_involvement, work_experience,
                final_total_points, evaluation_id, staff_id
            ], async (err, result) => {  // ⭐ Changed to async
                if (err) {
                    console.error("Update error:", err);
                    return res.status(500).json({ message: "Error updating evaluation" });
                }
                
                // ⭐ ADD AUTO-CALCULATION HERE (UPDATE PATH)
                const checkQuery = `
                    SELECT ep.semester, ep.year_id
                    FROM nonteaching_evaluations nte
                    JOIN evaluation_periods ep ON nte.period_id = ep.period_id
                    WHERE nte.evaluation_id = ?
                `;
                
                connection.query(checkQuery, [evaluation_id], async (err, evalInfo) => {
                    if (!err && evalInfo.length > 0) {
                        const { semester, year_id } = evalInfo[0];
                        
                        if (semester === '2nd') {
                            const firstSemQuery = `
                                SELECT COUNT(*) as count
                                FROM nonteaching_evaluations nte
                                JOIN evaluation_periods ep ON nte.period_id = ep.period_id
                                WHERE nte.staff_id = ? AND ep.year_id = ? 
                                    AND ep.semester = '1st' AND nte.evaluation_status = 'completed'
                            `;
                            
                            connection.query(firstSemQuery, [staff_id, year_id], async (err, firstSemResult) => {
                                if (!err && firstSemResult[0].count > 0) {
                                    try {
                                        const result = await calculateYearlyPointsForNonTeachingStaff(staff_id, year_id);
                                        console.log('✅ Auto-calculated non-teaching yearly points:', result);
                                    } catch (error) {
                                        console.error('❌ Error auto-calculating:', error);
                                    }
                                }
                            });
                        }
                    }
                });
                
                res.json({ 
                    message: "Evaluation updated successfully",
                    evaluation_id: evaluation_id,
                    total_points: final_total_points
                });
            });
            
        } else {
            // ========== INSERT PATH ==========
            const insertQuery = `
                INSERT INTO nonteaching_evaluations (
                    staff_id, evaluator_user_id, period_id,
                    excu_absences_without_pay, tardiness, minutes_late, seminar,
                    institutional_involvement, community_involvement, work_experience,
                    final_total_points, evaluation_status, evaluation_date, completed_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `;
            
            connection.query(insertQuery, [
                staff_id, req.user.user_id, period_id,
                excu_absences_without_pay, tardiness, minutes_late, seminar,
                institutional_involvement, community_involvement, work_experience,
                final_total_points
            ], async (err, result) => {  // ⭐ Changed to async
                if (err) {
                    console.error("Insert error:", err);
                    return res.status(500).json({ message: "Error creating evaluation" });
                }
                
                const newEvaluationId = result.insertId;
                
                // ⭐ ADD AUTO-CALCULATION HERE (INSERT PATH)
                const checkQuery = `
                    SELECT ep.semester, ep.year_id
                    FROM evaluation_periods ep
                    WHERE ep.period_id = ?
                `;
                
                connection.query(checkQuery, [period_id], async (err, evalInfo) => {
                    if (!err && evalInfo.length > 0) {
                        const { semester, year_id } = evalInfo[0];
                        
                        if (semester === '2nd') {
                            const firstSemQuery = `
                                SELECT COUNT(*) as count
                                FROM nonteaching_evaluations nte
                                JOIN evaluation_periods ep ON nte.period_id = ep.period_id
                                WHERE nte.staff_id = ? AND ep.year_id = ? 
                                    AND ep.semester = '1st' AND nte.evaluation_status = 'completed'
                            `;
                            
                            connection.query(firstSemQuery, [staff_id, year_id], async (err, firstSemResult) => {
                                if (!err && firstSemResult[0].count > 0) {
                                    try {
                                        const result = await calculateYearlyPointsForNonTeachingStaff(staff_id, year_id);
                                        console.log('✅ Auto-calculated non-teaching yearly points:', result);
                                    } catch (error) {
                                        console.error('❌ Error auto-calculating:', error);
                                    }
                                }
                            });
                        }
                    }
                });
                
                res.json({ 
                    message: "Evaluation created successfully",
                    evaluation_id: newEvaluationId,
                    total_points: final_total_points
                });
            });
        }
    });
});
//================================================================================




// ====================== PEER EVALUATION ENDPOINTS ======================
// Get peer evaluations by period (for global period selector)
// GET Peer Evaluation Assignments
app.get("/api/peer-evaluations/:periodId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    
    const query = `
        SELECT 
            s.staff_id as evaluatee_staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            ep.period_id,
            
            -- Department Head
            (SELECT CONCAT(s2.first_name, ' ', s2.last_name)
             FROM peer_evaluation_assignments pea1
             JOIN staff s2 ON pea1.evaluator_staff_id = s2.staff_id
             WHERE pea1.evaluatee_staff_id = s.staff_id 
               AND pea1.period_id = ?
               AND pea1.evaluator_type = 'department_head'
             LIMIT 1) as dept_head_name,
            
            (SELECT pe.evaluation_status
             FROM peer_evaluation_assignments pea1
             LEFT JOIN peer_evaluations pe ON pea1.assignment_id = pe.assignment_id
             WHERE pea1.evaluatee_staff_id = s.staff_id 
               AND pea1.period_id = ?
               AND pea1.evaluator_type = 'department_head'
             LIMIT 1) as dept_head_status,
            
            -- Same Department Peer
            (SELECT CONCAT(s2.first_name, ' ', s2.last_name)
             FROM peer_evaluation_assignments pea2
             JOIN staff s2 ON pea2.evaluator_staff_id = s2.staff_id
             WHERE pea2.evaluatee_staff_id = s.staff_id 
               AND pea2.period_id = ?
               AND pea2.evaluator_type = 'same_department_peer'
             LIMIT 1) as same_dept_peer_name,
            
            (SELECT pe.evaluation_status
             FROM peer_evaluation_assignments pea2
             LEFT JOIN peer_evaluations pe ON pea2.assignment_id = pe.assignment_id
             WHERE pea2.evaluatee_staff_id = s.staff_id 
               AND pea2.period_id = ?
               AND pea2.evaluator_type = 'same_department_peer'
             LIMIT 1) as same_dept_peer_status,
            
            -- External Peer
            (SELECT CONCAT(s2.first_name, ' ', s2.last_name)
             FROM peer_evaluation_assignments pea3
             JOIN staff s2 ON pea3.evaluator_staff_id = s2.staff_id
             WHERE pea3.evaluatee_staff_id = s.staff_id 
               AND pea3.period_id = ?
               AND pea3.evaluator_type = 'outsider'
             LIMIT 1) as external_peer_name,
            
            (SELECT pe.evaluation_status
             FROM peer_evaluation_assignments pea3
             LEFT JOIN peer_evaluations pe ON pea3.assignment_id = pe.assignment_id
             WHERE pea3.evaluatee_staff_id = s.staff_id 
               AND pea3.period_id = ?
               AND pea3.evaluator_type = 'outsider'
             LIMIT 1) as external_peer_status,
            
            -- Count completed evaluations
            (SELECT COUNT(*)
             FROM peer_evaluation_assignments pea
             JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
             WHERE pea.evaluatee_staff_id = s.staff_id 
               AND pea.period_id = ?
               AND pe.evaluation_status = 'submitted') as completed_evaluations
            
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN evaluation_periods ep ON ep.period_id = ?
        WHERE s.category_id = 2 
            AND s.status = 'active'
            AND EXISTS (
                SELECT 1 FROM peer_evaluation_assignments pea
                WHERE pea.evaluatee_staff_id = s.staff_id 
                  AND pea.period_id = ?
            )
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [periodId, periodId, periodId, periodId, periodId, periodId, periodId, periodId, periodId], (err, results) => {
        if (err) {
            console.error("Peer evaluations query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Non-Teaching Staff for Assignment
app.get("/api/non-teaching-staff", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as full_name,
            s.department_id,
            d.department_name,
            s.is_department_head
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.category_id = 2 
            AND s.status = 'active'
            AND s.staff_id != ?
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [req.user.user_id], (err, results) => {
        if (err) {
            console.error("Non-teaching staff query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// POST Create Peer Assignment
app.post("/api/peer-assignment", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const { evaluatee_staff_id, department_head_id, same_dept_peer_id, external_peer_id, period_id } = req.body;
    const assignedByUserId = req.user.user_id;
    
    // Check if already assigned for this period
    const checkQuery = `
        SELECT COUNT(*) as count 
        FROM peer_evaluation_assignments 
        WHERE evaluatee_staff_id = ? AND period_id = ?
    `;
    
    connection.query(checkQuery, [evaluatee_staff_id, period_id], (err, checkResults) => {
        if (err) {
            console.error("Check query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (checkResults[0].count > 0) {
            return res.status(400).json({ message: "This employee is already assigned for this period" });
        }
        
        // Insert three assignments
        const insertQuery = `
            INSERT INTO peer_evaluation_assignments 
            (evaluatee_staff_id, evaluator_staff_id, period_id, evaluator_type, assigned_by_user_id, assignment_status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `;
        
        // Insert department head assignment
        connection.query(insertQuery, [evaluatee_staff_id, department_head_id, period_id, 'department_head', assignedByUserId], (err) => {
            if (err) {
                console.error("Insert dept head error:", err);
                return res.status(500).json({ message: "Error creating assignment" });
            }
            
            // Insert same dept peer assignment
            connection.query(insertQuery, [evaluatee_staff_id, same_dept_peer_id, period_id, 'same_department_peer', assignedByUserId], (err) => {
                if (err) {
                    console.error("Insert same peer error:", err);
                    return res.status(500).json({ message: "Error creating assignment" });
                }
                
                // Insert external peer assignment
                connection.query(insertQuery, [evaluatee_staff_id, external_peer_id, period_id, 'outsider', assignedByUserId], (err) => {
                    if (err) {
                        console.error("Insert external peer error:", err);
                        return res.status(500).json({ message: "Error creating assignment" });
                    }
                    
                    res.json({ message: "Peer evaluation assigned successfully" });
                });
            });
        });
    });
});

// GET Peer Evaluation Details
app.get("/api/peer-evaluation-details/:evaluateeStaffId/:periodId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const { evaluateeStaffId, periodId } = req.params;
    
    // Get employee info
    const employeeQuery = `
        SELECT 
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            ep.period_name
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN evaluation_periods ep ON ep.period_id = ?
        WHERE s.staff_id = ?
    `;
    
    connection.query(employeeQuery, [periodId, evaluateeStaffId], (err, employeeResults) => {
        if (err) {
            console.error("Employee query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (employeeResults.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }
        
        // Get all evaluations
        const evalQuery = `
            SELECT 
                pea.evaluator_type,
                CONCAT(s.first_name, ' ', s.last_name) as evaluator_name,
                pe.*
            FROM peer_evaluation_assignments pea
            JOIN staff s ON pea.evaluator_staff_id = s.staff_id
            LEFT JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
            WHERE pea.evaluatee_staff_id = ? AND pea.period_id = ?
        `;
        
        connection.query(evalQuery, [evaluateeStaffId, periodId], (err, evalResults) => {
            if (err) {
                console.error("Evaluation query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const response = {
                ...employeeResults[0],
                evaluations: evalResults
            };
            
            res.json(response);
        });
    });
});
//================================================================================







// ====================== SUMMARY ENDPOINTS ======================
// Get teaching summary by period (for global period selector)
// For populating the table in teaching summary page
app.get("/api/teaching-summary/:periodId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name as department,
            te.total_points as total_score,
            COALESCE(te.evaluation_status, 'Not Started') as status
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN teaching_evaluations te ON s.staff_id = te.staff_id AND te.period_id = ?
        WHERE s.category_id = 1 AND s.department_head_id = ? AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
    `;

    connection.query(query, [periodId, req.user.staff_id], (err, results) => {
        if (err) {
            console.error("Summary query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});


// GET Teaching Summary List (All staff with yearly totals)
app.get("/api/teaching-summary/:yearId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const yearId = req.params.yearId;
    const evaluatorStaffId = req.user.staff_id;
    
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            COALESCE(
                (SELECT SUM(te.total_points) 
                 FROM teaching_evaluations te
                 JOIN evaluation_periods ep ON te.period_id = ep.period_id
                 WHERE te.staff_id = s.staff_id AND ep.year_id = ?
                ), 0
            ) as total_score
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.department_head_id = ? 
            AND s.category_id = 1 
            AND s.status = 'active'
        ORDER BY total_score DESC, s.last_name, s.first_name
    `;
    
    connection.query(query, [yearId, evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Error fetching teaching summary:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Detailed Teaching Summary (Individual staff with both semesters)
app.get("/api/teaching-summary/detail/:staffId/:yearId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const { staffId, yearId } = req.params;
    const evaluatorStaffId = req.user.staff_id;
    
    // First verify access
    const verifyQuery = `
        SELECT staff_id FROM staff 
        WHERE staff_id = ? AND department_head_id = ? AND category_id = 1
    `;
    
    connection.query(verifyQuery, [staffId, evaluatorStaffId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        // Get staff basic info
        const staffQuery = `
            SELECT 
                s.staff_id,
                CONCAT(s.first_name, ' ', s.last_name) as employee_name,
                d.department_name,
                s.position,
                ay.year_code as academic_year
            FROM staff s
            LEFT JOIN departments d ON s.department_id = d.department_id
            LEFT JOIN academic_years ay ON ay.year_id = ?
            WHERE s.staff_id = ?
        `;
        
        connection.query(staffQuery, [yearId, staffId], (err, staffResults) => {
            if (err) {
                console.error("Staff query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            if (staffResults.length === 0) {
                return res.status(404).json({ message: "Staff not found" });
            }
            
            const staffInfo = staffResults[0];
            
            // Get evaluations for both semesters
            const evalQuery = `
                SELECT 
                    te.*,
                    ep.semester
                FROM teaching_evaluations te
                JOIN evaluation_periods ep ON te.period_id = ep.period_id
                WHERE te.staff_id = ? AND ep.year_id = ?
                ORDER BY ep.semester
            `;
            
            connection.query(evalQuery, [staffId, yearId], (err, evalResults) => {
                if (err) {
                    console.error("Evaluation query error:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                // Organize by semester
                const firstSemester = evalResults.find(e => e.semester === '1st') || null;
                const secondSemester = evalResults.find(e => e.semester === '2nd') || null;
                
                const response = {
                    ...staffInfo,
                    first_semester: firstSemester,
                    second_semester: secondSemester
                };
                
                res.json(response);
            });
        });
    });
});








// Get non-teaching summary by period (for global period selector)
// For populating the table in non-teaching summary page
// GET Non-Teaching Summary List
app.get("/api/non-teaching-summary/:yearId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const yearId = req.params.yearId;
    const evaluatorStaffId = req.user.staff_id;
    
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            COALESCE(
                (SELECT SUM(nte.final_total_points)
                 FROM nonteaching_evaluations nte
                 JOIN evaluation_periods ep ON nte.period_id = ep.period_id
                 WHERE nte.staff_id = s.staff_id AND ep.year_id = ?
                ), 0
            ) as total_score
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.department_head_id = ?
            AND s.category_id = 2 
            AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [yearId, evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Error fetching non-teaching summary:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Detailed Non-Teaching Summary
app.get("/api/non-teaching-summary/detail/:staffId/:yearId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const { staffId, yearId } = req.params;
    
    // Get staff basic info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            ay.year_code as academic_year
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN academic_years ay ON ay.year_id = ?
        WHERE s.staff_id = ?
    `;
    
    connection.query(staffQuery, [yearId, staffId], (err, staffResults) => {
        if (err) {
            console.error("Staff query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get evaluation periods for this year
        const periodsQuery = `
            SELECT period_id, semester, period_name
            FROM evaluation_periods
            WHERE year_id = ?
            ORDER BY semester
        `;
        
        connection.query(periodsQuery, [yearId], (err, periodResults) => {
            if (err) {
                console.error("Periods query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const firstSemPeriod = periodResults.find(p => p.semester === '1st');
            const secondSemPeriod = periodResults.find(p => p.semester === '2nd');
            
            // Get peer evaluations and HR evaluations for both semesters
            Promise.all([
                getPeerEvaluationData(staffId, firstSemPeriod?.period_id),
                getPeerEvaluationData(staffId, secondSemPeriod?.period_id),
                getHREvaluationData(staffId, firstSemPeriod?.period_id),
                getHREvaluationData(staffId, secondSemPeriod?.period_id)
            ]).then(([fsPeer, ssPeer, fsHR, ssHR]) => {
                const response = {
                    ...staffInfo,
                    first_semester_period: firstSemPeriod?.period_name || '-',
                    second_semester_period: secondSemPeriod?.period_name || '-',
                    first_semester: {
                        productivity: fsPeer.productivity,
                        attitude: fsPeer.attitude,
                        competence: fsPeer.competence,
                        attendance: fsHR.attendance,
                        seminar: fsHR.seminar,
                        institutional: fsHR.institutional,
                        community: fsHR.community,
                        work_experience: fsHR.work_experience
                    },
                    second_semester: {
                        productivity: ssPeer.productivity,
                        attitude: ssPeer.attitude,
                        competence: ssPeer.competence,
                        attendance: ssHR.attendance,
                        seminar: ssHR.seminar,
                        institutional: ssHR.institutional,
                        community: ssHR.community,
                        work_experience: ssHR.work_experience
                    },
                    recommendation: '',
                    remarks: ''
                };
                
                res.json(response);
            }).catch(err => {
                console.error("Promise error:", err);
                res.status(500).json({ message: "Server error" });
            });
        });
    });
});

function getPeerEvaluationData(staffId, periodId) {
    return new Promise((resolve, reject) => {
        if (!periodId) {
            resolve({
                productivity: {},
                attitude: {},
                competence: {}
            });
            return;
        }
        
        const query = `
            SELECT 
                pe.quality_of_work, pe.quantity_of_work, pe.job_knowledge, 
                pe.initiative, pe.reliability,
                pe.job_attitude, pe.work_habits, pe.personal_relation, 
                pe.integrity, pe.self_discipline,
                pe.ability_to_learn, pe.ability_to_organize, pe.cooperation,
                pe.development_orientation, pe.planning_capability
            FROM peer_evaluation_assignments pea
            JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
            WHERE pea.evaluatee_staff_id = ? 
                AND pea.period_id = ?
                AND pe.evaluation_status = 'submitted'
            ORDER BY pea.evaluator_type
        `;
        
        connection.query(query, [staffId, periodId], (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            
            const data = {
                productivity: {
                    quality_of_work: {
                        evaluator1: results[0]?.quality_of_work || 0,
                        evaluator2: results[1]?.quality_of_work || 0,
                        evaluator3: results[2]?.quality_of_work || 0
                    },
                    quantity_of_work: {
                        evaluator1: results[0]?.quantity_of_work || 0,
                        evaluator2: results[1]?.quantity_of_work || 0,
                        evaluator3: results[2]?.quantity_of_work || 0
                    },
                    job_knowledge: {
                        evaluator1: results[0]?.job_knowledge || 0,
                        evaluator2: results[1]?.job_knowledge || 0,
                        evaluator3: results[2]?.job_knowledge || 0
                    },
                    initiative: {
                        evaluator1: results[0]?.initiative || 0,
                        evaluator2: results[1]?.initiative || 0,
                        evaluator3: results[2]?.initiative || 0
                    },
                    reliability: {
                        evaluator1: results[0]?.reliability || 0,
                        evaluator2: results[1]?.reliability || 0,
                        evaluator3: results[2]?.reliability || 0
                    }
                },
                attitude: {
                    job_attitude: {
                        evaluator1: results[0]?.job_attitude || 0,
                        evaluator2: results[1]?.job_attitude || 0,
                        evaluator3: results[2]?.job_attitude || 0
                    },
                    work_habits: {
                        evaluator1: results[0]?.work_habits || 0,
                        evaluator2: results[1]?.work_habits || 0,
                        evaluator3: results[2]?.work_habits || 0
                    },
                    personal_relation: {
                        evaluator1: results[0]?.personal_relation || 0,
                        evaluator2: results[1]?.personal_relation || 0,
                        evaluator3: results[2]?.personal_relation || 0
                    },
                    integrity: {
                        evaluator1: results[0]?.integrity || 0,
                        evaluator2: results[1]?.integrity || 0,
                        evaluator3: results[2]?.integrity || 0
                    },
                    self_discipline: {
                        evaluator1: results[0]?.self_discipline || 0,
                        evaluator2: results[1]?.self_discipline || 0,
                        evaluator3: results[2]?.self_discipline || 0
                    }
                },
                competence: {
                    ability_to_learn: {
                        evaluator1: results[0]?.ability_to_learn || 0,
                        evaluator2: results[1]?.ability_to_learn || 0,
                        evaluator3: results[2]?.ability_to_learn || 0
                    },
                    ability_to_organize: {
                        evaluator1: results[0]?.ability_to_organize || 0,
                        evaluator2: results[1]?.ability_to_organize || 0,
                        evaluator3: results[2]?.ability_to_organize || 0
                    },
                    cooperation: {
                        evaluator1: results[0]?.cooperation || 0,
                        evaluator2: results[1]?.cooperation || 0,
                        evaluator3: results[2]?.cooperation || 0
                    },
                    development_orientation: {
                        evaluator1: results[0]?.development_orientation || 0,
                        evaluator2: results[1]?.development_orientation || 0,
                        evaluator3: results[2]?.development_orientation || 0
                    },
                    planning_capability: {
                        evaluator1: results[0]?.planning_capability || 0,
                        evaluator2: results[1]?.planning_capability || 0,
                        evaluator3: results[2]?.planning_capability || 0
                    }
                }
            };
            
            resolve(data);
        });
    });
}

function getHREvaluationData(staffId, periodId) {
    return new Promise((resolve, reject) => {
        if (!periodId) {
            resolve({
                attendance: {},
                seminar: 0,
                institutional: 0,
                community: 0,
                work_experience: 0
            });
            return;
        }
        
        const query = `
            SELECT 
                excu_absences_without_pay, tardiness, minutes_late,
                seminar, institutional_involvement, community_involvement, work_experience
            FROM nonteaching_evaluations
            WHERE staff_id = ? AND period_id = ?
        `;
        
        connection.query(query, [staffId, periodId], (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            
            const data = results[0] || {};
            resolve({
                attendance: {
                    absences: data.excu_absences_without_pay || 0,
                    tardiness: data.tardiness || 0,
                    minutes_late: data.minutes_late || 0
                },
                seminar: data.seminar || 0,
                institutional: data.institutional_involvement || 0,
                community: data.community_involvement || 0,
                work_experience: data.work_experience || 0
            });
        });
    });
}
//================================================================================







// ====================== RANKING ENDPOINTS ======================

//TEACHING RANKINGS 
// Get teaching rankings by period - specifically for Teaching Evaluator
// For populating the table in rankings page

// GET Teaching Rankings List
app.get("/api/teaching-rankings/:yearId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const yearId = req.params.yearId;
    const evaluatorStaffId = req.user.staff_id;
    
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            COALESCE(
                (SELECT SUM(typ.total_points)
                 FROM teaching_yearly_points typ
                 WHERE typ.staff_id = s.staff_id 
                   AND typ.academic_year_id <= ?
                ), 0
            ) as total_score
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.department_head_id = ? 
            AND s.category_id = 1 
            AND s.status = 'active'
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [yearId, evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Error fetching teaching rankings:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Teaching Ranking History (Evaluator View - 3-year cycle with Seminar)
app.get("/api/teaching-ranking-history/:staffId/:yearId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    
    const { staffId, yearId } = req.params;
    const evaluatorStaffId = req.user.staff_id;
    
    // Verify evaluator has access to this staff
    const verifyQuery = `
        SELECT staff_id FROM staff 
        WHERE staff_id = ? AND department_head_id = ? AND category_id = 1
    `;
    
    connection.query(verifyQuery, [staffId, evaluatorStaffId], (err, verifyResults) => {
        if (err || verifyResults.length === 0) {
            return res.status(403).json({ message: "Unauthorized" });
        }
        
        // Calculate 3-year window
        const inputYearId = parseInt(yearId);
        const cycle = getCycleYears(inputYearId);
        const year1Id = cycle.year1;  // Most recent
        const year2Id = cycle.year2;  // Middle
        const year3Id = cycle.year3;  // Oldest

        console.log(`Year ${inputYearId} belongs to Cycle ${cycle.cycleNumber}: Years ${year3Id}, ${year2Id}, ${year1Id}`);

        // Get staff info
        const staffQuery = `
            SELECT 
                s.staff_id,
                CONCAT(s.first_name, ' ', s.last_name) as employee_name,
                s.employment_type,
                s.position as present_rank,
                d.department_name
            FROM staff s
            LEFT JOIN departments d ON s.department_id = d.department_id
            WHERE s.staff_id = ?
        `;
        
        connection.query(staffQuery, [staffId], (err, staffResults) => {
            if (err || staffResults.length === 0) {
                return res.status(404).json({ message: "Staff not found" });
            }
            
            const staffInfo = staffResults[0];
            
            // Get year labels
            const yearLabelsQuery = `
                SELECT year_id, year_code 
                FROM academic_years 
                WHERE year_id IN (?, ?, ?)
                ORDER BY year_id DESC
            `;
            
            connection.query(yearLabelsQuery, [year3Id, year2Id, year1Id], (err, yearLabels) => {
                if (err) return res.status(500).json({ message: "Server error" });
                
                const yearLabelMap = {};
                yearLabels.forEach(y => yearLabelMap[y.year_id] = y.year_code);
                
                // Get yearly points for 3-year window
                const yearlyPointsQuery = `
                    SELECT 
                        academic_year_id,
                        teaching_competence,
                        effectiveness,
                        professional_growth,
                        teaching_experience,
                        total_points
                    FROM teaching_yearly_points
                    WHERE staff_id = ? AND academic_year_id IN (?, ?, ?)
                    ORDER BY academic_year_id DESC
                `;
                
                connection.query(yearlyPointsQuery, [staffId, year3Id, year2Id, year1Id], (err, yearlyResults) => {
                    if (err) return res.status(500).json({ message: "Server error" });
                    
                    // Get seminar points from teaching_evaluations for each year
                    const seminarQuery = `
                        SELECT 
                            ep.year_id,
                            ep.semester,
                            te.seminar_attendance
                        FROM teaching_evaluations te
                        JOIN evaluation_periods ep ON te.period_id = ep.period_id
                        WHERE te.staff_id = ? AND ep.year_id IN (?, ?, ?)
                        ORDER BY ep.year_id DESC, ep.semester
                    `;
                    
                    connection.query(seminarQuery, [staffId, year3Id, year2Id, year1Id], (err, seminarResults) => {
                        if (err) return res.status(500).json({ message: "Server error" });
                        
                        // Calculate seminar points per year (max 3 per year)
                        const calculateYearSeminar = (yearId) => {
                            const yearEvals = seminarResults.filter(s => s.year_id === yearId);
                            const sem1 = yearEvals.find(s => s.semester === '1st');
                            const sem2 = yearEvals.find(s => s.semester === '2nd');
                            
                            const sem1Points = parseFloat(sem1?.seminar_attendance) || 0;
                            const sem2Points = parseFloat(sem2?.seminar_attendance) || 0;
                            const total = sem1Points + sem2Points;
                            
                            // Cap at 3 points maximum
                            return Math.min(total, 3);
                        };
                        
                        const year1Seminar = calculateYearSeminar(year1Id);
                        const year2Seminar = calculateYearSeminar(year2Id);
                        const year3Seminar = calculateYearSeminar(year3Id);
                        
                        // Get OLD POINTS (sum of all years before 3-year window)
                        const oldPointsQuery = `
                            SELECT 
                                COALESCE(SUM(total_points), 0) as total_old_points,
                                COALESCE(SUM(teaching_competence), 0) as teaching_competence,
                                COALESCE(SUM(effectiveness), 0) as effectiveness,
                                COALESCE(SUM(professional_growth), 0) as professional_growth,
                                COALESCE(SUM(teaching_experience), 0) as teaching_experience
                            FROM teaching_yearly_points
                            WHERE staff_id = ? AND academic_year_id < ?
                        `;
                        
                        connection.query(oldPointsQuery, [staffId, year3Id], (err, oldResults) => {
                            if (err) return res.status(500).json({ message: "Server error" });
                            
                            // Get OLD seminar points (all years before year3)
                            const oldSeminarQuery = `
                                SELECT 
                                    ep.year_id,
                                    ep.semester,
                                    te.seminar_attendance
                                FROM teaching_evaluations te
                                JOIN evaluation_periods ep ON te.period_id = ep.period_id
                                WHERE te.staff_id = ? AND ep.year_id < ?
                                ORDER BY ep.year_id, ep.semester
                            `;
                            
                            connection.query(oldSeminarQuery, [staffId, year3Id], (err, oldSeminarResults) => {
                                if (err) return res.status(500).json({ message: "Server error" });
                                
                                // Calculate old seminar points (sum per year, max 3 each year, then total)
                                const oldYears = [...new Set(oldSeminarResults.map(s => s.year_id))];
                                let oldSeminarTotal = 0;
                                
                                oldYears.forEach(oldYearId => {
                                    const yearEvals = oldSeminarResults.filter(s => s.year_id === oldYearId);
                                    const sem1 = yearEvals.find(s => s.semester === '1st');
                                    const sem2 = yearEvals.find(s => s.semester === '2nd');
                                    
                                    const sem1Points = parseFloat(sem1?.seminar_attendance) || 0;
                                    const sem2Points = parseFloat(sem2?.seminar_attendance) || 0;
                                    const yearTotal = Math.min(sem1Points + sem2Points, 3);
                                    
                                    oldSeminarTotal += yearTotal;
                                });
                                
                                // Map yearly results
                                const getYearData = (yearId, seminarPoints) => {
                                    const yearData = yearlyResults.find(y => y.academic_year_id === yearId);
                                    return yearData ? {
                                        teaching_competence: parseFloat(yearData.teaching_competence),
                                        effectiveness: parseFloat(yearData.effectiveness),
                                        professional_growth: parseFloat(yearData.professional_growth),
                                        teaching_experience: parseFloat(yearData.teaching_experience),
                                        total_points: parseFloat(yearData.total_points),
                                        seminar_points: seminarPoints
                                    } : null;
                                };
                                
                                const year1Data = getYearData(year1Id, year1Seminar);
                                const year2Data = getYearData(year2Id, year2Seminar);
                                const year3Data = getYearData(year3Id, year3Seminar);
                                
                                const response = {
                                    employee_name: staffInfo.employee_name,
                                    employment_type: staffInfo.employment_type || '-',
                                    present_rank: staffInfo.present_rank || '-',
                                    department_name: staffInfo.department_name || '-',
                                    
                                    year1_label: yearLabelMap[year1Id] || '-',
                                    year2_label: yearLabelMap[year2Id] || '-',
                                    year3_label: yearLabelMap[year3Id] || '-',
                                    
                                    old_points: {
                                        teaching_competence: parseFloat(oldResults[0]?.teaching_competence) || 0,
                                        effectiveness: parseFloat(oldResults[0]?.effectiveness) || 0,
                                        professional_growth: parseFloat(oldResults[0]?.professional_growth) || 0,
                                        teaching_experience: parseFloat(oldResults[0]?.teaching_experience) || 0,
                                        total_points: parseFloat(oldResults[0]?.total_old_points) || 0,
                                        seminar: oldSeminarTotal
                                    },
                                    
                                    year1: year1Data,
                                    year2: year2Data,
                                    year3: year3Data,
                                    
                                    grand_total: (
                                        (parseFloat(oldResults[0]?.total_old_points) || 0) +
                                        (year1Data?.total_points || 0) +
                                        (year2Data?.total_points || 0) +
                                        (year3Data?.total_points || 0)
                                    )
                                };
                                
                                res.json(response);
                            });
                        });
                    });
                });
            });
        });
    });
});


//NON TEACHING RANKINGS

// GET Non-Teaching Rankings List
app.get("/api/non-teaching-rankings/:yearId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const yearId = req.params.yearId;
    
    const query = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            COALESCE(
                (SELECT SUM(ntyp.total_points)
                 FROM nonteaching_yearly_points ntyp
                 WHERE ntyp.staff_id = s.staff_id 
                   AND ntyp.academic_year_id <= ?
                ), 0
            ) as total_score
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.category_id = 2 
            AND s.status = 'active'
            AND s.department_head_id = ?
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [yearId, req.user.staff_id], (err, results) => {
        if (err) {
            console.error("Error fetching non-teaching rankings:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Non-Teaching Ranking History (3-year cycle)
app.get("/api/non-teaching-ranking-history/:staffId/:yearId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const inputYearId = parseInt(req.params.yearId);
    const { staffId } = req.params;
    
    // Calculate 3-year cycle
    const cycle = getCycleYears(inputYearId);
    const year1Id = cycle.year1;
    const year2Id = cycle.year2;
    const year3Id = cycle.year3;
    
    // Get staff basic info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            s.employment_type
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.staff_id = ?
    `;
    
    connection.query(staffQuery, [staffId], (err, staffResults) => {
        if (err) {
            console.error("Staff query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get academic year labels
        const yearLabelsQuery = `
            SELECT year_id, year_code 
            FROM academic_years 
            WHERE year_id IN (?, ?, ?)
            ORDER BY year_id DESC
        `;
        
        connection.query(yearLabelsQuery, [year3Id, year2Id, year1Id], (err, yearLabels) => {
            if (err) {
                console.error("Year labels error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const yearLabelMap = {};
            yearLabels.forEach(y => {
                yearLabelMap[y.year_id] = y.year_code;
            });
            
            // Get yearly points for the 3-year cycle
            const pointsQuery = `
                SELECT 
                    ntyp.*
                FROM nonteaching_yearly_points ntyp
                WHERE ntyp.staff_id = ? 
                    AND ntyp.academic_year_id IN (?, ?, ?)
                ORDER BY ntyp.academic_year_id DESC
            `;
            
            connection.query(pointsQuery, [staffId, year3Id, year2Id, year1Id], (err, pointsResults) => {
                if (err) {
                    console.error("Points query error:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                // Organize data by year
                const year1Data = pointsResults.find(p => p.academic_year_id === year1Id);
                const year2Data = pointsResults.find(p => p.academic_year_id === year2Id);
                const year3Data = pointsResults.find(p => p.academic_year_id === year3Id);
                
                const response = {
                    ...staffInfo,
                    year1_label: yearLabelMap[year1Id] || '-',
                    year2_label: yearLabelMap[year2Id] || '-',
                    year3_label: yearLabelMap[year3Id] || '-',
                    year3: year3Data ? {
                        productivity: parseFloat(year3Data.productivity) || 0,
                        attitude: parseFloat(year3Data.attitude) || 0,
                        promotional_competence: parseFloat(year3Data.promotional_competence) || 0,
                        attendance: parseFloat(year3Data.attendance) || 0,
                        professional_advancement: parseFloat(year3Data.professional_advancement) || 0,
                        institutional_involvement: parseFloat(year3Data.institutional_involvement) || 0,
                        community_involvement: parseFloat(year3Data.community_involvement) || 0,
                        work_experience: parseFloat(year3Data.work_experience) || 0
                    } : null,
                    year2: year2Data ? {
                        productivity: parseFloat(year2Data.productivity) || 0,
                        attitude: parseFloat(year2Data.attitude) || 0,
                        promotional_competence: parseFloat(year2Data.promotional_competence) || 0,
                        attendance: parseFloat(year2Data.attendance) || 0,
                        professional_advancement: parseFloat(year2Data.professional_advancement) || 0,
                        institutional_involvement: parseFloat(year2Data.institutional_involvement) || 0,
                        community_involvement: parseFloat(year2Data.community_involvement) || 0,
                        work_experience: parseFloat(year2Data.work_experience) || 0
                    } : null,
                    year1: year1Data ? {
                        productivity: parseFloat(year1Data.productivity) || 0,
                        attitude: parseFloat(year1Data.attitude) || 0,
                        promotional_competence: parseFloat(year1Data.promotional_competence) || 0,
                        attendance: parseFloat(year1Data.attendance) || 0,
                        professional_advancement: parseFloat(year1Data.professional_advancement) || 0,
                        institutional_involvement: parseFloat(year1Data.institutional_involvement) || 0,
                        community_involvement: parseFloat(year1Data.community_involvement) || 0,
                        work_experience: parseFloat(year1Data.work_experience) || 0
                    } : null,
                    remarks: ''
                };
                
                res.json(response);
            });
        });
    });
});

//================================================================================






// ====================== TEACHING CERTIFICATES ENDPOINT ======================
// Get teaching certificates by period - specifically for Teaching Evaluator
// For populating the table in teaching certificates page
// GET Teaching Certificates
app.get("/api/teaching-certificates/:periodId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const typeFilter = req.query.type;
    const evaluatorStaffId = req.user.staff_id;
    
    let query = `
        SELECT 
            c.certificate_id,
            c.staff_id,
            c.certificate_name,
            c.certificate_type,
            c.organizer,
            c.duration_start,
            c.duration_end,
            c.points_value,
            c.status,
            c.submitted_date,
            c.evaluated_date,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name
        FROM certificates c
        JOIN staff s ON c.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE c.period_id = ? 
            AND s.department_head_id = ?
            AND s.category_id = 1
            AND s.status = 'active'
    `;
    
    const params = [periodId, evaluatorStaffId];
    
    if (typeFilter && typeFilter !== '') {
        query += ` AND c.certificate_type = ?`;
        params.push(typeFilter);
    }
    
    query += ` ORDER BY 
        CASE c.status 
            WHEN 'pending' THEN 1 
            WHEN 'accepted' THEN 2 
            WHEN 'rejected' THEN 3 
        END,
        c.submitted_date DESC
    `;
    
    connection.query(query, params, (err, results) => {
        if (err) {
            console.error("Error fetching certificates:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Single Certificate Detail
app.get("/api/certificate/:certificateId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const certificateId = req.params.certificateId;
    const userRole = req.user.role_name; // Assuming you have role_name in the user object
    
    let query = `
        SELECT 
            c.*,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.category_id
        FROM certificates c
        JOIN staff s ON c.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE c.certificate_id = ?
    `;
    
    connection.query(query, [certificateId], (err, results) => {
        if (err) {
            console.error("Error fetching certificate:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "Certificate not found" });
        }
        
        const certificate = results[0];
        
        // Verify permission based on role and staff category
        if (userRole === 'Teaching Evaluator') {
            // Teaching evaluator can only view teaching staff certificates
            if (certificate.category_id !== 1) {
                return res.status(403).json({ message: "Access denied" });
            }
        } else if (userRole === 'Non-Teaching Evaluator') {
            // Non-teaching evaluator can only view non-teaching staff certificates
            if (certificate.category_id !== 2) {
                return res.status(403).json({ message: "Access denied" });
            }
        }
        
        // Convert BLOB to base64 if image exists
        if (certificate.certificate_image) {
            certificate.certificate_image = certificate.certificate_image.toString('base64');
        }
        
        res.json(certificate);
    });
});

// PUT Update Certificate Status (Accept/Reject)
app.put("/api/certificate/:certificateId/status", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const certificateId = req.params.certificateId;
    const { status } = req.body;
    const evaluatorUserId = req.user.user_id;
    const evaluatorStaffId = req.user.staff_id;
    
    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }
    
    // First, verify the evaluator has permission
    const verifyQuery = `
        SELECT c.*, s.staff_id, s.department_head_id
        FROM certificates c
        JOIN staff s ON c.staff_id = s.staff_id
        WHERE c.certificate_id = ? AND s.department_head_id = ?
    `;
    
    connection.query(verifyQuery, [certificateId, evaluatorStaffId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        const certificate = verifyResults[0];
        
        // Update certificate status
        const updateQuery = `
            UPDATE certificates 
            SET status = ?,
                evaluator_id = ?,
                evaluated_date = CURRENT_TIMESTAMP
            WHERE certificate_id = ?
        `;
        
        connection.query(updateQuery, [status, evaluatorUserId, certificateId], (err, updateResult) => {
            if (err) {
                console.error("Update error:", err);
                return res.status(500).json({ message: "Error updating certificate" });
            }
            
            // If accepted, add points to evaluation
            if (status === 'accepted') {
                // Get the period's semester
                const periodQuery = `
                    SELECT semester, year_id 
                    FROM evaluation_periods 
                    WHERE period_id = ?
                `;
                
                connection.query(periodQuery, [certificate.period_id], (err, periodResults) => {
                    if (err) {
                        console.error("Period query error:", err);
                        return res.status(500).json({ message: "Error processing certificate" });
                    }
                    
                    if (periodResults.length === 0) {
                        return res.status(404).json({ message: "Period not found" });
                    }
                    
                    // Check if evaluation exists for this staff and period
                    const checkEvalQuery = `
                        SELECT evaluation_id, seminar_attendance 
                        FROM teaching_evaluations 
                        WHERE staff_id = ? AND period_id = ?
                    `;
                    
                    connection.query(checkEvalQuery, [certificate.staff_id, certificate.period_id], (err, evalResults) => {
                        if (err) {
                            console.error("Eval check error:", err);
                            return res.status(500).json({ message: "Error updating evaluation" });
                        }
                        
                        const newSeminarPoints = parseFloat(certificate.points_value) || 0;
                        
                        if (evalResults.length > 0) {
                            // Update existing evaluation
                            const currentPoints = parseFloat(evalResults[0].seminar_attendance) || 0;
                            const updatedPoints = Math.min(currentPoints + newSeminarPoints, 3); // Max 3 points
                            
                            const updateEvalQuery = `
                                UPDATE teaching_evaluations 
                                SET seminar_attendance = ?,
                                    total_points = dean_eval + student_eval + peer_eval + 
                                                  committee_chair_eval + dept_head_eval + ? + 
                                                  publications + scholarly_achievement + 
                                                  research_conducted + graduate_units + teaching_experience
                                WHERE evaluation_id = ?
                            `;
                            
                            connection.query(updateEvalQuery, [updatedPoints, updatedPoints, evalResults[0].evaluation_id], (err) => {
                                if (err) {
                                    console.error("Eval update error:", err);
                                    return res.status(500).json({ message: "Error updating evaluation points" });
                                }
                                
                                res.json({ 
                                    message: "Certificate accepted and points added to evaluation",
                                    points_added: newSeminarPoints
                                });
                            });
                        } else {
                            // Create new evaluation with seminar points
                            const insertEvalQuery = `
                                INSERT INTO teaching_evaluations (
                                    staff_id, evaluator_user_id, period_id,
                                    seminar_attendance, total_points,
                                    evaluation_status, evaluation_date
                                ) VALUES (?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)
                            `;
                            
                            const cappedPoints = Math.min(newSeminarPoints, 3);
                            
                            connection.query(insertEvalQuery, [
                                certificate.staff_id, 
                                evaluatorUserId, 
                                certificate.period_id,
                                cappedPoints,
                                cappedPoints
                            ], (err) => {
                                if (err) {
                                    console.error("Eval insert error:", err);
                                    return res.status(500).json({ message: "Error creating evaluation" });
                                }
                                
                                res.json({ 
                                    message: "Certificate accepted and evaluation created with points",
                                    points_added: newSeminarPoints
                                });
                            });
                        }
                    });
                });
            } else {
                // Just rejected, no points to add
                res.json({ message: "Certificate rejected" });
            }
        });
    });
});




// GET Non-Teaching Certificates
app.get("/api/non-teaching-certificates/:periodId", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const periodId = req.params.periodId;
    const typeFilter = req.query.type;
    
    let query = `
        SELECT 
            c.certificate_id,
            c.staff_id,
            c.certificate_name,
            c.certificate_type,
            c.organizer,
            c.duration_start,
            c.duration_end,
            c.points_value,
            c.status,
            c.submitted_date,
            c.evaluated_date,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name
        FROM certificates c
        JOIN staff s ON c.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE c.period_id = ? 
            AND s.category_id = 2
            AND s.status = 'active'
    `;
    
    const params = [periodId];
    
    if (typeFilter && typeFilter !== '') {
        query += ` AND c.certificate_type = ?`;
        params.push(typeFilter);
    }
    
    query += ` ORDER BY 
        CASE c.status 
            WHEN 'pending' THEN 1 
            WHEN 'accepted' THEN 2 
            WHEN 'rejected' THEN 3 
        END,
        c.submitted_date DESC
    `;
    
    connection.query(query, params, (err, results) => {
        if (err) {
            console.error("Error fetching non-teaching certificates:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// PUT Update Non-Teaching Certificate Status
app.put("/api/non-teaching-certificate/:certificateId/status", authenticate, requireRole(["Non-Teaching Evaluator"]), (req, res) => {
    const certificateId = req.params.certificateId;
    const { status } = req.body;
    const evaluatorUserId = req.user.user_id;
    
    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }
    
    // First, verify certificate is for non-teaching staff
    const verifyQuery = `
        SELECT c.*, s.staff_id, s.category_id
        FROM certificates c
        JOIN staff s ON c.staff_id = s.staff_id
        WHERE c.certificate_id = ? AND s.category_id = 2
    `;
    
    connection.query(verifyQuery, [certificateId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Certificate not found or not for non-teaching staff" });
        }
        
        const certificate = verifyResults[0];
        
        // Update certificate status
        const updateQuery = `
            UPDATE certificates 
            SET status = ?,
                evaluator_id = ?,
                evaluated_date = CURRENT_TIMESTAMP
            WHERE certificate_id = ?
        `;
        
        connection.query(updateQuery, [status, evaluatorUserId, certificateId], (err, updateResult) => {
            if (err) {
                console.error("Update error:", err);
                return res.status(500).json({ message: "Error updating certificate" });
            }
            
            // If accepted, add points to non-teaching evaluation
            if (status === 'accepted') {
                // Check if evaluation exists for this staff and period
                const checkEvalQuery = `
                    SELECT evaluation_id, seminar 
                    FROM nonteaching_evaluations 
                    WHERE staff_id = ? AND period_id = ?
                `;
                
                connection.query(checkEvalQuery, [certificate.staff_id, certificate.period_id], (err, evalResults) => {
                    if (err) {
                        console.error("Eval check error:", err);
                        return res.status(500).json({ message: "Error updating evaluation" });
                    }
                    
                    const newSeminarPoints = parseFloat(certificate.points_value) || 0;
                    
                    if (evalResults.length > 0) {
                        // Update existing evaluation
                        const currentPoints = parseFloat(evalResults[0].seminar) || 0;
                        const updatedPoints = Math.min(currentPoints + newSeminarPoints, 3); // Max 3 points
                        
                        const updateEvalQuery = `
                            UPDATE nonteaching_evaluations 
                            SET seminar = ?,
                                final_total_points = excu_absences_without_pay + tardiness + minutes_late + 
                                                    ? + institutional_involvement + community_involvement + work_experience
                            WHERE evaluation_id = ?
                        `;
                        
                        connection.query(updateEvalQuery, [updatedPoints, updatedPoints, evalResults[0].evaluation_id], (err) => {
                            if (err) {
                                console.error("Eval update error:", err);
                                return res.status(500).json({ message: "Error updating evaluation points" });
                            }
                            
                            res.json({ 
                                message: "Certificate accepted and points added to evaluation",
                                points_added: newSeminarPoints
                            });
                        });
                    } else {
                        // Create new evaluation with seminar points
                        const insertEvalQuery = `
                            INSERT INTO nonteaching_evaluations (
                                staff_id, evaluator_user_id, period_id,
                                seminar, final_total_points,
                                evaluation_status, evaluation_date
                            ) VALUES (?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)
                        `;
                        
                        const cappedPoints = Math.min(newSeminarPoints, 3);
                        
                        connection.query(insertEvalQuery, [
                            certificate.staff_id, 
                            evaluatorUserId, 
                            certificate.period_id,
                            cappedPoints,
                            cappedPoints
                        ], (err) => {
                            if (err) {
                                console.error("Eval insert error:", err);
                                return res.status(500).json({ message: "Error creating evaluation" });
                            }
                            
                            res.json({ 
                                message: "Certificate accepted and evaluation created with points",
                                points_added: newSeminarPoints
                            });
                        });
                    }
                });
            } else {
                // Just rejected, no points to add
                res.json({ message: "Certificate rejected" });
            }
        });
    });
});

//================================================================================





// ====================== EMPLOYEE MANAGEMENT ENDPOINTS ======================

// GET All Employees for Management
app.get("/api/employees-management", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const evaluatorStaffId = req.user.staff_id;
    
    const query = `
        SELECT 
            s.staff_id,
            s.first_name,
            s.last_name,
            s.middle_name,
            CONCAT(s.first_name, ' ', s.last_name) as full_name,
            s.email,
            s.phone,
            s.employment_type,
            s.status,
            s.department_id,
            d.department_name,
            sc.category_name
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN staff_categories sc ON s.category_id = sc.category_id
        WHERE s.department_head_id = ?
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Error fetching employees:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Single Employee
app.get("/api/employees/:staffId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const staffId = req.params.staffId;
    const evaluatorStaffId = req.user.staff_id;
    
    const query = `
        SELECT 
            s.*,
            CONCAT(s.first_name, ' ', s.last_name) as full_name,
            d.department_name
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.staff_id = ? AND s.department_head_id = ?
    `;
    
    connection.query(query, [staffId, evaluatorStaffId], (err, results) => {
        if (err) {
            console.error("Error fetching employee:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }
        
        res.json(results[0]);
    });
});

// GET Departments
app.get("/api/departments", authenticate, (req, res) => {
    const query = `
        SELECT department_id, department_name 
        FROM departments 
        ORDER BY department_name
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching departments:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// POST Add New Employee
app.post("/api/employees", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), async (req, res) => {
    const { first_name, last_name, middle_name, department_id, employment_type, email, phone } = req.body;
    const evaluatorStaffId = req.user.staff_id;
    const evaluatorUserId = req.user.user_id;
    
    // Validate required fields
    if (!first_name || !last_name || !department_id || !employment_type || !email) {
        return res.status(400).json({ message: "Missing required fields" });
    }
    
    try {
        // Get department head for the selected department
        const deptQuery = `
            SELECT s.staff_id as dept_head_id, sc.category_id
            FROM staff s
            JOIN departments d ON s.department_id = d.department_id
            JOIN staff_categories sc ON sc.category_name = 
                CASE 
                    WHEN d.department_id IN (1, 2, 3, 4) THEN 'Teaching'
                    ELSE 'Non-Teaching'
                END
            WHERE d.department_id = ? AND s.is_department_head = 1
            LIMIT 1
        `;
        
        connection.query(deptQuery, [department_id], async (err, deptResults) => {
            if (err) {
                console.error("Department query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const deptHeadId = deptResults.length > 0 ? deptResults[0].dept_head_id : evaluatorStaffId;
            const categoryId = deptResults.length > 0 ? deptResults[0].category_id : 1;
            
            // Generate username and password
            const username = (first_name + last_name).toLowerCase().replace(/\s+/g, '');
            const password = username; // Same as username before hashing
            const hashedPassword = await bcrypt.hash(password, 12);
            
            // Insert into staff table
            const staffQuery = `
                INSERT INTO staff (
                    first_name, last_name, middle_name, department_id, 
                    email, phone, employment_type, category_id, 
                    department_head_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `;
            
            connection.query(staffQuery, [
                first_name, last_name, middle_name, department_id,
                email, phone, employment_type, categoryId,
                deptHeadId
            ], (err, staffResult) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ message: "Email already exists" });
                    }
                    console.error("Staff insert error:", err);
                    return res.status(500).json({ message: "Error creating employee" });
                }
                
                const newStaffId = staffResult.insertId;
                
                // Determine role based on category
                const roleId = categoryId === 1 ? 3 : 4; // 3 = Teaching Employee, 4 = Non-Teaching Employee
                
                // Insert into users table
                const userQuery = `
                    INSERT INTO users (
                        username, password_hash, email, role_id, staff_id, is_active
                    ) VALUES (?, ?, ?, ?, ?, 1)
                `;
                
                connection.query(userQuery, [
                    username, hashedPassword, email, roleId, newStaffId
                ], (err, userResult) => {
                    if (err) {
                        // Rollback: delete the staff record
                        connection.query('DELETE FROM staff WHERE staff_id = ?', [newStaffId]);
                        
                        if (err.code === 'ER_DUP_ENTRY') {
                            return res.status(400).json({ message: "Username already exists" });
                        }
                        console.error("User insert error:", err);
                        return res.status(500).json({ message: "Error creating user account" });
                    }
                    
                    res.json({
                        message: "Employee added successfully",
                        staff_id: newStaffId,
                        username: username,
                        default_password: password
                    });
                });
            });
        });
    } catch (error) {
        console.error("Error adding employee:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// PUT Update Employee
app.put("/api/employees/:staffId", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const staffId = req.params.staffId;
    const { department_id, employment_type } = req.body;
    const evaluatorStaffId = req.user.staff_id;
    
    // Verify permission
    const verifyQuery = `SELECT staff_id FROM staff WHERE staff_id = ? AND department_head_id = ?`;
    
    connection.query(verifyQuery, [staffId, evaluatorStaffId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        // Get new department head
        const deptHeadQuery = `
            SELECT staff_id 
            FROM staff 
            WHERE department_id = ? AND is_department_head = 1 
            LIMIT 1
        `;
        
        connection.query(deptHeadQuery, [department_id], (err, deptHeadResults) => {
            if (err) {
                console.error("Dept head query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const newDeptHeadId = deptHeadResults.length > 0 ? deptHeadResults[0].staff_id : evaluatorStaffId;
            
            // Update employee
            const updateQuery = `
                UPDATE staff 
                SET department_id = ?,
                    employment_type = ?,
                    department_head_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE staff_id = ?
            `;
            
            connection.query(updateQuery, [department_id, employment_type, newDeptHeadId, staffId], (err) => {
                if (err) {
                    console.error("Update error:", err);
                    return res.status(500).json({ message: "Error updating employee" });
                }
                
                res.json({ message: "Employee updated successfully" });
            });
        });
    });
});

// PUT Archive Employee
app.put("/api/employees/:staffId/archive", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const staffId = req.params.staffId;
    const evaluatorStaffId = req.user.staff_id;
    
    // Verify permission
    const verifyQuery = `SELECT staff_id FROM staff WHERE staff_id = ? AND department_head_id = ?`;
    
    connection.query(verifyQuery, [staffId, evaluatorStaffId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        // Archive employee and deactivate user
        const archiveQuery = `
            UPDATE staff 
            SET status = 'archived',
                updated_at = CURRENT_TIMESTAMP
            WHERE staff_id = ?
        `;
        
        connection.query(archiveQuery, [staffId], (err) => {
            if (err) {
                console.error("Archive error:", err);
                return res.status(500).json({ message: "Error archiving employee" });
            }
            
            // Also deactivate user account
            const deactivateUserQuery = `
                UPDATE users 
                SET is_active = 0 
                WHERE staff_id = ?
            `;
            
            connection.query(deactivateUserQuery, [staffId], (err) => {
                if (err) {
                    console.error("User deactivate error:", err);
                }
                
                res.json({ message: "Employee archived successfully" });
            });
        });
    });
});

// PUT Unarchive Employee
app.put("/api/employees/:staffId/unarchive", authenticate, requireRole(["Teaching Evaluator", "Non-Teaching Evaluator"]), (req, res) => {
    const staffId = req.params.staffId;
    const evaluatorStaffId = req.user.staff_id;
    
    // Verify permission
    const verifyQuery = `SELECT staff_id FROM staff WHERE staff_id = ? AND department_head_id = ?`;
    
    connection.query(verifyQuery, [staffId, evaluatorStaffId], (err, verifyResults) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (verifyResults.length === 0) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        // Restore employee
        const restoreQuery = `
            UPDATE staff 
            SET status = 'active',
                updated_at = CURRENT_TIMESTAMP
            WHERE staff_id = ?
        `;
        
        connection.query(restoreQuery, [staffId], (err) => {
            if (err) {
                console.error("Restore error:", err);
                return res.status(500).json({ message: "Error restoring employee" });
            }
            
            // Reactivate user account
            const activateUserQuery = `
                UPDATE users 
                SET is_active = 1 
                WHERE staff_id = ?
            `;
            
            connection.query(activateUserQuery, [staffId], (err) => {
                if (err) {
                    console.error("User activate error:", err);
                }
                
                res.json({ message: "Employee restored successfully" });
            });
        });
    });
});





//========================================= EMPLOYEE ENDPOINTS ===================================================



// ====================== EMPLOYEE DASHBOARD ENDPOINTS ======================


// GET Employee Recent Activity
app.get("/api/employee/dashboard/recent-activity/:periodId", authenticate, requireRole(["Teaching Employee", "Non-Teaching Employee"]), (req, res) => {
    const periodId = req.params.periodId;
    const staffId = req.user.staff_id;
    const categoryId = req.user.category_id;
    
    if (categoryId === 1) {
        // Teaching employee activity
        const query = `
            SELECT * FROM (
                -- Certificate submissions
                SELECT 
                    'certificate_submitted' as activity_type,
                    c.submitted_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                
                UNION ALL
                
                -- Certificate accepted
                SELECT 
                    'certificate_accepted' as activity_type,
                    c.evaluated_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                  AND c.status = 'accepted'
                
                UNION ALL
                
                -- Certificate rejected
                SELECT 
                    'certificate_rejected' as activity_type,
                    c.evaluated_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                  AND c.status = 'rejected'
                
                UNION ALL
                
                -- Evaluation completed
                SELECT 
                    'evaluation_completed' as activity_type,
                    te.evaluation_date as activity_date,
                    NULL as evaluatee_name,
                    'Your evaluation was completed' as description
                FROM teaching_evaluations te
                WHERE te.staff_id = ? AND te.period_id = ?
                  AND te.evaluation_status = 'completed'
            ) as activities
            ORDER BY activity_date DESC
        `;
        
        connection.query(query, [staffId, periodId, staffId, periodId, staffId, periodId, staffId, periodId], (err, results) => {
            if (err) {
                console.error("Activity error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results);
        });
        
    } else if (categoryId === 2) {
        // Non-teaching employee activity
        const query = `
            SELECT * FROM (
                -- Certificate submissions
                SELECT 
                    'certificate_submitted' as activity_type,
                    c.submitted_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                
                UNION ALL
                
                -- Certificate accepted
                SELECT 
                    'certificate_accepted' as activity_type,
                    c.evaluated_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                  AND c.status = 'accepted'
                
                UNION ALL
                
                -- Certificate rejected
                SELECT 
                    'certificate_rejected' as activity_type,
                    c.evaluated_date as activity_date,
                    NULL as evaluatee_name,
                    c.certificate_name as description
                FROM certificates c
                WHERE c.staff_id = ? AND c.period_id = ?
                  AND c.status = 'rejected'
                
                UNION ALL
                
                -- Peer evaluation assignments
                SELECT 
                    'peer_evaluation_assigned' as activity_type,
                    pea.assigned_date as activity_date,
                    CONCAT(s.first_name, ' ', s.last_name) as evaluatee_name,
                    'Assigned to evaluate' as description
                FROM peer_evaluation_assignments pea
                JOIN staff s ON pea.evaluatee_staff_id = s.staff_id
                WHERE pea.evaluator_staff_id = ? AND pea.period_id = ?
                
                UNION ALL
                
                -- Peer evaluation completed
                SELECT 
                    'peer_evaluation_completed' as activity_type,
                    pe.submitted_date as activity_date,
                    CONCAT(s.first_name, ' ', s.last_name) as evaluatee_name,
                    'Evaluation submitted' as description
                FROM peer_evaluations pe
                JOIN peer_evaluation_assignments pea ON pe.assignment_id = pea.assignment_id
                JOIN staff s ON pea.evaluatee_staff_id = s.staff_id
                WHERE pea.evaluator_staff_id = ? AND pea.period_id = ?
                  AND pe.evaluation_status = 'submitted'
                
                UNION ALL
                
                -- Evaluation completed
                SELECT 
                    'evaluation_completed' as activity_type,
                    nte.evaluation_date as activity_date,
                    NULL as evaluatee_name,
                    'Your evaluation was completed' as description
                FROM nonteaching_evaluations nte
                WHERE nte.staff_id = ? AND nte.period_id = ?
                  AND nte.evaluation_status = 'completed'
            ) as activities
            ORDER BY activity_date DESC
        `;
        
        connection.query(query, [staffId, periodId, staffId, periodId, staffId, periodId, staffId, periodId, staffId, periodId, staffId, periodId], (err, results) => {
            if (err) {
                console.error("Activity error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            res.json(results);
        });
    } else {
        return res.status(403).json({ message: "Invalid user category" });
    }
});

//==========================================================================================



// GET Employee's Own Teaching Summary
app.get("/api/employee/teaching-summary/:yearId", authenticate, requireRole(["Teaching Employee"]), (req, res) => {
    const { yearId } = req.params;
    const staffId = req.user.staff_id;
    
    // Get staff basic info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            ay.year_code as academic_year
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN academic_years ay ON ay.year_id = ?
        WHERE s.staff_id = ?
    `;
    
    connection.query(staffQuery, [yearId, staffId], (err, staffResults) => {
        if (err) {
            console.error("Staff query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get evaluations for both semesters
        const evalQuery = `
            SELECT 
                te.*,
                ep.semester
            FROM teaching_evaluations te
            JOIN evaluation_periods ep ON te.period_id = ep.period_id
            WHERE te.staff_id = ? AND ep.year_id = ?
            ORDER BY ep.semester
        `;
        
        connection.query(evalQuery, [staffId, yearId], (err, evalResults) => {
            if (err) {
                console.error("Evaluation query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            // Organize by semester
            const firstSemester = evalResults.find(e => e.semester === '1st') || null;
            const secondSemester = evalResults.find(e => e.semester === '2nd') || null;
            
            const response = {
                ...staffInfo,
                first_semester: firstSemester,
                second_semester: secondSemester
            };
            
            res.json(response);
        });
    });
});



// GET Employee's Own Non-Teaching Summary
app.get("/api/employee/nonteaching-summary/:yearId", authenticate, requireRole(["Non-Teaching Employee"]), (req, res) => {
    const yearId = req.params.yearId;
    const staffId = req.user.staff_id;
    
    // Get staff basic info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            d.department_name,
            s.position,
            ay.year_code as academic_year
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN academic_years ay ON ay.year_id = ?
        WHERE s.staff_id = ? AND s.category_id = 2
    `;
    
    connection.query(staffQuery, [yearId, staffId], (err, staffResults) => {
        if (err) {
            console.error("Staff query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found or not a non-teaching employee" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get evaluation periods info for the year
        const periodInfoQuery = `
            SELECT period_id, semester, period_name
            FROM evaluation_periods
            WHERE year_id = ?
            ORDER BY semester
        `;
        
        connection.query(periodInfoQuery, [yearId], (err, periodResults) => {
            if (err) {
                console.error("Period info query error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const firstPeriod = periodResults.find(p => p.semester === '1st');
            const secondPeriod = periodResults.find(p => p.semester === '2nd');
            
            // Get peer evaluations for both semesters
            const peerEvalQuery = `
                SELECT 
                    ep.semester,
                    ep.period_id,
                    pea.evaluator_type,
                    pe.quality_of_work,
                    pe.quantity_of_work,
                    pe.job_knowledge,
                    pe.initiative,
                    pe.reliability,
                    pe.job_attitude,
                    pe.work_habits,
                    pe.personal_relation,
                    pe.integrity,
                    pe.self_discipline,
                    pe.ability_to_learn,
                    pe.ability_to_organize,
                    pe.cooperation,
                    pe.development_orientation,
                    pe.planning_capability,
                    pe.evaluation_status
                FROM peer_evaluation_assignments pea
                LEFT JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
                JOIN evaluation_periods ep ON pea.period_id = ep.period_id
                WHERE pea.evaluatee_staff_id = ? 
                  AND ep.year_id = ?
                  AND pe.evaluation_status = 'submitted'
                ORDER BY ep.semester, 
                    CASE pea.evaluator_type
                        WHEN 'department_head' THEN 1
                        WHEN 'same_department' THEN 2
                        WHEN 'external_department' THEN 3
                    END
            `;
            
            connection.query(peerEvalQuery, [staffId, yearId], (err, peerResults) => {
                if (err) {
                    console.error("Peer evaluation query error:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                // Get HR evaluations (attendance, seminars, etc.)
                const hrEvalQuery = `
                    SELECT 
                        ep.semester,
                        ep.period_id,
                        nte.excu_absences_without_pay as excused_absences,
                        nte.tardiness,
                        nte.minutes_late,
                        nte.seminar,
                        nte.institutional_involvement,
                        nte.community_involvement,
                        nte.work_experience,
                        nte.evaluation_status
                    FROM nonteaching_evaluations nte
                    JOIN evaluation_periods ep ON nte.period_id = ep.period_id
                    WHERE nte.staff_id = ? AND ep.year_id = ?
                    ORDER BY ep.semester
                `;
                
                connection.query(hrEvalQuery, [staffId, yearId], (err, hrResults) => {
                    if (err) {
                        console.error("HR evaluation query error:", err);
                        return res.status(500).json({ message: "Server error" });
                    }
                    
                    // Organize data by semester
                    const firstSemesterPeer = peerResults.filter(r => r.semester === '1st');
                    const secondSemesterPeer = peerResults.filter(r => r.semester === '2nd');
                    
                    const firstSemesterHR = hrResults.find(r => r.semester === '1st') || {};
                    const secondSemesterHR = hrResults.find(r => r.semester === '2nd') || {};
                    
                    
                    // Build first semester data
                    const firstSemester = {
                        // Peer evaluation data (3 evaluators)
                        quality_1: firstSemesterPeer[0]?.quality_of_work || 0,
                        quality_2: firstSemesterPeer[1]?.quality_of_work || 0,
                        quality_3: firstSemesterPeer[2]?.quality_of_work || 0,
                        
                        quantity_1: firstSemesterPeer[0]?.quantity_of_work || 0,
                        quantity_2: firstSemesterPeer[1]?.quantity_of_work || 0,
                        quantity_3: firstSemesterPeer[2]?.quantity_of_work || 0,
                        
                        job_knowledge_1: firstSemesterPeer[0]?.job_knowledge || 0,
                        job_knowledge_2: firstSemesterPeer[1]?.job_knowledge || 0,
                        job_knowledge_3: firstSemesterPeer[2]?.job_knowledge || 0,
                        
                        initiative_1: firstSemesterPeer[0]?.initiative || 0,
                        initiative_2: firstSemesterPeer[1]?.initiative || 0,
                        initiative_3: firstSemesterPeer[2]?.initiative || 0,
                        
                        reliability_1: firstSemesterPeer[0]?.reliability || 0,
                        reliability_2: firstSemesterPeer[1]?.reliability || 0,
                        reliability_3: firstSemesterPeer[2]?.reliability || 0,
                        
                        job_attitude_1: firstSemesterPeer[0]?.job_attitude || 0,
                        job_attitude_2: firstSemesterPeer[1]?.job_attitude || 0,
                        job_attitude_3: firstSemesterPeer[2]?.job_attitude || 0,
                        
                        work_habits_1: firstSemesterPeer[0]?.work_habits || 0,
                        work_habits_2: firstSemesterPeer[1]?.work_habits || 0,
                        work_habits_3: firstSemesterPeer[2]?.work_habits || 0,
                        
                        personal_relation_1: firstSemesterPeer[0]?.personal_relation || 0,
                        personal_relation_2: firstSemesterPeer[1]?.personal_relation || 0,
                        personal_relation_3: firstSemesterPeer[2]?.personal_relation || 0,
                        
                        integrity_1: firstSemesterPeer[0]?.integrity || 0,
                        integrity_2: firstSemesterPeer[1]?.integrity || 0,
                        integrity_3: firstSemesterPeer[2]?.integrity || 0,
                        
                        self_discipline_1: firstSemesterPeer[0]?.self_discipline || 0,
                        self_discipline_2: firstSemesterPeer[1]?.self_discipline || 0,
                        self_discipline_3: firstSemesterPeer[2]?.self_discipline || 0,
                        
                        ability_learn_1: firstSemesterPeer[0]?.ability_to_learn || 0,
                        ability_learn_2: firstSemesterPeer[1]?.ability_to_learn || 0,
                        ability_learn_3: firstSemesterPeer[2]?.ability_to_learn || 0,
                        
                        ability_organize_1: firstSemesterPeer[0]?.ability_to_organize || 0,
                        ability_organize_2: firstSemesterPeer[1]?.ability_to_organize || 0,
                        ability_organize_3: firstSemesterPeer[2]?.ability_to_organize || 0,
                        
                        cooperation_1: firstSemesterPeer[0]?.cooperation || 0,
                        cooperation_2: firstSemesterPeer[1]?.cooperation || 0,
                        cooperation_3: firstSemesterPeer[2]?.cooperation || 0,
                        
                        development_orientation_1: firstSemesterPeer[0]?.development_orientation || 0,
                        development_orientation_2: firstSemesterPeer[1]?.development_orientation || 0,
                        development_orientation_3: firstSemesterPeer[2]?.development_orientation || 0,
                        
                        planning_capability_1: firstSemesterPeer[0]?.planning_capability || 0,
                        planning_capability_2: firstSemesterPeer[1]?.planning_capability || 0,
                        planning_capability_3: firstSemesterPeer[2]?.planning_capability || 0,
                        
                        // HR data
                        excused_absences: firstSemesterHR.excused_absences || 0,
                        tardiness: firstSemesterHR.tardiness || 0,
                        minutes_late: firstSemesterHR.minutes_late || 0,
                        seminar: firstSemesterHR.seminar || 0,
                        institutional_involvement: firstSemesterHR.institutional_involvement || 0,
                        community_involvement: firstSemesterHR.community_involvement || 0,
                        work_experience: firstSemesterHR.work_experience || 0
                    };
                    
                    // Build second semester data (same structure)
                    const secondSemester = {
                        quality_1: secondSemesterPeer[0]?.quality_of_work || 0,
                        quality_2: secondSemesterPeer[1]?.quality_of_work || 0,
                        quality_3: secondSemesterPeer[2]?.quality_of_work || 0,
                        
                        quantity_1: secondSemesterPeer[0]?.quantity_of_work || 0,
                        quantity_2: secondSemesterPeer[1]?.quantity_of_work || 0,
                        quantity_3: secondSemesterPeer[2]?.quantity_of_work || 0,
                        
                        job_knowledge_1: secondSemesterPeer[0]?.job_knowledge || 0,
                        job_knowledge_2: secondSemesterPeer[1]?.job_knowledge || 0,
                        job_knowledge_3: secondSemesterPeer[2]?.job_knowledge || 0,
                        
                        initiative_1: secondSemesterPeer[0]?.initiative || 0,
                        initiative_2: secondSemesterPeer[1]?.initiative || 0,
                        initiative_3: secondSemesterPeer[2]?.initiative || 0,
                        
                        reliability_1: secondSemesterPeer[0]?.reliability || 0,
                        reliability_2: secondSemesterPeer[1]?.reliability || 0,
                        reliability_3: secondSemesterPeer[2]?.reliability || 0,
                        
                        job_attitude_1: secondSemesterPeer[0]?.job_attitude || 0,
                        job_attitude_2: secondSemesterPeer[1]?.job_attitude || 0,
                        job_attitude_3: secondSemesterPeer[2]?.job_attitude || 0,
                        
                        work_habits_1: secondSemesterPeer[0]?.work_habits || 0,
                        work_habits_2: secondSemesterPeer[1]?.work_habits || 0,
                        work_habits_3: secondSemesterPeer[2]?.work_habits || 0,
                        
                        personal_relation_1: secondSemesterPeer[0]?.personal_relation || 0,
                        personal_relation_2: secondSemesterPeer[1]?.personal_relation || 0,
                        personal_relation_3: secondSemesterPeer[2]?.personal_relation || 0,
                        
                        integrity_1: secondSemesterPeer[0]?.integrity || 0,
                        integrity_2: secondSemesterPeer[1]?.integrity || 0,
                        integrity_3: secondSemesterPeer[2]?.integrity || 0,
                        
                        self_discipline_1: secondSemesterPeer[0]?.self_discipline || 0,
                        self_discipline_2: secondSemesterPeer[1]?.self_discipline || 0,
                        self_discipline_3: secondSemesterPeer[2]?.self_discipline || 0,
                        
                        ability_learn_1: secondSemesterPeer[0]?.ability_to_learn || 0,
                        ability_learn_2: secondSemesterPeer[1]?.ability_to_learn || 0,
                        ability_learn_3: secondSemesterPeer[2]?.ability_to_learn || 0,
                        
                        ability_organize_1: secondSemesterPeer[0]?.ability_to_organize || 0,
                        ability_organize_2: secondSemesterPeer[1]?.ability_to_organize || 0,
                        ability_organize_3: secondSemesterPeer[2]?.ability_to_organize || 0,
                        
                        cooperation_1: secondSemesterPeer[0]?.cooperation || 0,
                        cooperation_2: secondSemesterPeer[1]?.cooperation || 0,
                        cooperation_3: secondSemesterPeer[2]?.cooperation || 0,
                        
                        development_orientation_1: secondSemesterPeer[0]?.development_orientation || 0,
                        development_orientation_2: secondSemesterPeer[1]?.development_orientation || 0,
                        development_orientation_3: secondSemesterPeer[2]?.development_orientation || 0,
                        
                        planning_capability_1: secondSemesterPeer[0]?.planning_capability || 0,
                        planning_capability_2: secondSemesterPeer[1]?.planning_capability || 0,
                        planning_capability_3: secondSemesterPeer[2]?.planning_capability || 0,
                        
                        // HR data
                        excused_absences: secondSemesterHR.excused_absences || 0,
                        tardiness: secondSemesterHR.tardiness || 0,
                        minutes_late: secondSemesterHR.minutes_late || 0,
                        seminar: secondSemesterHR.seminar || 0,
                        institutional_involvement: secondSemesterHR.institutional_involvement || 0,
                        community_involvement: secondSemesterHR.community_involvement || 0,
                        work_experience: secondSemesterHR.work_experience || 0
                    };
                    
                    const response = {
                        ...staffInfo,
                        first_semester: firstSemester,
                        second_semester: secondSemester,
                        first_semester_period: firstPeriod?.period_name || '1st Semester',
                        second_semester_period: secondPeriod?.period_name || '2nd Semester',
                        recommendation: 'Based on performance evaluation',
                        remarks: 'Employee demonstrates consistent performance'
                    };
                    
                    res.json(response);
                });
            });
        });
    });
});


//==================================PEER EVALUATION ENDPOINTS========================================


// GET Assigned Peer Evaluations for Current User
app.get("/api/employee/peer-evaluations/assigned/:periodId", authenticate, requireRole(["Non-Teaching Employee"]), (req, res) => {
    const { periodId } = req.params;
    const staffId = req.user.staff_id;
    
    const query = `
        SELECT 
            pea.assignment_id,
            pea.evaluatee_staff_id,
            pea.evaluator_type,
            CONCAT(s.first_name, ' ', s.last_name) as evaluatee_name,
            d.department_name as department,
            COALESCE(pe.evaluation_status, 'pending') as evaluation_status,
            pe.peer_eval_id
        FROM peer_evaluation_assignments pea
        JOIN staff s ON pea.evaluatee_staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id
        WHERE pea.evaluator_staff_id = ? 
          AND pea.period_id = ?
        ORDER BY s.first_name, s.last_name
    `;
    
    connection.query(query, [staffId, periodId], (err, results) => {
        if (err) {
            console.error("Error fetching assigned peer evaluations:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        res.json(results);
    });
});

// GET Peer Evaluation Details (for editing)
app.get("/api/employee/peer-evaluations/assignment/:assignmentId", authenticate, requireRole(["Non-Teaching Employee"]), (req, res) => {
    const { assignmentId } = req.params;
    const staffId = req.user.staff_id;
    
    // First verify this assignment belongs to the logged-in user
    const verifyQuery = `
        SELECT 
            pea.assignment_id,
            pea.evaluatee_staff_id,
            pea.evaluator_staff_id,
            pea.evaluator_type,
            CONCAT(s.first_name, ' ', s.last_name) as evaluatee_name,
            d.department_name,
            s.position
        FROM peer_evaluation_assignments pea
        JOIN staff s ON pea.evaluatee_staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE pea.assignment_id = ? AND pea.evaluator_staff_id = ?
    `;
    
    connection.query(verifyQuery, [assignmentId, staffId], (err, assignmentResults) => {
        if (err) {
            console.error("Error verifying assignment:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (assignmentResults.length === 0) {
            return res.status(403).json({ message: "Unauthorized access to this evaluation" });
        }
        
        const assignment = assignmentResults[0];
        
        // Get existing evaluation if any
        const evalQuery = `
            SELECT * FROM peer_evaluations 
            WHERE assignment_id = ?
        `;
        
        connection.query(evalQuery, [assignmentId], (err, evalResults) => {
            if (err) {
                console.error("Error fetching evaluation:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const response = {
                ...assignment,
                evaluation: evalResults[0] || null
            };
            
            res.json(response);
        });
    });
});

// POST/PUT Submit Peer Evaluation
app.post("/api/employee/peer-evaluations/submit/:assignmentId", authenticate, requireRole(["Non-Teaching Employee"]), (req, res) => {
    const { assignmentId } = req.params;
    const staffId = req.user.staff_id;
    
    const {
        quality_of_work,
        quantity_of_work,
        job_knowledge,
        initiative,
        reliability,
        job_attitude,
        work_habits,
        personal_relation,
        integrity,
        self_discipline,
        ability_to_learn,
        ability_to_organize,
        cooperation,
        development_orientation,
        planning_capability,
        comments
    } = req.body;
    
    // First, get the assignment details to find evaluatee and period
    const assignmentQuery = `
        SELECT evaluatee_staff_id, period_id, evaluator_staff_id, evaluator_type
        FROM peer_evaluation_assignments 
        WHERE assignment_id = ? AND evaluator_staff_id = ?
    `;
    
    connection.query(assignmentQuery, [assignmentId, staffId], (err, assignmentResults) => {
        if (err) {
            console.error("Error fetching assignment:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (assignmentResults.length === 0) {
            return res.status(403).json({ message: "Unauthorized access" });
        }
        
        const { evaluatee_staff_id, period_id, evaluator_type } = assignmentResults[0];
        
        // Find or create the nonteaching_evaluations record
        const findNTEvalQuery = `
            SELECT evaluation_id 
            FROM nonteaching_evaluations 
            WHERE staff_id = ? AND period_id = ?
        `;
        
        connection.query(findNTEvalQuery, [evaluatee_staff_id, period_id], (err, ntEvalResults) => {
            if (err) {
                console.error("Error finding NT evaluation:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            let nonteaching_evaluation_id = null;
            
            // If nonteaching_evaluations record exists, use it
            if (ntEvalResults.length > 0) {
                nonteaching_evaluation_id = ntEvalResults[0].evaluation_id;
                savePeerEvaluation();
            } else {
                // Need to create nonteaching_evaluations record
                // First, find the HR Head (Non-Teaching Evaluator)
                const findHRQuery = `
                    SELECT user_id 
                    FROM users 
                    WHERE role_id = (SELECT role_id FROM user_roles WHERE role_name = 'Non-Teaching Evaluator')
                    LIMIT 1
                `;
                
                connection.query(findHRQuery, (err, hrResults) => {
                    if (err) {
                        console.error("Error finding HR evaluator:", err);
                        return res.status(500).json({ message: "Server error" });
                    }
                    
                    if (hrResults.length === 0) {
                        return res.status(500).json({ message: "No HR evaluator found in system" });
                    }
                    
                    const hr_user_id = hrResults[0].user_id;
                    
                    // Create a new nonteaching_evaluations record with HR as evaluator
                    const createNTEvalQuery = `
                        INSERT INTO nonteaching_evaluations (
                            staff_id,
                            evaluator_user_id,
                            period_id,
                            evaluation_status,
                            final_total_points
                        ) VALUES (?, ?, ?, 'pending', 0.00)
                    `;
                    
                    connection.query(createNTEvalQuery, [evaluatee_staff_id, hr_user_id, period_id], (err, createResult) => {
                        if (err) {
                            console.error("Error creating NT evaluation:", err);
                            return res.status(500).json({ message: "Error creating evaluation record" });
                        }
                        
                        nonteaching_evaluation_id = createResult.insertId;
                        savePeerEvaluation();
                    });
                });
            }
            
            function savePeerEvaluation() {
                // Check if peer evaluation already exists
                const checkPeerQuery = `SELECT peer_eval_id FROM peer_evaluations WHERE assignment_id = ?`;
                
                connection.query(checkPeerQuery, [assignmentId], (err, peerCheckResults) => {
                    if (err) {
                        console.error("Error checking peer evaluation:", err);
                        return res.status(500).json({ message: "Server error" });
                    }
                    
                    if (peerCheckResults.length > 0) {
                        // UPDATE existing peer evaluation
                        const updateQuery = `
                            UPDATE peer_evaluations 
                            SET quality_of_work = ?,
                                quantity_of_work = ?,
                                job_knowledge = ?,
                                initiative = ?,
                                reliability = ?,
                                job_attitude = ?,
                                work_habits = ?,
                                personal_relation = ?,
                                integrity = ?,
                                self_discipline = ?,
                                ability_to_learn = ?,
                                ability_to_organize = ?,
                                cooperation = ?,
                                development_orientation = ?,
                                planning_capability = ?,
                                comments = ?,
                                nonteaching_evaluation_id = ?,
                                evaluation_status = 'submitted',
                                submitted_date = CURRENT_TIMESTAMP
                            WHERE peer_eval_id = ?
                        `;
                        
                        connection.query(updateQuery, [
                            quality_of_work, quantity_of_work, job_knowledge, initiative, reliability,
                            job_attitude, work_habits, personal_relation, integrity, self_discipline,
                            ability_to_learn, ability_to_organize, cooperation, development_orientation, planning_capability,
                            comments,
                            nonteaching_evaluation_id,
                            peerCheckResults[0].peer_eval_id
                        ], (err, result) => {
                            if (err) {
                                console.error("Error updating peer evaluation:", err);
                                return res.status(500).json({ message: "Error updating evaluation" });
                            }
                            
                            // ALWAYS recalculate and update NT evaluation
                            recalculateAndUpdateNTEvaluation(nonteaching_evaluation_id, evaluatee_staff_id, period_id, res);
                        });
                    } else {
                        // INSERT new peer evaluation
                        const insertQuery = `
                            INSERT INTO peer_evaluations (
                                assignment_id,
                                nonteaching_evaluation_id,
                                quality_of_work,
                                quantity_of_work,
                                job_knowledge,
                                initiative,
                                reliability,
                                job_attitude,
                                work_habits,
                                personal_relation,
                                integrity,
                                self_discipline,
                                ability_to_learn,
                                ability_to_organize,
                                cooperation,
                                development_orientation,
                                planning_capability,
                                comments,
                                evaluation_status,
                                submitted_date
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', CURRENT_TIMESTAMP)
                        `;
                        
                        connection.query(insertQuery, [
                            assignmentId,
                            nonteaching_evaluation_id,
                            quality_of_work, quantity_of_work, job_knowledge, initiative, reliability,
                            job_attitude, work_habits, personal_relation, integrity, self_discipline,
                            ability_to_learn, ability_to_organize, cooperation, development_orientation, planning_capability,
                            comments
                        ], (err, result) => {
                            if (err) {
                                console.error("Error creating peer evaluation:", err);
                                return res.status(500).json({ message: "Error creating evaluation" });
                            }
                            
                            // ALWAYS recalculate and update NT evaluation
                            recalculateAndUpdateNTEvaluation(nonteaching_evaluation_id, evaluatee_staff_id, period_id, res);
                        });
                    }
                });
            }
        });
    });
});

// Helper function to ALWAYS recalculate NT evaluation totals (including zeros for missing peer evals)
function recalculateAndUpdateNTEvaluation(nonteaching_evaluation_id, staff_id, period_id, res) {
    // Get all 3 peer evaluation assignments for this employee and period
    const getPeerEvalsQuery = `
        SELECT 
            pea.evaluator_type,
            COALESCE(pe.quality_of_work, 0) as quality_of_work,
            COALESCE(pe.quantity_of_work, 0) as quantity_of_work,
            COALESCE(pe.job_knowledge, 0) as job_knowledge,
            COALESCE(pe.initiative, 0) as initiative,
            COALESCE(pe.reliability, 0) as reliability,
            COALESCE(pe.job_attitude, 0) as job_attitude,
            COALESCE(pe.work_habits, 0) as work_habits,
            COALESCE(pe.personal_relation, 0) as personal_relation,
            COALESCE(pe.integrity, 0) as integrity,
            COALESCE(pe.self_discipline, 0) as self_discipline,
            COALESCE(pe.ability_to_learn, 0) as ability_to_learn,
            COALESCE(pe.ability_to_organize, 0) as ability_to_organize,
            COALESCE(pe.cooperation, 0) as cooperation,
            COALESCE(pe.development_orientation, 0) as development_orientation,
            COALESCE(pe.planning_capability, 0) as planning_capability,
            pe.evaluation_status
        FROM peer_evaluation_assignments pea
        LEFT JOIN peer_evaluations pe ON pea.assignment_id = pe.assignment_id 
            AND pe.evaluation_status = 'submitted'
        WHERE pea.evaluatee_staff_id = ? 
          AND pea.period_id = ?
        ORDER BY 
            CASE pea.evaluator_type
                WHEN 'department_head' THEN 1
                WHEN 'same_department' THEN 2
                WHEN 'external_department' THEN 3
            END
    `;
    
    connection.query(getPeerEvalsQuery, [staff_id, period_id], (err, peerResults) => {
        if (err) {
            console.error("Error getting peer evaluations:", err);
            return res.json({ 
                message: "Evaluation submitted successfully (recalculation failed)",
                evaluation_id: nonteaching_evaluation_id
            });
        }
        
        // Initialize with zeros for all 3 evaluators
        const evaluators = [
            { type: 'department_head', data: null },
            { type: 'same_department_peer', data: null },
            { type: 'outsider', data: null }
        ];
        
        // Fill in the data from submitted evaluations
        peerResults.forEach(peer => {
            const evalIndex = evaluators.findIndex(e => e.type === peer.evaluator_type);
            if (evalIndex !== -1 && peer.evaluation_status === 'submitted') {
                evaluators[evalIndex].data = peer;
            }
        });
        
        // Calculate averages (treating missing evals as 0)
        const criteria = [
            'quality_of_work', 'quantity_of_work', 'job_knowledge', 'initiative', 'reliability',
            'job_attitude', 'work_habits', 'personal_relation', 'integrity', 'self_discipline',
            'ability_to_learn', 'ability_to_organize', 'cooperation', 'development_orientation', 'planning_capability'
        ];
        
        let peerTotalPoints = 0;
        
        criteria.forEach(criterion => {
            const val1 = evaluators[0].data ? parseFloat(evaluators[0].data[criterion]) : 0;
            const val2 = evaluators[1].data ? parseFloat(evaluators[1].data[criterion]) : 0;
            const val3 = evaluators[2].data ? parseFloat(evaluators[2].data[criterion]) : 0;
            
            // Average including zeros: (val1 + val2 + val3) / 3
            const average = (val1 + val2 + val3) / 3;
            peerTotalPoints += average;
        });
        
        // Count how many peer evaluations are actually submitted
        const completedCount = evaluators.filter(e => e.data !== null).length;
        
        // Get existing NT evaluation data to preserve HR-entered fields
        const getNTQuery = `
            SELECT 
                COALESCE(excu_absences_without_pay, 0) as excu_absences_without_pay,
                COALESCE(tardiness, 0) as tardiness,
                COALESCE(minutes_late, 0) as minutes_late,
                COALESCE(seminar, 0) as seminar,
                COALESCE(institutional_involvement, 0) as institutional_involvement,
                COALESCE(community_involvement, 0) as community_involvement,
                COALESCE(work_experience, 0) as work_experience
            FROM nonteaching_evaluations
            WHERE evaluation_id = ?
        `;
        
        connection.query(getNTQuery, [nonteaching_evaluation_id], (err, ntResults) => {
            if (err) {
                console.error("Error getting NT evaluation:", err);
                return res.json({ 
                    message: "Evaluation submitted successfully (total calculation failed)",
                    evaluation_id: nonteaching_evaluation_id
                });
            }
            
            const ntData = ntResults[0] || {};
            
            // Calculate final total points (peer + HR fields)
            const final_total = peerTotalPoints +
                              parseFloat(ntData.excu_absences_without_pay || 0) +
                              parseFloat(ntData.tardiness || 0) +
                              parseFloat(ntData.minutes_late || 0) +
                              parseFloat(ntData.seminar || 0) +
                              parseFloat(ntData.institutional_involvement || 0) +
                              parseFloat(ntData.community_involvement || 0) +
                              parseFloat(ntData.work_experience || 0);
            
            // Update the nonteaching_evaluations with calculated totals
            const updateNTQuery = `
                UPDATE nonteaching_evaluations
                SET final_total_points = ?
                WHERE evaluation_id = ?
            `;
            
            connection.query(updateNTQuery, [final_total, nonteaching_evaluation_id], (err) => {
                if (err) {
                    console.error("Error updating NT totals:", err);
                    return res.json({ 
                        message: "Evaluation submitted successfully (update failed)",
                        evaluation_id: nonteaching_evaluation_id
                    });
                }
                
                const allComplete = completedCount >= 3;
                
                return res.json({ 
                    message: allComplete 
                        ? "Evaluation submitted successfully! All peer evaluations are now complete."
                        : "Evaluation submitted successfully. Total points recalculated.",
                    evaluation_id: nonteaching_evaluation_id,
                    all_peer_evals_complete: allComplete,
                    completed_count: completedCount,
                    remaining: 3 - completedCount,
                    peer_total_points: peerTotalPoints.toFixed(2),
                    final_total_points: final_total.toFixed(2),
                    calculation_method: "Averages include zeros for missing evaluations (sum / 3)"
                });
            });
        });
    });
}

//===========================EMPLOYEE CERTIFICATE ENDPOINTS========================================

// POST Submit Certificate (for employees)
app.post("/api/certificates/submit", authenticate, requireRole(["Teaching Employee", "Non-Teaching Employee"]), upload.single('certificate_image'), (req, res) => {
    const {
        certificate_name,
        certificate_type,
        organizer,
        duration_start,
        duration_end,
        period_id
    } = req.body;
    
    const staff_id = req.user.staff_id;
    const certificate_image = req.file ? req.file.buffer : null;
    const image_filename = req.file ? req.file.originalname : null;
    
    // Validation
    if (!certificate_name || !certificate_type || !organizer || !duration_start || !duration_end || !period_id) {
        return res.status(400).json({ message: "All fields are required" });
    }
    
    if (!certificate_image) {
        return res.status(400).json({ message: "Certificate image is required" });
    }
    
    // Calculate points based on duration and type
    const start = new Date(duration_start);
    const end = new Date(duration_end);
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    let points_value = 0;
    if (certificate_type === 'local') {
        points_value = durationDays * 0.5; // 0.5 points per day for local
    } else if (certificate_type === 'regional') {
        points_value = durationDays * 1.0; // 1 point per day for regional
    } else if (certificate_type === 'national') {
        points_value = durationDays * 1.5; // 1.5 points per day for national
    }
    
    // Max 3 points per certificate
    points_value = Math.min(points_value, 3);
    
    const insertQuery = `
        INSERT INTO certificates (
            staff_id,
            period_id,
            certificate_name,
            certificate_type,
            organizer,
            duration_start,
            duration_end,
            points_value,
            certificate_image,
            image_filename,
            status,
            submitted_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `;
    
    connection.query(insertQuery, [
        staff_id,
        period_id,
        certificate_name,
        certificate_type,
        organizer,
        duration_start,
        duration_end,
        points_value,
        certificate_image,
        image_filename
    ], (err, result) => {
        if (err) {
            console.error("Error submitting certificate:", err);
            return res.status(500).json({ message: "Error submitting certificate" });
        }
        
        res.json({
            message: "Certificate submitted successfully",
            certificate_id: result.insertId,
            calculated_points: points_value
        });
    });
});

// GET Employee's Own Certificates
app.get("/api/employee/certificates/:periodId", authenticate, requireRole(["Teaching Employee", "Non-Teaching Employee"]), (req, res) => {
    const { periodId } = req.params;
    const staff_id = req.user.staff_id;
    
    const query = `
        SELECT 
            c.certificate_id,
            c.certificate_name,
            c.certificate_type,
            c.organizer,
            c.duration_start,
            c.duration_end,
            c.points_value,
            c.status,
            c.submitted_date,
            c.evaluated_date,
            c.evaluator_comments,
            c.image_filename
        FROM certificates c
        WHERE c.staff_id = ? AND c.period_id = ?
        ORDER BY c.submitted_date DESC
    `;
    
    connection.query(query, [staff_id, periodId], (err, results) => {
        if (err) {
            console.error("Error fetching certificates:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// GET Certificate Image
app.get("/api/certificate/image/:certificateId", authenticate, (req, res) => {
    const { certificateId } = req.params;
    
    const query = `
        SELECT certificate_image, image_filename
        FROM certificates
        WHERE certificate_id = ?
    `;
    
    connection.query(query, [certificateId], (err, results) => {
        if (err) {
            console.error("Error fetching certificate image:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0 || !results[0].certificate_image) {
            return res.status(404).json({ message: "Certificate image not found" });
        }
        
        const image = results[0].certificate_image;
        const filename = results[0].image_filename || 'certificate.jpg';
        
        // Detect image type from filename
        const ext = filename.split('.').pop().toLowerCase();
        const contentType = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'pdf': 'application/pdf'
        }[ext] || 'image/jpeg';
        
        res.setHeader('Content-Type', contentType);
        res.send(image);
    });
});

//======================================================================================================

// GET Teaching Employee's Own Ranking History (3-year cycle with Seminar)
app.get("/api/teaching-employee/ranking-history/:yearId", 
    authenticate, 
    requireRole(["Teaching Employee"]), 
    (req, res) => {
    
    const inputYearId = parseInt(req.params.yearId);
    const staffId = req.user.staff_id;
    
    // Calculate 3-year cycle
    const cycle = getCycleYears(inputYearId);
    const year1Id = cycle.year1;
    const year2Id = cycle.year2;
    const year3Id = cycle.year3;
    
    console.log(`Employee viewing Cycle ${cycle.cycleNumber}: Years ${year3Id}, ${year2Id}, ${year1Id}`);
    
    // Get staff info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            s.employment_type,
            s.position as present_rank,
            d.department_name
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.staff_id = ?
    `;
    
    connection.query(staffQuery, [staffId], (err, staffResults) => {
        if (err || staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get year labels
        const yearLabelsQuery = `
            SELECT year_id, year_code 
            FROM academic_years 
            WHERE year_id IN (?, ?, ?)
            ORDER BY year_id DESC
        `;
        
        connection.query(yearLabelsQuery, [year3Id, year2Id, year1Id], (err, yearLabels) => {
            if (err) return res.status(500).json({ message: "Server error" });
            
            const yearLabelMap = {};
            yearLabels.forEach(y => yearLabelMap[y.year_id] = y.year_code);
            
            // Get yearly points for 3-year window
            const yearlyPointsQuery = `
                SELECT 
                    academic_year_id,
                    teaching_competence,
                    effectiveness,
                    professional_growth,
                    teaching_experience,
                    total_points
                FROM teaching_yearly_points
                WHERE staff_id = ? AND academic_year_id IN (?, ?, ?)
                ORDER BY academic_year_id DESC
            `;
            
            connection.query(yearlyPointsQuery, [staffId, year3Id, year2Id, year1Id], (err, yearlyResults) => {
                if (err) return res.status(500).json({ message: "Server error" });
                
                // Get seminar points from teaching_evaluations for each year
                const seminarQuery = `
                    SELECT 
                        ep.year_id,
                        ep.semester,
                        te.seminar_attendance
                    FROM teaching_evaluations te
                    JOIN evaluation_periods ep ON te.period_id = ep.period_id
                    WHERE te.staff_id = ? AND ep.year_id IN (?, ?, ?)
                    ORDER BY ep.year_id DESC, ep.semester
                `;
                
                connection.query(seminarQuery, [staffId, year3Id, year2Id, year1Id], (err, seminarResults) => {
                    if (err) return res.status(500).json({ message: "Server error" });
                    
                    // Calculate seminar points per year (max 3 per year)
                    const calculateYearSeminar = (yearId) => {
                        const yearEvals = seminarResults.filter(s => s.year_id === yearId);
                        const sem1 = yearEvals.find(s => s.semester === '1st');
                        const sem2 = yearEvals.find(s => s.semester === '2nd');
                        
                        const sem1Points = parseFloat(sem1?.seminar_attendance) || 0;
                        const sem2Points = parseFloat(sem2?.seminar_attendance) || 0;
                        const total = sem1Points + sem2Points;
                        
                        // Cap at 3 points maximum
                        return Math.min(total, 3);
                    };
                    
                    const year1Seminar = calculateYearSeminar(year1Id);
                    const year2Seminar = calculateYearSeminar(year2Id);
                    const year3Seminar = calculateYearSeminar(year3Id);
                    
                    // Get OLD POINTS (sum of all years before 3-year window)
                    const oldPointsQuery = `
                        SELECT 
                            COALESCE(SUM(total_points), 0) as total_old_points,
                            COALESCE(SUM(teaching_competence), 0) as teaching_competence,
                            COALESCE(SUM(effectiveness), 0) as effectiveness,
                            COALESCE(SUM(professional_growth), 0) as professional_growth,
                            COALESCE(SUM(teaching_experience), 0) as teaching_experience
                        FROM teaching_yearly_points
                        WHERE staff_id = ? AND academic_year_id < ?
                    `;
                    
                    connection.query(oldPointsQuery, [staffId, year3Id], (err, oldResults) => {
                        if (err) return res.status(500).json({ message: "Server error" });
                        
                        // Get OLD seminar points (all years before year3)
                        const oldSeminarQuery = `
                            SELECT 
                                ep.year_id,
                                ep.semester,
                                te.seminar_attendance
                            FROM teaching_evaluations te
                            JOIN evaluation_periods ep ON te.period_id = ep.period_id
                            WHERE te.staff_id = ? AND ep.year_id < ?
                            ORDER BY ep.year_id, ep.semester
                        `;
                        
                        connection.query(oldSeminarQuery, [staffId, year3Id], (err, oldSeminarResults) => {
                            if (err) return res.status(500).json({ message: "Server error" });
                            
                            // Calculate old seminar points (sum per year, max 3 each year, then total)
                            const oldYears = [...new Set(oldSeminarResults.map(s => s.year_id))];
                            let oldSeminarTotal = 0;
                            
                            oldYears.forEach(oldYearId => {
                                const yearEvals = oldSeminarResults.filter(s => s.year_id === oldYearId);
                                const sem1 = yearEvals.find(s => s.semester === '1st');
                                const sem2 = yearEvals.find(s => s.semester === '2nd');
                                
                                const sem1Points = parseFloat(sem1?.seminar_attendance) || 0;
                                const sem2Points = parseFloat(sem2?.seminar_attendance) || 0;
                                const yearTotal = Math.min(sem1Points + sem2Points, 3);
                                
                                oldSeminarTotal += yearTotal;
                            });
                            
                            // Map yearly results
                            const getYearData = (yearId, seminarPoints) => {
                                const yearData = yearlyResults.find(y => y.academic_year_id === yearId);
                                return yearData ? {
                                    teaching_competence: parseFloat(yearData.teaching_competence),
                                    effectiveness: parseFloat(yearData.effectiveness),
                                    professional_growth: parseFloat(yearData.professional_growth),
                                    teaching_experience: parseFloat(yearData.teaching_experience),
                                    total_points: parseFloat(yearData.total_points),
                                    seminar_points: seminarPoints
                                } : null;
                            };
                            
                            const year1Data = getYearData(year1Id, year1Seminar);
                            const year2Data = getYearData(year2Id, year2Seminar);
                            const year3Data = getYearData(year3Id, year3Seminar);
                            
                            const response = {
                                employee_name: staffInfo.employee_name,
                                employment_type: staffInfo.employment_type || '-',
                                present_rank: staffInfo.present_rank || '-',
                                department: staffInfo.department_name || '-',
                                
                                year1_label: yearLabelMap[year1Id] || '-',
                                year2_label: yearLabelMap[year2Id] || '-',
                                year3_label: yearLabelMap[year3Id] || '-',
                                
                                old_points: {
                                    teaching_competence: parseFloat(oldResults[0]?.teaching_competence) || 0,
                                    effectiveness: parseFloat(oldResults[0]?.effectiveness) || 0,
                                    professional_growth: parseFloat(oldResults[0]?.professional_growth) || 0,
                                    teaching_experience: parseFloat(oldResults[0]?.teaching_experience) || 0,
                                    total_points: parseFloat(oldResults[0]?.total_old_points) || 0,
                                    seminar: oldSeminarTotal
                                },
                                
                                year1: year1Data,
                                year2: year2Data,
                                year3: year3Data,
                                
                                grand_total: (
                                    (parseFloat(oldResults[0]?.total_old_points) || 0) +
                                    (year1Data?.total_points || 0) +
                                    (year2Data?.total_points || 0) +
                                    (year3Data?.total_points || 0)
                                )
                            };
                            
                            res.json(response);
                        });
                    });
                });
            });
        });
    });
});


//===========================NON TEACHING RANKING HISTORY========================================
// GET Non-Teaching Employee's Own Ranking History (3-year cycle)
app.get("/api/nonteaching-employee/ranking-history/:yearId", 
    authenticate, 
    requireRole(["Non-Teaching Employee"]), 
    (req, res) => {
    
    const inputYearId = parseInt(req.params.yearId);
    const staffId = req.user.staff_id;
    
    // Calculate 3-year cycle
    const cycle = getCycleYears(inputYearId);
    const year1Id = cycle.year1;
    const year2Id = cycle.year2;
    const year3Id = cycle.year3;
    
    console.log(`Non-Teaching Employee viewing Cycle ${cycle.cycleNumber}: Years ${year3Id}, ${year2Id}, ${year1Id}`);
    
    // Get staff info
    const staffQuery = `
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as employee_name,
            s.employment_type,
            s.position,
            d.department_name
        FROM staff s
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE s.staff_id = ?
    `;
    
    connection.query(staffQuery, [staffId], (err, staffResults) => {
        if (err || staffResults.length === 0) {
            return res.status(404).json({ message: "Staff not found" });
        }
        
        const staffInfo = staffResults[0];
        
        // Get year labels
        const yearLabelsQuery = `
            SELECT year_id, year_code 
            FROM academic_years 
            WHERE year_id IN (?, ?, ?)
            ORDER BY year_id DESC
        `;
        
        connection.query(yearLabelsQuery, [year3Id, year2Id, year1Id], (err, yearLabels) => {
            if (err) return res.status(500).json({ message: "Server error" });
            
            const yearLabelMap = {};
            yearLabels.forEach(y => yearLabelMap[y.year_id] = y.year_code);
            
            // Get yearly points for 3-year window
            const yearlyPointsQuery = `
                SELECT 
                    academic_year_id,
                    productivity,
                    attitude,
                    promotional_competence,
                    attendance,
                    professional_advancement,
                    institutional_involvement,
                    community_involvement,
                    work_experience,
                    total_points
                FROM nonteaching_yearly_points
                WHERE staff_id = ? AND academic_year_id IN (?, ?, ?)
                ORDER BY academic_year_id DESC
            `;
            
            connection.query(yearlyPointsQuery, [staffId, year3Id, year2Id, year1Id], (err, yearlyResults) => {
                if (err) return res.status(500).json({ message: "Server error" });
                
                // Map yearly results
                const getYearData = (yearId) => {
                    const yearData = yearlyResults.find(y => y.academic_year_id === yearId);
                    return yearData ? {
                        productivity: parseFloat(yearData.productivity),
                        attitude: parseFloat(yearData.attitude),
                        promotional_competence: parseFloat(yearData.promotional_competence),
                        attendance: parseFloat(yearData.attendance),
                        professional_advancement: parseFloat(yearData.professional_advancement),
                        institutional_involvement: parseFloat(yearData.institutional_involvement),
                        community_involvement: parseFloat(yearData.community_involvement),
                        work_experience: parseFloat(yearData.work_experience),
                        total_points: parseFloat(yearData.total_points)
                    } : null;
                };

                const year1Data = getYearData(year1Id);
                const year2Data = getYearData(year2Id);
                const year3Data = getYearData(year3Id);

                // Calculate averages across 3 years (ALWAYS divide by 3)
                const calculateAverage = (field) => {
                    const values = [year1Data?.[field] || 0, year2Data?.[field] || 0, year3Data?.[field] || 0];
                    const sum = values.reduce((a, b) => a + b, 0);
                    return sum / 3;  // ✅ Always divide by 3
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
                
                const response = {
                    employee_name: staffInfo.employee_name,
                    employment_type: staffInfo.employment_type || '-',
                    position: staffInfo.position || '-',
                    department: staffInfo.department_name || '-',
                    
                    year1_label: yearLabelMap[year1Id] || '-',
                    year2_label: yearLabelMap[year2Id] || '-',
                    year3_label: yearLabelMap[year3Id] || '-',
                    
                    year1: year1Data,
                    year2: year2Data,
                    year3: year3Data,
                    
                    averages: averages
                };
                
                res.json(response);
            });
        });
    });
});






//======================================SUPER ADMIN ENDPOINTS========================================

// GET Superadmin Dashboard Statistics
app.get("/api/superadmin/dashboard/stats", authenticate, (req, res) => {
    // Query to get all statistics
    const statsQuery = `
        SELECT 
            -- Total active users
            (SELECT COUNT(*) 
             FROM users 
             WHERE is_active = 1 AND role_id != 5
            ) as totalUsers,
            
            -- Total evaluators (Teaching + Non-Teaching Evaluators)
            (SELECT COUNT(*) 
             FROM users 
             WHERE role_id IN (1, 2) AND is_active = 1
            ) as totalEvaluators,
            
            -- Total teaching staff
            (SELECT COUNT(*) 
             FROM staff 
             WHERE category_id = 1 AND status = 'active' AND is_department_head = 0
            ) as totalTeaching,
            
            -- Total non-teaching staff
            (SELECT COUNT(*) 
             FROM staff 
             WHERE category_id = 2 AND status = 'active' AND is_department_head = 0
            ) as totalNonTeaching,
            
            -- Teaching department heads count
            (SELECT COUNT(*) 
             FROM staff 
             WHERE category_id = 1 
               AND is_department_head = 1 
               AND status = 'active'
            ) as teachingHeads,
            
            -- Non-teaching department heads count
            (SELECT COUNT(*) 
             FROM staff 
             WHERE category_id = 2 
               AND is_department_head = 1 
               AND status = 'active'
            ) as nonTeachingHeads
    `;
    
    connection.query(statsQuery, (err, statsResults) => {
        if (err) {
            console.error("Dashboard statistics error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        // Get active period information
        const periodQuery = `
            SELECT 
                period_id,
                period_name,
                academic_year,
                start_date,
                end_date
            FROM evaluation_periods
            WHERE status = 'active'
            LIMIT 1
        `;
        
        connection.query(periodQuery, (err, periodResults) => {
            if (err) {
                console.error("Active period error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            
            const stats = statsResults[0] || {};
            const activePeriod = periodResults.length > 0 ? periodResults[0] : null;
            
            res.json({
                totalUsers: stats.totalUsers || 0,
                totalEvaluators: stats.totalEvaluators || 0,
                totalTeaching: stats.totalTeaching || 0,
                totalNonTeaching: stats.totalNonTeaching || 0,
                teachingHeads: stats.teachingHeads || 0,
                nonTeachingHeads: stats.nonTeachingHeads || 0,
                activePeriod: activePeriod
            });
        });
    });
});

//========================USER MANAGEMENT ENDPOINTS=========================

// GET All Users (for superadmin user management)
app.get("/api/superadmin/users", authenticate, (req, res) => {
    const query = `
        SELECT 
            u.user_id,
            u.username,
            u.email,
            u.role_id,
            u.is_active,
            ur.role_name,
            s.staff_id,
            CONCAT(s.first_name, ' ', COALESCE(CONCAT(s.middle_name, ' '), ''), s.last_name) as full_name,
            s.department_id,
            s.position,
            s.phone,
            s.employment_type,
            s.category_id,
            s.is_department_head,
            s.status as staff_status,
            d.department_name
        FROM users u
        LEFT JOIN user_roles ur ON u.role_id = ur.role_id
        LEFT JOIN staff s ON u.staff_id = s.staff_id
        LEFT JOIN departments d ON s.department_id = d.department_id
        WHERE category_id != 5  -- Exclude IT Admin staff
        ORDER BY u.user_id
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Load users error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        res.json(results);
    });
});

// GET Single User by ID
app.get("/api/superadmin/users/:userId", authenticate, (req, res) => {
    const userId = req.params.userId;
    
    const query = `
        SELECT 
            u.user_id,
            u.username,
            u.email,
            u.role_id,
            u.is_active,
            u.staff_id,
            s.first_name,
            s.middle_name,
            s.last_name,
            s.department_id,
            s.position,
            s.phone,
            s.employment_type,
            s.category_id,
            s.is_department_head,
            s.status
        FROM users u
        LEFT JOIN staff s ON u.staff_id = s.staff_id
        WHERE u.user_id = ?
    `;
    
    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Get user error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json(results[0]);
    });
});

// POST Create New User (UPDATED)
app.post("/api/superadmin/users", authenticate, async (req, res) => {
    const {
        firstName,
        middleName,
        lastName,
        email,
        phone,
        username,
        password,
        roleId,
        departmentId,
        position,
        employmentType,
        categoryId,
        isDeptHead
    } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !username || !password || !roleId || !departmentId || !employmentType || !categoryId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Check if username or email already exists
    const checkQuery = `SELECT user_id FROM users WHERE username = ? OR email = ?`;
    
    connection.query(checkQuery, [username, email], async (err, existing) => {
        if (err) {
            console.error("Check user error:", err);
            return res.status(500).json({ error: "Server error" });
        }
        
        if (existing.length > 0) {
            return res.status(409).json({ error: "Username or email already exists" });
        }
        
        try {
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Find department head based on role and department
            let deptHeadId = null;
            
            if (roleId === 3) {
                // Teaching Employee - find teaching evaluator in same department
                const findHeadQuery = `
                    SELECT s.staff_id 
                    FROM staff s
                    JOIN users u ON s.staff_id = u.staff_id
                    WHERE s.department_id = ? 
                      AND u.role_id = 1 
                      AND s.category_id = 1
                      AND s.is_department_head = 1
                      AND s.status = 'active'
                    LIMIT 1
                `;
                const [headResult] = await new Promise((resolve, reject) => {
                    connection.query(findHeadQuery, [departmentId], (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    });
                });
                deptHeadId = headResult.length > 0 ? headResult[0].staff_id : null;
                
            } else if (roleId === 4) {
                // Non-Teaching Employee - find HR head OR dept head in their department
                const findHeadQuery = `
                    SELECT s.staff_id 
                    FROM staff s
                    JOIN users u ON s.staff_id = u.staff_id
                    WHERE s.category_id = 2 
                      AND s.is_department_head = 1
                      AND s.status = 'active'
                      AND (u.role_id = 2 OR s.department_id = ?)
                    ORDER BY u.role_id ASC
                    LIMIT 1
                `;
                const [headResult] = await new Promise((resolve, reject) => {
                    connection.query(findHeadQuery, [departmentId], (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    });
                });
                deptHeadId = headResult.length > 0 ? headResult[0].staff_id : null;
            }
            // If role 1 or 2 (evaluators), deptHeadId stays null
            
            // Insert staff record
            const staffQuery = `
                INSERT INTO staff (
                    first_name, last_name, middle_name, department_id,
                    position, email, phone, employment_type,
                    category_id, department_head_id, is_department_head, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `;
            
            connection.query(staffQuery, [
                firstName, lastName, middleName, departmentId,
                position, email, phone, employmentType,
                categoryId, deptHeadId, isDeptHead ? 1 : 0
            ], (err, staffResult) => {
                if (err) {
                    console.error("Insert staff error:", err);
                    return res.status(500).json({ error: "Failed to create staff record" });
                }
                
                const staffId = staffResult.insertId;
                
                // Insert user record
                const userQuery = `
                    INSERT INTO users (
                        username, password_hash, email, role_id, staff_id, is_active
                    ) VALUES (?, ?, ?, ?, ?, 1)
                `;
                
                connection.query(userQuery, [username, hashedPassword, email, roleId, staffId], (err, userResult) => {
                    if (err) {
                        console.error("Insert user error:", err);
                        // Rollback: delete staff record
                        connection.query("DELETE FROM staff WHERE staff_id = ?", [staffId]);
                        return res.status(500).json({ error: "Failed to create user account" });
                    }
                    
                    res.status(201).json({
                        success: true,
                        userId: userResult.insertId,
                        staffId: staffId,
                        message: "User created successfully"
                    });
                });
            });
        } catch (error) {
            console.error("Create user error:", error);
            return res.status(500).json({ error: "Server error" });
        }
    });
});

// PUT Update User (UPDATED)
app.put("/api/superadmin/users/:userId", authenticate, async (req, res) => {
    const userId = req.params.userId;
    const {
        firstName,
        middleName,
        lastName,
        email,
        phone,
        username,
        password,
        roleId,
        departmentId,
        position,
        employmentType,
        categoryId,
        isDeptHead,
        isActive
    } = req.body;
    
    // Get staff_id from user
    const getStaffQuery = "SELECT staff_id FROM users WHERE user_id = ?";
    
    connection.query(getStaffQuery, [userId], async (err, userResults) => {
        if (err) {
            console.error("Get user error:", err);
            return res.status(500).json({ error: "Server error" });
        }
        
        if (userResults.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const staffId = userResults[0].staff_id;
        
        try {
            // Find department head based on role and department
            let deptHeadId = null;
            
            if (roleId === 3) {
                // Teaching Employee - find teaching evaluator in same department
                const findHeadQuery = `
                    SELECT s.staff_id 
                    FROM staff s
                    JOIN users u ON s.staff_id = u.staff_id
                    WHERE s.department_id = ? 
                      AND u.role_id = 1 
                      AND s.category_id = 1
                      AND s.is_department_head = 1
                      AND s.status = 'active'
                      AND s.staff_id != ?
                    LIMIT 1
                `;
                const [headResult] = await new Promise((resolve, reject) => {
                    connection.query(findHeadQuery, [departmentId, staffId], (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    });
                });
                deptHeadId = headResult.length > 0 ? headResult[0].staff_id : null;
                
            } else if (roleId === 4) {
                // Non-Teaching Employee - find HR head OR dept head
                const findHeadQuery = `
                    SELECT s.staff_id 
                    FROM staff s
                    JOIN users u ON s.staff_id = u.staff_id
                    WHERE s.category_id = 2 
                      AND s.is_department_head = 1
                      AND s.status = 'active'
                      AND s.staff_id != ?
                      AND (u.role_id = 2 OR s.department_id = ?)
                    ORDER BY u.role_id ASC
                    LIMIT 1
                `;
                const [headResult] = await new Promise((resolve, reject) => {
                    connection.query(findHeadQuery, [staffId, departmentId], (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    });
                });
                deptHeadId = headResult.length > 0 ? headResult[0].staff_id : null;
            }
            // If role 1 or 2 (evaluators), deptHeadId stays null
            
            // Determine staff status based on isActive
            const staffStatus = isActive ? 'active' : 'inactive';
            
            // Update staff record
            const staffQuery = `
                UPDATE staff 
                SET first_name = ?, last_name = ?, middle_name = ?,
                    department_id = ?, position = ?, email = ?,
                    phone = ?, employment_type = ?, category_id = ?,
                    department_head_id = ?, is_department_head = ?, 
                    status = ?, updated_at = NOW()
                WHERE staff_id = ?
            `;
            
            connection.query(staffQuery, [
                firstName, lastName, middleName,
                departmentId, position, email,
                phone, employmentType, categoryId,
                deptHeadId, isDeptHead ? 1 : 0, staffStatus, staffId
            ], async (err) => {
                if (err) {
                    console.error("Update staff error:", err);
                    return res.status(500).json({ error: "Failed to update staff record" });
                }
                
                // Update user record
                let userQuery, userParams;
                
                if (password && password.trim() !== '') {
                    // Update with new password
                    try {
                        const hashedPassword = await bcrypt.hash(password, 10);
                        userQuery = `
                            UPDATE users 
                            SET username = ?, password_hash = ?, email = ?, 
                                role_id = ?, is_active = ?
                            WHERE user_id = ?
                        `;
                        userParams = [username, hashedPassword, email, roleId, isActive ? 1 : 0, userId];
                    } catch (error) {
                        console.error("Password hash error:", error);
                        return res.status(500).json({ error: "Server error" });
                    }
                } else {
                    // Update without changing password
                    userQuery = `
                        UPDATE users 
                        SET username = ?, email = ?, role_id = ?, is_active = ?
                        WHERE user_id = ?
                    `;
                    userParams = [username, email, roleId, isActive ? 1 : 0, userId];
                }
                
                connection.query(userQuery, userParams, (err) => {
                    if (err) {
                        console.error("Update user error:", err);
                        return res.status(500).json({ error: "Failed to update user account" });
                    }
                    
                    res.json({
                        success: true,
                        message: "User updated successfully"
                    });
                });
            });
        } catch (error) {
            console.error("Update user error:", error);
            return res.status(500).json({ error: "Server error" });
        }
    });
});

// GET Departments (for dropdown)
app.get("/api/superadmin/departments", authenticate, (req, res) => {
    const query = `
        SELECT department_id, department_name, description
        FROM departments
        ORDER BY department_name
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Get departments error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});



// ====================== SUPERADMIN PERIOD MANAGEMENT ENDPOINTS ======================

// GET All Academic Years
app.get("/api/superadmin/academic-years", authenticate, (req, res) => {
    const query = `
        SELECT 
            year_id,
            year_code,
            start_year,
            end_year,
            status,
            created_at
        FROM academic_years
        ORDER BY start_year DESC
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Get academic years error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// POST Create New Academic Year
app.post("/api/superadmin/academic-years", authenticate, (req, res) => {
    const { startYear, endYear, status } = req.body;
    
    // Validate input
    if (!startYear || !endYear || !status) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (endYear !== startYear + 1) {
        return res.status(400).json({ error: "End year must be exactly one year after start year" });
    }
    
    const yearCode = `${startYear}-${endYear}`;
    
    // Check if year already exists
    const checkQuery = "SELECT year_id FROM academic_years WHERE year_code = ?";
    
    connection.query(checkQuery, [yearCode], (err, existing) => {
        if (err) {
            console.error("Check academic year error:", err);
            return res.status(500).json({ error: "Server error" });
        }
        
        if (existing.length > 0) {
            return res.status(409).json({ error: "Academic year already exists" });
        }
        
        // Insert new academic year
        const insertQuery = `
            INSERT INTO academic_years (year_code, start_year, end_year, status)
            VALUES (?, ?, ?, ?)
        `;
        
        connection.query(insertQuery, [yearCode, startYear, endYear, status], (err, result) => {
            if (err) {
                console.error("Insert academic year error:", err);
                return res.status(500).json({ error: "Failed to create academic year" });
            }
            
            res.status(201).json({
                success: true,
                yearId: result.insertId,
                message: "Academic year created successfully"
            });
        });
    });
});

// PUT Update Academic Year Status
app.put("/api/superadmin/academic-years/:yearId/status", authenticate, (req, res) => {
    const yearId = req.params.yearId;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['active', 'completed', 'upcoming'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }
    
    // If setting to active, deactivate all other years first
    if (status === 'active') {
        const deactivateQuery = `
            UPDATE academic_years 
            SET status = 'completed' 
            WHERE status = 'active' AND year_id != ?
        `;
        
        connection.query(deactivateQuery, [yearId], (err) => {
            if (err) {
                console.error("Deactivate years error:", err);
                return res.status(500).json({ error: "Server error" });
            }
            
            // Now update the target year
            updateYearStatus();
        });
    } else {
        updateYearStatus();
    }
    
    function updateYearStatus() {
        const updateQuery = `
            UPDATE academic_years 
            SET status = ? 
            WHERE year_id = ?
        `;
        
        connection.query(updateQuery, [status, yearId], (err, result) => {
            if (err) {
                console.error("Update year status error:", err);
                return res.status(500).json({ error: "Failed to update status" });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Academic year not found" });
            }
            
            res.json({
                success: true,
                message: "Academic year status updated"
            });
        });
    }
});

// GET All Evaluation Periods
app.get("/api/superadmin/evaluation-periods", authenticate, (req, res) => {
    const query = `
        SELECT 
            ep.period_id,
            ep.year_id,
            ep.period_name,
            ep.academic_year,
            ep.semester,
            ep.start_date,
            ep.end_date,
            ep.status,
            ep.created_at
        FROM evaluation_periods ep
        ORDER BY ep.start_date DESC
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Get evaluation periods error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});

// POST Create New Evaluation Period
app.post("/api/superadmin/evaluation-periods", authenticate, (req, res) => {
    const { yearId, semester, periodName, startDate, endDate, status } = req.body;
    
    // Validate input
    if (!yearId || !semester || !periodName || !startDate || !endDate || !status) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Get academic year code
    const getYearQuery = "SELECT year_code FROM academic_years WHERE year_id = ?";
    
    connection.query(getYearQuery, [yearId], (err, yearResults) => {
        if (err) {
            console.error("Get academic year error:", err);
            return res.status(500).json({ error: "Server error" });
        }
        
        if (yearResults.length === 0) {
            return res.status(404).json({ error: "Academic year not found" });
        }
        
        const academicYear = yearResults[0].year_code;
        
        // Check if period already exists for this year and semester
        const checkQuery = `
            SELECT period_id 
            FROM evaluation_periods 
            WHERE year_id = ? AND semester = ?
        `;
        
        connection.query(checkQuery, [yearId, semester], (err, existing) => {
            if (err) {
                console.error("Check period error:", err);
                return res.status(500).json({ error: "Server error" });
            }
            
            if (existing.length > 0) {
                return res.status(409).json({ error: "Evaluation period already exists for this semester" });
            }
            
            // Insert new evaluation period
            const insertQuery = `
                INSERT INTO evaluation_periods (
                    year_id, period_name, academic_year, semester,
                    start_date, end_date, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            connection.query(insertQuery, [
                yearId, periodName, academicYear, semester,
                startDate, endDate, status
            ], (err, result) => {
                if (err) {
                    console.error("Insert evaluation period error:", err);
                    return res.status(500).json({ error: "Failed to create evaluation period" });
                }
                
                res.status(201).json({
                    success: true,
                    periodId: result.insertId,
                    message: "Evaluation period created successfully"
                });
            });
        });
    });
});

// PUT Update Evaluation Period Status
app.put("/api/superadmin/evaluation-periods/:periodId/status", authenticate, (req, res) => {
    const periodId = req.params.periodId;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['upcoming', 'active', 'completed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }
    
    // If setting to active, deactivate all other periods first
    if (status === 'active') {
        const deactivateQuery = `
            UPDATE evaluation_periods 
            SET status = 'upcoming' 
            WHERE status = 'active' AND period_id != ?
        `;
        
        connection.query(deactivateQuery, [periodId], (err) => {
            if (err) {
                console.error("Deactivate periods error:", err);
                return res.status(500).json({ error: "Server error" });
            }
            
            // Now update the target period
            updatePeriodStatus();
        });
    } else {
        updatePeriodStatus();
    }
    
    function updatePeriodStatus() {
        const updateQuery = `
            UPDATE evaluation_periods 
            SET status = ? 
            WHERE period_id = ?
        `;
        
        connection.query(updateQuery, [status, periodId], (err, result) => {
            if (err) {
                console.error("Update period status error:", err);
                return res.status(500).json({ error: "Failed to update status" });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Evaluation period not found" });
            }
            
            res.json({
                success: true,
                message: "Evaluation period status updated"
            });
        });
    }
});

//======================GENERATE SUMMARY OF MERIT PAY=======================
// GET Teaching Summary of Merit Pay (All Employees for Evaluator)
app.get("/api/teaching-summary-merit-pay/:yearId", authenticate, requireRole(["Teaching Evaluator"]), (req, res) => {
    const yearId = req.params.yearId;
    const evaluatorStaffId = req.user.staff_id;
    
    // Get evaluator's department info
    const deptQuery = `
        SELECT d.department_name, d.department_id
        FROM staff s
        JOIN departments d ON s.department_id = d.department_id
        WHERE s.staff_id = ?
    `;
    
    connection.query(deptQuery, [evaluatorStaffId], (err, deptResults) => {
        if (err || deptResults.length === 0) {
            return res.status(500).json({ message: "Error fetching department info" });
        }
        
        const { department_name, department_id } = deptResults[0];
        
        // Get academic year label
        const yearQuery = `SELECT year_code FROM academic_years WHERE year_id = ?`;
        
        connection.query(yearQuery, [yearId], (err, yearResults) => {
            if (err) return res.status(500).json({ message: "Error fetching year" });
            
            const academicYear = yearResults[0]?.year_code || '-';
            
            // Get all teaching staff in this department with their yearly totals
            const summaryQuery = `
                SELECT 
                    s.staff_id,
                    CONCAT(s.first_name, ' ', s.last_name) as employee_name,
                    COALESCE(typ.teaching_competence, 0) as teaching_competence,
                    COALESCE(typ.effectiveness, 0) as effectiveness,
                    COALESCE(typ.professional_growth, 0) as professional_growth,
                    COALESCE(typ.teaching_experience, 0) as teaching_experience,
                    COALESCE(typ.total_points, 0) as total_points
                FROM staff s
                LEFT JOIN teaching_yearly_points typ 
                    ON s.staff_id = typ.staff_id AND typ.academic_year_id = ?
                WHERE s.department_id = ? 
                    AND s.category_id = 1 
                    AND s.status = 'active'
                    AND s.staff_id != ?
                ORDER BY s.first_name, s.last_name
            `;
            
            connection.query(summaryQuery, [yearId, department_id, evaluatorStaffId], (err, results) => {
                if (err) {
                    console.error("Error fetching summary:", err);
                    return res.status(500).json({ message: "Server error" });
                }
                
                // Calculate recommended merit pay for each employee
                const calculateMeritPay = (points) => {
                    if (points >= 46 && points <= 50) return 45.00;
                    else if (points >= 41 && points <= 45) return 28.00;
                    else if (points >= 36 && points <= 40) return 23.00;
                    else if (points >= 31 && points <= 35) return 18.00;
                    else if (points >= 26 && points <= 30) return 15.00;
                    else return 0;
                };
                
                const employeeSummaries = results.map(emp => ({
                    ...emp,
                    recommended_merit_pay: calculateMeritPay(emp.total_points)
                }));
                
                res.json({
                    department_name,
                    academic_year: academicYear,
                    employees: employeeSummaries
                });
            });
        });
    });
});


// ====================== EVALUATION PERIODS ======================
app.get("/api/evaluation-periods", authenticate, (req, res) => {
    const query = "SELECT * FROM evaluation_periods ORDER BY start_date DESC";
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Evaluation periods query error:", err);
            return res.status(500).json({ message: "Server error" });
        }
        res.json(results);
    });
});



// ====================== ERROR HANDLING ======================
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Something went wrong!" });
});

// ====================== START SERVER ======================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
});