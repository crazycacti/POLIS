import type { NextRequest } from "next/server";

import { handlePreviewPosterRequest } from "@/lib/preview-poster-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return handlePreviewPosterRequest(request, file);
}
