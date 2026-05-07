import { NextResponse } from "next/server";

export const maxDuration = 30;

// Endpoint desabilitado — tabela dev_chat_messages não existe
export async function GET() {
  return NextResponse.json({ error: "Endpoint desabilitado" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ error: "Endpoint desabilitado" }, { status: 501 });
}
