const Stripe = require("stripe")
const { createPrintfulOrder } = require("../lib/printful")

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

/**
 * STRIPE WEBHOOK -> PRINTFUL ORDER
 * ----------------------------------
 * This is the piece that was actually missing before: the moment a
 * Stripe payment succeeds, Stripe calls THIS endpoint automatically
 * (not your frontend — this happens server-to-server, so it still
 * fires even if the customer closes their browser right after paying).
 *
 * SETUP NEEDED IN STRIPE DASHBOARD:
 * 1. Developers -> Webhooks -> Add endpoint
 * 2. URL: https://your-vercel-project.vercel.app/api/stripe-webhook
 * 3. Listen for event: checkout.session.completed
 * 4. Copy the "Signing secret" it gives you into Vercel's environment
 *    variables as STRIPE_WEBHOOK_SECRET
 *
 * IMPORTANT VERCEL CONFIG: Stripe needs the RAW request body to verify
 * the signature, but Vercel parses JSON by default. The config export
 * below (bodyParser: false) turns that off for this one function.
 */

module.exports.config = {
    api: {
        bodyParser: false,
    },
}

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = ""
        req.on("data", (chunk) => (data += chunk))
        req.on("end", () => resolve(data))
        req.on("error", reject)
    })
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).end()
    }

    const rawBody = await getRawBody(req)
    const signature = req.headers["stripe-signature"]

    let event
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (err) {
        console.error("Webhook signature check failed:", err.message)
        return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object

        try {
            const cart = JSON.parse(session.metadata.cart || "[]")

            const printfulItems = cart.map((item) => ({
                sync_variant_id: item.v,
                quantity: item.q,
            }))

            const shipping = session.shipping_details
            const customer = session.customer_details

            const recipient = {
                name: shipping?.name || customer?.name,
                address1: shipping?.address?.line1,
                address2: shipping?.address?.line2 || "",
                city: shipping?.address?.city,
                state_code: shipping?.address?.state,
                country_code: shipping?.address?.country,
                zip: shipping?.address?.postal_code,
                email: customer?.email,
            }

            await createPrintfulOrder({
                recipient,
                items: printfulItems,
                externalId: session.id,
            })

            console.log(`Printful order created for Stripe session ${session.id}`)
        } catch (err) {
            // IMPORTANT: if this fails, the customer has already been
            // charged but Printful never got the order. Right now this
            // just logs it — you will want a real alert here (email
            // yourself, or check Vercel's function logs) so a failed
            // order doesn't silently vanish while the customer thinks
            // they're all set.
            console.error("Failed to create Printful order:", err.message)
        }
    }

    res.status(200).json({ received: true })
}
