// Generate self-signed SSL certificate for local HTTPS testing
// This is needed for camera access on mobile devices over LAN
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, 'certs');
const keyPath = path.join(certsDir, 'key.pem');
const certPath = path.join(certsDir, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✅ SSL certificates already exist in server/certs/');
  console.log('   Delete them and re-run this script to regenerate.');
  process.exit(0);
}

// Create certs directory
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

console.log('🔐 Generating self-signed SSL certificate...');
console.log('');

try {
  // Generate using openssl (available on macOS, Linux, and Git Bash on Windows)
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=QR Check-In Local"`,
    { stdio: 'pipe' }
  );

  console.log('✅ Certificate generated successfully!');
  console.log(`   Key:  ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('');
  console.log('📱 To trust on iPhone:');
  console.log('   1. Open Safari and go to https://<your-ip>:3443');
  console.log('   2. Tap "Show Details" → "visit this website"');
  console.log('   3. Go to Settings → General → About → Certificate Trust Settings');
  console.log('   4. Enable full trust for "QR Check-In Local"');
  console.log('');
  console.log('🚀 Start the server with HTTPS: npm run server:https');
} catch (err) {
  console.error('❌ Failed to generate certificate.');
  console.error('');
  console.error('   openssl is required. Install it:');
  console.error('   - macOS: brew install openssl');
  console.error('   - Ubuntu: sudo apt install openssl');
  console.error('   - Windows: Install Git for Windows (includes openssl)');
  console.error('              or run from Git Bash');
  console.error('');
  console.error('   Error:', err.message);
  process.exit(1);
}
