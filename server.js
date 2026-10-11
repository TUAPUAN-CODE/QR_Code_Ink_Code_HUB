const express = require('express');
const path = require('path');

const app = express();
const PORT = 81;
const HOST = '0.0.0.0'; // listen on all network interfaces (LAN + localhost)

// Serve every file in this folder as static content
app.use(express.static(__dirname));

// Default page when visiting just http://IP:81/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Generate QR Code.html'));
});

app.listen(PORT, HOST, () => {
  console.log('============================================================');
  console.log('  QR Code Tool server is running');
  console.log('============================================================');
  console.log('  This machine:      http://localhost:' + PORT + '/');
  console.log('  Other PCs on LAN:  http://172.48.0.115:' + PORT + '/');
  console.log('');
  console.log('  Press Ctrl+C to stop the server.');
});
