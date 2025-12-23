const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;

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
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: '看视频 - WTV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用 webSecurity 以允许跨域图片加载（Electron 桌面应用可以这样做）
    },
  });

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
    
    // 构建正确的 file:// URL
    // 对于 asar 文件，需要使用特殊的路径格式
    let fileUrl;
    if (process.platform === 'win32') {
      // Windows 路径处理：file:///C:/path/to/file
      // 需要将反斜杠转换为正斜杠，并将冒号替换为管道符
      fileUrl = `file:///${indexPath.replace(/\\/g, '/').replace(/:/g, '|')}`;
    } else {
      // macOS/Linux 路径处理：file:///path/to/file
      // 对于 asar 文件，路径应该是：file:///path/to/app.asar/src/renderer/build/index.html
      fileUrl = `file://${indexPath}`;
    }
    
    console.log('Loading URL:', fileUrl);
    console.log('Index path:', indexPath);
    
    // 使用 loadURL 加载文件
    // 这样可以确保相对路径的静态资源能正确解析
    mainWindow.loadURL(fileUrl).catch(err => {
      console.error('Failed to load with loadURL:', err);
      console.error('尝试的路径:', indexPath);
      console.error('尝试的 URL:', fileUrl);
      
      // 如果 loadURL 失败，尝试使用 loadFile
      console.log('Trying with loadFile as fallback...');
      mainWindow.loadFile(indexPath).catch(err2 => {
        console.error('Failed to load with loadFile:', err2);
        // 显示错误页面，包含调试信息
        const errorHtml = `
          <html>
            <body style="font-family: Arial; padding: 20px;">
              <h1>无法加载应用</h1>
              <p>请检查应用文件是否完整</p>
              <p><strong>loadURL 错误:</strong> ${err.message}</p>
              <p><strong>loadFile 错误:</strong> ${err2.message}</p>
              <p><strong>App Path:</strong> ${appPath}</p>
              <p><strong>尝试的路径:</strong> ${indexPath}</p>
              <p><strong>尝试的 URL:</strong> ${fileUrl}</p>
              <p><strong>__dirname:</strong> ${__dirname}</p>
              <p><strong>isPackaged:</strong> ${app.isPackaged}</p>
              <p><strong>Platform:</strong> ${process.platform}</p>
            </body>
          </html>
        `;
        mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
      });
    });
    
    // 临时启用开发者工具以便调试打包后的应用
    // TODO: 问题解决后可以移除这行
    // mainWindow.webContents.openDevTools();
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