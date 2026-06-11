const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://ashandsha.com';

const PRODUCTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf-8'));

app.use(compression());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const CATEGORIES = [...new Set(PRODUCTS.map(p => p.category))];

app.locals.SITE_URL = SITE_URL;
app.locals.year = new Date().getFullYear();

app.get('/', (req, res) => {
  const featured = PRODUCTS.slice(0, 4);
  res.render('index', {
    title: 'Ash & Sha — Clever 3D Printed Goods, Made in Alberta',
    description: 'Small-batch 3D printed home goods, organizers, and accessibility tools — designed and made to order in Fort McMurray, Alberta, Canada.',
    path: '',
    active: 'home',
    featured,
  });
});

app.get('/shop', (req, res) => {
  const category = req.query.category || 'all';
  const products = category === 'all'
    ? PRODUCTS
    : PRODUCTS.filter(p => p.category === category);
  res.render('shop', {
    title: 'Shop All Products',
    description: 'Browse our full collection of small-batch 3D printed home goods, organizers, and accessibility tools.',
    path: 'shop',
    active: 'shop',
    products,
    categories: CATEGORIES,
    activeCategory: category,
  });
});

app.get('/product/:id', (req, res) => {
  const product = PRODUCTS.find(p => p.id === req.params.id);
  if (!product) return res.status(404).render('404', { title: 'Not Found', description: 'Page not found', path: '404', active: '' });
  const related = PRODUCTS.filter(p => p.id !== product.id && p.category === product.category).slice(0, 3);
  const fallback = PRODUCTS.filter(p => p.id !== product.id).slice(0, 3);
  res.render('product', {
    title: product.name,
    description: product.short,
    path: `product/${product.id}`,
    active: 'shop',
    product,
    related: related.length ? related : fallback,
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title: 'Our Story',
    description: 'Meet Ash & Sha — a home-based 3D printing studio in Fort McMurray, Alberta, designing clever everyday tools printed one layer at a time.',
    path: 'about',
    active: 'about',
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us',
    description: 'Get in touch with Ash & Sha — questions, custom orders, and wholesale inquiries welcome.',
    path: 'contact',
    active: 'contact',
  });
});

app.post('/contact', (req, res) => {
  // Placeholder handler — wire up to email service later
  res.render('contact', {
    title: 'Contact Us',
    description: 'Get in touch with Ash & Sha — questions, custom orders, and wholesale inquiries welcome.',
    path: 'contact',
    active: 'contact',
    submitted: true,
  });
});

app.get('/sitemap.xml', (req, res) => {
  const staticPaths = ['', 'shop', 'about', 'contact'];
  const productPaths = PRODUCTS.map(p => `product/${p.id}`);
  const urls = [...staticPaths, ...productPaths].map(p => `  <url><loc>${SITE_URL}/${p}</loc></url>`).join('\n');
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found', description: 'Page not found', path: '404', active: '' });
});

app.listen(PORT, () => {
  console.log(`Ash & Sha running on port ${PORT}`);
});
