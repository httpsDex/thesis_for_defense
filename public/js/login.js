// js/login.js
const apiBaseUrl = "http://localhost:1804";
// const apiBaseUrl = "https://meritup-server.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".loginForm");
  const loginResult = document.getElementById("loginResult");
  const togglePassword = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");


  // Toggle password visibility
  togglePassword.addEventListener("click", () => {
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    
    // Toggle eye icon
    if (type === "text") {
      togglePassword.classList.remove("fa-eye");
      togglePassword.classList.add("fa-eye-slash");
    } else {
      togglePassword.classList.remove("fa-eye-slash");
      togglePassword.classList.add("fa-eye");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usernameOrEmail = document.getElementById("UserId").value.trim();
    const password = document.getElementById("password").value;

    const loginButton = document.getElementById("loginButton");
    const buttonText = document.querySelector(".button-text");
    const spinner = document.querySelector(".spinner");

// Show loading state
    loginButton.disabled = true;
    buttonText.style.display = "none";
    spinner.style.display = "inline-block";
    loginResult.textContent = "";


    if (!usernameOrEmail || !password) {
      loginResult.textContent = "Please enter both fields.";
      loginResult.style.color = "red";
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrEmail, password }),
      });

      const data = await response.json();

      // Hide loading state
      loginButton.disabled = false;
      buttonText.style.display = "inline-block";
      spinner.style.display = "none";

      if (!response.ok) {
        loginResult.textContent = data.message || "Login failed.";
        loginResult.style.color = "red";
        return;
      }

      // ✅ Login success
      loginResult.textContent = "Login successful!";
      loginResult.style.color = "green";

      // Save tokens to localStorage (or cookies if you want)
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect based on role
      switch (data.user.role_id) {
        case 1: // teaching_evaluator
          window.location.href = "evaluatorpage.html";
          break;
        case 2: // non-teaching_evaluator
          window.location.href = "evaluatorpage.html";
          break;
        case 3: // teaching_evaluator
          window.location.href = "employeepage.html";
          break;
        case 4: // nonteaching_employee
          window.location.href = "employeepage.html";
          break;
        case 5: // super_admin
          window.location.href = "superadmin.html";
          break;
        default:
          loginResult.textContent = "Unknown user role.";
          loginResult.style.color = "red";
      }
    } catch (err) {
      console.error("Login error:", err);

      // Hide loading state on error
      loginButton.disabled = false;
      buttonText.style.display = "inline-block";
      spinner.style.display = "none";

      loginResult.textContent = "Server error. Try again later.";
      loginResult.style.color = "red";
    }
  });
});
