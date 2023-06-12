import {
  generateClientTokenFromReadWriteToken,
  type GenerateClientTokenOptions,
} from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as GenerateClientTokenOptions;

  return NextResponse.json({
    clientToken: generateClientTokenFromReadWriteToken(body),
  });
}
