// public/js/login.js

const users = [
  {
    email: "admju@empresa.com",
    password: "123456",
    displayName: "admju",
    role: "admin",
  },
  {
    email: "admb@empresa.com",
    password: "123456",
    displayName: "admB",
    role: "admin",
  },
  {
    email: "teste@empresa.com",
    password: "123456",
    displayName: "teste",
    role: "user",
  },
];

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    errorBox.classList.remove("hidden");
    return;
  }

  // Salva usuário no localStorage
  localStorage.setItem(
    "nfseUser",
    JSON.stringify({
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    })
  );

  window.location.href = "/dashboard.html";
});
