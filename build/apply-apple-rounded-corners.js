#!/usr/bin/env node

const sharp = require('sharp');
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

// 生成苹果圆角遮罩（超椭圆）
// 使用超椭圆公式创建苹果风格的圆角
function createAppleRoundedCornerMask(size) {
  // 苹果圆角使用超椭圆（squircle）
  // 使用 n=3.5 的超椭圆公式来创建更精确的苹果圆角效果
  const n = 3.5;
  const center = size / 2;
  const a = size / 2; // 半轴长度
  
  // 生成超椭圆路径（使用足够多的点来保证平滑）
  const points = [];
  const numPoints = Math.max(200, size); // 至少 200 个点
  
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 2;
    // 超椭圆参数方程
    const x = Math.pow(Math.abs(Math.cos(t)), 2 / n) * a * (Math.cos(t) >= 0 ? 1 : -1);
    const y = Math.pow(Math.abs(Math.sin(t)), 2 / n) * a * (Math.sin(t) >= 0 ? 1 : -1);
    points.push([center + x, center + y]);
  }
  
  // 构建 SVG 路径
  let pathData = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  pathData += ' Z';
  
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="appleMask">
          <path d="${pathData}"/>
        </clipPath>
      </defs>
      <rect width="${size}" height="${size}" fill="white" clip-path="url(#appleMask)"/>
    </svg>`
  );
  
  return svg;
}

// 应用苹果圆角效果
async function applyAppleRoundedCorners(inputPath, outputPath) {
  try {
    log('🎨 开始应用苹果圆角效果...', 'blue');
    
    // 读取原始图片信息
    const metadata = await sharp(inputPath).metadata();
    const size = Math.min(metadata.width, metadata.height);
    
    log(`  📐 图片尺寸: ${metadata.width}x${metadata.height}`, 'blue');
    log(`  📏 使用尺寸: ${size}x${size}`, 'blue');
    
    // 如果图片不是正方形，先裁剪为正方形
    let processedImage;
    if (metadata.width !== metadata.height) {
      log('  ✂️  裁剪为正方形...', 'yellow');
      processedImage = await sharp(inputPath)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
    } else {
      processedImage = await sharp(inputPath).toBuffer();
    }
    
    // 创建苹果圆角遮罩
    log('  🎭 生成苹果圆角遮罩...', 'blue');
    const mask = createAppleRoundedCornerMask(size);
    
    // 应用遮罩
    log('  ✨ 应用圆角效果...', 'blue');
    const rounded = await sharp(processedImage)
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();
    
    // 保存结果
    await sharp(rounded).toFile(outputPath);
    
    log(`  ✅ 完成！已保存到: ${outputPath}`, 'green');
    
  } catch (error) {
    log(`  ❌ 处理失败: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n错误堆栈:\n${error.stack}`, 'red');
    }
    throw error;
  }
}

// 主函数
async function main() {
  const logoPath = path.join(__dirname, 'logo.png');
  // 直接覆盖原文件
  const outputPath = logoPath;
  
  // 检查源文件是否存在
  if (!fs.existsSync(logoPath)) {
    log(`❌ 源文件不存在: ${logoPath}`, 'red');
    process.exit(1);
  }
  
  try {
    // 先保存到临时文件，处理完成后再覆盖原文件
    const tempPath = path.join(__dirname, 'logo-temp.png');
    await applyAppleRoundedCorners(logoPath, tempPath);
    
    // 覆盖原文件
    fs.renameSync(tempPath, outputPath);
    
    log('\n' + '='.repeat(50), 'bright');
    log('\n✅ 处理完成！', 'green');
    log(`\n📁 已更新文件: ${outputPath}`, 'blue');
    
  } catch (error) {
    log(`\n❌ 处理失败: ${error.message}`, 'red');
    // 清理临时文件
    const tempPath = path.join(__dirname, 'logo-temp.png');
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    process.exit(1);
  }
}

main();

