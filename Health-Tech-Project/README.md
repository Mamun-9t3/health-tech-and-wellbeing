# Health-Tech-and-Wellbeing--Project

This project contains a simple static front‑end and a basic Node.js/Express backend that stores username and email submissions.

## Running the backend

1. Make sure you have Node.js installed (v14+).
2. Open a terminal **inside the `Health-Tech-Project` folder** (where `package.json` and `server.js` live) and run:
   ```bash
   npm install
   npm start     # or `npm run dev` for auto-reload with nodemon
   ```
   If you see errors about missing `package.json`, you're in the wrong directory.
3. Visit `http://localhost:3000/login.html` to access the login form.

Submitted users are appended to `users.json` in the project root.

The site now includes two forms:

* `/register.html` – create a new account (username, email, password). Passwords must be at least 8 characters long and include an uppercase letter, a number, and a special character. Duplicate entries are prevented.
* `/login.html` – existing users sign in with the same credentials (including password); an error is shown if they are not found or the password doesn't match.

Navigation links for Sign Up / Sign In are available in the header.
