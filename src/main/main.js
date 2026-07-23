const { app, BrowserWindow, ipcMain, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { Transform } = require('stream');

console.log('📦 [主进程] main.js 正在加载...');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;
let videoWindow = null; // 详情窗口（单例）
let playerWindow = null; // 播放窗口（单例）
// 存储当前窗口的视频数据，用于传递给渲染进程
let currentVideoData = null;
let currentPlayerVideoData = null;
let currentVideoWindowTitle = '视频详情';

let pngsucaiCookie = '';

// 获取 pngsucai 的 cookie
const updatePngsucaiCookie = () => {
  console.log('🚀 [主进程] 开始请求 pngsucai 获取 Cookie...');
  try {
    const request = net.request({
      method: 'GET',
      url: 'https://www.pngsucai.com/',
      redirect: 'follow'
    });
    
    // 模拟浏览器头
    request.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');
    request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
    
    request.on('response', (response) => {
      console.log(`📡 [主进程] pngsucai 响应状态码: ${response.statusCode}`);
      const setCookies = response.headers['set-cookie'];
      
      if (setCookies) {
        const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
        const cookieStrings = cookies.map(c => c.split(';')[0]);
        pngsucaiCookie = cookieStrings.join('; ');
        console.log('✅ [主进程] 成功获取 pngsucai Cookie:', pngsucaiCookie);
      } else {
        console.warn('⚠️ [主进程] pngsucai 响应中没有 set-cookie 头部');
        // 打印所有头部以供调试
        console.log('[主进程] 响应头部详情:', JSON.stringify(response.headers));
      }
    });
    
    request.on('error', (err) => {
      console.error('❌ [主进程] 请求 pngsucai 出错:', err.message);
    });
    
    request.end();
  } catch (err) {
    console.error('❌ [主进程] updatePngsucaiCookie 抛出异常:', err);
  }
};

const createWindow = () => {
  console.log('🏁 [主进程] createWindow 函数开始执行...');
  // 初始获取一次 pngsucai 的 cookie
  updatePngsucaiCookie();
  
  // 定期更新 pngsucai 的 cookie (每30分钟)
  setInterval(updatePngsucaiCookie, 30 * 60 * 1000);

  // 配置 session 以支持跨域图片请求
  const ses = session.defaultSession;
  
  // 🔧 开发模式下清除缓存（在应用启动时）
  if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
    ses.clearCache().then(() => {
      console.log('开发模式：已清除缓存');
    }).catch(err => {
      console.error('清除缓存失败:', err);
    });
  }
  
  // 设置请求头，添加用户要求的 Cookie（用于获取头像等图片）
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = {
      ...details.requestHeaders,
    };
    
    // 如果是获取图片的请求，或者到后端服务器的请求，添加指定的 Cookie
    const isImageRequest = /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?.*)?$/i.test(details.url);
    const isBackendRequest = details.url.includes('124.222.196.128');
    
    // Windows 平台：确保 User-Agent 正确设置，避免某些服务器拒绝请求
    if (process.platform === 'win32') {
      if (!requestHeaders['User-Agent']) {
        requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      }
    }
    // 修改识别逻辑：只要是 pngsucai.com 的图片请求，都视为需要注入 Cookie 的头像/素材请求
    const isPngsucaiRequest = details.url.includes('pngsucai.com');
    
    // 如果是 pngsucai 的请求，使用从其主站获取的 cookie
    if (isPngsucaiRequest && pngsucaiCookie) {
      console.log('正在为 pngsucai 请求注入 Cookie:', details.url);
      requestHeaders['Cookie'] = pngsucaiCookie;
      // 必须伪装 Referer 和 Origin 以绕过防盗链
      requestHeaders['Referer'] = 'https://www.pngsucai.com/';
      requestHeaders['Origin'] = 'https://www.pngsucai.com';
      // 添加额外的浏览器模拟头
      requestHeaders['accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
      requestHeaders['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
      requestHeaders['sec-ch-ua'] = '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"';
      requestHeaders['sec-ch-ua-mobile'] = '?0';
      requestHeaders['sec-ch-ua-platform'] = '"macOS"';
      requestHeaders['sec-fetch-dest'] = 'image';
      requestHeaders['sec-fetch-mode'] = 'no-cors';
      requestHeaders['sec-fetch-site'] = 'cross-site';
      requestHeaders['user-agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
    } else if (isImageRequest || isBackendRequest) {
      // 其他图片或后端请求使用默认 Cookie
      requestHeaders['Cookie'] = 'server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C';
    }

    // 🔧 开发模式下，为所有请求添加禁用缓存的头部
    if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
      requestHeaders['Expires'] = '0';
    }
    
    // 如果是豆瓣图片的请求，添加特定的请求头以绕过防盗链
    if (details.url.includes('doubanio')) {
      requestHeaders['Referer'] = 'https://www.douban.com/';
      requestHeaders['Origin'] = 'https://www.douban.com';
      requestHeaders['accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
      requestHeaders['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
      requestHeaders['cache-control'] = 'no-cache';
      requestHeaders['dnt'] = '1';
      requestHeaders['pragma'] = 'no-cache';
      requestHeaders['priority'] = 'u=0, i';
      requestHeaders['sec-ch-ua'] = '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"';
      requestHeaders['sec-ch-ua-mobile'] = '?0';
      requestHeaders['sec-ch-ua-platform'] = '"macOS"';
      requestHeaders['sec-fetch-dest'] = 'image';
      requestHeaders['sec-fetch-mode'] = 'no-cors';
      requestHeaders['sec-fetch-site'] = 'cross-site';
      requestHeaders['user-agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
    }
    
    callback({ requestHeaders: requestHeaders });
  });

  // 设置 CORS 头，允许跨域请求图片和其他资源
  ses.webRequest.onHeadersReceived((details, callback) => {
    // 为所有响应添加 CORS 头
    const responseHeaders = {
      ...details.responseHeaders,
    };
    
    // 移除原有可能冲突的 CORS 头（不区分大小写）
    Object.keys(responseHeaders).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'access-control-allow-origin' || 
          lowerKey === 'access-control-allow-methods' || 
          lowerKey === 'access-control-allow-headers' || 
          lowerKey === 'access-control-allow-credentials' ||
          lowerKey === 'content-security-policy' ||
          lowerKey === 'content-security-policy-report-only') {
        delete responseHeaders[key];
      }
    });

    // 动态获取请求来源 (Origin)
    // 在 onHeadersReceived 中通过 details.referrer 或默认值判断
    let requestOrigin = '*';
    if (details.referrer) {
      try {
        const refUrl = new URL(details.referrer);
        requestOrigin = refUrl.origin;
      } catch (e) {
        requestOrigin = '*';
      }
    }
    
    // 如果无法从 referrer 获取，且是在开发环境，指向本地服务器
    if (requestOrigin === '*' || requestOrigin === 'null') {
      requestOrigin = 'http://localhost:3000'; 
    }

    // 强制注入最宽松的跨域许可
    responseHeaders['Access-Control-Allow-Origin'] = [requestOrigin];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
    responseHeaders['Access-Control-Expose-Headers'] = ['*'];

    // 如果是视频流或特定图片的请求，额外处理
    const isVideoStream = details.url.includes('.m3u8') || details.url.includes('.ts') || details.url.includes('.mp4');
    if (details.url.includes('doubanio') || details.url.includes('pngsucai.com') || isVideoStream) {
      if (isVideoStream) console.log('📽️ 正在为视频流响应注入 CORS 头:', details.url);
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['content-security-policy-report-only'];
      
      // 确保内容类型正确
      if (details.url.includes('.webp')) {
        responseHeaders['Content-Type'] = ['image/webp'];
      } else if (details.url.includes('.m3u8')) {
        responseHeaders['Content-Type'] = ['application/x-mpegURL'];
      } else if (details.url.includes('.ts')) {
        responseHeaders['Content-Type'] = ['video/MP2T'];
      }
    }
    
    callback({
      responseHeaders: responseHeaders,
    });
  });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1450,
    height: 950,
    resizable: false, // 禁用调整窗口大小
    fullscreenable: false, // 禁用全屏功能
    maximizable: false, // 禁用最大化功能
    title: '看视频 - WTV',
    backgroundColor: '#f5f5f5', // 设置背景色，避免白屏闪烁
    autoHideMenuBar: true, // 自动隐藏菜单栏（Windows 和 Linux）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用 webSecurity 以允许跨域图片加载（Electron 桌面应用可以这样做）
      cache: false, // 🔧 禁用缓存，确保开发时所有资源都从服务器获取
    },
  });
  
  // Windows 平台完全禁用菜单栏
  if (process.platform === 'win32') {
    mainWindow.setMenuBarVisibility(false);
  }

  // and load the index.html of the app.
  // 判断是否为开发环境：只有在未打包且明确设置为开发模式时才使用开发服务器
  const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production';
  
  if (isDevelopment) {
    console.log('当前环境变量 NODE_ENV:', process.env.NODE_ENV);
    console.log('加载开发服务器 URL: http://localhost:3000');
    
    // 等待开发服务器就绪
    const waitForServer = async (retries = 10) => {
      for (let i = 0; i < retries; i++) {
        try {
          const http = require('http');
          await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:3000', (res) => {
              resolve();
            });
            req.on('error', reject);
            req.setTimeout(2000, () => {
              req.destroy();
              reject(new Error('Timeout'));
            });
          });
          console.log('开发服务器已就绪');
          break;
        } catch (err) {
          if (i === retries - 1) {
            console.error('开发服务器未就绪，但仍尝试加载');
          } else {
            console.log(`等待开发服务器... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    };
    
    // 加载开发服务器
    const loadDevServer = async () => {
      await waitForServer();
      try {
        // 🔧 清除缓存，确保所有资源都从服务器获取
        const ses = mainWindow.webContents.session;
        await ses.clearCache();
        await ses.clearStorageData();
        console.log('已清除缓存，准备加载开发服务器');
        
        // 🔧 禁用缓存，添加时间戳参数确保每次都是新请求
        const timestamp = Date.now();
        await mainWindow.loadURL(`http://localhost:3000?nocache=${timestamp}`);
        console.log('成功加载开发服务器（已禁用缓存）');
      } catch (err) {
        console.error('加载开发服务器失败:', err);
        // 显示错误页面
        mainWindow.loadURL('data:text/html,<html><body style="font-family: Arial; padding: 20px;"><h1>无法连接到开发服务器</h1><p>请确保 React 开发服务器正在运行 (npm run react-dev)</p><p>错误: ' + err.message + '</p></body></html>');
      }
    };
    
    loadDevServer();
    mainWindow.webContents.openDevTools();
  } else {
    console.log('当前环境变量 NODE_ENV:', process.env.NODE_ENV);
    console.log('是否为打包版本:', app.isPackaged);
    
    // 在生产环境中，使用 app.getAppPath() 获取应用路径
    const appPath = app.getAppPath();
    console.log('App path:', appPath);
    console.log('__dirname:', __dirname);
    
    let indexPath;
    
    // electron-builder 打包后的结构：
    // - resources/app.asar (包含所有源代码)
    // - 或者 resources/app (未打包版本)
    if (app.isPackaged) {
      // 打包后的应用，文件在 app.asar 中
      // 路径应该是：app.asar/src/renderer/build/index.html
      indexPath = path.join(appPath, 'src', 'renderer', 'build', 'index.html');
      
      // 如果上面的路径不存在，尝试其他可能的路径
      const fs = require('fs');
      if (!fs.existsSync(indexPath)) {
        // 尝试：app.asar/renderer/build/index.html
        indexPath = path.join(appPath, 'renderer', 'build', 'index.html');
      }
      if (!fs.existsSync(indexPath)) {
        // 尝试：app.asar/build/index.html
        indexPath = path.join(appPath, 'build', 'index.html');
      }
    } else {
      // 开发环境，使用相对路径
      indexPath = path.join(__dirname, '..', 'renderer', 'build', 'index.html');
    }
    
    console.log('Loading file:', indexPath);
    
    // 检查文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(indexPath)) {
      console.error('文件不存在:', indexPath);
      // 列出可能的路径
      console.log('尝试查找 index.html...');
      const possiblePaths = [
        path.join(appPath, 'src', 'renderer', 'build', 'index.html'),
        path.join(appPath, 'renderer', 'build', 'index.html'),
        path.join(appPath, 'build', 'index.html'),
        path.join(__dirname, '..', 'renderer', 'build', 'index.html'),
      ];
      for (const p of possiblePaths) {
        console.log('检查路径:', p, fs.existsSync(p) ? '存在' : '不存在');
        if (fs.existsSync(p)) {
          indexPath = p;
          break;
        }
      }
    }
    
    console.log('Index path:', indexPath);
    console.log('Platform:', process.platform);
    console.log('isPackaged:', app.isPackaged);
    console.log('App path:', appPath);
    
    // 获取 index.html 所在的目录，用于解析相对路径的资源文件
    const buildDir = path.dirname(indexPath);
    console.log('Build directory:', buildDir);
    
    // 优先使用 loadFile，它能正确处理相对路径和 asar 文件
    // loadFile 会自动设置正确的 base URL，使 index.html 中的相对路径资源能正确加载
    console.log('Loading with loadFile (recommended for relative paths)...');
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load with loadFile:', err);
      console.error('尝试的路径:', indexPath);
      
      // 如果 loadFile 失败，尝试使用 loadURL 作为备用
      console.log('Trying with loadURL as fallback...');
    
    // 构建正确的 file:// URL
    let fileUrl;
    if (process.platform === 'win32') {
      // Windows 路径处理：file:///C:/path/to/file
        // 将反斜杠转换为正斜杠，保留冒号（Windows 驱动器号需要冒号）
        const normalizedPath = indexPath.replace(/\\/g, '/');
        // Windows 路径需要以 file:/// 开头
        // 对于 asar 文件，路径格式：file:///C:/path/to/app.asar/src/renderer/build/index.html
        fileUrl = `file:///${normalizedPath}`;
    } else {
      // macOS/Linux 路径处理：file:///path/to/file
      // 对于 asar 文件，路径应该是：file:///path/to/app.asar/src/renderer/build/index.html
      fileUrl = `file://${indexPath}`;
    }
    
      console.log('Trying URL:', fileUrl);
      mainWindow.loadURL(fileUrl).catch(err2 => {
        console.error('Failed to load with loadURL:', err2);
        // 显示错误页面，包含调试信息
        const errorHtml = `
          <html>
            <body style="font-family: Arial; padding: 20px;">
              <h1>无法加载应用</h1>
              <p>请检查应用文件是否完整</p>
              <p><strong>loadFile 错误:</strong> ${err.message}</p>
              <p><strong>loadURL 错误:</strong> ${err2.message}</p>
              <p><strong>App Path:</strong> ${appPath}</p>
              <p><strong>尝试的路径:</strong> ${indexPath}</p>
              <p><strong>尝试的 URL:</strong> ${fileUrl || 'N/A'}</p>
              <p><strong>__dirname:</strong> ${__dirname}</p>
              <p><strong>isPackaged:</strong> ${app.isPackaged}</p>
              <p><strong>Platform:</strong> ${process.platform}</p>
            </body>
          </html>
        `;
        mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
      });
    });
    
    // 生产环境不启用开发者工具
    // 如果需要调试，可以通过环境变量控制
    if (process.env.ENABLE_DEVTOOLS === 'true' || (!app.isPackaged && process.env.NODE_ENV === 'development')) {
      mainWindow.webContents.openDevTools();
    }
    
    // 监听资源加载失败事件（仅在开发环境或调试模式下输出详细日志）
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        // 只记录非主框架的资源加载失败（如 CSS、JS 文件）
        // 生产环境只记录错误，不输出详细调试信息
        if (!app.isPackaged || process.env.DEBUG === 'true') {
          console.error(`资源加载失败 (${errorCode}):`, errorDescription, validatedURL);
          
          // 对于 logo.svg 等静态资源，尝试修复路径
          if (validatedURL && validatedURL.includes('logo.svg')) {
            console.warn('logo.svg 加载失败，尝试查找文件...');
            const fs = require('fs');
            const buildDir = path.dirname(indexPath);
            const logoPath = path.join(buildDir, 'logo.svg');
            console.log('检查 logo.svg 路径:', logoPath, fs.existsSync(logoPath) ? '存在' : '不存在');
          }
        } else {
          // 生产环境只记录关键错误
          console.error(`资源加载失败: ${errorDescription}`);
        }
      } else {
        // 主框架加载失败（重要错误，始终记录）
        console.error(`主页面加载失败 (${errorCode}):`, errorDescription, validatedURL);
      }
    });
    
    // 监听页面加载完成事件
    mainWindow.webContents.on('did-finish-load', () => {
      if (!app.isPackaged || process.env.DEBUG === 'true') {
        console.log('页面加载完成');
        // 检查页面是否有内容（仅在开发环境或调试模式）
        mainWindow.webContents.executeJavaScript(`
          (function() {
            const root = document.getElementById('root');
            // 检查静态资源是否加载
            const scripts = Array.from(document.querySelectorAll('script'));
            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            const failedResources = [];
            
            scripts.forEach(script => {
              if (script.src && !script.src.startsWith('data:')) {
                // 检查脚本是否加载成功（简单检查）
                if (!script.textContent && script.src.includes('static')) {
                  failedResources.push('Script: ' + script.src);
                }
              }
            });
            
            styles.forEach(link => {
              if (link.href && link.href.includes('static')) {
                // 检查样式表是否加载（通过检查是否应用了样式）
                const testEl = document.createElement('div');
                testEl.className = 'test-style-check';
                document.body.appendChild(testEl);
                const computedStyle = window.getComputedStyle(testEl);
                // 简单的检查方式
              }
            });
            
            if (!root || root.innerHTML.trim() === '') {
              console.error('页面 root 元素为空');
              return { 
                error: 'root element is empty', 
                html: document.documentElement.innerHTML.substring(0, 500),
                failedResources: failedResources,
                scripts: scripts.map(s => s.src || s.textContent.substring(0, 50)),
                styles: styles.map(l => l.href)
              };
            }
            return { 
              success: true, 
              rootContent: root.innerHTML.substring(0, 200),
              failedResources: failedResources
            };
          })();
        `).then(result => {
          if (result.error) {
            console.error('页面渲染错误:', result);
            if (result.failedResources && result.failedResources.length > 0) {
              console.error('加载失败的资源:', result.failedResources);
            }
          } else {
            if (!app.isPackaged || process.env.DEBUG === 'true') {
              console.log('页面渲染成功:', result);
            }
          }
        }).catch(err => {
          console.error('检查页面渲染时出错:', err);
        });
      }
    });
  }

  // Handle window events
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
  
  // 添加错误处理
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load page:', errorCode, errorDescription, validatedURL);
    if (errorCode === -105 || errorCode === -106) {
      // 网络错误或连接被拒绝
      console.error('无法连接到服务器，请检查开发服务器是否运行');
    }
  });
  
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer process crashed:', killed);
  });
  
  // 添加控制台消息监听
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelMap = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };
    console.log(`[Renderer ${levelMap[level] || 'LOG'}]`, message);
  });
  
  // 监听未捕获的异常
  mainWindow.webContents.on('unresponsive', () => {
    console.error('页面无响应');
  });
  
  mainWindow.webContents.on('responsive', () => {
    console.log('页面恢复响应');
  });
  
  // 禁用刷新功能：拦截 F5 和 Ctrl+R / Cmd+R
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // 拦截 F5 刷新
    if (input.key === 'F5') {
      event.preventDefault();
      return;
    }
    
    // 拦截 Ctrl+R (Windows/Linux) 或 Cmd+R (macOS)
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      return;
    }
  });
  
  // 禁用右键菜单中的刷新选项
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Windows 平台：处理应用退出，确保可以正常关闭以便更新安装
app.on('before-quit', (event) => {
  // 在 Windows 平台，允许应用正常退出
  // 不阻止退出，确保覆盖安装时可以关闭应用
  if (process.platform === 'win32') {
    // 确保所有窗口都关闭
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
  }
});

// Windows 平台：处理应用退出事件
app.on('will-quit', (event) => {
  // 在 Windows 平台，允许应用正常退出
  // 不阻止退出，确保覆盖安装时可以关闭应用
  if (process.platform === 'win32') {
    // 不阻止退出
    return;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 获取内部版本号（大版本号 + 打包日期），格式如 1.0.1-20260306
ipcMain.handle('get-internal-version', () => {
  try {
    let packageJsonPath;
    if (app.isPackaged) {
      packageJsonPath = path.join(app.getAppPath(), 'package.json');
    } else {
      const candidates = [
        path.join(__dirname, '..', '..', 'package.json'),
        path.join(process.cwd(), 'package.json'),
      ];
      packageJsonPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
    }
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = pkg.version || app.getVersion();
    const buildDate = pkg.buildDate || '';
    return buildDate ? `${version}-${buildDate}` : version;
  } catch (err) {
    return app.getVersion();
  }
});

// 获取 VersionCode（用于版本检测和升级）
ipcMain.handle('get-version-code', () => {
  try {
    // 尝试从应用路径读取 package.json
    let packageJsonPath;
    if (app.isPackaged) {
      // 打包后的应用，package.json 在 app.asar 中
      packageJsonPath = path.join(app.getAppPath(), 'package.json');
    } else {
      // 开发环境，尝试多个可能的路径
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'package.json'),
        path.join(__dirname, '..', 'package.json'),
        path.join(process.cwd(), 'package.json')
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          packageJsonPath = p;
          break;
        }
      }
      
      // 如果都找不到，回退到第一个
      if (!packageJsonPath) {
        packageJsonPath = possiblePaths[0];
      }
    }
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent);
      return packageJson.versionCode || 1;
    }
    throw new Error('package.json not found');
  } catch (error) {
    console.error('读取 VersionCode 失败:', error.message);
    // 降级处理：尝试直接使用 require
    try {
      // 使用动态路径
      const packageJson = require('../../package.json');
      return packageJson.versionCode || 1;
    } catch (err) {
      return 1; // 默认返回 1
    }
  }
});

// 获取平台信息（用于更新检查）
ipcMain.handle('get-platform', () => {
  const platform = process.platform;
  const arch = process.arch;
  
  console.log('获取平台信息 - platform:', platform, 'arch:', arch);
  
  // 根据平台和架构返回对应的字符串
  if (platform === 'darwin') {
    // Mac 平台：区分 ARM 和 Intel
    // arm64 = Apple Silicon (M1/M2/M3 等)
    // x64 = Intel Mac
    if (arch === 'arm64') {
      const result = 'DeskTop-Mac-ARM';
      console.log('返回平台:', result);
      return result;
    } else {
      // x64 或其他架构都视为 Intel Mac
      const result = 'DeskTop-Mac-Intel';
      console.log('返回平台:', result);
      return result;
    }
  } else if (platform === 'win32') {
    const result = 'DeskTop-Win';
    console.log('返回平台:', result);
    return result;
  } else {
    // Linux 或其他平台，默认返回 DeskTop-Mac-Intel（可以根据需要调整）
    const result = 'DeskTop-Mac-Intel';
    console.log('返回平台（默认）:', result);
    return result;
  }
});

// 渲染进程播放调试日志 → 主进程终端（npm run dev 里 [1] electron 那路可见）
ipcMain.on('wtv-renderer-log', (event, tag, payload) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const title = win?.getTitle?.() || '';
    const extra = payload !== undefined && payload !== null
      ? (typeof payload === 'string' ? payload : JSON.stringify(payload))
      : '';
    console.log('[WTV_PLAY_LOG]', tag, title || '(no-title)', extra);
  } catch (_) {
    console.log('[WTV_PLAY_LOG]', tag, payload);
  }
});

// 在外部浏览器中打开 URL
ipcMain.handle('open-external', (event, url) => {
  const { shell } = require('electron');
  return shell.openExternal(url);
});

// 创建新窗口打开指定页面
ipcMain.handle('open-page-window', (event, pagePath, title) => {
  const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production';
  
  let pageWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    resizable: false, // 禁用调整窗口大小
    fullscreenable: false, // 禁用全屏功能
    maximizable: false, // 禁用最大化功能
    title: title || 'WTV',
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      session: session.defaultSession,
    },
  });

  if (process.platform === 'win32') {
    pageWindow.setMenuBarVisibility(false);
  }

  if (isDevelopment) {
    const url = `http://localhost:3000/#${pagePath}?newWindow=true`;
    pageWindow.loadURL(url);
  } else {
    const appPath = app.getAppPath();
    let indexPath = path.join(appPath, 'src', 'renderer', 'build', 'index.html');
    
    // 生产环境路径兼容逻辑
    const fs = require('fs');
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(appPath, 'renderer', 'build', 'index.html');
    }
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(appPath, 'build', 'index.html');
    }

    pageWindow.loadFile(indexPath).then(() => {
      pageWindow.webContents.executeJavaScript(`window.location.hash = '#${pagePath}?newWindow=true';`);
    });
  }

  return pageWindow.id;
});

// 创建新窗口打开视频详情页（只保留一个窗口）
ipcMain.handle('open-video-window', (event, videoId, videoData) => {
  // 判断是否为开发环境
  const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production';
  
  // 如果视频窗口已存在且未被销毁，更新内容而不是创建新窗口
  if (videoWindow && !videoWindow.isDestroyed()) {
    // 保存视频数据，供渲染进程通过 IPC 获取
    currentVideoData = videoData;
    
    // 更新窗口标题（使用纯视频标题，不带前缀）
    const newTitle = videoData?.title || '视频详情';
    currentVideoWindowTitle = newTitle;
    videoWindow.setTitle(newTitle);
    // 聚焦窗口
    videoWindow.focus();
    
    // 更新 URL 到新的视频
    if (isDevelopment) {
      // 开发环境：直接加载新的 URL
      const videoUrl = `http://localhost:3000/#/video/${videoId}?newWindow=true`;
      videoWindow.loadURL(videoUrl);
    } else {
      // 生产环境：更新 hash
      videoWindow.webContents.executeJavaScript(`window.location.hash = '#/video/${videoId}?newWindow=true';`);
    }
    
    return videoWindow.id;
  }
  
  // 保存视频数据，供渲染进程通过 IPC 获取
  currentVideoData = videoData;
  currentVideoWindowTitle = videoData?.title || '视频详情';
  
  // 创建新窗口（比主窗口小，不显示导航栏）
  // 使用视频标题（如果有），避免显示默认的 "看视频 - WTV"
  const initialTitle = videoData?.title || '视频详情';
  videoWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    resizable: false, // 禁用调整窗口大小
    fullscreenable: true, // 允许视频播放器全屏（HTML5 视频全屏需要此选项）
    maximizable: false, // 禁用最大化功能
    title: initialTitle,
    backgroundColor: '#f5f5f5', // 设置背景色，避免白屏闪烁
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      session: session.defaultSession, // 共享 session，保持登录状态
    },
  });
  
  // Windows 平台完全禁用菜单栏
  if (process.platform === 'win32') {
    videoWindow.setMenuBarVisibility(false);
  }

  // 监听窗口全屏事件，允许视频播放器全屏
  // HTML5 视频全屏需要 fullscreenable: true
  // 注意：当 HTML5 视频元素进入全屏时，Electron 窗口不应该跟随进入全屏
  // 我们只在视频元素退出全屏时确保窗口状态正确
    videoWindow.on('enter-full-screen', () => {
      console.log('窗口进入全屏模式');
      // 允许窗口全屏，不再检测 HTML5 视频元素
      // HTML5 视频元素的全屏由浏览器自己处理
    });

  videoWindow.on('leave-full-screen', () => {
    console.log('窗口退出全屏模式');
    // 确保窗口状态正确
    if (videoWindow && !videoWindow.isDestroyed()) {
      // 如果窗口仍然处于全屏状态，强制退出
      if (videoWindow.isFullScreen()) {
        console.log('窗口仍在全屏状态，强制退出');
        videoWindow.setFullScreen(false);
      }
    }
  });
  
  // 窗口关闭时清空引用并停止标题检查
  videoWindow.on('closed', () => {
    stopTitleCheck();
    videoWindow = null;
    currentVideoData = null; // 窗口关闭时清除视频数据
  });
  
  const getExpectedVideoTitle = () => currentVideoWindowTitle || currentVideoData?.title || '视频详情';
  const applyExpectedVideoTitle = () => {
    const expectedTitle = getExpectedVideoTitle();
    if (!videoWindow || videoWindow.isDestroyed()) {
      return;
    }
    videoWindow.setTitle(expectedTitle);
    videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(expectedTitle)};`).catch(() => {});
  };
  
  // 使用定时器持续检查和修正标题，直到页面完全加载
  let titleCheckInterval = null;
  const startTitleCheck = () => {
    if (titleCheckInterval) {
      clearInterval(titleCheckInterval);
    }
    titleCheckInterval = setInterval(() => {
      if (videoWindow && !videoWindow.isDestroyed()) {
        const expectedTitle = getExpectedVideoTitle();
        const currentTitle = videoWindow.getTitle();
        if (currentTitle !== expectedTitle && currentTitle.includes('看视频')) {
          applyExpectedVideoTitle();
        }
      }
    }, 50); // 每50ms检查一次
  };
  
  const stopTitleCheck = () => {
    if (titleCheckInterval) {
      clearInterval(titleCheckInterval);
      titleCheckInterval = null;
    }
  };
  
  // 在页面开始加载时就设置标题，避免闪烁
  videoWindow.webContents.on('did-start-loading', () => {
    applyExpectedVideoTitle();
    startTitleCheck(); // 开始检查标题
  });
  
  // 在 DOM 准备就绪时立即修改 document.title，防止 HTML title 标签生效
  videoWindow.webContents.on('dom-ready', () => {
    applyExpectedVideoTitle();
  });
  
  // 监听页面标题更新，始终阻止并使用视频标题
  videoWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    applyExpectedVideoTitle();
  });
  
  // 在页面加载完成后，再次确保标题正确，然后停止检查
  videoWindow.webContents.on('did-finish-load', () => {
    applyExpectedVideoTitle();
    // 延迟停止检查，确保标题稳定
    setTimeout(() => {
      stopTitleCheck();
    }, 500);
  });
  
  // 为新窗口添加刷新屏蔽功能（与主窗口保持一致）
  // 禁用刷新功能：拦截 F5 和 Ctrl+R / Cmd+R
  videoWindow.webContents.on('before-input-event', (event, input) => {
    // 拦截 F5 刷新
    if (input.key === 'F5') {
      event.preventDefault();
      return;
    }
    
    // 拦截 Ctrl+R (Windows/Linux) 或 Cmd+R (macOS)
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      return;
    }
  });
  
  // 禁用右键菜单中的刷新选项
  videoWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
  
  if (isDevelopment) {
    // 开发环境：加载开发服务器 URL，添加 newWindow 参数标识这是新窗口
    const videoUrl = `http://localhost:3000/#/video/${videoId}?newWindow=true`;
    // 在加载前确保标题已设置
    applyExpectedVideoTitle();
    videoWindow.loadURL(videoUrl);
    // 页面加载完成后，将 videoData 存储到 sessionStorage，供渲染进程使用
    videoWindow.webContents.once('did-finish-load', () => {
      if (videoData) {
        videoWindow.webContents.executeJavaScript(`
          if (window.sessionStorage) {
            window.sessionStorage.setItem('videoData_${videoId}', ${JSON.stringify(videoData)});
          }
        `).catch(err => console.error('存储 videoData 失败:', err));
      }
    });
    videoWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的文件
    const appPath = app.getAppPath();
    let indexPath;
    
    if (app.isPackaged) {
      indexPath = path.join(appPath, 'src', 'renderer', 'build', 'index.html');
      const fs = require('fs');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(appPath, 'renderer', 'build', 'index.html');
      }
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(appPath, 'build', 'index.html');
      }
    } else {
      indexPath = path.join(__dirname, '..', 'renderer', 'build', 'index.html');
    }
    
    // 在加载前确保标题已设置
    applyExpectedVideoTitle();
    // 使用 loadFile 加载，然后设置 hash，添加 newWindow 参数标识这是新窗口
    videoWindow.loadFile(indexPath).then(() => {
      // 加载完成后设置 hash
      videoWindow.webContents.executeJavaScript(`window.location.hash = '#/video/${videoId}?newWindow=true';`);
      // 确保标题正确（可能在 loadFile 后被 HTML title 覆盖）
      applyExpectedVideoTitle();
    }).catch(err => {
      console.error('加载视频详情页失败:', err);
    });
  }
  
  return videoWindow.id;
});

// 创建新窗口打开视频播放页（只保留一个播放窗口）
ipcMain.handle('open-player-window', (event, videoId, videoData, episodeNumber) => {
  const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production';
  const finalEpisodeNumber = episodeNumber || videoData?.autoPlayEpisode || '';
  /** 从播放记录续播：由渲染进程读取 playHistory 做带进度续播，勿在 URL 上加 autoplayEpisode（否则会先无进度连播，与续播逻辑冲突） */
  const resumeFromPlayHistory = !!(videoData && videoData.playHistory);
  const queryParts = ['newWindow=true', 'playerWindow=true', 'autoplay=true'];
  if (resumeFromPlayHistory) {
    queryParts.push('fromPlayHistory=true');
  }
  if (
    !resumeFromPlayHistory &&
    finalEpisodeNumber !== '' &&
    finalEpisodeNumber !== null &&
    finalEpisodeNumber !== undefined
  ) {
    queryParts.push(`autoplayEpisode=${encodeURIComponent(finalEpisodeNumber)}`);
  }
  // 强制每次打开都变更 search，避免播放窗已在同一 hash 时 React 不刷新视频信息
  queryParts.push(`_ts=${Date.now()}`);
  const query = queryParts.join('&');

  const storedAutoPlayEpisode = resumeFromPlayHistory
    ? (videoData.playHistory.episode != null && videoData.playHistory.episode !== ''
        ? videoData.playHistory.episode
        : null)
    : (finalEpisodeNumber || null);

  if (playerWindow && !playerWindow.isDestroyed()) {
    currentPlayerVideoData = {
      ...(videoData || {}),
      autoPlayEpisode: storedAutoPlayEpisode,
    };

    const newTitle = videoData?.title ? `${videoData.title} - 播放` : '视频播放';
    playerWindow.setTitle(newTitle);
    if (playerWindow.isMinimized()) {
      playerWindow.restore();
    }
    if (!playerWindow.isVisible()) {
      playerWindow.show();
    }
    playerWindow.focus();

    if (isDevelopment) {
      playerWindow.loadURL(`http://localhost:3000/#/video/${videoId}?${query}`);
    } else {
      playerWindow.webContents.executeJavaScript(`window.location.hash = '#/video/${videoId}?${query}';`);
    }

    return playerWindow.id;
  }

  currentPlayerVideoData = {
    ...(videoData || {}),
    autoPlayEpisode: storedAutoPlayEpisode,
  };

  const initialTitle = videoData?.title ? `${videoData.title} - 播放` : '视频播放';
  playerWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    resizable: false,
    fullscreenable: true,
    maximizable: false,
    title: initialTitle,
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      session: session.defaultSession,
    },
  });

  if (process.platform === 'win32') {
    playerWindow.setMenuBarVisibility(false);
  }

  playerWindow.on('closed', () => {
    playerWindow = null;
    currentPlayerVideoData = null;
  });

  playerWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5') {
      event.preventDefault();
      return;
    }

    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      return;
    }
  });

  playerWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  if (isDevelopment) {
    playerWindow.loadURL(`http://localhost:3000/#/video/${videoId}?${query}`);
  } else {
    const appPath = app.getAppPath();
    let indexPath;

    if (app.isPackaged) {
      indexPath = path.join(appPath, 'src', 'renderer', 'build', 'index.html');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(appPath, 'renderer', 'build', 'index.html');
      }
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(appPath, 'build', 'index.html');
      }
    } else {
      indexPath = path.join(__dirname, '..', 'renderer', 'build', 'index.html');
    }

    playerWindow.loadFile(indexPath).then(() => {
      playerWindow.webContents.executeJavaScript(`window.location.hash = '#/video/${videoId}?${query}';`);
    }).catch(err => {
      console.error('加载视频播放页失败:', err);
    });
  }

  if (!playerWindow.isVisible()) {
    playerWindow.show();
  }
  playerWindow.focus();

  return playerWindow.id;
});

// 更新视频窗口标题
ipcMain.handle('update-video-window-title', (event, title) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow && !senderWindow.isDestroyed()) {
    if (videoWindow && !videoWindow.isDestroyed() && senderWindow.id === videoWindow.id) {
      currentVideoWindowTitle = title;
    }
    senderWindow.setTitle(title);
    senderWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(title)};`).catch(() => {});
    return true;
  }
  return false;
});

// 播放窗切集 → 同步到后台详情窗 / 主窗口，保持选中集一致
ipcMain.on('player-episode-changed', (event, payload) => {
  const { videoId, episodeNumber } = payload || {};
  if (videoId === undefined || videoId === null || episodeNumber === undefined || episodeNumber === null) {
    return;
  }
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win || win.isDestroyed()) return;
    if (win.webContents === event.sender) return;
    win.webContents.send('player-episode-changed', { videoId, episodeNumber });
  });
});

// 获取当前视频窗口的视频数据
ipcMain.handle('get-video-data', (event) => {
  if (videoWindow && !videoWindow.isDestroyed() && event.sender === videoWindow.webContents) {
    return currentVideoData;
  }
  if (playerWindow && !playerWindow.isDestroyed() && event.sender === playerWindow.webContents) {
    return currentPlayerVideoData;
  }
  return null;
});

// 安全删除文件的辅助函数
const safeUnlinkSync = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('删除文件失败:', filePath, error.message);
  }
};

// 下载更新文件
ipcMain.handle('download-update', async (event, downloadUrl, fileName) => {
  return new Promise((resolve, reject) => {
    try {
      // 确定下载目录（用户下载目录）
      const userDataPath = app.getPath('downloads');
      const filePath = path.join(userDataPath, fileName || `update-${Date.now()}.exe`);
      
      console.log('开始下载更新文件:', downloadUrl);
      console.log('保存路径:', filePath);
      
      // 获取发送请求的窗口
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const targetWindow = senderWindow || mainWindow;
      
      // 选择使用 http 或 https
      const urlObj = new URL(downloadUrl);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      // 创建文件写入流，设置更大的缓冲区以提高性能
      const file = fs.createWriteStream(filePath, {
        highWaterMark: 1024 * 1024 * 2 // 2MB 缓冲区，提高写入性能
      });
      
      let downloadedBytes = 0;
      let totalBytes = 0;
      let lastUpdateTime = Date.now();
      let lastDownloadedBytes = 0;
      let lastProgressUpdateTime = Date.now();
      let isCompleted = false;
      
      // 监听文件写入完成事件
      file.on('finish', () => {
        if (!isCompleted) {
          isCompleted = true;
          console.log('文件写入完成:', filePath);
          // 验证文件是否存在且有内容
          try {
            const stats = fs.statSync(filePath);
            if (stats.size > 0) {
              resolve({
                success: true,
                filePath: filePath,
                totalBytes: stats.size
              });
            } else {
              reject(new Error('下载的文件为空'));
            }
          } catch (err) {
            reject(new Error('无法验证下载文件: ' + err.message));
          }
        }
      });
      
      // 配置请求选项，优化下载性能
      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        },
        timeout: 30000, // 30秒超时
        agent: false // 不使用代理，直接连接
      };
      
      const request = client.get(downloadUrl, requestOptions, (response) => {
        // 检查响应状态码
        if (response.statusCode !== 200) {
          file.destroy();
          safeUnlinkSync(filePath);
          reject(new Error(`下载失败，HTTP 状态码: ${response.statusCode}`));
          return;
        }
        
        // 获取文件总大小
        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        
        console.log('文件总大小:', totalBytes, 'bytes');
        
        // 如果没有 Content-Length，无法显示进度，但仍然可以下载
        if (totalBytes === 0) {
          console.warn('服务器未提供 Content-Length，无法显示准确进度');
        }
        
        // 直接监听数据流，减少 Transform 流的开销，提高下载速度
        // 使用 response.on('data') 直接处理数据，然后写入文件
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          
          // 异步写入文件，不阻塞数据接收
          if (!file.write(chunk)) {
            // 如果缓冲区已满，暂停响应流
            response.pause();
            file.once('drain', () => {
              response.resume();
            });
          }
          
          // 计算下载速度（每0.5秒更新一次）
          const now = Date.now();
          const timeDiff = (now - lastUpdateTime) / 1000; // 秒
          let speed = 0;
          
          // 只在0.5秒间隔时计算和更新速度
          if (timeDiff >= 0.5) {
            speed = (downloadedBytes - lastDownloadedBytes) / timeDiff;
            lastUpdateTime = now;
            lastDownloadedBytes = downloadedBytes;
          }
          
          // 节流：每0.5秒发送一次进度更新，避免闪烁
          // 但如果接近完成（>95%），立即更新以确保显示100%
          const progressUpdateInterval = 500; // 500毫秒 = 0.5秒
          const timeSinceLastProgressUpdate = now - lastProgressUpdateTime;
          const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
          
          // 如果进度接近完成（>95%）或超过更新间隔，发送进度更新
          if (progress >= 95 || timeSinceLastProgressUpdate >= progressUpdateInterval) {
            // 发送进度更新到渲染进程
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('download-progress', {
                progress: Math.min(progress, 100),
                downloaded: downloadedBytes,
                total: totalBytes,
                speed: speed // 只在速度更新时发送新速度，否则发送0
              });
            }
            lastProgressUpdateTime = now;
          }
        });
        
        // 监听响应结束（数据流结束）
        response.on('end', () => {
          console.log('响应流结束，已下载:', downloadedBytes, 'bytes');
          
          // 发送最终进度更新（100%）
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('download-progress', {
              progress: 100,
              downloaded: downloadedBytes,
              total: totalBytes,
              speed: 0
            });
          }
          
          // 结束文件写入流，触发 file.on('finish') 事件
          file.end();
          // 不在这里 resolve，等待 file.on('finish') 事件
        });
        
        // 监听错误
        response.on('error', (error) => {
          if (!isCompleted) {
            isCompleted = true;
            file.destroy();
            safeUnlinkSync(filePath); // 删除不完整的文件
            console.error('下载响应错误:', error);
            reject(error);
          }
        });
      });
      
      // 监听请求错误
      request.on('error', (error) => {
        if (!isCompleted) {
          isCompleted = true;
          file.destroy();
          safeUnlinkSync(filePath); // 删除不完整的文件
          console.error('下载请求错误:', error);
          reject(error);
        }
      });
      
      // 监听文件写入错误
      file.on('error', (error) => {
        if (!isCompleted) {
          isCompleted = true;
          request.destroy();
          safeUnlinkSync(filePath); // 删除不完整的文件
          console.error('文件写入错误:', error);
          reject(error);
        }
      });
      
      // 设置超时（30分钟）
      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          request.destroy();
          file.destroy();
          safeUnlinkSync(filePath);
          reject(new Error('下载超时'));
        }
      }, 30 * 60 * 1000);
      
      // 清理超时
      file.on('finish', () => clearTimeout(timeout));
      file.on('error', () => clearTimeout(timeout));
      request.on('error', () => clearTimeout(timeout));
      
    } catch (error) {
      console.error('下载过程出错:', error);
      reject(error);
    }
  });
});

// 安装更新文件
ipcMain.handle('install-update', async (event, filePath) => {
  try {
    console.log('开始安装更新文件:', filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error('更新文件不存在');
    }
    
    // 使用 shell.openPath 打开文件（Windows 会自动运行安装程序）
    const { shell } = require('electron');
    await shell.openPath(filePath);
    
    console.log('已打开安装程序');
    
    // 延迟退出应用，给用户时间看到安装程序启动
    setTimeout(() => {
      app.quit();
    }, 1000);
    
    return { success: true };
  } catch (error) {
    console.error('安装更新失败:', error);
    throw error;
  }
});

// 检查窗口是否处于全屏状态
ipcMain.handle('is-full-screen', (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow && !senderWindow.isDestroyed()) {
    return senderWindow.isFullScreen();
  }
  return false;
});

// 设置窗口全屏状态
ipcMain.handle('set-full-screen', (event, flag) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow && !senderWindow.isDestroyed()) {
    senderWindow.setFullScreen(flag);
    return true;
  }
  return false;
});