import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';

export interface TenantInfo {
	name: string;
	appPort: number;
	mongoPort: number;
	status: 'running' | 'stopped' | 'creating' | 'error' | 'unknown';
	createdAt: string;
	// AI Configuration
	geminiApiKey?: string;
	// Build tracking
	buildLog?: string;
	errorMessage?: string;
}

// In-memory map to track active build processes
const activeBuildProcesses = new Map<string, { pid: number; startTime: number }>();

const TENANTS_DIR = path.join(process.cwd(), 'tenants');
const REGISTRY_FILE = path.join(TENANTS_DIR, 'tenants.json');
const HTTPS_CERT = path.join(process.cwd(), 'https-setup', 'localhost+4.pem');
const HTTPS_KEY = path.join(process.cwd(), 'https-setup', 'localhost+4-key.pem');

const APP_PORT_START = 9005;
const MONGO_PORT_START = 27018;

function ensureTenantsDirectoryExists(): void {
	if (!fs.existsSync(TENANTS_DIR)) {
		fs.mkdirSync(TENANTS_DIR, { recursive: true });
	}
}

function loadRegistry(): TenantInfo[] {
	ensureTenantsDirectoryExists();
	if (!fs.existsSync(REGISTRY_FILE)) {
		fs.writeFileSync(REGISTRY_FILE, JSON.stringify([], null, 2));
		return [];
	}
	try {
		const data = fs.readFileSync(REGISTRY_FILE, 'utf-8');
		return JSON.parse(data) as TenantInfo[];
	} catch {
		return [];
	}
}

function saveRegistry(tenants: TenantInfo[]): void {
	fs.writeFileSync(REGISTRY_FILE, JSON.stringify(tenants, null, 2));
}

function isPortTaken(port: number, used: Set<number>): boolean {
	return used.has(port);
}

function isPortInUse(port: number): boolean {
	try {
		// Check if port is in use by Docker containers
		const output = execSync(`docker ps --format "{{.Ports}}"`, { encoding: 'utf-8' });
		// Check if port appears in any container's port mapping
		return output.includes(`:${port}->`) || output.includes(`0.0.0.0:${port}:`) || output.includes(`::${port}:`);
	} catch {
		// If docker command fails, assume port might be available
		return false;
	}
}

function getNextAvailablePorts(tenants: TenantInfo[]): { appPort: number; mongoPort: number } {
	const usedApp = new Set(tenants.map(t => t.appPort));
	const usedMongo = new Set(tenants.map(t => t.mongoPort));

	let appPort = APP_PORT_START;
	while (isPortTaken(appPort, usedApp)) appPort += 1;

	let mongoPort = MONGO_PORT_START;
	while (isPortTaken(mongoPort, usedMongo)) mongoPort += 1;

	return { appPort, mongoPort };
}

function toDockerPath(p: string): string {
	return p.replace(/\\/g, '/');
}

function getLocalIpAddress(): string {
	const nets = os.networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] || []) {
			if (net.family === 'IPv4' && !net.internal) {
				return net.address;
			}
		}
	}
	return '127.0.0.1';
}

function getNangoServerUrl(): string {
	// Try to get Nango server URL from environment or use a sensible default
	// For Docker containers, we need the host IP where Nango is running
	const envUrl = process.env.NANGO_SERVER_URL;
	if (envUrl && !envUrl.includes('ngrok')) {
		return envUrl;
	}
	// Default to the known Nango server IP
	return 'http://172.16.34.39:3003';
}

function getNangoProxyUrl(): string {
	// Get ngrok proxy URL for frontend OAuth flows
	return process.env.NEXT_PUBLIC_NANGO_PROXY_URL || 
	       process.env.NEXT_PUBLIC_NANGO_SERVER_URL || 
	       'https://irremovable-overexuberantly-jaxen.ngrok-free.dev';
}

function dockerComposeContent(tenant: string, appPort: number, mongoPort: number, geminiApiKey?: string): string {
	const networkName = `upmy-${tenant}-network`;
	const volumeName = `mongo_${tenant}_data`;

	const projectRoot = toDockerPath(process.cwd());
	const buildContext = projectRoot;
	const dockerfilePath = toDockerPath(path.join(process.cwd(), 'https-setup', 'Dockerfile.prod'));
	const envFilePath = toDockerPath(path.join(process.cwd(), '.env'));

	const hostCert = toDockerPath(HTTPS_CERT);
	const hostKey = toDockerPath(HTTPS_KEY);

	const localIp = getLocalIpAddress();
	const baseUrl = `https://${localIp}:${appPort}/${tenant}`;
	const nangoServerUrl = getNangoServerUrl();

	const nangoProxyUrl = getNangoProxyUrl();

	// Build environment variables
	const envVars = [
		`NODE_ENV=production`,
		`DATABASE_URL=mongodb://mongo:27017/upmy_${tenant}`,
		`NEXTAUTH_URL=${baseUrl}`,
		`NEXTAUTH_SECRET=replace_this_with_secure_secret`,
		`APP_URL=${baseUrl}`,
		`NEXT_PUBLIC_APP_URL=${baseUrl}`,
		`NEXT_PUBLIC_TENANT_BASEPATH=/${tenant}`,
		`NEXT_PUBLIC_HOST_IP=${localIp}`,
		`JIRA_OAUTH_REDIRECT_URI=https://${localIp}:9003/api/oauth-router/jira/callback`,
		// ========== NANGO CONFIGURATION ==========
		// Server-side can use ngrok URL if direct IP is not accessible from Docker
		// The nango-service.ts will auto-detect and use ngrok if needed
		`NANGO_SERVER_URL=${nangoProxyUrl}`,
		// Frontend uses ngrok proxy for OAuth flows (HTTPS required)
		`NEXT_PUBLIC_NANGO_SERVER_URL=${nangoProxyUrl}`,
		`NEXT_PUBLIC_NANGO_PROXY_URL=${nangoProxyUrl}`,
		// ========== NANGO AUTHENTICATION KEYS ==========
		// Required for OAuth connections - loaded from main .env
		...(process.env.NANGO_SECRET_KEY ? [`NANGO_SECRET_KEY=${process.env.NANGO_SECRET_KEY}`] : []),
		...(process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY ? [`NEXT_PUBLIC_NANGO_PUBLIC_KEY=${process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY}`] : []),
		...(process.env.NANGO_ENCRYPTION_KEY ? [`NANGO_ENCRYPTION_KEY=${process.env.NANGO_ENCRYPTION_KEY}`] : []),
		// ========== EMAIL CONFIGURATION ==========
		// Email settings - these will be loaded from main .env via env_file
		// But we also pass them explicitly to ensure they're available
		// Use process.env to get values from the main .env file
		...(process.env.EMAIL_SERVER_HOST ? [`EMAIL_SERVER_HOST=${process.env.EMAIL_SERVER_HOST}`] : []),
		...(process.env.EMAIL_SERVER_PORT ? [`EMAIL_SERVER_PORT=${process.env.EMAIL_SERVER_PORT}`] : []),
		...(process.env.EMAIL_SERVER_USER ? [`EMAIL_SERVER_USER=${process.env.EMAIL_SERVER_USER}`] : []),
		...(process.env.EMAIL_SERVER_PASSWORD ? [`EMAIL_SERVER_PASSWORD=${process.env.EMAIL_SERVER_PASSWORD}`] : []),
		...(process.env.EMAIL_FROM ? [`EMAIL_FROM=${process.env.EMAIL_FROM}`] : []),
		...(process.env.USE_DIRECT_EMAIL ? [`USE_DIRECT_EMAIL=${process.env.USE_DIRECT_EMAIL}`] : []),
	];

	// Add Gemini API key if provided
	if (geminiApiKey) {
		envVars.push(`GOOGLE_GENAI_API_KEY=${geminiApiKey}`);
	}

	const envSection = envVars.map(v => `      - ${v}`).join('\n');

	return `services:
  upmy-${tenant}:
    build:
      context: ${buildContext}
      dockerfile: ${dockerfilePath}
      target: runner
      args:
        - NEXT_PUBLIC_TENANT_BASEPATH=/${tenant}
    container_name: upmy-${tenant}
    ports:
      - "${appPort}:9003"
    # Load Nango and other config from project .env file
    env_file:
      - ${envFilePath}
    environment:
${envSection}
    depends_on:
      - mongo
    networks:
      - ${networkName}
    volumes:
      - "${hostCert}:/app/localhost+4.pem:ro"
      - "${hostKey}:/app/localhost+4-key.pem:ro"

  mongo:
    image: mongo
    container_name: mongo-${tenant}
    ports:
      - "${mongoPort}:27017"
    volumes:
      - ${volumeName}:/data/db
    networks:
      - ${networkName}

networks:
  ${networkName}:
    driver: bridge

volumes:
  ${volumeName}:
    name: ${volumeName}
`;
}

export function listTenants(): TenantInfo[] {
	return loadRegistry();
}

export interface CreateTenantOptions {
	name: string;
	geminiApiKey?: string;
}

export function createTenant(tenantRaw: string | CreateTenantOptions): TenantInfo {
	// Check if running on Render.com or similar environment
	if (process.env.RENDER || process.env.NODE_ENV === 'production') {
		console.warn('⚠️ Dynamic tenant creation is disabled in production/Render environments.');
		// Return a mock tenant info for portfolio purposes if needed, 
		// or throw an error to prevent crashing the server
		throw new Error('Tenant creation is disabled in this environment. Please use a pre-configured tenant.');
	}

	// Handle both string and object input for backwards compatibility
	const options: CreateTenantOptions = typeof tenantRaw === 'string' 
		? { name: tenantRaw } 
		: tenantRaw;
	
	const tenant = options.name.trim();
	if (!tenant || /[^a-zA-Z0-9_-]/.test(tenant)) {
		throw new Error('Invalid tenant name. Use alphanumeric, dash or underscore.');
	}

	const registry = loadRegistry();
	if (registry.some(t => t.name.toLowerCase() === tenant.toLowerCase())) {
		throw new Error('Tenant already exists');
	}

	let { appPort, mongoPort } = getNextAvailablePorts(registry);
	
	// Check if ports are actually in use by Docker containers
	if (isPortInUse(appPort)) {
		console.warn(`⚠️ Port ${appPort} is already in use, finding alternative...`);
		const usedPorts = new Set(registry.map(t => t.appPort));
		for (let p = APP_PORT_START; p < APP_PORT_START + 100; p++) {
			if (!usedPorts.has(p) && !isPortInUse(p)) {
				appPort = p;
				console.log(`✅ Found available port: ${appPort}`);
				break;
			}
		}
	}
	
	if (isPortInUse(mongoPort)) {
		console.warn(`⚠️ Port ${mongoPort} is already in use, finding alternative...`);
		const usedPorts = new Set(registry.map(t => t.mongoPort));
		for (let p = MONGO_PORT_START; p < MONGO_PORT_START + 100; p++) {
			if (!usedPorts.has(p) && !isPortInUse(p)) {
				mongoPort = p;
				console.log(`✅ Found available port: ${mongoPort}`);
				break;
			}
		}
	}
	
	const tenantDir = path.join(TENANTS_DIR, tenant);
	const composePath = path.join(tenantDir, 'docker-compose.yml');
	fs.mkdirSync(tenantDir, { recursive: true });

	const compose = dockerComposeContent(tenant, appPort, mongoPort, options.geminiApiKey);
	fs.writeFileSync(composePath, compose);

	// Save tenant to registry immediately with "creating" status
	const info: TenantInfo = {
		name: tenant,
		appPort,
		mongoPort,
		status: 'creating',
		createdAt: new Date().toISOString(),
		geminiApiKey: options.geminiApiKey,
	};
	registry.push(info);
	saveRegistry(registry);

	// Start the build in the background (non-blocking)
	startTenantBuild(tenant, composePath, tenantDir);

	return info;
}

/**
 * Starts the docker compose build process in the background.
 * Updates the registry when the build completes or fails.
 */
function startTenantBuild(tenant: string, composePath: string, tenantDir: string): void {
	const isWindows = process.platform === 'win32';
	const logFile = path.join(tenantDir, 'build.log');

	// Clean up any existing containers first (synchronous, fast operation)
	try {
		const containerName = `upmy-${tenant}`;
		const mongoContainerName = `mongo-${tenant}`;
		const checkOutput = execSync(`docker ps -a --filter name=${containerName} --filter name=${mongoContainerName} --format "{{.Names}}"`, { 
			encoding: 'utf-8',
			timeout: 10000
		}).trim();
		
		if (checkOutput.includes(containerName) || checkOutput.includes(mongoContainerName)) {
			console.log(`ℹ️ Containers for tenant ${tenant} already exist, stopping them first...`);
			try {
				execSync(`docker compose -f "${composePath}" down`, { 
					stdio: 'ignore',
					cwd: tenantDir,
					timeout: 30000
				});
			} catch {
				// Ignore
			}
		}
	} catch {
		// Ignore check errors
	}

	// Open log file for writing
	const logStream = fs.createWriteStream(logFile, { flags: 'w' });
	logStream.write(`[${new Date().toISOString()}] Starting build for tenant: ${tenant}\n`);

	// Spawn docker compose in the background (non-blocking!)
	const shellCmd = isWindows ? 'powershell.exe' : '/bin/bash';
	const shellArgs = isWindows
		? ['-Command', `docker compose -f "${composePath}" up -d --build`]
		: ['-c', `docker compose -f "${composePath}" up -d --build`];

	const child = spawn(shellCmd, shellArgs, {
		cwd: tenantDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: false,
	});

	activeBuildProcesses.set(tenant, { pid: child.pid!, startTime: Date.now() });

	child.stdout?.on('data', (data) => {
		logStream.write(data);
	});

	child.stderr?.on('data', (data) => {
		logStream.write(data);
	});

	child.on('close', (code) => {
		activeBuildProcesses.delete(tenant);
		logStream.write(`\n[${new Date().toISOString()}] Build process exited with code: ${code}\n`);
		logStream.end();

		// Update tenant status in registry
		const reg = loadRegistry();
		const idx = reg.findIndex(t => t.name === tenant);
		if (idx === -1) return; // Tenant was deleted while building

		if (code === 0) {
			reg[idx].status = 'running';
			console.log(`✅ Tenant "${tenant}" build completed successfully`);
		} else {
			// Check if container is actually running despite non-zero exit
			try {
				const check = execSync(`docker ps --filter name=upmy-${tenant} --format "{{.Names}}"`, {
					encoding: 'utf-8',
					timeout: 10000
				}).trim();
				if (check.includes(`upmy-${tenant}`)) {
					reg[idx].status = 'running';
					console.log(`✅ Tenant "${tenant}" container is running (ignoring exit code ${code})`);
				} else {
					reg[idx].status = 'error';
					reg[idx].errorMessage = `Build failed with exit code ${code}. Check build log for details.`;
					console.error(`❌ Tenant "${tenant}" build failed with code ${code}`);
				}
			} catch {
				reg[idx].status = 'error';
				reg[idx].errorMessage = `Build failed with exit code ${code}. Check build log for details.`;
				console.error(`❌ Tenant "${tenant}" build failed with code ${code}`);
			}
		}
		saveRegistry(reg);
	});

	child.on('error', (err) => {
		activeBuildProcesses.delete(tenant);
		logStream.write(`\n[${new Date().toISOString()}] Build process error: ${err.message}\n`);
		logStream.end();

		const reg = loadRegistry();
		const idx = reg.findIndex(t => t.name === tenant);
		if (idx !== -1) {
			reg[idx].status = 'error';
			reg[idx].errorMessage = err.message;
			saveRegistry(reg);
		}
		console.error(`❌ Tenant "${tenant}" build error:`, err.message);
	});

	console.log(`🚀 Tenant "${tenant}" build started in background (PID: ${child.pid})`);
}

/**
 * Get the build log for a tenant
 */
export function getTenantBuildLog(tenantName: string): string {
	const logFile = path.join(TENANTS_DIR, tenantName, 'build.log');
	if (fs.existsSync(logFile)) {
		return fs.readFileSync(logFile, 'utf-8');
	}
	return '';
}

/**
 * Check if a tenant build is still in progress
 */
export function isTenantBuilding(tenantName: string): boolean {
	return activeBuildProcesses.has(tenantName);
}

/**
 * Retry a failed tenant build
 */
export function retryTenantBuild(tenantName: string): TenantInfo {
	const registry = loadRegistry();
	const idx = registry.findIndex(t => t.name === tenantName);
	if (idx === -1) throw new Error('Tenant not found');

	const tenantInfo = registry[idx];
	if (tenantInfo.status !== 'error') {
		throw new Error('Tenant is not in error state');
	}

	const tenantDir = path.join(TENANTS_DIR, tenantName);
	const composePath = path.join(tenantDir, 'docker-compose.yml');

	// Reset status
	registry[idx].status = 'creating';
	registry[idx].errorMessage = undefined;
	saveRegistry(registry);

	// Start build again
	startTenantBuild(tenantName, composePath, tenantDir);

	return registry[idx];
}

export function getTenant(tenant: string): TenantInfo | undefined {
	return loadRegistry().find(t => t.name === tenant);
}

export function updateTenantApiKey(tenantRaw: string, geminiApiKey: string): TenantInfo {
	const tenant = tenantRaw.trim();
	const registry = loadRegistry();
	const idx = registry.findIndex(t => t.name === tenant);
	if (idx === -1) {
		throw new Error('Tenant not found');
	}

	const tenantInfo = registry[idx];
	const tenantDir = path.join(TENANTS_DIR, tenant);
	const composePath = path.join(tenantDir, 'docker-compose.yml');

	// Update the docker-compose.yml with new API key
	const compose = dockerComposeContent(tenant, tenantInfo.appPort, tenantInfo.mongoPort, geminiApiKey);
	fs.writeFileSync(composePath, compose);

	// Update registry
	tenantInfo.geminiApiKey = geminiApiKey;
	registry[idx] = tenantInfo;
	saveRegistry(registry);

	// Restart the tenant container to pick up the new API key
	try {
		execSync(`docker compose -f "${composePath}" up -d`, { stdio: 'inherit' });
	} catch (err) {
		console.error('Failed to restart tenant container:', err);
	}

	return tenantInfo;
}

export function deleteTenant(tenantRaw: string): void {
	const tenant = tenantRaw.trim();
	const registry = loadRegistry();
	const idx = registry.findIndex(t => t.name === tenant);
	if (idx === -1) {
		throw new Error('Tenant not found');
	}
	const tenantDir = path.join(TENANTS_DIR, tenant);
	const composePath = path.join(tenantDir, 'docker-compose.yml');
	try {
		if (fs.existsSync(composePath)) {
			execSync(`docker compose -f "${composePath}" down`, { stdio: 'inherit' });
		}
	} catch (err) {
		// Continue to clean up files even if docker down fails
		console.error('docker compose down failed for tenant', tenant, err);
	}
	// Remove tenant directory
	try {
		if (fs.existsSync(tenantDir)) {
			fs.rmSync(tenantDir, { recursive: true, force: true });
		}
	} catch {}
	// Update registry
	registry.splice(idx, 1);
	saveRegistry(registry);
} 