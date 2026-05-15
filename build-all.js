#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 清理函数
function cleanCache() {
  log('\n🧹 开始清理缓存...', 'yellow');
  
  const cleanPaths = [
    'dist',
    'src/renderer/build',
    'node_modules/.cache',
    'src/renderer/node_modules/.cache',
    '.cache',
  ];

  cleanPaths.forEach(cleanPath => {
    const fullPath = path.join(process.cwd(), cleanPath);
    if (fs.existsSync(fullPath)) {
      log(`  删除: ${cleanPath}`, 'yellow');
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  });

  log('✅ 缓存清理完成\n', 'green');
}

// 构建 React 应用
function buildReact() {
  log('📦 开始构建 React 应用...', 'blue');
  try {
    execSync('cd src/renderer && npm run build', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    log('✅ React 应用构建完成\n', 'green');
  } catch (error) {
    log('❌ React 应用构建失败', 'red');
    process.exit(1);
  }
}

function getArchFromPlatform(platform) {
  // 例如: mac-x64 / mac-arm64 / linux-x64
  const parts = String(platform).split('-');
  return parts.length >= 2 ? parts[1] : null;
}

function isMacPlatform(platform) {
  return String(platform).startsWith('mac-');
}

function isLinuxPlatform(platform) {
  return String(platform).startsWith('linux-');
}

function restrictArchInBuildConfig(packageJson, platformKey, arch) {
  if (!packageJson.build || !packageJson.build[platformKey]) return;

  const cfg = packageJson.build[platformKey];
  if (!cfg.target) return;

  if (Array.isArray(cfg.target)) {
    cfg.target = cfg.target.map((t) => {
      if (typeof t === 'object' && t) {
        return { ...t, arch: [arch] };
      }
      return t;
    });
  }
}

// 打包函数（支持 windows / mac-x64 / mac-arm64 / linux-x64）
function build(platform) {
  log(`\n📦 开始打包 ${platform} ...`, 'blue');

  const packageJsonPath = path.join(process.cwd(), 'package.json');
  let originalPackageJson = null;

  try {
    // 设置输出目录 & 打包命令
    let outputDir = 'dist/windows';
    let command = 'electron-builder --win --x64';

    if (isMacPlatform(platform)) {
      const arch = getArchFromPlatform(platform);
      if (!arch) throw new Error(`无法识别 mac 架构: ${platform}`);
      outputDir = path.join('dist', 'mac', arch);
      command = `electron-builder --mac --${arch}`;
    } else if (isLinuxPlatform(platform)) {
      const arch = getArchFromPlatform(platform);
      if (!arch) throw new Error(`无法识别 linux 架构: ${platform}`);
      outputDir = path.join('dist', 'ubuntu', arch);
      command = `electron-builder --linux --${arch}`;
    } else if (platform === 'windows') {
      outputDir = 'dist/windows';
      command = 'electron-builder --win --x64';
    } else {
      throw new Error(`未知平台: ${platform}`);
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 读取原始 package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    originalPackageJson = packageJsonContent; // 保存原始内容

    // 临时修改输出目录
    packageJson.build.directories.output = outputDir;

    // 强制只保留当前 arch 的目标，避免在配置里同时包含 x64/arm64 导致混打
    if (isMacPlatform(platform)) {
      const arch = getArchFromPlatform(platform);
      restrictArchInBuildConfig(packageJson, 'mac', arch);
    } else if (isLinuxPlatform(platform)) {
      const arch = getArchFromPlatform(platform);
      restrictArchInBuildConfig(packageJson, 'linux', arch);
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

    try {
      log(`  执行命令: ${command}`, 'blue');

      // app-builder 默认从 github.com 拉 Electron zip，国内/不稳定时易出现 504；未显式设置时默认走 npmmirror
      const electronMirror =
        process.env.ELECTRON_MIRROR ||
        process.env.npm_config_electron_mirror ||
        'https://npmmirror.com/mirrors/electron/';
      execSync(command, {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          ELECTRON_MIRROR: electronMirror,
        },
      });

      log(`✅ ${platform} 打包完成\n`, 'green');
    } finally {
      if (originalPackageJson) {
        fs.writeFileSync(packageJsonPath, originalPackageJson, 'utf8');
      }
    }
  } catch (error) {
    log(`❌ ${platform} 平台打包失败`, 'red');
    if (error && error.message) {
      log(`  错误信息: ${error.message}`, 'red');
    }
    if (originalPackageJson) {
      try {
        fs.writeFileSync(packageJsonPath, originalPackageJson, 'utf8');
      } catch (e) {
        log('⚠️  警告: 恢复 package.json 失败，请手动检查', 'yellow');
      }
    }
    throw error;
  }
}

// 清理 mac 打包过程中生成的中间 .app 目录，避免被系统“应用程序存储”统计为已安装应用
function cleanMacUnpackedApps(outputDir) {
  const absoluteOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(process.cwd(), outputDir);

  // electron-builder 会在 outputDir 下生成 mac 相关的未打包目录
  const macUnpackedDirs = [
    path.join(absoluteOutputDir, 'mac'),
    path.join(absoluteOutputDir, 'mac-arm64'),
  ];

  let cleanedCount = 0;
  macUnpackedDirs.forEach((dirPath) => {
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        cleanedCount += 1;
      } catch (err) {
        log(`⚠️  清理中间目录失败: ${dirPath} (${err.message})`, 'yellow');
      }
    }
  });

  if (cleanedCount > 0) {
    log(`🧹 已清理 ${cleanedCount} 个 mac 中间目录（保留 dmg 安装包）`, 'green');
  }
}

// 清理 Windows 打包过程中生成的中间目录，保留安装包与压缩包
function cleanWindowsIntermediateDirs() {
  const windowsIntermediateDirs = [
    path.join(process.cwd(), 'dist', 'windows', 'win-unpacked'),
    path.join(process.cwd(), 'dist', 'windows', 'builder-debug.yml'),
    path.join(process.cwd(), 'dist', 'windows', 'builder-effective-config.yaml'),
  ];

  let cleanedCount = 0;
  windowsIntermediateDirs.forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        cleanedCount += 1;
      } catch (err) {
        log(`⚠️  清理 Windows 中间产物失败: ${targetPath} (${err.message})`, 'yellow');
      }
    }
  });

  if (cleanedCount > 0) {
    log(`🧹 已清理 ${cleanedCount} 个 Windows 中间产物（保留安装包）`, 'green');
  }
}

// 清理 Linux（Ubuntu）打包过程生成的中间目录
function cleanLinuxIntermediateDirs(outputDir) {
  const absoluteOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(process.cwd(), outputDir);

  // electron-builder 对 linux 常见的中间目录
  const linuxIntermediateDirs = [
    path.join(absoluteOutputDir, 'linux-unpacked'),
    path.join(absoluteOutputDir, 'builder-debug.yml'),
    path.join(absoluteOutputDir, 'builder-effective-config.yaml'),
  ];

  let cleanedCount = 0;
  linuxIntermediateDirs.forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        cleanedCount += 1;
      } catch (err) {
        log(`⚠️  清理 Linux 中间产物失败: ${targetPath} (${err.message})`, 'yellow');
      }
    }
  });

  if (cleanedCount > 0) {
    log(`🧹 已清理 ${cleanedCount} 个 Linux 中间产物（保留安装包）`, 'green');
  }
}

// 写入打包日期到 package.json（格式：YYYYMMDD）
function writeBuildDate() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  try {
    const content = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    content.buildDate = `${yyyy}${mm}${dd}`;
    fs.writeFileSync(packageJsonPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    log(`📅 打包日期已写入: ${content.buildDate}`, 'green');
  } catch (err) {
    log(`⚠️  写入打包日期失败: ${err.message}`, 'yellow');
  }
}

function logElectronDownloadHints() {
  log('\n📡 Electron 二进制下载失败常见原因：访问 github.com 不稳定（EOF / timeout）', 'yellow');
  log('   可任选其一后重新执行打包：', 'yellow');
  log('   1) 临时使用国内镜像（zsh/bash）：', 'blue');
  log('      export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/', 'bright');
  log('      npm run build:all', 'bright');
  log('   2) 或在项目根目录 .npmrc 增加一行（持久）：', 'blue');
  log('      electron_mirror=https://npmmirror.com/mirrors/electron/', 'bright');
  log('   3) 使用系统/终端代理后再打包；或稍后网络稳定时重试。', 'blue');
  log('   缓存目录一般为 ~/.cache/electron/（可保留已下完的 zip 避免重复拉取）。\n', 'blue');
}

// 主函数
function main() {
  log('🚀 开始一键打包所有平台...', 'bright');
  
  // 获取命令行参数
  const args = process.argv.slice(2);
  const skipClean = args.includes('--skip-clean');
  const onlyMac = args.includes('--mac-only');
  const onlyWin = args.includes('--win-only');
  const onlyUbuntu = args.includes('--ubuntu-only');
  
  try {
    // 写入打包日期
    writeBuildDate();

    // 清理缓存
    if (!skipClean) {
      cleanCache();
    }
    
    // 构建 React 应用
    buildReact();
    
    // 打包
    const platforms = [];
    if (onlyMac) {
      platforms.push('mac-arm64','mac-x64');
    } else if (onlyWin) {
      platforms.push('windows');
    } else if (onlyUbuntu) {
      platforms.push('linux-x64');
    } else {
      platforms.push('mac-x64', 'mac-arm64', 'windows', 'linux-x64');
    }
    
    const successfulPlatforms = [];
    const failedPlatforms = [];
    
    for (const platform of platforms) {
      try {
        build(platform);
        successfulPlatforms.push(platform);

        // 每个平台成功后立即清理自己的中间目录，避免因其他平台失败而跳过清理
        if (platform === 'windows') {
          cleanWindowsIntermediateDirs();
        } else if (isMacPlatform(platform)) {
          const arch = getArchFromPlatform(platform);
          cleanMacUnpackedApps(path.join('dist', 'mac', arch));
        } else if (isLinuxPlatform(platform)) {
          const arch = getArchFromPlatform(platform);
          cleanLinuxIntermediateDirs(path.join('dist', 'ubuntu', arch));
        }
      } catch (error) {
        failedPlatforms.push(platform);
        log(`\n⚠️  ${platform} 平台打包失败，继续打包其他平台...`, 'yellow');
      }
    }
    
    // 输出结果摘要
    log('\n' + '='.repeat(50), 'bright');
    if (successfulPlatforms.length > 0) {
      log(`\n✅ 成功打包的平台: ${successfulPlatforms.join(', ')}`, 'green');
    }
    if (failedPlatforms.length > 0) {
      log(`\n❌ 打包失败的平台: ${failedPlatforms.join(', ')}`, 'red');
      log('提示: 某些平台可能需要在对应的操作系统上打包，或需要配置交叉编译环境', 'yellow');
      logElectronDownloadHints();
    }
    
    log('\n📁 输出目录:', 'bright');
    log('  - Mac(x64): dist/mac/x64/', 'blue');
    log('  - Mac(arm64): dist/mac/arm64/', 'blue');
    log('  - Windows: dist/windows/', 'blue');
    log('  - Ubuntu(x64): dist/ubuntu/x64/', 'blue');
    
    if (failedPlatforms.length > 0) {
      process.exit(1);
    } else {
      log('\n🎉 所有平台打包完成！', 'green');
    }
    
  } catch (error) {
    log(`\n❌ 打包过程出错: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
