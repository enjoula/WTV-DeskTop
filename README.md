# WTV Desktop - 视频桌面应用

一个基于 Electron 和 React 开发的跨平台视频播放桌面应用，支持电影、电视剧、动漫的在线播放和管理。

## 📋 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [打包部署](#打包部署)
- [API 配置](#api-配置)
- [常见问题](#常见问题)

## 🎯 项目简介

WTV Desktop 是一个现代化的视频播放桌面应用，提供流畅的视频观看体验。应用采用 Electron 框架构建，结合 React 实现响应式用户界面，支持多种视频格式播放。

## 🛠 技术栈

### 前端框架
- **React 18.2** - 用户界面库
- **Redux Toolkit** - 状态管理
- **React Router 6** - 路由管理
- **Axios** - HTTP 客户端

### 桌面应用
- **Electron 21.2** - 跨平台桌面应用框架
- **electron-builder 23.6** - 应用打包工具

### 视频播放
- **react-player** - React 视频播放器组件
- **hls.js** - HLS 视频流播放支持

### 开发工具
- **react-scripts** - Create React App 构建工具
- **nodemon** - 开发环境自动重启
- **concurrently** - 并行运行多个命令

## ✨ 功能特性

- 🎬 **视频分类浏览** - 支持电影、电视剧、动漫三大分类
- 🔍 **搜索功能** - 快速搜索视频内容
- ⭐ **收藏管理** - 收藏喜欢的视频，方便后续观看
- 👤 **用户系统** - 登录、注册、个人资料管理
- 📱 **响应式设计** - 适配不同屏幕尺寸
- 🎨 **现代化 UI** - 美观易用的用户界面
- 📺 **多种视频格式** - 支持 HLS 等多种视频流格式
- 🔐 **身份验证** - JWT Token 认证机制

## 📁 项目结构

```
WTV-DeskTop/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── main.js           # 主进程入口，窗口管理
│   │   └── preload.js        # 预加载脚本，IPC 通信桥接
│   └── renderer/             # React 渲染进程
│       ├── public/           # 静态资源
│       ├── src/
│       │   ├── api/          # API 接口封装
│       │   │   ├── client.js # Axios 客户端配置
│       │   │   ├── app.js    # 应用相关 API
│       │   │   ├── user.js   # 用户相关 API
│       │   │   └── video.js  # 视频相关 API
│       │   ├── components/   # React 组件
│       │   │   ├── Header.js # 头部组件
│       │   │   ├── Footer.js # 底部组件
│       │   │   ├── FilterPanel.js # 筛选面板
│       │   │   ├── StarRating.js  # 星级评分
│       │   │   ├── VideoImage.js  # 视频封面图
│       │   │   └── ErrorBoundary.js # 错误边界
│       │   ├── pages/        # 页面组件
│       │   │   ├── Home.js   # 首页
│       │   │   ├── Login.js  # 登录页
│       │   │   ├── Register.js # 注册页
│       │   │   ├── VideoList.js # 视频列表页
│       │   │   ├── VideoDetail.js # 视频详情页
│       │   │   ├── Search.js # 搜索页
│       │   │   ├── Favorites.js # 收藏页
│       │   │   ├── Profile.js # 个人资料页
│       │   │   └── ...
│       │   ├── store/        # Redux 状态管理
│       │   │   ├── index.js  # Store 配置
│       │   │   ├── authSlice.js # 认证状态
│       │   │   ├── videoSlice.js # 视频状态
│       │   │   └── favoriteSlice.js # 收藏状态
│       │   ├── App.js        # React 根组件
│       │   ├── Routes.js     # 路由配置
│       │   ├── setupProxy.js # 开发环境代理配置
│       │   └── ...
│       └── package.json      # React 应用依赖
├── build/                    # 构建资源
│   └── logo.svg             # 应用图标
├── dist/                     # 打包输出目录（构建产物，不提交）
│   ├── mac/                 # Mac 平台打包文件（build:all / build:mac）
│   └── windows/             # Windows 平台打包文件（build:all / build:win）
├── build-all.js             # 一键打包脚本
├── package.json             # 项目配置文件
└── README.md               # 项目文档
```

## 📦 环境要求

- **Node.js**: >= 14.x
- **npm**: >= 6.x 或 **yarn**: >= 1.x
- **操作系统**: 
  - macOS (10.13+)
  - Windows (10+)
  - Linux (可选)

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd WTV-DeskTop
```

### 2. 安装依赖

```bash
# 安装所有依赖（根项目 + src/renderer workspace）
npm install
```

> 提示：`node_modules`、`dist`、`src/renderer/build`、缓存目录均已通过 `.gitignore` 忽略，不建议提交到仓库。
> 提示：项目已启用 npm workspaces，`src/renderer` 依赖由根目录统一安装和锁定。

### 3. 启动开发环境

```bash
# 同时启动 React 开发服务器和 Electron
npm run dev

# 或者分别启动
npm run react-dev  # 启动 React 开发服务器 (端口 3000)
npm run electron-dev # 启动 Electron
```

### 4. 运行应用

开发环境启动后，Electron 窗口会自动打开，显示应用界面。

## 💻 开发指南

### 开发模式

开发模式下，应用会：
- React 应用运行在 `http://localhost:3000`
- Electron 窗口加载开发服务器 URL
- 支持热重载，代码修改后自动刷新
- 自动打开开发者工具

### 脚本命令

```bash
# 开发相关
npm start              # 直接运行 Electron（需要先构建 React）
npm run dev            # 开发模式（同时启动 React 和 Electron）
npm run react-dev      # 只启动 React 开发服务器
npm run electron-dev   # 只启动 Electron（监听 main 进程文件变化）

# 构建相关
npm run build:react    # 构建 React 应用
npm run build          # 使用 electron-builder 打包（当前平台，默认输出到 dist/）
npm run pack           # 打包但不生成安装包（仅目录）
npm run dist           # 生成分发包

# 打包相关（推荐使用）
npm run build:all      # 一键打包所有平台（Mac + Windows）
npm run build:mac      # 只打包 Mac 平台
npm run build:win      # 只打包 Windows 平台
```

### 代码结构说明

#### 主进程 (src/main/main.js)
- 管理 Electron 窗口生命周期
- 配置 CORS 和跨域支持
- 处理文件加载路径（开发/生产环境）
- IPC 通信处理

#### 渲染进程 (src/renderer/src)
- React 应用入口：`App.js`
- 路由配置：`Routes.js`
- API 客户端：`src/api/client.js`
- 状态管理：`src/store/`


#### API 配置
- 开发环境：通过 `setupProxy.js` 代理到后端服务器
- 生产环境：直接连接到生产 API 服务器
- API 地址配置在 `src/renderer/src/api/client.js`

## 📦 打包部署

### 一键打包（推荐）

项目提供了便捷的一键打包脚本，支持自动清理缓存和分别输出到不同目录：

```bash
# 打包所有平台（Mac + Windows）
npm run build:all
```

打包过程会：
1. ✅ 自动清理上次的构建缓存（dist、React build、node_modules/.cache 等）
2. ✅ 自动构建 React 应用
3. ✅ 分别打包 Mac 和 Windows 平台
4. ✅ 输出文件分别放到 `dist/mac/` 和 `dist/windows/` 目录

### 单独打包

```bash
# 只打包 Mac 平台（支持 x64 和 arm64）
npm run build:mac

# 只打包 Windows 平台（x64）
npm run build:win
```

### 打包输出

打包完成后，文件会按平台分别存放（使用 `build:all` / `build:mac` / `build:win`）：

```
dist/
├── mac/                    # Mac 平台输出
│   ├── WTV-1.0.0.dmg      # Intel Mac 安装包
│   ├── WTV-1.0.0-arm64.dmg # Apple Silicon Mac 安装包
│   └── mac/                # Mac 应用目录
│   └── mac-arm64/          # Apple Silicon Mac 应用目录
└── windows/                # Windows 平台输出
    ├── WTV Setup 1.0.0.exe # Windows 安装程序
    └── win-unpacked/       # 未打包的应用目录
```

### 打包配置

打包配置在 `package.json` 的 `build` 字段中：

- **Mac**: 生成 DMG 安装包，支持 x64 和 arm64 架构
- **Windows**: 生成 NSIS 安装程序，支持自定义安装路径

### 打包前准备

1. 确保 React 应用已构建：`npm run build:react`
2. 检查 `package.json` 中的版本号
3. 确保应用图标文件存在：`build/icons/icon.png`（Windows）与 `build/icon.icns`（macOS）

### 高级选项

打包脚本支持以下参数：

```bash
# 跳过清理缓存（如果之前已清理）
node build-all.js --skip-clean

# 只打包 Mac
node build-all.js --mac-only

# 只打包 Windows
node build-all.js --win-only
```

## 🌐 API 配置

### API 服务器地址

默认 API 服务器地址：`http://124.222.196.128:6660`

### 环境配置

#### 开发环境
- 使用 `setupProxy.js` 代理 API 请求
- React 开发服务器运行在 `http://localhost:3000`
- API 请求自动代理到后端服务器

#### 生产环境
- Electron 应用直接连接 API 服务器
- 配置在 `src/renderer/src/api/client.js` 中
- 根据运行环境自动选择 API 地址

### 修改 API 地址

如需修改 API 服务器地址，请编辑以下文件：

1. **开发环境代理**: `src/renderer/src/setupProxy.js`
2. **生产环境**: `src/renderer/src/api/client.js`

## 🔧 常见问题

### 1. 开发服务器无法连接

**问题**: Electron 窗口显示"无法连接到开发服务器"

**解决**:
- 确保 React 开发服务器已启动（`npm run react-dev`）
- 检查端口 3000 是否被占用
- 查看控制台错误信息

### 2. 打包后应用无法启动

**问题**: 打包后的应用无法正常加载

**解决**:
- 确保 React 应用已正确构建（`npm run build:react`）
- 检查 `src/renderer/build` 目录是否存在
- 查看主进程日志中的路径信息

### 3. 视频播放失败

**问题**: 视频无法播放或加载缓慢

**解决**:
- 检查网络连接
- 确认 API 服务器可访问
- 查看浏览器控制台的错误信息
- 检查视频 URL 是否正确

### 4. 打包失败

**问题**: electron-builder 打包失败

**解决**:
- 确保所有依赖已安装
- 清理缓存后重试：删除 `node_modules` 和 `dist` 目录
- 检查系统权限（特别是 macOS 的签名权限）
- 查看详细的错误日志

### 5. 跨平台打包

**问题**: 在 Mac 上无法打包 Windows 版本

**说明**: 
- electron-builder 支持交叉编译，但某些情况下可能需要在对应平台上打包
- 如果交叉编译失败，可以在 Windows 系统上运行 `npm run build:win`
- Mac 版本需要在 macOS 上打包

### 6. CORS 错误

**问题**: 开发环境出现 CORS 跨域错误

**解决**:
- 开发环境使用代理，应该不会出现 CORS 问题
- 如果出现，检查 `setupProxy.js` 配置
- 生产环境 Electron 已配置 CORS 支持

## 📝 开发注意事项

1. **环境变量**: 应用会根据运行环境自动选择 API 地址
2. **路径处理**: 注意开发环境和生产环境的文件路径差异
3. **热重载**: 主进程代码修改需要重启 Electron，渲染进程支持热重载
4. **安全性**: 生产环境建议启用代码签名（需要配置证书）
5. **性能**: 大型项目建议启用代码分割和懒加载

## 📄 许可证

MIT License

## 👥 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

如有问题或建议，请通过 Issue 联系。

---

**WTV Desktop Team** - 让视频观看更简单 🎬
