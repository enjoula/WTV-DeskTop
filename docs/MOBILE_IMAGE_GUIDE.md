# 📱 移动端图片请求处理对接文档

## 📋 目录

- [一、概述](#一概述)
- [二、需要处理的图片类型](#二需要处理的图片类型)
- [三、实现方案](#三实现方案)
- [四、请求头配置详解](#四请求头配置详解)
- [五、代码实现示例](#五代码实现示例)
- [六、测试验证](#六测试验证)
- [七、常见问题](#七常见问题)
- [八、技术支持](#八技术支持)

---

## 一、概述

### 1.1 背景说明

本项目中的图片资源来自多个不同的服务器，这些服务器设置了**防盗链**机制。移动端需要在请求图片时添加特定的请求头，才能正常加载图片。

### 1.2 核心目标

- ✅ 实现用户头像的正常加载（来自 pngsucai.com）
- ✅ 实现视频缩略图的正常加载（来自 doubanio.com）
- ✅ 实现后端服务器图片的正常加载
- ✅ 提供友好的降级处理（加载失败时显示占位图）

### 1.3 技术要点

| 技术点 | 说明 |
|-------|------|
| **请求头拦截** | 使用原生 HTTP 拦截器统一处理 |
| **Cookie 管理** | pngsucai.com 需要动态获取和更新 Cookie |
| **防盗链绕过** | 设置正确的 Referer 和 Origin |
| **浏览器模拟** | 使用完整的移动浏览器 User-Agent |

---

## 二、需要处理的图片类型

### 2.1 图片来源分类

| 图片类型 | 来源域名 | URL 示例 | 用途场景 | 是否需要特殊处理 |
|---------|---------|---------|---------|----------------|
| **用户头像** | `pngsucai.com` | `https://pngsucai.com/down/2025/1/14/xxx.png` | 个人中心、评论区、用户列表 | ✅ 需要（动态 Cookie） |
| **视频缩略图** | `doubanio.com` | `https://img9.doubanio.com/view/photo/s_ratio_poster/public/xxx.webp` | 视频列表、详情页、推荐卡片 | ✅ 需要（Referer） |
| **后端图片** | `124.222.196.128` | `http://124.222.196.128:6660/uploads/xxx.png` | 其他业务图片 | ✅ 需要（固定 Cookie） |

### 2.2 识别方法

```kotlin
// Kotlin 示例
fun getImageSourceType(url: String): ImageSourceType {
    return when {
        url.contains("pngsucai.com") -> ImageSourceType.PNGSUCAI_AVATAR
        url.contains("doubanio") -> ImageSourceType.DOUBAN_THUMBNAIL
        url.contains("124.222.196.128") -> ImageSourceType.BACKEND_SERVER
        else -> ImageSourceType.UNKNOWN
    }
}

enum class ImageSourceType {
    PNGSUCAI_AVATAR,    // pngsucai.com 头像
    DOUBAN_THUMBNAIL,   // doubanio.com 缩略图
    BACKEND_SERVER,     // 后端服务器
    UNKNOWN             // 未知来源
}
```

---

## 三、实现方案

### 3.1 方案选择

我们推荐使用 **方案 A（原生拦截器）**，如果遇到技术限制，可以降级使用方案 B。

| 方案 | 适用场景 | 优先级 | 实现难度 |
|------|---------|--------|---------|
| **方案 A：原生 HTTP 拦截器** | 所有项目 | ⭐⭐⭐⭐⭐ | 中等 |
| **方案 B：后端图片代理** | 无法实现拦截器时 | ⭐⭐⭐ | 简单 |

### 3.2 方案 A：原生 HTTP 拦截器（推荐）

#### Android (OkHttp Interceptor)

```kotlin
// 1. 添加依赖
dependencies {
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
}

// 2. 创建拦截器
class ImageHeaderInterceptor : Interceptor {
    // 详见第五章代码示例
}

// 3. 注册拦截器
val client = OkHttpClient.Builder()
    .addInterceptor(ImageHeaderInterceptor())
    .build()
```

#### iOS (URLProtocol / URLSession)

```swift
// 1. 创建拦截器
class ImageHeaderInterceptor: NSObject, URLSessionTaskDelegate {
    // 详见第五章代码示例
}

// 2. 配置 URLSession
let configuration = URLSessionConfiguration.default
let interceptor = ImageHeaderInterceptor()
let session = URLSession(configuration: configuration, delegate: interceptor, delegateQueue: nil)
```

### 3.3 方案 B：后端图片代理（备选）

需要后端提供统一的图片代理接口：

```
GET /api/proxy/image?url=<原始图片URL>
```

客户端调用示例：

```kotlin
// Android
val originalUrl = "https://pngsucai.com/down/2025/1/14/xxx.png"
val proxyUrl = "http://124.222.196.128:6660/api/proxy/image?url=" + 
               URLEncoder.encode(originalUrl, "UTF-8")
Glide.with(context).load(proxyUrl).into(imageView)
```

```swift
// iOS
let originalUrl = "https://pngsucai.com/down/2025/1/14/xxx.png"
let encodedUrl = originalUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
let proxyUrl = "http://124.222.196.128:6660/api/proxy/image?url=\(encodedUrl)"
imageView.sd_setImage(with: URL(string: proxyUrl))
```

**⚠️ 注意**：此方案会增加服务器负载，仅作为备选方案。

---

## 四、请求头配置详解

### 4.1 pngsucai.com（用户头像）

#### 请求示例

```http
GET https://pngsucai.com/down/2025/1/14/xxx.png HTTP/1.1
Host: pngsucai.com
Cookie: <动态获取的值>
Referer: https://www.pngsucai.com/
Origin: https://www.pngsucai.com
User-Agent: Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36
Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
```

#### 关键配置

| 请求头 | 值 | 是否必需 | 说明 |
|-------|---|---------|------|
| **Cookie** | `<动态值>` | ✅ 必需 | 从 pngsucai.com 首页获取，每30分钟更新 |
| **Referer** | `https://www.pngsucai.com/` | ✅ 必需 | 防盗链验证 |
| **Origin** | `https://www.pngsucai.com` | ✅ 必需 | 跨域验证 |
| **User-Agent** | 移动浏览器标识 | ⭐ 推荐 | 模拟真实浏览器 |
| **Accept** | `image/*` | ⭐ 推荐 | 图片类型 |

#### Cookie 获取方法

```kotlin
// Android 示例
private fun updatePngsucaiCookie() {
    val request = Request.Builder()
        .url("https://www.pngsucai.com/")
        .header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36")
        .build()
    
    okHttpClient.newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            // 提取 Set-Cookie 响应头
            val cookies = response.headers("Set-Cookie")
            pngsucaiCookie = cookies.joinToString("; ") { cookie ->
                cookie.split(";").first() // 只保留 key=value 部分
            }
            
            Log.d("ImageInterceptor", "✅ Cookie 更新成功: $pngsucaiCookie")
            
            // 可选：持久化存储
            SharedPreferences.edit()
                .putString("pngsucai_cookie", pngsucaiCookie)
                .putLong("cookie_update_time", System.currentTimeMillis())
                .apply()
        }
        
        override fun onFailure(call: Call, e: IOException) {
            Log.e("ImageInterceptor", "❌ Cookie 获取失败", e)
        }
    })
}

// 定期更新（每30分钟）
private fun schedulePeriodicUpdate() {
    val handler = Handler(Looper.getMainLooper())
    handler.postDelayed(object : Runnable {
        override fun run() {
            updatePngsucaiCookie()
            handler.postDelayed(this, 30 * 60 * 1000) // 30分钟
        }
    }, 30 * 60 * 1000)
}
```

### 4.2 doubanio.com（视频缩略图）

#### 请求示例

```http
GET https://img9.doubanio.com/view/photo/s_ratio_poster/public/xxx.webp HTTP/1.1
Host: img9.doubanio.com
Referer: https://www.douban.com/
Origin: https://www.douban.com
User-Agent: Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36
Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
```

#### 关键配置

| 请求头 | 值 | 是否必需 | 说明 |
|-------|---|---------|------|
| **Referer** | `https://www.douban.com/` | ✅ 必需 | 防盗链验证 |
| **Origin** | `https://www.douban.com` | ✅ 必需 | 跨域验证 |
| **User-Agent** | 移动浏览器标识 | ⭐ 推荐 | 模拟真实浏览器 |
| **Accept** | `image/*` | ⭐ 推荐 | 图片类型 |
| **Cookie** | - | ❌ 不需要 | 豆瓣不需要 Cookie |

#### 代码示例

```kotlin
// Android 示例
when {
    url.contains("doubanio") -> {
        requestBuilder.apply {
            addHeader("Referer", "https://www.douban.com/")
            addHeader("Origin", "https://www.douban.com")
            addHeader("User-Agent", MOBILE_USER_AGENT)
            addHeader("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        }
    }
}
```

### 4.3 后端服务器（124.222.196.128）

#### 请求示例

```http
GET http://124.222.196.128:6660/uploads/xxx.png HTTP/1.1
Host: 124.222.196.128:6660
Cookie: server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C
```

#### 关键配置

| 请求头 | 值 | 是否必需 | 说明 |
|-------|---|---------|------|
| **Cookie** | 固定值（见下方） | ✅ 必需 | 后端身份验证 |

#### Cookie 固定值

```
server_name_session=245619b23edc8a717a124f4092302064; img_auth=1767519930-102f39147b977d127328185881522622; Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; HMACCOUNT=2CDC1E500F1FB63C
```

⚠️ **注意**：此 Cookie 值可以直接写死在代码中。

#### 代码示例

```kotlin
// Android 示例
companion object {
    private const val BACKEND_COOKIE = "server_name_session=245619b23edc8a717a124f4092302064; " +
                                       "img_auth=1767519930-102f39147b977d127328185881522622; " +
                                       "Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                                       "Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                                       "HMACCOUNT=2CDC1E500F1FB63C"
}

when {
    url.contains("124.222.196.128") && isImageUrl(url) -> {
        requestBuilder.addHeader("Cookie", BACKEND_COOKIE)
    }
}
```

### 4.4 User-Agent 推荐值

#### Android

```
Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36
```

#### iOS

```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
```

---

## 五、代码实现示例

### 5.1 Android 完整实现

#### 步骤 1：创建拦截器类

```kotlin
// ImageHeaderInterceptor.kt
package com.wtv.network

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import java.io.IOException
import java.util.concurrent.TimeUnit

class ImageHeaderInterceptor(private val context: Context) : Interceptor {
    
    companion object {
        private const val TAG = "ImageHeaderInterceptor"
        
        // User-Agent
        private const val MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 13; Pixel 7) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36"
        
        // 后端 Cookie（固定值）
        private const val BACKEND_COOKIE = "server_name_session=245619b23edc8a717a124f4092302064; " +
                "img_auth=1767519930-102f39147b977d127328185881522622; " +
                "Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                "Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                "HMACCOUNT=2CDC1E500F1FB63C"
        
        // Cookie 更新间隔（30分钟）
        private const val COOKIE_UPDATE_INTERVAL = 30 * 60 * 1000L
        
        // SharedPreferences 键名
        private const val PREFS_NAME = "image_headers"
        private const val KEY_PNGSUCAI_COOKIE = "pngsucai_cookie"
        private const val KEY_COOKIE_UPDATE_TIME = "cookie_update_time"
    }
    
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    private var pngsucaiCookie: String = ""
    private val handler = Handler(Looper.getMainLooper())
    private val updateClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    
    init {
        // 从本地存储恢复 Cookie
        pngsucaiCookie = prefs.getString(KEY_PNGSUCAI_COOKIE, "") ?: ""
        val lastUpdateTime = prefs.getLong(KEY_COOKIE_UPDATE_TIME, 0)
        
        // 如果 Cookie 不存在或已过期，立即更新
        val currentTime = System.currentTimeMillis()
        if (pngsucaiCookie.isEmpty() || (currentTime - lastUpdateTime) > COOKIE_UPDATE_INTERVAL) {
            updatePngsucaiCookie()
        }
        
        // 启动定期更新
        schedulePeriodicUpdate()
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val url = originalRequest.url.toString()
        
        // 根据 URL 判断是否需要添加特殊请求头
        val newRequest = when {
            // 1️⃣ pngsucai.com 图片（头像）
            url.contains("pngsucai.com", ignoreCase = true) -> {
                Log.d(TAG, "🎨 处理 pngsucai 图片请求: $url")
                originalRequest.newBuilder().apply {
                    if (pngsucaiCookie.isNotEmpty()) {
                        addHeader("Cookie", pngsucaiCookie)
                    }
                    addHeader("Referer", "https://www.pngsucai.com/")
                    addHeader("Origin", "https://www.pngsucai.com")
                    addHeader("User-Agent", MOBILE_USER_AGENT)
                    addHeader("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
                    addHeader("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                }.build()
            }
            
            // 2️⃣ doubanio.com 图片（缩略图）
            url.contains("doubanio", ignoreCase = true) -> {
                Log.d(TAG, "📺 处理 douban 图片请求: $url")
                originalRequest.newBuilder().apply {
                    addHeader("Referer", "https://www.douban.com/")
                    addHeader("Origin", "https://www.douban.com")
                    addHeader("User-Agent", MOBILE_USER_AGENT)
                    addHeader("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
                    addHeader("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                }.build()
            }
            
            // 3️⃣ 后端服务器图片
            url.contains("124.222.196.128", ignoreCase = true) && isImageUrl(url) -> {
                Log.d(TAG, "🖼️ 处理后端图片请求: $url")
                originalRequest.newBuilder().apply {
                    addHeader("Cookie", BACKEND_COOKIE)
                }.build()
            }
            
            // 其他请求不处理
            else -> originalRequest
        }
        
        return chain.proceed(newRequest)
    }
    
    /**
     * 获取 pngsucai 的 Cookie
     */
    private fun updatePngsucaiCookie() {
        Log.d(TAG, "🔄 开始更新 pngsucai Cookie...")
        
        val request = Request.Builder()
            .url("https://www.pngsucai.com/")
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .build()
        
        updateClient.newCall(request).enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                try {
                    val cookies = response.headers("Set-Cookie")
                    if (cookies.isNotEmpty()) {
                        pngsucaiCookie = cookies.joinToString("; ") { cookie ->
                            cookie.split(";").first()
                        }
                        
                        // 持久化存储
                        prefs.edit()
                            .putString(KEY_PNGSUCAI_COOKIE, pngsucaiCookie)
                            .putLong(KEY_COOKIE_UPDATE_TIME, System.currentTimeMillis())
                            .apply()
                        
                        Log.d(TAG, "✅ Cookie 更新成功: ${pngsucaiCookie.take(50)}...")
                    } else {
                        Log.w(TAG, "⚠️ 未获取到 Cookie")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Cookie 处理失败", e)
                } finally {
                    response.close()
                }
            }
            
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "❌ Cookie 获取失败", e)
            }
        })
    }
    
    /**
     * 定期更新 Cookie（每30分钟）
     */
    private fun schedulePeriodicUpdate() {
        handler.postDelayed(object : Runnable {
            override fun run() {
                updatePngsucaiCookie()
                handler.postDelayed(this, COOKIE_UPDATE_INTERVAL)
            }
        }, COOKIE_UPDATE_INTERVAL)
    }
    
    /**
     * 判断是否为图片 URL
     */
    private fun isImageUrl(url: String): Boolean {
        return url.matches(
            Regex(".*\\.(png|jpg|jpeg|gif|webp|svg|ico)(\\?.*)?$", RegexOption.IGNORE_CASE)
        )
    }
    
    /**
     * 清理资源
     */
    fun destroy() {
        handler.removeCallbacksAndMessages(null)
    }
}
```

#### 步骤 2：注册拦截器

```kotlin
// NetworkModule.kt 或 Application 中
import com.wtv.network.ImageHeaderInterceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    
    private lateinit var imageHeaderInterceptor: ImageHeaderInterceptor
    
    fun init(context: Context) {
        imageHeaderInterceptor = ImageHeaderInterceptor(context)
    }
    
    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(imageHeaderInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl("http://124.222.196.128:6660/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
    
    fun destroy() {
        imageHeaderInterceptor.destroy()
    }
}
```

#### 步骤 3：在 Application 中初始化

```kotlin
// MyApplication.kt
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // 初始化网络模块
        NetworkModule.init(this)
        
        // 配置图片加载库（Glide）
        configureGlide()
    }
    
    private fun configureGlide() {
        // Glide 会自动使用已配置的 OkHttp 客户端
        // 如果需要单独配置，可以创建 GlideModule
    }
    
    override fun onTerminate() {
        super.onTerminate()
        NetworkModule.destroy()
    }
}
```

#### 步骤 4：使用示例

```kotlin
// 在 Activity/Fragment 中加载图片
import com.bumptech.glide.Glide

class ProfileActivity : AppCompatActivity() {
    
    private fun loadUserAvatar(avatarUrl: String) {
        Glide.with(this)
            .load(avatarUrl)
            .placeholder(R.drawable.ic_avatar_placeholder)
            .error(R.drawable.ic_avatar_error)
            .circleCrop()
            .into(binding.ivAvatar)
    }
    
    private fun loadVideoThumbnail(thumbnailUrl: String) {
        Glide.with(this)
            .load(thumbnailUrl)
            .placeholder(R.drawable.ic_video_placeholder)
            .error(R.drawable.ic_video_error)
            .centerCrop()
            .into(binding.ivThumbnail)
    }
}
```

---

### 5.2 iOS 完整实现

#### 步骤 1：创建拦截器类

```swift
// ImageHeaderInterceptor.swift
import Foundation

class ImageHeaderInterceptor: NSObject {
    
    // MARK: - 常量
    
    private struct Constants {
        // User-Agent
        static let mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                                     "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
                                     "Version/17.0 Mobile/15E148 Safari/604.1"
        
        // 后端 Cookie（固定值）
        static let backendCookie = "server_name_session=245619b23edc8a717a124f4092302064; " +
                                   "img_auth=1767519930-102f39147b977d127328185881522622; " +
                                   "Hm_lvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                                   "Hm_lpvt_386c683f3b0c25ee5b0bf789967980f8=1767519930; " +
                                   "HMACCOUNT=2CDC1E500F1FB63C"
        
        // Cookie 更新间隔（30分钟）
        static let cookieUpdateInterval: TimeInterval = 30 * 60
        
        // UserDefaults 键名
        static let pngsucaiCookieKey = "pngsucai_cookie"
        static let cookieUpdateTimeKey = "cookie_update_time"
    }
    
    // MARK: - 属性
    
    private var pngsucaiCookie: String = ""
    private var updateTimer: Timer?
    private let urlSession: URLSession
    
    // MARK: - 初始化
    
    override init() {
        // 配置 URLSession
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        
        self.urlSession = URLSession(configuration: configuration)
        
        super.init()
        
        // 从本地存储恢复 Cookie
        restoreCookieFromUserDefaults()
        
        // 如果 Cookie 不存在或已过期，立即更新
        checkAndUpdateCookieIfNeeded()
        
        // 启动定期更新
        schedulePeriodicUpdate()
    }
    
    deinit {
        updateTimer?.invalidate()
    }
    
    // MARK: - 公共方法
    
    /// 为 URLRequest 添加必要的请求头
    func addHeaders(to request: inout URLRequest) {
        guard let url = request.url?.absoluteString else { return }
        
        switch true {
        // 1️⃣ pngsucai.com 图片（头像）
        case url.contains("pngsucai.com"):
            print("🎨 处理 pngsucai 图片请求: \(url)")
            if !pngsucaiCookie.isEmpty {
                request.setValue(pngsucaiCookie, forHTTPHeaderField: "Cookie")
            }
            request.setValue("https://www.pngsucai.com/", forHTTPHeaderField: "Referer")
            request.setValue("https://www.pngsucai.com", forHTTPHeaderField: "Origin")
            request.setValue(Constants.mobileUserAgent, forHTTPHeaderField: "User-Agent")
            request.setValue("image/avif,image/webp,image/apng,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
            request.setValue("zh-CN,zh;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
            
        // 2️⃣ doubanio.com 图片（缩略图）
        case url.contains("doubanio"):
            print("📺 处理 douban 图片请求: \(url)")
            request.setValue("https://www.douban.com/", forHTTPHeaderField: "Referer")
            request.setValue("https://www.douban.com", forHTTPHeaderField: "Origin")
            request.setValue(Constants.mobileUserAgent, forHTTPHeaderField: "User-Agent")
            request.setValue("image/avif,image/webp,image/apng,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
            request.setValue("zh-CN,zh;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
            
        // 3️⃣ 后端服务器图片
        case url.contains("124.222.196.128") && isImageUrl(url):
            print("🖼️ 处理后端图片请求: \(url)")
            request.setValue(Constants.backendCookie, forHTTPHeaderField: "Cookie")
            
        default:
            break
        }
    }
    
    // MARK: - 私有方法
    
    /// 从 UserDefaults 恢复 Cookie
    private func restoreCookieFromUserDefaults() {
        if let savedCookie = UserDefaults.standard.string(forKey: Constants.pngsucaiCookieKey) {
            pngsucaiCookie = savedCookie
        }
    }
    
    /// 检查并更新 Cookie（如果需要）
    private func checkAndUpdateCookieIfNeeded() {
        let lastUpdateTime = UserDefaults.standard.double(forKey: Constants.cookieUpdateTimeKey)
        let currentTime = Date().timeIntervalSince1970
        
        if pngsucaiCookie.isEmpty || (currentTime - lastUpdateTime) > Constants.cookieUpdateInterval {
            updatePngsucaiCookie()
        }
    }
    
    /// 更新 pngsucai Cookie
    private func updatePngsucaiCookie() {
        print("🔄 开始更新 pngsucai Cookie...")
        
        guard let url = URL(string: "https://www.pngsucai.com/") else { return }
        
        var request = URLRequest(url: url)
        request.setValue(Constants.mobileUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", forHTTPHeaderField: "Accept")
        
        let task = urlSession.dataTask(with: request) { [weak self] _, response, error in
            guard let self = self else { return }
            
            if let error = error {
                print("❌ Cookie 获取失败: \(error.localizedDescription)")
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ 响应格式错误")
                return
            }
            
            // 提取 Set-Cookie 头
            if let cookies = httpResponse.allHeaderFields["Set-Cookie"] as? String {
                let cookieComponents = cookies.components(separatedBy: ";")
                self.pngsucaiCookie = cookieComponents.first ?? ""
                
                // 持久化存储
                UserDefaults.standard.set(self.pngsucaiCookie, forKey: Constants.pngsucaiCookieKey)
                UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Constants.cookieUpdateTimeKey)
                
                let preview = String(self.pngsucaiCookie.prefix(50))
                print("✅ Cookie 更新成功: \(preview)...")
            } else {
                print("⚠️ 未获取到 Cookie")
            }
        }
        
        task.resume()
    }
    
    /// 定期更新 Cookie
    private func schedulePeriodicUpdate() {
        updateTimer = Timer.scheduledTimer(withTimeInterval: Constants.cookieUpdateInterval, repeats: true) { [weak self] _ in
            self?.updatePngsucaiCookie()
        }
    }
    
    /// 判断是否为图片 URL
    private func isImageUrl(_ url: String) -> Bool {
        let pattern = #".*\.(png|jpg|jpeg|gif|webp|svg|ico)(\?.*)?$"#
        return url.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
```

#### 步骤 2：创建自定义 URLSession

```swift
// NetworkManager.swift
import Foundation

class NetworkManager {
    
    static let shared = NetworkManager()
    
    private let interceptor: ImageHeaderInterceptor
    private let urlSession: URLSession
    
    private init() {
        self.interceptor = ImageHeaderInterceptor()
        
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        
        self.urlSession = URLSession(configuration: configuration)
    }
    
    /// 发送请求（会自动添加请求头）
    func dataTask(with url: URL, completion: @escaping (Data?, URLResponse?, Error?) -> Void) {
        var request = URLRequest(url: url)
        interceptor.addHeaders(to: &request)
        
        let task = urlSession.dataTask(with: request, completionHandler: completion)
        task.resume()
    }
    
    /// 获取配置好的 URLSession（用于图片加载库）
    func getConfiguredURLSession() -> URLSession {
        return urlSession
    }
}
```

#### 步骤 3：集成 SDWebImage

```swift
// AppDelegate.swift
import UIKit
import SDWebImage

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    func application(_ application: UIApplication, 
                    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // 配置 SDWebImage 使用自定义 downloader
        configureSDWebImage()
        
        return true
    }
    
    private func configureSDWebImage() {
        // 创建自定义 downloader
        let downloader = SDWebImageDownloader.shared
        
        // 设置请求修饰器
        downloader.requestModifier = SDWebImageDownloaderRequestModifier { request in
            var modifiedRequest = request
            
            // 使用拦截器添加请求头
            let interceptor = ImageHeaderInterceptor()
            interceptor.addHeaders(to: &modifiedRequest)
            
            return modifiedRequest
        }
        
        // 配置 SDWebImageManager
        SDWebImageManager.shared.imageDownloader = downloader
    }
}
```

#### 步骤 4：使用示例

```swift
// ViewController.swift
import UIKit
import SDWebImage

class ProfileViewController: UIViewController {
    
    @IBOutlet weak var avatarImageView: UIImageView!
    @IBOutlet weak var thumbnailImageView: UIImageView!
    
    func loadUserAvatar(url: String) {
        guard let avatarURL = URL(string: url) else { return }
        
        avatarImageView.sd_setImage(
            with: avatarURL,
            placeholderImage: UIImage(named: "avatar_placeholder"),
            options: [.retryFailed, .refreshCached]
        ) { image, error, cacheType, url in
            if let error = error {
                print("❌ 头像加载失败: \(error.localizedDescription)")
            } else {
                print("✅ 头像加载成功")
            }
        }
    }
    
    func loadVideoThumbnail(url: String) {
        guard let thumbnailURL = URL(string: url) else { return }
        
        thumbnailImageView.sd_setImage(
            with: thumbnailURL,
            placeholderImage: UIImage(named: "video_placeholder"),
            options: [.retryFailed, .refreshCached]
        ) { image, error, cacheType, url in
            if let error = error {
                print("❌ 缩略图加载失败: \(error.localizedDescription)")
            } else {
                print("✅ 缩略图加载成功")
            }
        }
    }
}
```

---

## 六、测试验证

### 6.1 测试用例

创建以下测试用例验证功能：

```kotlin
// Android 测试示例
class ImageLoadingTest {
    
    @Test
    fun testPngsucaiAvatar() {
        val url = "https://pngsucai.com/down/2025/1/14/test.png"
        val result = loadImageSync(url)
        assertTrue("头像应该加载成功", result.isSuccess)
    }
    
    @Test
    fun testDoubanThumbnail() {
        val url = "https://img9.doubanio.com/view/photo/s_ratio_poster/public/test.webp"
        val result = loadImageSync(url)
        assertTrue("缩略图应该加载成功", result.isSuccess)
    }
    
    @Test
    fun testBackendImage() {
        val url = "http://124.222.196.128:6660/uploads/test.png"
        val result = loadImageSync(url)
        assertTrue("后端图片应该加载成功", result.isSuccess)
    }
    
    @Test
    fun testCookieUpdate() {
        val interceptor = ImageHeaderInterceptor(context)
        Thread.sleep(1000) // 等待 Cookie 更新
        val cookie = interceptor.getPngsucaiCookie()
        assertTrue("Cookie 应该不为空", cookie.isNotEmpty())
    }
}
```

### 6.2 手动测试步骤

#### 步骤 1：测试头像加载

1. 登录账号
2. 进入个人中心页面
3. 观察头像是否正常显示
4. 查看日志输出：
   ```
   🎨 处理 pngsucai 图片请求: https://pngsucai.com/...
   ✅ Cookie 更新成功: ...
   ```

#### 步骤 2：测试缩略图加载

1. 进入视频列表页面
2. 滚动列表，观察缩略图是否正常加载
3. 查看日志输出：
   ```
   📺 处理 douban 图片请求: https://img9.doubanio.com/...
   ```

#### 步骤 3：测试后端图片

1. 访问需要加载后端图片的页面
2. 观察图片是否正常显示
3. 查看日志输出：
   ```
   🖼️ 处理后端图片请求: http://124.222.196.128:6660/...
   ```

#### 步骤 4：测试 Cookie 更新

1. 启动应用后，观察初次 Cookie 获取日志
2. 等待 30 分钟后，观察是否有 Cookie 更新日志
3. 或者修改更新间隔为 1 分钟快速测试

### 6.3 测试检查清单

- [ ] ✅ pngsucai.com 头像能正常加载
- [ ] ✅ doubanio.com 缩略图能正常加载
- [ ] ✅ 后端服务器图片能正常加载
- [ ] ✅ Cookie 能自动获取和更新
- [ ] ✅ 加载失败时显示占位图
- [ ] ✅ 网络切换（WiFi ↔ 4G）后仍能正常加载
- [ ] ✅ 应用冷启动后能正常加载
- [ ] ✅ 应用后台切换回来后能正常加载

### 6.4 调试工具

#### Android

使用 Charles/Fiddler 抓包查看请求头：

```bash
# 安装 Charles 证书
# 配置代理：设置 -> WiFi -> 长按网络 -> 修改网络 -> 代理

# 过滤规则
https://pngsucai.com/*
https://doubanio.com/*
http://124.222.196.128/*
```

#### iOS

使用 Charles/Proxyman 抓包：

```bash
# 安装证书
# 设置 -> WiFi -> 点击 ⓘ -> 配置代理 -> 手动

# 过滤规则（同 Android）
```

---

## 七、常见问题

### Q1: 为什么 pngsucai.com 的图片加载失败？

**可能原因**：
1. Cookie 过期或未获取到
2. Referer/Origin 设置错误
3. 网络问题

**解决方案**：
```kotlin
// 1. 检查 Cookie 是否存在
Log.d("Debug", "Cookie: $pngsucaiCookie")

// 2. 手动触发 Cookie 更新
interceptor.updatePngsucaiCookie()

// 3. 缩短 Cookie 更新间隔
private const val COOKIE_UPDATE_INTERVAL = 15 * 60 * 1000L // 改为15分钟

// 4. 检查请求头是否正确设置
override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    Log.d("Debug", "请求头: ${request.headers}")
    // ...
}
```

### Q2: 豆瓣图片偶尔加载失败？

**可能原因**：
1. Referer 未正确设置
2. 豆瓣服务器限流

**解决方案**：
```kotlin
// 1. 确保 Referer 和 Origin 都设置了
addHeader("Referer", "https://www.douban.com/")
addHeader("Origin", "https://www.douban.com")

// 2. 添加重试机制（Glide 示例）
Glide.with(context)
    .load(url)
    .error(
        Glide.with(context)
            .load(url)  // 失败后自动重试一次
            .placeholder(R.drawable.placeholder)
    )
    .into(imageView)
```

### Q3: 后端图片加载失败？

**可能原因**：
1. Cookie 值错误
2. 后端服务器问题
3. URL 不正确

**解决方案**：
```kotlin
// 1. 确认 Cookie 值
private const val BACKEND_COOKIE = "server_name_session=245619b23edc8a717a124f4092302064; ..."

// 2. 检查 URL 格式
// 正确：http://124.222.196.128:6660/uploads/xxx.png
// 错误：https://124.222.196.128:6660/uploads/xxx.png (注意协议)

// 3. 测试后端服务器是否可访问
curl -H "Cookie: $BACKEND_COOKIE" http://124.222.196.128:6660/uploads/xxx.png
```

### Q4: 是否需要处理 CORS？

**答案**：**不需要**。

原生移动应用不受浏览器的同源策略限制，不存在 CORS 问题。只需要设置正确的请求头绕过防盗链即可。

### Q5: 图片缓存策略如何设置？

**推荐配置**：

```kotlin
// Android (Glide)
Glide.with(context)
    .load(url)
    .diskCacheStrategy(DiskCacheStrategy.ALL)  // 缓存所有版本
    .skipMemoryCache(false)                    // 启用内存缓存
    .into(imageView)
```

```swift
// iOS (SDWebImage)
imageView.sd_setImage(
    with: url,
    options: [
        .refreshCached,      // 刷新缓存
        .retryFailed,        // 失败重试
        .cacheMemoryOnly     // 只缓存到内存
    ]
)
```

### Q6: 用户头像更新后显示的还是旧头像？

**解决方案**：

后端返回新头像 URL 时，添加时间戳参数强制刷新缓存：

```kotlin
// Android
val avatarUrl = user.avatar + "?t=" + System.currentTimeMillis()
Glide.with(context).load(avatarUrl).into(imageView)
```

```swift
// iOS
let timestamp = Int(Date().timeIntervalSince1970)
let avatarUrl = "\(user.avatar)?t=\(timestamp)"
imageView.sd_setImage(with: URL(string: avatarUrl))
```

### Q7: 在 Flutter 中如何实现？

**Flutter 实现**：

```dart
// 创建自定义 HTTP Client
import 'package:http/http.dart' as http;

class ImageHttpClient extends http.BaseClient {
  final http.Client _client = http.Client();
  String _pngsucaiCookie = '';
  
  ImageHttpClient() {
    _updatePngsucaiCookie();
    Timer.periodic(Duration(minutes: 30), (_) => _updatePngsucaiCookie());
  }
  
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final url = request.url.toString();
    
    // pngsucai.com 图片
    if (url.contains('pngsucai.com')) {
      request.headers['Cookie'] = _pngsucaiCookie;
      request.headers['Referer'] = 'https://www.pngsucai.com/';
      request.headers['Origin'] = 'https://www.pngsucai.com';
    }
    // doubanio.com 图片
    else if (url.contains('doubanio')) {
      request.headers['Referer'] = 'https://www.douban.com/';
      request.headers['Origin'] = 'https://www.douban.com';
    }
    // 后端服务器
    else if (url.contains('124.222.196.128')) {
      request.headers['Cookie'] = 'server_name_session=...';
    }
    
    return _client.send(request);
  }
  
  Future<void> _updatePngsucaiCookie() async {
    try {
      final response = await _client.get(
        Uri.parse('https://www.pngsucai.com/'),
        headers: {'User-Agent': 'Mozilla/5.0 ...'}
      );
      
      final cookies = response.headers['set-cookie'];
      if (cookies != null) {
        _pngsucaiCookie = cookies.split(';').first;
      }
    } catch (e) {
      print('Cookie 获取失败: $e');
    }
  }
}

// 在 main.dart 中配置
void main() {
  HttpOverrides.global = MyHttpOverrides();
  runApp(MyApp());
}

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

// 使用 CachedNetworkImage
CachedNetworkImage(
  imageUrl: imageUrl,
  httpHeaders: {
    // 由 ImageHttpClient 自动添加
  },
  placeholder: (context, url) => CircularProgressIndicator(),
  errorWidget: (context, url, error) => Icon(Icons.error),
)
```

### Q8: React Native 如何实现？

**React Native 实现**：

```javascript
// ImageHeaderInterceptor.js
import NetInfo from '@react-native-community/netinfo';

class ImageHeaderInterceptor {
  constructor() {
    this.pngsucaiCookie = '';
    this.updatePngsucaiCookie();
    setInterval(() => this.updatePngsucaiCookie(), 30 * 60 * 1000);
  }
  
  async updatePngsucaiCookie() {
    try {
      const response = await fetch('https://www.pngsucai.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 ...'
        }
      });
      
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        this.pngsucaiCookie = setCookie.split(';')[0];
      }
    } catch (error) {
      console.error('Cookie 获取失败:', error);
    }
  }
  
  getHeaders(url) {
    const headers = {};
    
    if (url.includes('pngsucai.com')) {
      headers['Cookie'] = this.pngsucaiCookie;
      headers['Referer'] = 'https://www.pngsucai.com/';
      headers['Origin'] = 'https://www.pngsucai.com';
    } else if (url.includes('doubanio')) {
      headers['Referer'] = 'https://www.douban.com/';
      headers['Origin'] = 'https://www.douban.com';
    } else if (url.includes('124.222.196.128')) {
      headers['Cookie'] = 'server_name_session=...';
    }
    
    return headers;
  }
}

export const interceptor = new ImageHeaderInterceptor();

// 使用 FastImage
import FastImage from 'react-native-fast-image';

<FastImage
  source={{
    uri: imageUrl,
    headers: interceptor.getHeaders(imageUrl)
  }}
  style={styles.image}
  resizeMode={FastImage.resizeMode.cover}
/>
```

---

## 八、技术支持

### 8.1 联系方式

如果在实现过程中遇到问题，请联系：

| 项目 | 信息 |
|------|------|
| **负责人** | 桌面端开发团队 |
| **邮箱** | desktop-dev@wtv.com |
| **技术文档** | https://wiki.wtv.com/mobile-image-guide |
| **问题反馈** | https://github.com/wtv/issues |

### 8.2 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v1.0.0 | 2026-01-13 | 初始版本，包含 Android/iOS 完整实现 |

### 8.3 参考资料

- [OkHttp 官方文档](https://square.github.io/okhttp/)
- [URLSession 官方文档](https://developer.apple.com/documentation/foundation/urlsession)
- [Glide 官方文档](https://bumptech.github.io/glide/)
- [SDWebImage 官方文档](https://github.com/SDWebImage/SDWebImage)

---

## 附录 A：完整配置清单

### Android

```kotlin
// build.gradle (app)
dependencies {
    // OkHttp
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    
    // Glide
    implementation 'com.github.bumptech.glide:glide:4.16.0'
    kapt 'com.github.bumptech.glide:compiler:4.16.0'
    
    // Retrofit（可选）
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
}
```

### iOS

```ruby
# Podfile
pod 'SDWebImage', '~> 5.18'
pod 'Alamofire', '~> 5.8' # 可选
```

---

## 附录 B：错误码说明

| 错误码 | 说明 | 解决方案 |
|-------|------|---------|
| 403 | 防盗链验证失败 | 检查 Referer 和 Origin 是否正确设置 |
| 401 | Cookie 验证失败 | 更新 Cookie 或检查 Cookie 格式 |
| 404 | 图片不存在 | 检查 URL 是否正确 |
| 500 | 服务器错误 | 联系后端排查问题 |
| timeout | 请求超时 | 增加超时时间或检查网络 |

---

**最后更新时间**: 2026-01-13  
**文档维护**: 桌面端开发团队
