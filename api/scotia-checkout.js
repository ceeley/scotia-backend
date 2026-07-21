const crypto = require('crypto');

module.exports = async (req, res) => {
    // 1. Enable CORS so Framer can make requests to this function
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle browser pre-flight check
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { amount, currency = '780' } = req.body || {}; // 780 = TTD, 840 = USD

        if (!amount) {
            return res.status(400).json({ error: 'Amount is required' });
        }

        // Credentials retrieved securely from Vercel Environment Variables
        const STORE_NAME = process.env.SCOTIA_STORE_ID;
        const SHARED_SECRET = process.env.SCOTIA_SHARED_SECRET;
        const DOMAIN = process.env.SITE_DOMAIN || 'https://yourdomain.com';
        
        // Sandbox URL (Replace via env variable when Scotia gives live production credentials)
        const GATEWAY_URL = process.env.SCOTIA_GATEWAY_URL || "https://test.ipg-online.com/connect/gateway/processing";

        // Timestamp format: YYYY:MM:DD-hh:mm:ss
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const txndatetime = `${now.getFullYear()}:${pad(now.getMonth()+1)}:${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        // 2. Prepare parameter payload
        const params = {
            chargetotal: parseFloat(amount).toFixed(2),
            checkoutoption: 'combinedpage',
            currency: currency,
            hash_algorithm: 'HMACSHA256',
            responseFailURL: `${DOMAIN}/failure`,
            responseSuccessURL: `${DOMAIN}/success`,
            storename: STORE_NAME,
            timezone: 'America/Port_of_Spain',
            txndatetime: txndatetime,
            txntype: 'sale'
        };

        // 3. Sort parameters alphabetically by key (ASCII) & join values with '|'
        const sortedKeys = Object.keys(params).sort();
        const stringToHash = sortedKeys.map(k => params[k]).join('|');

        // 4. Generate HMAC-SHA256 Base64 hash signature
        const hashExtended = crypto.createHmac('sha256', SHARED_SECRET).update(stringToHash).digest('base64');
        params['hashExtended'] = hashExtended;

        // 5. Send payload back to Framer
        return res.status(200).json({ actionUrl: GATEWAY_URL, params });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
