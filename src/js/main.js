const card = document.querySelector(".login-card");
const form = document.querySelector(".login-form");
const submitButton = form ? form.querySelector(".primary-submit") : null;
const emailInput = form ? form.querySelector("#email") : null;
const passwordInput = form ? form.querySelector("#password") : null;
const roleSelect = form ? form.querySelector("#role") : null;

// Create custom alert
function showCustomAlert(missingFields) {
  // Remove existing alert if any
  const existingAlert = document.querySelector('.custom-alert-overlay');
  if (existingAlert) {
    existingAlert.remove();
  }

  const alertOverlay = document.createElement('div');
  alertOverlay.className = 'custom-alert-overlay';
  
  const fieldsList = missingFields.map(field => `<span class="field-tag">${field}</span>`).join('');
  
  alertOverlay.innerHTML = `
    <div class="custom-alert">
      <div class="alert-content">
        <div class="alert-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="alert-text">
          <strong>Missing fields:</strong> ${fieldsList}
        </div>
      </div>
      <button class="alert-close" onclick="this.closest('.custom-alert-overlay').remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(alertOverlay);
  
  // Trigger animation
  setTimeout(() => {
    alertOverlay.classList.add('show');
  }, 10);
  
  // Auto-close after 4 seconds
  setTimeout(() => {
    if (alertOverlay.parentNode) {
      alertOverlay.classList.add('hide');
      setTimeout(() => alertOverlay.remove(), 300);
    }
  }, 4000);
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      alertOverlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

if (card) {
  const setGlowPosition = (event) => {
    const bounds = card.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    card.style.setProperty("--glow-x", `${Math.max(0, Math.min(100, x))}%`);
    card.style.setProperty("--glow-y", `${Math.max(0, Math.min(100, y))}%`);
  };

  card.addEventListener("pointermove", setGlowPosition);
  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--glow-x", "50%");
    card.style.setProperty("--glow-y", "14%");
  });
}

if (form && card) {
  let submitTimer = 0;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    
    // Validate all fields
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";
    const role = roleSelect ? roleSelect.value : "";
    
    // Check if any field is empty
    if (!email || !password || !role) {
      let missingFields = [];
      if (!email) missingFields.push("Email Address");
      if (!password) missingFields.push("Password");
      if (!role) missingFields.push("User Role");
      
      showCustomAlert(missingFields);
      return;
    }
    
    const formData = new FormData(form);
    const selectedRole = formData.get("role");
    
    card.classList.add("is-submitting");
    window.clearTimeout(submitTimer);
    
    // Redirect based on role
    const redirectTo = selectedRole ? `dashboard-${selectedRole}.html` : form.getAttribute("data-redirect");
    
    submitTimer = window.setTimeout(() => {
      card.classList.remove("is-submitting");
      if (redirectTo) window.location.href = redirectTo;
    }, 850);
  });
}

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  const inputId = button.getAttribute("data-toggle-password");
  const input = inputId ? document.getElementById(inputId) : null;
  if (!input) return;

  const updateVisibility = () => {
    const hasValue = input.value.trim().length > 0;
    button.classList.toggle("is-visible", hasValue);
    if (!hasValue && input.type !== "password") {
      input.type = "password";
      const icon = button.querySelector("img");
      if (icon) icon.src = "assets/eye.svg";
      button.setAttribute("aria-label", "Show password");
    }
  };

  input.addEventListener("input", updateVisibility);
  updateVisibility();

  button.addEventListener("click", () => {
    const icon = button.querySelector("img");

    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    if (icon) {
      icon.src = show ? "assets/eye-off.svg" : "assets/eye.svg";
    }
  });
});
