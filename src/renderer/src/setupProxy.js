const { createProxyMiddleware } = require('http-proxy-middleware');
const { API_BASE_URL } = require('./config/apiConfig');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: API_BASE_URL,
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding to the target
      },
      onProxyReq: (proxyReq, req, res) => {
        // 添加用户要求的 Cookie
        proxyReq.setHeader('Cookie', 'server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C');
      },
    })
  );
  
  // Proxy video endpoints directly
  app.use(
    '/video',
    createProxyMiddleware({
      target: API_BASE_URL,
      changeOrigin: true,
    })
  );
  
  // Proxy user endpoints directly
  app.use(
    '/user',
    createProxyMiddleware({
      target: API_BASE_URL,
      changeOrigin: true,
    })
  );
  
  // Proxy app endpoints directly
  app.use(
    '/app',
    createProxyMiddleware({
      target: API_BASE_URL,
      changeOrigin: true,
    })
  );
  
  // Proxy ping endpoint directly
  app.use(
    '/ping',
    createProxyMiddleware({
      target: API_BASE_URL,
      changeOrigin: true,
    })
  );
  
  // Proxy images from vip.dytt-img.com to avoid CORS issues
  app.use(
    '/proxy-image',
    createProxyMiddleware({
      target: 'https://vip.dytt-img.com',
      changeOrigin: true,
      pathRewrite: {
        '^/proxy-image': '', // Remove /proxy-image prefix
      },
      onProxyReq: (proxyReq, req, res) => {
        // 移除可能存在的 referer，避免被服务器拒绝
        proxyReq.removeHeader('referer');
        proxyReq.removeHeader('origin');
        // 添加用户要求的 Cookie
        proxyReq.setHeader('Cookie', 'server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C');
      },
      onProxyRes: (proxyRes, req, res) => {
        // 添加 CORS 头，允许跨域访问
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
      },
    })
  );
  
  // Proxy images from img.ffzy888.com to avoid CORS issues
  app.use(
    '/proxy-image-ffzy',
    createProxyMiddleware({
      target: 'https://img.ffzy888.com',
      changeOrigin: true,
      pathRewrite: {
        '^/proxy-image-ffzy': '', // Remove /proxy-image-ffzy prefix
      },
      onProxyReq: (proxyReq, req, res) => {
        // 移除可能存在的 referer，避免被服务器拒绝
        proxyReq.removeHeader('referer');
        proxyReq.removeHeader('origin');
        // 添加用户要求的 Cookie
        proxyReq.setHeader('Cookie', 'server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C');
      },
      onProxyRes: (proxyRes, req, res) => {
        // 添加 CORS 头，允许跨域访问
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
      },
    })
  );
};