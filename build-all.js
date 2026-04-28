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

// 打包函数
function build(platform) {
  log(`\n📦 开始打包 ${platform} 平台...`, 'blue');
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  let originalPackageJson = null;
  
  try {
    // 设置输出目录
    const outputDir = platform === 'mac' ? 'dist/mac' : 'dist/windows';
    
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 读取原始 package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    originalPackageJson = packageJsonContent; // 保存原始内容
    
    // 临时修改输出目录
    packageJson.build.directories.output = outputDir;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

    try {
      // 执行打包命令
      const command = platform === 'mac' 
        ? 'electron-builder --mac --x64 --arm64'
        : 'electron-builder --win --x64';
      
      log(`  执行命令: ${command}`, 'blue');
      
      execSync(command, {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
        },
      });
      
      log(`✅ ${platform} 平台打包完成\n`, 'green');
    } finally {
      // 恢复原始 package.json
      if (originalPackageJson) {
        fs.writeFileSync(packageJsonPath, originalPackageJson, 'utf8');
      }
    }
    
  } catch (error) {
    log(`❌ ${platform} 平台打包失败`, 'red');
    if (error.message) {
      log(`  错误信息: ${error.message}`, 'red');
    }
    // 确保恢复原始 package.json
    if (originalPackageJson) {
      try {
        fs.writeFileSync(packageJsonPath, originalPackageJson, 'utf8');
      } catch (e) {
        log(`⚠️  警告: 恢复 package.json 失败，请手动检查`, 'yellow');
      }
    }
    throw error; // 重新抛出错误，让主函数处理
  }
}

// 清理 mac 打包过程中生成的中间 .app 目录，避免被系统“应用程序存储”统计为已安装应用
function cleanMacUnpackedApps() {
  const macUnpackedDirs = [
    path.join(process.cwd(), 'dist', 'mac', 'mac'),
    path.join(process.cwd(), 'dist', 'mac', 'mac-arm64'),
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

// 主函数
function main() {
  log('🚀 开始一键打包所有平台...', 'bright');
  
  // 获取命令行参数
  const args = process.argv.slice(2);
  const skipClean = args.includes('--skip-clean');
  const onlyMac = args.includes('--mac-only');
  const onlyWin = args.includes('--win-only');
  
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
      platforms.push('mac');
    } else if (onlyWin) {
      platforms.push('windows');
    } else {
      platforms.push('mac', 'windows');
    }
    
    const successfulPlatforms = [];
    const failedPlatforms = [];
    
    for (const platform of platforms) {
      try {
        build(platform);
        successfulPlatforms.push(platform);
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
    }
    
    log('\n📁 输出目录:', 'bright');
    log('  - Mac: dist/mac/', 'blue');
    log('  - Windows: dist/windows/', 'blue');
    
    if (failedPlatforms.length > 0) {
      process.exit(1);
    } else {
      // 清理 mac 的中间 .app 目录，避免系统误识别为多个“已安装应用”
      if (platforms.includes('mac')) {
        cleanMacUnpackedApps();
      }
      log('\n🎉 所有平台打包完成！', 'green');
    }
    
  } catch (error) {
    log(`\n❌ 打包过程出错: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
