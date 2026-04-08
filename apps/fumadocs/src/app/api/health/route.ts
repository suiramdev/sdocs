export const dynamic = "force-static";

export const GET = (): Response =>
  Response.json({
    ok: true,
    service: "fumadocs",
  });
