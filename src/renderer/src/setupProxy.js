const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://124.222.196.128:6660',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding to the target
      },
    })
  );
  
  // Proxy video endpoints directly
  app.use(
    '/video',
    createProxyMiddleware({
      target: 'http://124.222.196.128:6660',
      changeOrigin: true,
    })
  );
  
  // Proxy user endpoints directly
  app.use(
    '/user',
    createProxyMiddleware({
      target: 'http://124.222.196.128:6660',
      changeOrigin: true,
    })
  );
  
  // Proxy app endpoints directly
  app.use(
    '/app',
    createProxyMiddleware({
      target: 'http://124.222.196.128:6660',
      changeOrigin: true,
    })
  );
  
  // Proxy ping endpoint directly
  app.use(
    '/ping',
    createProxyMiddleware({
      target: 'http://124.222.196.128:6660',
      changeOrigin: true,
    })
  );
};