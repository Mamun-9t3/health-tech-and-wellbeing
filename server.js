const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// path where user data will be stored
const dataFile = path.join(__dirname, 'users.json');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static assets from the `html` folder (HTML pages) and `css`/`js` folders
app.use(express.static(path.join(__dirname, 'html')));
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));

// Default route: serve index.html from the html folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'index.html'));
});

// registration endpoint
app.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).send('username, email and password required');
  }

  // enforce password rules server-side as well
  const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.redirect('register.html?error=weakpassword');
  }

  let users = [];
  if (fs.existsSync(dataFile)) {
    try {
      users = JSON.parse(fs.readFileSync(dataFile, 'utf-8')) || [];
    } catch (err) {
      console.error('read error', err);
    }
  }

  const exists = users.find(u => u.username === username || u.email === email);
  if (exists) {
    return res.redirect('register.html?error=exists');
  }

  users.push({ username, email, password, timestamp: new Date().toISOString() });
  try {
    fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('write error', err);
  }

  res.redirect('index.html');
});

// login endpoint for existing users
app.post('/login', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).send('username, email and password required');
  }

  let users = [];
  if (fs.existsSync(dataFile)) {
    try {
      users = JSON.parse(fs.readFileSync(dataFile, 'utf-8')) || [];
    } catch (err) {
      console.error('read error', err);
    }
  }

  const exists = users.find(u => u.username === username && u.email === email && u.password === password);
  if (!exists) {
    return res.redirect('login.html?error=notfound');
  }

  // successful login
  res.redirect('index.html');
});

function startServer(port) {
  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    console.log(`Server listening at http://localhost:${actualPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

startServer(PORT);
