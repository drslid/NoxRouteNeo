import type { NextRequest } from "next/server";
import QRCode from "qrcode";

import { getOwnedDeviceConnection } from "@/data/connections";
import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const { deviceId } = await params;
    const connection = await getOwnedDeviceConnection(
      actor.session.user.id,
      deviceId,
    );
    const kind = request.nextUrl.searchParams.get("kind");
    const value = kind === "direct" ? connection.directUri : connection.subscriptionUrl;
    const svg = await QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#13212f", light: "#ffffff" },
    });

    return new Response(svg, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
