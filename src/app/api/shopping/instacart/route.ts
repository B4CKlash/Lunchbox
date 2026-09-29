import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1).max(80),
    quantity: z.number().finite().positive(),
    unit: z.enum(["g", "ml", "each"]),
  })).min(1).max(200),
});

export async function POST(request: Request) {
  const token = process.env.INSTACART_API_KEY;
  if (!token) return NextResponse.json({ error: "Instacart linking is not configured yet. Add an approved INSTACART_API_KEY on the server." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The shopping list could not be read." }, { status: 400 });

  try {
    const response = await fetch("https://connect.instacart.com/idp/v1/products/products_link", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "LunchBox shopping list",
        link_type: "shopping_list",
        expires_in: 30,
        line_items: parsed.data.items.map((item) => ({
          name: item.name,
          display_text: `${item.name} · ${item.quantity} ${item.unit}`,
          line_item_measurements: [{
            quantity: item.quantity,
            unit: item.unit === "g" ? "gram" : item.unit === "ml" ? "milliliter" : "each",
          }],
        })),
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return NextResponse.json({ error: "Instacart could not create the list. Check API access and try again." }, { status: 502 });
    const result = z.object({ products_link_url: z.string().url() }).safeParse(await response.json());
    if (!result.success) return NextResponse.json({ error: "Instacart returned an unexpected response." }, { status: 502 });
    return NextResponse.json({ url: result.data.products_link_url });
  } catch {
    return NextResponse.json({ error: "Instacart is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
