const axios = require("axios")

/**
 * PRINTFUL ORDER HELPER
 * ----------------------
 * One shared function that actually places the order with Printful once
 * a payment has succeeded. Stripe, and later Scotia/Linx, both call this
 * same function — it doesn't know or care which payment method was used.
 *
 * IMPORTANT: this uses "sync_variant_id" for each item, NOT the raw
 * Printful catalog variant_id. Since your products are already set up
 * as Sync Products in your Printful store, Printful already has the
 * design/print files attached to each sync_variant_id — you just need
 * to tell it which one, and how many.
 *
 * Where does sync_variant_id come from? Your CMS's "Variants JSON"
 * field (written by sync.js) has the full list of sync_variants per
 * product, each with an id, a size, and (via the catalog lookup we just
 * added) a color. The cart needs to resolve "customer picked Forest
 * Camo, size L" into the matching sync_variant_id BEFORE checkout ever
 * reaches this file. That lookup piece isn't built yet — flagging it
 * now so it doesn't get lost; it's the next thing after this webhook
 * is confirmed working.
 */

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN

const printfulApi = axios.create({
    baseURL: "https://api.printful.com",
    headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "Content-Type": "application/json",
    },
})

/**
 * @param {Object} params
 * @param {Object} params.recipient - { name, address1, address2, city, state_code, country_code, zip, email, phone }
 * @param {Array}  params.items - [{ sync_variant_id: number, quantity: number }]
 * @param {string} params.externalId - your own order/session ID, so you can trace a Printful order back to a Stripe payment
 */
async function createPrintfulOrder({ recipient, items, externalId }) {
    if (!items || items.length === 0) {
        throw new Error("No items provided for Printful order")
    }

    const response = await printfulApi.post("/orders", {
        external_id: externalId,
        recipient,
        items,
        // confirm: true places the order for production immediately.
        // Leave this OUT (or set to false) while you're still testing,
        // so orders sit as drafts in your Printful dashboard instead of
        // actually going into production/shipping.
        confirm: true,
    })

    return response.data.result
}

module.exports = { createPrintfulOrder }
