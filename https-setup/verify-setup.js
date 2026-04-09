#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🔍 UPMY HTTPS Setup Verification');
console.log('=====================================\n');

const checks = [];

// Check 1: SSL Certificates exist
function checkCertificates() {
    const certPath = path.join('..', 'localhost+4.pem');
    const keyPath = path.join('..', 'localhost+4-key.pem');
    
    const certExists = fs.existsSync(certPath);
    const keyExists = fs.existsSync(keyPath);
    
    checks.push({
        name: 'SSL Certificates',
        passed: certExists && keyExists,
        details: certExists && keyExists ? 
            '✅ Both certificate and key files found' : 
            `❌ Missing files: ${!certExists ? 'certificate ' : ''}${!keyExists ? 'private key' : ''}`
    });
}

// Check 2: Server.js exists
function checkServer() {
    const serverPath = path.join('..', 'server.js');
    const exists = fs.existsSync(serverPath);
    
    checks.push({
        name: 'HTTPS Server File',
        passed: exists,
        details: exists ? '✅ server.js found' : '❌ server.js missing'
    });
}

// Check 3: Environment file
function checkEnvironment() {
    const envPath = path.join('..', '.env.local');
    const exists = fs.existsSync(envPath);
    
    if (exists) {
        const content = fs.readFileSync(envPath, 'utf8');
        const hasHttps = content.includes('https://');
        const hasNextAuth = content.includes('NEXTAUTH_URL=https://');
        
        checks.push({
            name: 'Environment Configuration',
            passed: hasHttps && hasNextAuth,
            details: hasHttps && hasNextAuth ? 
                '✅ HTTPS URLs configured' : 
                '❌ Missing HTTPS configuration'
        });
    } else {
        checks.push({
            name: 'Environment Configuration',
            passed: false,
            details: '❌ .env.local file not found'
        });
    }
}

// Check 4: Package.json scripts
function checkPackageJson() {
    const packagePath = path.join('..', 'package.json');
    
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const hasDevScript = packageJson.scripts && packageJson.scripts.dev === 'node server.js';
        
        checks.push({
            name: 'Package.json Scripts',
            passed: hasDevScript,
            details: hasDevScript ? 
                '✅ Dev script configured for HTTPS' : 
                '❌ Dev script not configured (should be "node server.js")'
        });
    } else {
        checks.push({
            name: 'Package.json Scripts',
            passed: false,
            details: '❌ package.json not found'
        });
    }
}

// Check 5: Test HTTPS connection
function checkHttpsConnection() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 9003,
            path: '/',
            method: 'GET',
            rejectUnauthorized: false, // Allow self-signed certificates
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            checks.push({
                name: 'HTTPS Connection Test',
                passed: res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 404,
                details: `✅ Server responding with status ${res.statusCode}`
            });
            resolve();
        });

        req.on('error', (err) => {
            checks.push({
                name: 'HTTPS Connection Test',
                passed: false,
                details: `❌ Connection failed: ${err.message}`
            });
            resolve();
        });

        req.on('timeout', () => {
            checks.push({
                name: 'HTTPS Connection Test',
                passed: false,
                details: '❌ Connection timeout (server may not be running)'
            });
            req.destroy();
            resolve();
        });

        req.end();
    });
}

// Run all checks
async function runChecks() {
    console.log('Running verification checks...\n');
    
    checkCertificates();
    checkServer();
    checkEnvironment();
    checkPackageJson();
    
    // Test connection if server might be running
    await checkHttpsConnection();
    
    // Display results
    console.log('Verification Results:');
    console.log('====================\n');
    
    let allPassed = true;
    
    checks.forEach((check, index) => {
        console.log(`${index + 1}. ${check.name}`);
        console.log(`   ${check.details}\n`);
        if (!check.passed) allPassed = false;
    });
    
    // Summary
    console.log('Summary:');
    console.log('========');
    
    if (allPassed) {
        console.log('🎉 All checks passed! Your HTTPS setup is ready.');
        console.log('\nTo start your application:');
        console.log('   cd ..');
        console.log('   npm run dev');
        console.log('\nThen visit: https://localhost:9003');
    } else {
        console.log('⚠️  Some checks failed. Please review the issues above.');
        console.log('\nTo fix issues:');
        console.log('   1. Run the setup script for your platform');
        console.log('   2. Check the README.md for troubleshooting');
        console.log('   3. Ensure the server is running for connection test');
    }
    
    console.log('\nFor help, see: https-setup/README.md');
}

// Handle process
process.on('unhandledRejection', (err) => {
    console.error('Error during verification:', err.message);
    process.exit(1);
});

// Run the verification
runChecks().catch(console.error); 