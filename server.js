const express = require('express');
const path = require('path');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// Set domain configuration
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

const stripeSecret = process.env.STRIPE_SECRET_KEY || ''; // Set STRIPE_SECRET_KEY in env
if (!stripeSecret) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Checkout will not work until you set it.');
}
const stripe = Stripe(stripeSecret);

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use(express.json());

// Route: home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Optional: product route (so /tournament-entry/p/new-membership-f4s6k works)
app.get('/tournament-entry/p/new-membership-f4s6k', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tournament-entry', 'p', 'new-membership-f4s6k', 'index.html'));
});

// Cart page
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

// Success page
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { cart, successUrl, cancelUrl } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Build line_items for Stripe
    const line_items = cart.map(item => {
      // Stripe expects amounts as integer cents
      const unit_amount = Math.round((item.unitPriceDecimal || item.unitPrice || 0) * 100);
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.productName || item.name || 'Item',
            description: (item.productDescription || '').substring(0, 500),
            images: item.image ? [item.image] : []
          },
          unit_amount: unit_amount
        },
        quantity: item.quantity || 1
      };
    });

    // Add metadata to session for later retrieval in receipt if needed
    const metadata = {
      skylinks_cart: JSON.stringify(cart).substring(0, 5000) // truncated if large
    };

    // Use provided URLs or default to domain-based URLs
    const defaultSuccessUrl = `${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${DOMAIN}/cart`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      metadata,
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Fetch full session details for success.html
app.get('/checkout-session', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer_details']
    });

    res.json(session);

  } catch (err) {
    console.error(err);
    res.json({ error: "Unable to retrieve session." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${DOMAIN}`);
  console.log(`- Home page: ${DOMAIN}/`);
  console.log(`- Cart page: ${DOMAIN}/cart`);
  console.log(`- Success page: ${DOMAIN}/success`);
  console.log(`- Default success URL: ${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`);
  console.log(`- Default cancel URL: ${DOMAIN}/cart`);
});