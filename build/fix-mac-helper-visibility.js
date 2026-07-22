const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function setPlistBool(plistPath, key, value) {
  const boolValue = value ? 'true' : 'false';
  try {
    execSync(`/usr/libexec/PlistBuddy -c "Set :${key} ${boolValue}" "${plistPath}"`, {
      stdio: 'ignore',
    });
  } catch (_) {
    execSync(`/usr/libexec/PlistBuddy -c "Add :${key} bool ${boolValue}" "${plistPath}"`, {
      stdio: 'ignore',
    });
  }
}

exports.default = async function fixMacHelperVisibility(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) {
    return;
  }

  const appBundleName = `${context.packager.appInfo.productFilename}.app`;
  const frameworksDir = path.join(appOutDir, appBundleName, 'Contents', 'Frameworks');
  if (!fs.existsSync(frameworksDir)) {
    return;
  }

  const helperApps = fs
    .readdirSync(frameworksDir)
    .filter((name) => name.endsWith('.app') && name.includes('Helper'));

  for (const helperApp of helperApps) {
    const plistPath = path.join(frameworksDir, helperApp, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) {
      continue;
    }

    // 避免 Helper 在启动台/应用列表中作为独立 App 显示
    setPlistBool(plistPath, 'LSUIElement', true);
    setPlistBool(plistPath, 'LSBackgroundOnly', true);

    // 重新签名修改后的 Helper 包（修改 Info.plist 后签名会失效）
    const helperAppPath = path.join(frameworksDir, helperApp);
    try {
      execSync(`codesign --force --deep --sign - "${helperAppPath}"`, {
        stdio: 'ignore',
      });
    } catch (e) {
      // 签名失败时忽略，可能在非 macOS 环境下打包
    }
  }

  // 对整个 app 包进行深度重新签名（修改 Helper 后整体签名会失效，arm64 macOS 对此更严格）
  const appBundlePath = path.join(appOutDir, appBundleName);
  try {
    execSync(`codesign --force --deep --sign - "${appBundlePath}"`, {
      stdio: 'ignore',
    });
  } catch (e) {
    // 签名失败时忽略，可能在非 macOS 环境下打包
  }
};
