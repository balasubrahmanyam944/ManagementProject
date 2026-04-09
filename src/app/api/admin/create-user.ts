import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getCollection, COLLECTIONS } from "@/lib/db/mongodb";

export async function POST(req: NextRequest) {
  try {
    const { fullName, email, password, role } = await req.json();
    if (!fullName || !email || !password || !role) {
      return NextResponse.json({ message: "All fields are required." }, { status: 400 });
    }

    const users = await getCollection(COLLECTIONS.USERS);
    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json({ message: "User with this email already exists." }, { status: 409 });
    }

    const hashedPassword = await hash(password, 10);
    const user = {
      name: fullName,
      email,
      password: hashedPassword,
      role: role.toUpperCase(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await users.insertOne(user);
    return NextResponse.json({ message: "User created successfully." }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
} 