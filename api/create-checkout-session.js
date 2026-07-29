const Stripe = require("stripe")

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

/**
 * CREATE STRIPE CHECKOUT SESSION
 * --------------------------------
 * Called from your Framer checkout modal when the customer clicks
 * "Checkout" (and picks Stripe as the payment method). It builds a
 * Stripe Checkout Session from the cart, then hands back a URL —
 * your frontend redirects the browser to that URL, Stripe handles the
 * actual card entry on their hosted page.
 *
 * WHAT THE FRAMER SIDE NEEDS TO SEND (as JSON in the POST body):
 * {
 *   "items": [
 *     { "syncVariantId": 4567, "quantity": 1, "name": "GRDNS Hoodie - Forest Camo / L", "unitPriceCents": 6000 }
 *   ],
 *   "email": "customer@example.com"   // optional, pre-fills Stripe's email field
 * }
 *
 * unitPriceCents is the price in cents (e.g. $60.00 -> 6000), since
 * Stripe works in the smallest currency unit.
 */
module.exports = async (req, res) => {
    // Basic CORS so your Framer site (a different domain) can call this
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
        return res.status(200).end()
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { items, email } = req.body

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Cart is empty" })
        }

        // Stripe needs its own line_items shape (name/price), separate
        // from the sync_variant_id Printful needs — so we build both:
        // one for Stripe's display, and a compact version for metadata
        // that the webhook will read back out after payment succeeds.
        const line_items = items.map((item) => ({
            price_data: {
                currency: "usd",
                product_data: { name: item.name },
                unit_amount: item.unitPriceCents,
            },
            quantity: item.quantity,
        }))

        // Compact cart data for Printful, stashed in metadata so the
        // webhook has it after payment completes. Stripe metadata values
        // are capped at 500 characters — fine for a normal cart, but a
        // very large order could hit that limit. Flag it if that ever
        // becomes a real concern (large bulk/wholesale orders).
        const cartForPrintful = items.map((item) => ({
            v: item.syncVariantId,
            q: item.quantity,
        }))

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items,
            customer_email: email || undefined,
            shipping_address_collection: {
                allowed_countries: ["TT", "US", "CA"], // adjust to wherever GRDNS actually ships
            },
            metadata: {
                cart: JSON.stringify(cartForPrintful),
            },
            success_url: `${process.env.SITE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_URL}/checkout-cancelled`,
        })

        return res.status(200).json({ url: session.url })
    } catch (err) {
        console.error("Stripe session creation failed:", err.message)
        return res.status(500).json({ error: "Could not start checkout" })
    }
}
