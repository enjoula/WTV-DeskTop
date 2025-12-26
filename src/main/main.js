const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;
let videoWindow = null; // 只保留一个视频窗口
// 存储当前视频窗口的视频数据，用于传递给渲染进程
let currentVideoData = null;

const createWindow = () => {
  // 配置 session 以支持跨域图片请求
  const ses = session.defaultSession;
  
  // 设置 CORS 头，允许跨域请求图片和其他资源
  ses.webRequest.onHeadersReceived((details, callback) => {
    // 为所有响应添加 CORS 头
    const responseHeaders = {
      ...details.responseHeaders,
    };
    
    // 添加 CORS 头，支持视频流和 Range 请求
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];
    responseHeaders['Access-Control-Allow-Headers'] = ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'];
    responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
    responseHeaders['Access-Control-Expose-Headers'] = ['Content-Length', 'Content-Range', 'Accept-Ranges'];
    
    callback({
      responseHeaders: responseHeaders,
    });
  });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 600,
    title: '看视频 - WTV',
    backgroundColor: '#f5f5f5', // 设置背景色，避免白屏闪烁
    autoHideMenuBar: true, // 自动隐藏菜单栏（Windows 和 Linux）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用 webSecurity 以允许跨域图片加载（Electron 桌面应用可以这样做）
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
        await mainWindow.loadURL('http://localhost:3000');
        console.log('成功加载开发服务器');
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

// 获取 VersionCode（用于版本检测和升级）
ipcMain.handle('get-version-code', () => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // 尝试从应用路径读取 package.json
    let packageJsonPath;
    if (app.isPackaged) {
      // 打包后的应用，package.json 在 app.asar 中
      packageJsonPath = path.join(app.getAppPath(), 'package.json');
    } else {
      // 开发环境，使用相对路径
      packageJsonPath = path.join(__dirname, '..', 'package.json');
    }
    
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson.versionCode || 1;
  } catch (error) {
    console.error('读取 VersionCode 失败:', error);
    // 如果读取失败，尝试直接 require（在开发环境可能有效）
    try {
      const packageJson = require(path.join(__dirname, '..', 'package.json'));
      return packageJson.versionCode || 1;
    } catch (err) {
      console.error('通过 require 读取 VersionCode 也失败:', err);
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

// 在外部浏览器中打开 URL
ipcMain.handle('open-external', (event, url) => {
  const { shell } = require('electron');
  return shell.openExternal(url);
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
  
  // 创建新窗口（比主窗口小，不显示导航栏）
  // 使用视频标题（如果有），避免显示默认的 "看视频 - WTV"
  const initialTitle = videoData?.title || '视频详情';
  videoWindow = new BrowserWindow({
    width: 1300,
    height: 700,
    minWidth: 1100,
    minHeight: 600,
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
  
  // 窗口关闭时清空引用并停止标题检查
  videoWindow.on('closed', () => {
    stopTitleCheck();
    videoWindow = null;
  });
  
  // 保存视频标题，用于后续事件处理
  const videoTitle = videoData?.title || '视频详情';
  
  // 使用定时器持续检查和修正标题，直到页面完全加载
  let titleCheckInterval = null;
  const startTitleCheck = () => {
    if (titleCheckInterval) {
      clearInterval(titleCheckInterval);
    }
    titleCheckInterval = setInterval(() => {
      if (videoWindow && !videoWindow.isDestroyed() && videoData?.title) {
        const currentTitle = videoWindow.getTitle();
        if (currentTitle !== videoTitle && currentTitle.includes('看视频')) {
          videoWindow.setTitle(videoTitle);
          // 同时修改 document.title
          videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(videoTitle)};`).catch(() => {});
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
    videoWindow.setTitle(videoTitle);
    startTitleCheck(); // 开始检查标题
  });
  
  // 在 DOM 准备就绪时立即修改 document.title，防止 HTML title 标签生效
  videoWindow.webContents.on('dom-ready', () => {
    if (videoData?.title) {
      videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(videoTitle)};`).catch(() => {});
      videoWindow.setTitle(videoTitle);
    }
  });
  
  // 监听页面标题更新，始终阻止并使用视频标题
  videoWindow.webContents.on('page-title-updated', (event) => {
    if (videoData?.title) {
      event.preventDefault();
      videoWindow.setTitle(videoTitle);
      // 同时修改 document.title，防止后续更新
      videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(videoTitle)};`).catch(() => {});
    }
  });
  
  // 在页面加载完成后，再次确保标题正确，然后停止检查
  videoWindow.webContents.on('did-finish-load', () => {
    if (videoData?.title) {
      videoWindow.setTitle(videoTitle);
      videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(videoTitle)};`).catch(() => {});
    }
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
    videoWindow.setTitle(videoTitle);
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
    videoWindow.setTitle(videoTitle);
    // 使用 loadFile 加载，然后设置 hash，添加 newWindow 参数标识这是新窗口
    videoWindow.loadFile(indexPath).then(() => {
      // 加载完成后设置 hash
      videoWindow.webContents.executeJavaScript(`window.location.hash = '#/video/${videoId}?newWindow=true';`);
      // 确保标题正确（可能在 loadFile 后被 HTML title 覆盖）
      if (videoData?.title) {
        videoWindow.webContents.executeJavaScript(`document.title = ${JSON.stringify(videoTitle)};`).catch(() => {});
        videoWindow.setTitle(videoTitle);
      }
    }).catch(err => {
      console.error('加载视频详情页失败:', err);
    });
  }
  
  return videoWindow.id;
});

// 更新视频窗口标题
ipcMain.handle('update-video-window-title', (event, title) => {
  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.setTitle(title);
    return true;
  }
  return false;
});

// 获取当前视频窗口的视频数据
ipcMain.handle('get-video-data', (event) => {
  // 只允许从视频窗口获取数据
  if (videoWindow && !videoWindow.isDestroyed() && event.sender === videoWindow.webContents) {
    const data = currentVideoData;
    // 获取后清除，避免数据残留
    if (data) {
      currentVideoData = null;
    }
    return data;
  }
  return null;
});