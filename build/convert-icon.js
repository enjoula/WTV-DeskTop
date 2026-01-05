#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// macOS 需要的图标尺寸（.icns 格式）
const macIconSizes = [
  16, 32, 64, 128, 256, 512, 1024
];

// Windows 需要的图标尺寸（.ico 格式）
const winIconSizes = [
  16, 32, 48, 64, 128, 256
];

// 临时目录
const tempDir = path.join(__dirname, 'icon-temp');
const iconsetDir = path.join(tempDir, 'icon.iconset');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 清理临时目录
function cleanTemp() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 生成带圆角的图标（用于 macOS）
async function generateRoundedIcon(inputPath, outputPath, size) {
  const radius = Math.floor(size * 0.2); // 圆角半径约为尺寸的 20%
  const contentSize = Math.floor(size * 0.85); // 内容占据 85% 的大小，留出 15% 的内边距
  
  // 创建圆角遮罩
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );

  // 创建透明背景 SVG
  const backgroundSvg = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="transparent"/>
    </svg>`
  );

  // 调整内容大小到 85%
  const resized = await sharp(inputPath)
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明背景
    })
    .toBuffer();

  // 将缩小后的内容居中放置在完整尺寸的画布上
  const padding = Math.floor((size - contentSize) / 2);
  const finalIcon = await sharp(backgroundSvg)
    .composite([{
      input: resized,
      left: padding,
      top: padding
    }])
    .toBuffer();

  // 应用圆角遮罩（保留苹果圆角效果）
  const rounded = await sharp(finalIcon)
    .composite([{
      input: mask,
      blend: 'dest-in'
    }])
    .png()
    .toBuffer();

  await sharp(rounded).toFile(outputPath);
}

// 生成普通图标（用于 Windows）
async function generateIcon(inputPath, outputPath, size) {
  const contentSize = Math.floor(size * 0.85); // 内容占据 85% 的大小，留出 15% 的内边距
  
  // 创建透明背景 SVG
  const backgroundSvg = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="transparent"/>
    </svg>`
  );

  // 调整内容大小到 85%
  const resized = await sharp(inputPath)
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明背景
    })
    .toBuffer();

  // 将缩小后的内容居中放置在完整尺寸的画布上
  const padding = Math.floor((size - contentSize) / 2);
  await sharp(backgroundSvg)
    .composite([{
      input: resized,
      left: padding,
      top: padding
    }])
    .png()
    .toFile(outputPath);
}

// 生成 macOS .icns 文件
async function generateMacIcon(inputPath, outputPath) {
  log('📱 生成 macOS 图标 (.icns)...', 'blue');
  
  ensureDir(iconsetDir);
  
  // 生成所有尺寸的图标（带圆角）
  for (const size of macIconSizes) {
    const filename1x = `icon_${size}x${size}.png`;
    const filename2x = `icon_${size}x${size}@2x.png`;
    
    const output1x = path.join(iconsetDir, filename1x);
    const output2x = path.join(iconsetDir, filename2x);
    
    // 生成 1x 尺寸
    await generateRoundedIcon(inputPath, output1x, size);
    log(`  ✓ 生成 ${size}x${size}`, 'green');
    
    // 生成 2x 尺寸（Retina）
    await generateRoundedIcon(inputPath, output2x, size * 2);
    log(`  ✓ 生成 ${size}x${size}@2x`, 'green');
  }
  
  // 使用 iconutil 生成 .icns 文件（macOS 系统工具）
  try {
    log('  🔧 使用 iconutil 生成 .icns 文件...', 'blue');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${outputPath}"`, {
      stdio: 'inherit'
    });
    log(`  ✅ macOS 图标生成完成: ${outputPath}`, 'green');
  } catch (error) {
    log('  ⚠️  iconutil 不可用，尝试使用替代方法...', 'yellow');
    // 如果 iconutil 不可用，可以使用 electron-icon-maker 或其他工具
    // 这里我们尝试使用 electron-icon-maker
    try {
      const { makeIcon } = require('electron-icon-maker');
      await makeIcon({
        input: inputPath,
        output: path.dirname(outputPath),
        name: path.basename(outputPath, '.icns')
      });
      log(`  ✅ macOS 图标生成完成: ${outputPath}`, 'green');
    } catch (e) {
      log('  ❌ 无法生成 .icns 文件，请确保在 macOS 系统上运行', 'red');
      throw e;
    }
  }
}

// 生成 Windows .ico 文件
async function generateWinIcon(inputPath, outputPath) {
  log('🪟 生成 Windows 图标 (.ico)...', 'blue');
  
  const winTempDir = path.join(tempDir, 'win-icons');
  ensureDir(winTempDir);
  
  // 生成所有尺寸的图标
  for (const size of winIconSizes) {
    const tempPath = path.join(winTempDir, `${size}.png`);
    await generateIcon(inputPath, tempPath, size);
    log(`  ✓ 生成 ${size}x${size}`, 'green');
  }
  
  try {
    // 使用 icon-gen 生成 ICO 文件
    const icongen = require('icon-gen');
    
    await icongen(winTempDir, path.dirname(outputPath), {
      report: true,
      ico: {
        name: path.basename(outputPath, '.ico'),
        sizes: winIconSizes
      }
    });
    
    // 如果生成的文件名不同，需要重命名
    const generatedIco = path.join(path.dirname(outputPath), path.basename(outputPath, '.ico') + '.ico');
    if (fs.existsSync(generatedIco) && generatedIco !== outputPath) {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      fs.renameSync(generatedIco, outputPath);
    }
    
    log(`  ✅ Windows 图标生成完成: ${outputPath}`, 'green');
  } catch (error) {
    log(`  ❌ 生成 ICO 文件失败: ${error.message}`, 'red');
    // 尝试使用命令行工具作为备用方案
    try {
      log('  🔧 尝试使用 electron-icon-maker 命令行工具...', 'yellow');
      const outputDir = path.dirname(outputPath);
      execSync(`npx electron-icon-maker --input="${inputPath}" --output="${outputDir}"`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      // 查找生成的文件
      const winIconDir = path.join(outputDir, 'icons', 'win');
      const generatedIco = path.join(winIconDir, 'icon.ico');
      if (fs.existsSync(generatedIco)) {
        ensureDir(path.dirname(outputPath));
        fs.copyFileSync(generatedIco, outputPath);
        log(`  ✅ Windows 图标生成完成: ${outputPath}`, 'green');
      } else {
        throw new Error('无法找到生成的 ICO 文件');
      }
    } catch (cmdError) {
      log(`  ❌ 所有方法都失败了: ${cmdError.message}`, 'red');
      throw cmdError;
    }
  }
}

// 主函数
async function main() {
  log('🎨 开始生成平台图标...', 'bright');
  
  const logoPath = path.join(__dirname, 'logo-rounded.png');
  const outputDir = __dirname;
  
  // 检查源文件是否存在
  if (!fs.existsSync(logoPath)) {
    log(`❌ 源文件不存在: ${logoPath}`, 'red');
    process.exit(1);
  }
  
  try {
    // 清理临时目录
    cleanTemp();
    ensureDir(tempDir);
    
    // 生成 macOS 图标（ARM 和 Intel 使用同一个 .icns 文件）
    const macIconPath = path.join(outputDir, 'icon.icns');
    await generateMacIcon(logoPath, macIconPath);
    
    // 生成 Windows 图标
    const winIconPath = path.join(outputDir, 'icons', 'icon.ico');
    ensureDir(path.dirname(winIconPath));
    await generateWinIcon(logoPath, winIconPath);
    
    // 生成通用 PNG 图标（用于 electron-builder）
    const pngIconPath = path.join(outputDir, 'icons', 'icon.png');
    ensureDir(path.dirname(pngIconPath));
    await generateIcon(logoPath, pngIconPath, 512);
    log(`  ✅ 通用 PNG 图标生成完成: ${pngIconPath}`, 'green');
    
    // 清理临时目录
    cleanTemp();
    
    log('\n' + '='.repeat(50), 'bright');
    log('\n✅ 所有平台图标生成完成！', 'green');
    log('\n📁 生成的文件:', 'bright');
    log(`  - macOS (ARM/Intel): ${macIconPath}`, 'blue');
    log(`  - Windows: ${winIconPath}`, 'blue');
    log(`  - 通用 PNG: ${pngIconPath}`, 'blue');
    log('\n💡 提示: macOS 图标已自动应用圆角效果', 'yellow');
    
  } catch (error) {
    log(`\n❌ 生成图标时出错: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n错误堆栈:\n${error.stack}`, 'red');
    }
    cleanTemp();
    process.exit(1);
  }
}

main();

