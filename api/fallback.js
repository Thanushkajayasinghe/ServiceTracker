const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const filePath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(content);
  } catch (err) {
    res.status(500).json({ error: 'SPA entry not found' });
  }
};
