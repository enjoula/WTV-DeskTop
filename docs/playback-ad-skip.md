# 视频播放跳过逻辑说明（去广告 & 片头片尾）跳过广告逻辑分析

## 1. 项目背景

项目地址：

> https://github.com/MoonTechLab/LunaTV

LunaTV 是一个基于 Web 技术实现的视频点播系统，播放器采用：

- ArtPlayer
- HLS.js

项目提供：

> 智能去广告（实验性）

其核心目标是：

- 检测影视资源站播放流中的广告切片
- 自动跳过广告片段
- 提升连续播放体验

需要注意：

LunaTV 的去广告并不是浏览器广告拦截，而是针对 **HLS 视频流（m3u8）中的广告分片进行处理**。

---

# 2. 整体播放流程

```
用户选择影片

        ↓

资源站接口

        ↓

获取播放地址

        ↓

解析视频 URL

        ↓

判断视频类型

        ↓

      m3u8(HLS)

        ↓

    HLS.js加载

        ↓

 广告检测/过滤逻辑

        ↓

重写播放列表

        ↓

 ArtPlayer播放
```

---

# 3. HLS 视频结构分析

LunaTV 主要处理 m3u8 视频。

典型 HLS 文件：

```m3u8
#EXTM3U

#EXTINF:10,
001.ts

#EXTINF:10,
002.ts

#EXTINF:10,
003.ts

#EXTINF:600,
movie.ts
```

其中：

- m3u8：播放索引文件
- ts：实际视频切片

播放器实际播放：

```
m3u8
 |
 +-- segment1.ts
 |
 +-- segment2.ts
 |
 +-- segment3.ts
```

---

# 4. 广告产生方式

影视资源站广告主要有以下几种形式。

---

## 4.1 独立广告切片

示例：

```m3u8
#EXTINF:10,
ad001.ts

#EXTINF:10,
ad002.ts

#EXTINF:600,
movie001.ts
```

播放：

```
广告
 |
广告
 |
正片
```

这种最容易识别。

---

## 4.2 m3u8 标记广告区间

部分资源站：

```m3u8
#EXT-X-DISCONTINUITY

ad.ts

#EXT-X-DISCONTINUITY

movie.ts
```

通过：

- DISCONTINUITY
- DATERANGE

标记内容切换。

---

## 4.3 广告直接写入视频

例如：

```
0:00 - 0:30 广告

0:30以后 正片
```

特点：

- m3u8 无异常
- ts 分片正常

这种无法通过分片分析解决。

---

# 5. LunaTV 去广告核心思想

核心流程：

```
获取 m3u8

      ↓

解析 EXTINF 分片

      ↓

分析 segment

      ↓

判断是否广告

      ↓

过滤广告 segment

      ↓

生成新的 m3u8

      ↓

HLS.js继续播放
```

---

# 6. 广告检测规则分析

## 6.1 文件名匹配

最基础方式。

例如：

```
ad.ts

ads001.ts

advert.ts

guanggao.ts
```

检测：

```javascript
/ad|ads|advert|guanggao/i
```

命中：

```
删除该 segment
```

---

# 6.2 分片时间判断

正常视频：

```
10秒
10秒
10秒
10秒
```

广告：

```
3秒
5秒
5秒
3秒
```

规则：

```
短时间大量连续segment

↓

疑似广告
```

例如：

```text
duration < 5秒

连续出现多个

提高广告概率
```

---

# 6.3 文件大小判断

正常：

```
movie001.ts

20MB
```

广告：

```
ad001.ts

1MB
```

可以通过：

- 文件大小
- bitrate

判断异常。

---

# 6.4 HASH重复检测

部分资源站广告重复：

```
电视剧A

广告片段X


电视剧B

广告片段X
```

处理：

```
计算segment hash

        ↓

建立广告库

        ↓

再次出现直接跳过
```

---

# 7. m3u8 重写逻辑

原始：

```m3u8
#EXTM3U

#EXTINF:10,
ad001.ts

#EXTINF:10,
ad002.ts

#EXTINF:600,
movie001.ts
```

过滤后：

```m3u8
#EXTM3U

#EXTINF:600,
movie001.ts
```

然后：

```javascript
hls.loadSource(newM3u8)
```

重新加载。

---

# 8. 播放阶段跳过逻辑

如果广告已经进入播放：

例如：

```
当前播放时间:

35秒

发现广告:

35-65秒
```

执行：

```javascript
video.currentTime = 65
```

效果：

```
35秒

↓

直接跳到

65秒
```

---

# 9. 为什么属于实验功能

原因：

## 9.1 没有统一广告标准

资源站：

A：

```
ad001.ts
```

容易处理。


B：

```
001.ts
002.ts
003.ts
```

无法判断。


C：

```
广告直接编码进视频
```

无法识别。

---

# 10. 当前方案能力边界

|广告类型|处理能力|
|-|-|
|独立广告ts切片|很好|
|m3u8广告标记|较好|
|文件名广告|较好|
|重复广告|较好|
|烧录广告|较差|
|AI识别广告|不支持|

---

# 11. 推荐增强方案

可以升级为：

```
                 m3u8

                  ↓

          Segment Analyzer

                  ↓

 --------------------------------

 文件名分析

 时长分析

 大小分析

 HASH分析

 音视频特征分析

 --------------------------------

                  ↓

          Advertisement Score

                  ↓

        高于阈值自动删除

```

---

# 12. 广告评分模型设计

Segment结构：

```typescript
interface SegmentInfo {

    url:string;

    duration:number;

    size:number;

    hash:string;

    score:number;

}
```

评分：

|规则|分值|
|-|-:|
|文件名包含ad|40|
|duration异常短|20|
|文件大小异常|10|
|hash重复|30|

判断：

```
score >=60

认为广告
```

---

# 13. 源码定位建议

重点搜索：

```
m3u8

Hls

Artplayer

loadSource

EXTINF

EXT-X
```

重点目录：

```
src

├── components

│      └── player


├── utils

│      └── m3u8


├── lib

│      └── hls

```

---

# 14. 与 TVBox 类方案区别

## LunaTV

特点：

```
播放器层处理

↓

分析HLS流

↓

过滤广告
```


## TVBox

特点：

```
接口解析

↓

规则替换

↓

播放地址处理
```

---

# 15. 总结

LunaTV 的去广告核心逻辑：

> 在 HLS 播放阶段，对 m3u8 播放列表进行分析，通过规则识别疑似广告 segment，然后删除或跳过广告片段，最终生成新的播放流交给 HLS.js 播放。

优势：

- 实现简单
- 性能消耗低
- 对切片广告有效

不足：

- 无法识别视频内嵌广告
- 依赖资源站结构
- 规则需要持续优化

未来增强方向：

1. 广告特征数据库
2. segment hash共享
3. 音视频AI识别
4. 用户反馈学习机制
5. 多资源站自适应规则
