const card = document.querySelector(".login-card");
const form = document.querySelector(".login-form");

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
    const formData = new FormData(form);
    const role = formData.get("role");
    
    card.classList.add("is-submitting");
    window.clearTimeout(submitTimer);
    
    // Redirect based on role
    const redirectTo = role ? `dashboard-${role}.html` : form.getAttribute("data-redirect");
    
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
