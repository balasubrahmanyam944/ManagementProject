import { NextRequest, NextResponse } from 'next/server';
import { createTenant, listTenants, deleteTenant, updateTenantApiKey, getTenantBuildLog, isTenantBuilding, retryTenantBuild } from '@/lib/tenancy/tenantManager';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const action = searchParams.get('action');
		const name = searchParams.get('name') || '';

		// Return build log for a specific tenant
		if (action === 'buildLog' && name) {
			const log = getTenantBuildLog(name);
			const building = isTenantBuilding(name);
			return NextResponse.json({ log, building });
		}

		const tenants = listTenants();
		return NextResponse.json({ tenants });
	} catch (error: any) {
		return NextResponse.json({ error: error?.message ?? 'Failed to list tenants' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const name = (body?.name ?? '').toString();
		const geminiApiKey = body?.geminiApiKey?.toString() || undefined;
		
		if (!name) {
			return NextResponse.json({ error: 'Missing tenant name' }, { status: 400 });
		}
		
		const result = createTenant({ name, geminiApiKey });
		return NextResponse.json({ tenant: result }, { status: 201 });
	} catch (error: any) {
		return NextResponse.json({ error: error?.message ?? 'Failed to create tenant' }, { status: 500 });
	}
}

export async function PUT(req: NextRequest) {
	try {
		const body = await req.json();
		const action = body?.action;
		const name = (body?.name ?? '').toString();

		// Retry a failed build
		if (action === 'retry') {
			if (!name) {
				return NextResponse.json({ error: 'Missing tenant name' }, { status: 400 });
			}
			const result = retryTenantBuild(name);
			return NextResponse.json({ tenant: result });
		}

		const geminiApiKey = (body?.geminiApiKey ?? '').toString();
		
		if (!name) {
			return NextResponse.json({ error: 'Missing tenant name' }, { status: 400 });
		}
		if (!geminiApiKey) {
			return NextResponse.json({ error: 'Missing Gemini API key' }, { status: 400 });
		}
		
		const result = updateTenantApiKey(name, geminiApiKey);
		return NextResponse.json({ tenant: result });
	} catch (error: any) {
		return NextResponse.json({ error: error?.message ?? 'Failed to update tenant API key' }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const name = searchParams.get('name') || '';
		if (!name) return NextResponse.json({ error: 'Missing tenant name' }, { status: 400 });
		deleteTenant(name);
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		return NextResponse.json({ error: error?.message ?? 'Failed to delete tenant' }, { status: 500 });
	}
} 